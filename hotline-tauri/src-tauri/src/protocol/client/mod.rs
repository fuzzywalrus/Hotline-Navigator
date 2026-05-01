// Hotline client implementation

mod chat;
pub(crate) mod files;
pub(crate) mod hope;
mod hope_aead;
mod hope_stream;
mod news;
pub(crate) mod users;

use super::constants::{
    FieldType, TransactionType, PROTOCOL_ID, PROTOCOL_SUBVERSION,
    PROTOCOL_VERSION, SUBPROTOCOL_ID, TRANSACTION_HEADER_SIZE,
    CAPABILITY_LARGE_FILES, CAPABILITY_CHAT_HISTORY, resolve_error_message,
};
use super::transaction::{Transaction, TransactionField};
use super::types::{Bookmark, ConnectionStatus, ServerInfo};
use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::net::TcpStream;
use tokio::sync::{mpsc, Mutex, RwLock};
use tokio::task::JoinHandle;

use hope_aead::{HopeAeadReader, HopeAeadWriter};
use hope_stream::{HopeReader, HopeWriter};

/// Enable TCP-level keepalive on a control-channel socket so the OS surfaces
/// silent drops (peer vanished without FIN/RST) before the multi-minute
/// retransmit default. idle=30s, interval=10s, count=3 — ~60s detection on
/// macOS/Linux. Windows can't set retry count via socket2, so it uses the
/// system default (typically 10) and detects in ~130s.
fn apply_tcp_keepalive(stream: &TcpStream) -> std::io::Result<()> {
    let sock_ref = socket2::SockRef::from(stream);
    let ka = socket2::TcpKeepalive::new()
        .with_time(Duration::from_secs(30))
        .with_interval(Duration::from_secs(10));
    #[cfg(any(target_os = "macos", target_os = "ios", target_os = "linux", target_os = "android", target_os = "freebsd"))]
    let ka = ka.with_retries(3);
    sock_ref.set_tcp_keepalive(&ka)
}

/// Transport reader: either RC4 stream (with optional encryption) or AEAD.
enum TransportReader {
    Stream(HopeReader),
    Aead(HopeAeadReader),
}

impl TransportReader {
    /// Read raw bytes (no decryption). Used for handshake.
    async fn read_raw(&mut self, buf: &mut [u8]) -> Result<(), std::io::Error> {
        match self {
            Self::Stream(r) => r.read_raw(buf).await,
            Self::Aead(r) => r.read_raw(buf).await,
        }
    }

    /// Read and decode one transaction, decrypting if active.
    async fn read_transaction(&mut self) -> Result<Transaction, String> {
        match self {
            Self::Stream(r) => r.read_transaction().await,
            Self::Aead(r) => r.read_transaction().await,
        }
    }
}

/// Transport writer: either RC4 stream (with optional encryption) or AEAD.
enum TransportWriter {
    Stream(HopeWriter),
    Aead(HopeAeadWriter),
}

impl TransportWriter {
    /// Write raw bytes (no encryption). Used for handshake.
    async fn write_raw(&mut self, data: &[u8]) -> Result<(), std::io::Error> {
        match self {
            Self::Stream(w) => w.write_raw(data).await,
            Self::Aead(w) => w.write_raw(data).await,
        }
    }

    /// Encode and send a transaction, encrypting if active.
    async fn write_transaction(&mut self, transaction: &Transaction) -> Result<(), std::io::Error> {
        match self {
            Self::Stream(w) => w.write_transaction(transaction).await,
            Self::Aead(w) => w.write_transaction(transaction).await,
        }
    }
}

// TLS support
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::DigitallySignedStruct;
use tokio_rustls::TlsConnector;

// Trait object type aliases for stream halves (supports both plain TCP and TLS)
pub(crate) type BoxedRead = Box<dyn AsyncRead + Unpin + Send>;
pub(crate) type BoxedWrite = Box<dyn AsyncWrite + Unpin + Send>;

const LEGACY_TLS_CIPHER_LIST: &str =
    "DHE-RSA-AES256-SHA:DHE-RSA-AES128-SHA:AES256-SHA:AES128-SHA:DES-CBC3-SHA:RC4-SHA:@SECLEVEL=0";

fn legacy_tls_sni_host(host: &str) -> &str {
    if host.parse::<IpAddr>().is_ok() || (host.contains('%') && host.matches(':').count() >= 2) {
        "hotline"
    } else {
        host
    }
}

/// Certificate verifier that accepts any certificate.
/// Hotline servers typically use self-signed certificates.
#[derive(Debug)]
struct NoVerifier;

impl ServerCertVerifier for NoVerifier {
    fn verify_server_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        rustls::crypto::ring::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
    }
}

// Event types that can be received from the server
#[derive(Debug, Clone)]
pub enum HotlineEvent {
    ChatMessage { user_id: u16, user_name: String, message: String },
    ServerMessage(String),
    PrivateMessage { user_id: u16, message: String },
    UserJoined { user_id: u16, user_name: String, icon: u16, flags: u16, color: Option<String> },
    UserLeft { user_id: u16 },
    UserChanged { user_id: u16, user_name: String, icon: u16, flags: u16, color: Option<String> },
    AgreementRequired(String),
    FileList { files: Vec<FileInfo>, path: Vec<String> },
    NewMessageBoardPost(String),
    DisconnectMessage(String),
    ChatInvite { chat_id: u32, user_id: u16, user_name: String },
    PrivateChatMessage { chat_id: u32, user_id: u16, user_name: String, message: String },
    ChatUserJoined { chat_id: u32, user_id: u16, user_name: String, icon: u16, flags: u16, color: Option<String> },
    ChatUserLeft { chat_id: u32, user_id: u16 },
    ChatSubjectChanged { chat_id: u32, subject: String },
    ServerBannerUpdate { banner_type: Option<u16>, url: Option<String> },
    ProtocolLog { level: String, message: String },
    StatusChanged(ConnectionStatus),
}

/// Convert a 0x00RRGGBB u32 color to a CSS hex string like "#RRGGBB"
pub fn color_u32_to_css(c: u32) -> String {
    format!("#{:02X}{:02X}{:02X}", (c >> 16) & 0xFF, (c >> 8) & 0xFF, c & 0xFF)
}

#[derive(Debug, Clone)]
pub struct FileInfo {
    pub name: String,
    pub size: u64,
    pub is_folder: bool,
    pub file_type: String,
    pub creator: String,
}

pub struct HotlineClient {
    bookmark: Bookmark,
    allow_legacy_tls: bool,
    username: Arc<Mutex<String>>,
    user_icon_id: Arc<Mutex<u16>>,
    status: Arc<Mutex<ConnectionStatus>>,
    transport_reader: Arc<Mutex<Option<TransportReader>>>,
    transport_writer: Arc<Mutex<Option<TransportWriter>>>,
    transaction_counter: Arc<AtomicU32>,
    running: Arc<AtomicBool>,

    // Event channel
    event_tx: mpsc::UnboundedSender<HotlineEvent>,
    pub event_rx: Arc<Mutex<Option<mpsc::UnboundedReceiver<HotlineEvent>>>>,

    // Pending transactions (for request/reply pattern)
    pending_transactions: Arc<RwLock<HashMap<u32, mpsc::Sender<Transaction>>>>,

    // Track file list paths by transaction ID
    file_list_paths: Arc<RwLock<HashMap<u32, Vec<String>>>>,

    // Server info (extracted from login reply)
    server_info: Arc<Mutex<Option<ServerInfo>>>,

    // User access permissions (from login reply)
    user_access: Arc<Mutex<u64>>,

    // Large file support (negotiated during login)
    pub(crate) large_file_support: Arc<AtomicBool>,

    // Chat history support (negotiated during login via capability bit 4)
    pub(crate) chat_history_support: Arc<AtomicBool>,

    // HOPE AEAD file transfer base key (set when AEAD transport is activated)
    ft_base_key: Arc<Mutex<Option<[u8; 32]>>>,

    // Background tasks
    receive_task: Arc<Mutex<Option<JoinHandle<()>>>>,
    keepalive_task: Arc<Mutex<Option<JoinHandle<()>>>>,
}

impl HotlineClient {
    fn emit_protocol_log(&self, level: &str, message: impl Into<String>) {
        let _ = self.event_tx.send(HotlineEvent::ProtocolLog {
            level: level.to_string(),
            message: message.into(),
        });
    }

    pub fn new(bookmark: Bookmark, allow_legacy_tls: bool) -> Self {
        let (event_tx, event_rx) = mpsc::unbounded_channel();

        Self {
            bookmark,
            allow_legacy_tls,
            username: Arc::new(Mutex::new("guest".to_string())),
            user_icon_id: Arc::new(Mutex::new(191)),
            status: Arc::new(Mutex::new(ConnectionStatus::Disconnected)),
            transport_reader: Arc::new(Mutex::new(None)),
            transport_writer: Arc::new(Mutex::new(None)),
            transaction_counter: Arc::new(AtomicU32::new(1)),
            file_list_paths: Arc::new(RwLock::new(HashMap::new())),
            server_info: Arc::new(Mutex::new(None)),
            user_access: Arc::new(Mutex::new(0)),
            large_file_support: Arc::new(AtomicBool::new(false)),
            chat_history_support: Arc::new(AtomicBool::new(false)),
            ft_base_key: Arc::new(Mutex::new(None)),
            running: Arc::new(AtomicBool::new(false)),
            event_tx,
            event_rx: Arc::new(Mutex::new(Some(event_rx))),
            pending_transactions: Arc::new(RwLock::new(HashMap::new())),
            receive_task: Arc::new(Mutex::new(None)),
            keepalive_task: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn set_user_info(&self, username: String, user_icon_id: u16) {
        *self.username.lock().await = username;
        *self.user_icon_id.lock().await = user_icon_id;
    }

    pub(crate) fn next_transaction_id(&self) -> u32 {
        self.transaction_counter.fetch_add(1, Ordering::SeqCst)
    }

    /// Open a raw TCP (or TLS) connection and install it in the reader/writer slots.
    async fn open_connection(&self) -> Result<(), String> {
        let addr = crate::protocol::socket_addr_string(&self.bookmark.address, self.bookmark.port);
        self.emit_protocol_log("info", format!("Connecting to {}...", addr));

        let stream = tokio::time::timeout(
            Duration::from_secs(10),
            TcpStream::connect(&addr),
        )
        .await
        .map_err(|_| {
            self.emit_protocol_log("error", format!("Connection to {} timed out after 10s", addr));
            format!("Connection timed out after 10 seconds")
        })?
        .map_err(|e| {
            self.emit_protocol_log("error", format!("TCP connect failed: {}", e));
            format!("Failed to connect: {}", e)
        })?;

        if let Err(e) = apply_tcp_keepalive(&stream) {
            self.emit_protocol_log("warn", format!("Failed to enable TCP keepalive: {}", e));
        }

        if self.bookmark.tls {
            // Always try modern TLS (1.2+) first via rustls.
            // If that fails and legacy TLS is enabled, reconnect and retry
            // with native-tls which supports TLS 1.0/1.1 for older servers.
            self.emit_protocol_log("info", format!("TLS enabled — starting handshake with {}", self.bookmark.address));
            match tokio::time::timeout(
                Duration::from_secs(10),
                Self::wrap_tls(stream, &self.bookmark.address),
            ).await {
                Ok(Ok(tls_stream)) => {
                    self.emit_protocol_log("info", "TLS 1.2+ handshake successful");
                    let (read_half, write_half) = tokio::io::split(tls_stream);
                    *self.transport_reader.lock().await = Some(TransportReader::Stream(HopeReader::new(Box::new(read_half))));
                    *self.transport_writer.lock().await = Some(TransportWriter::Stream(HopeWriter::new(Box::new(write_half))));
                }
                modern_err if self.allow_legacy_tls => {
                    let reason = match &modern_err {
                        Ok(Err(e)) => format!("{}", e),
                        Err(_) => "timed out".to_string(),
                        _ => unreachable!(),
                    };
                    self.emit_protocol_log("warn", format!("TLS 1.2+ failed ({}), retrying with legacy TLS 1.0...", reason));

                    // Reconnect — the failed/timed-out TLS handshake consumed the TCP stream
                    let addr = crate::protocol::socket_addr_string(&self.bookmark.address, self.bookmark.port);
                    let stream = tokio::time::timeout(
                        Duration::from_secs(10),
                        TcpStream::connect(&addr),
                    )
                    .await
                    .map_err(|_| format!("Legacy TLS reconnect timed out"))?
                    .map_err(|e| format!("Legacy TLS reconnect failed: {}", e))?;

                    if let Err(e) = apply_tcp_keepalive(&stream) {
                        self.emit_protocol_log("warn", format!("Failed to enable TCP keepalive (legacy): {}", e));
                    }

                    match tokio::time::timeout(
                        Duration::from_secs(10),
                        Self::wrap_tls_legacy(stream, &self.bookmark.address),
                    ).await {
                        Ok(Ok(tls_stream)) => {
                            self.emit_protocol_log("info", "Legacy TLS handshake successful (TLS 1.0/1.1)");
                            let (read_half, write_half) = tokio::io::split(tls_stream);
                            *self.transport_reader.lock().await = Some(TransportReader::Stream(HopeReader::new(Box::new(read_half))));
                            *self.transport_writer.lock().await = Some(TransportWriter::Stream(HopeWriter::new(Box::new(write_half))));
                        }
                        Ok(Err(e2)) => {
                            self.emit_protocol_log("error", format!("Legacy TLS handshake also failed: {}", e2));
                            return Err(e2);
                        }
                        Err(_) => {
                            self.emit_protocol_log("error", "Legacy TLS handshake timed out after 10s");
                            return Err("Legacy TLS handshake timed out".to_string());
                        }
                    }
                }
                Ok(Err(e)) => {
                    self.emit_protocol_log("error", format!("TLS handshake failed: {}", e));
                    return Err(format!(
                        "TLS handshake failed: {}. This server may only support older TLS versions (1.0/1.1). \
                        Try enabling \"Allow Legacy TLS\" in Settings.",
                        e
                    ));
                }
                Err(_) => {
                    self.emit_protocol_log("error", "TLS handshake timed out after 10s");
                    return Err(
                        "TLS handshake timed out. This server may only support older TLS versions (1.0/1.1). \
                        Try enabling \"Allow Legacy TLS\" in Settings.".to_string()
                    );
                }
            }
        } else {
            self.emit_protocol_log("info", "Plain TCP connection established (no TLS)");
            let (read_half, write_half) = stream.into_split();
            *self.transport_reader.lock().await = Some(TransportReader::Stream(HopeReader::new(Box::new(read_half))));
            *self.transport_writer.lock().await = Some(TransportWriter::Stream(HopeWriter::new(Box::new(write_half))));
        }

        Ok(())
    }

    /// Establish TCP (or TLS) connection and perform Hotline handshake.
    /// Called by connect() and also by login() to reconnect after HOPE probe failure.
    /// Tries protocol subversion 2 first; if the server rejects it, reconnects
    /// and retries with subversion 1 for compatibility with 1990s-era servers.
    async fn establish_connection(&self) -> Result<(), String> {
        self.open_connection().await?;

        match self.handshake(PROTOCOL_SUBVERSION).await {
            Ok(()) => Ok(()),
            Err(e) if e.contains("error code") => {
                println!("Handshake with subversion {} failed ({}), retrying with subversion 1...",
                    PROTOCOL_SUBVERSION, e);
                self.emit_protocol_log(
                    "warn",
                    format!("Handshake v{} rejected, retrying with v1 for legacy compatibility", PROTOCOL_SUBVERSION),
                );
                // Server rejected our version — reconnect and try subversion 1
                self.open_connection().await?;
                self.handshake(0x0001).await
            }
            Err(e) => Err(e),
        }
    }

    pub async fn connect(&self) -> Result<(), String> {
        let tls_label = if self.bookmark.tls { " (TLS)" } else { "" };
        println!("Connecting to {}:{}{tls_label}...", self.bookmark.address, self.bookmark.port);

        // Update status
        {
            let mut status = self.status.lock().await;
            *status = ConnectionStatus::Connecting;
            let _ = self.event_tx.send(HotlineEvent::StatusChanged(ConnectionStatus::Connecting));
        }

        self.establish_connection().await?;

        // Update status
        {
            let mut status = self.status.lock().await;
            *status = ConnectionStatus::Connected;
            let _ = self.event_tx.send(HotlineEvent::StatusChanged(ConnectionStatus::Connected));
        }

        // Perform login
        self.login().await?;

        // Start background tasks
        self.start_receive_loop().await;
        self.start_keepalive().await;

        // Request initial user list
        self.get_user_list().await?;

        println!("Successfully connected and logged in!");

        Ok(())
    }

    /// Wrap a TCP stream with TLS (rustls, TLS 1.2+), accepting any certificate.
    pub(crate) async fn wrap_tls(
        stream: TcpStream,
        host: &str,
    ) -> Result<tokio_rustls::client::TlsStream<TcpStream>, String> {
        // Install the ring crypto provider (required by rustls)
        let _ = rustls::crypto::ring::default_provider().install_default();

        let config = rustls::ClientConfig::builder()
            .dangerous()
            .with_custom_certificate_verifier(Arc::new(NoVerifier))
            .with_no_client_auth();

        let connector = TlsConnector::from(Arc::new(config));

        // Build ServerName for SNI.
        // Important: Go's TLS server rejects IP-address SNI extensions, so when
        // connecting by IP we use a dummy DNS name. Since we skip cert verification
        // (NoVerifier), the SNI name only affects the server's certificate selection,
        // not validation.
        let server_name = if host.parse::<IpAddr>().is_ok() {
            // IP address — use a dummy DNS name to avoid Go's TLS rejecting IP-based SNI
            ServerName::try_from("hotline".to_string()).unwrap()
        } else {
            ServerName::try_from(host.to_string())
                .unwrap_or_else(|_| ServerName::try_from("hotline".to_string()).unwrap())
        };

        connector.connect(server_name, stream).await
            .map_err(|e| format!("TLS handshake failed: {}", e))
    }

    /// Wrap a TCP stream with legacy TLS (OpenSSL, supports TLS 1.0+ with DHE ciphers).
    /// Used for older Hotline servers that don't support TLS 1.2.
    /// macOS SecureTransport has removed DHE cipher suites, so we use vendored
    /// OpenSSL which still supports them.
    ///
    /// Key compatibility detail: Tiger-era SecureTransport (TLS 1.0 only) may not
    /// understand a ClientHello that advertises TLS 1.2+ or includes TLS 1.3
    /// extensions. We cap max version at TLS 1.0 so the ClientHello itself is
    /// pure TLS 1.0 — no extensions the old stack can't parse.
    pub(crate) async fn wrap_tls_legacy(
        stream: TcpStream,
        host: &str,
    ) -> Result<tokio_openssl::SslStream<TcpStream>, String> {
        let mut builder = openssl::ssl::SslConnector::builder(openssl::ssl::SslMethod::tls())
            .map_err(|e| format!("Failed to create OpenSSL context: {}", e))?;

        // Pin to TLS 1.0 only — ensures the ClientHello is a pure TLS 1.0
        // record that ancient SecureTransport (Tiger/Leopard) can parse.
        // A TLS 1.0-1.2 range ClientHello has client_version=0x0303 which
        // pre-TLS-1.2 stacks may reject outright.
        builder.set_min_proto_version(Some(openssl::ssl::SslVersion::TLS1))
            .map_err(|e| format!("Failed to set min TLS version: {}", e))?;
        builder.set_max_proto_version(Some(openssl::ssl::SslVersion::TLS1))
            .map_err(|e| format!("Failed to set max TLS version: {}", e))?;

        // Include legacy DHE and RSA ciphers that older Hotline servers use.
        // @SECLEVEL=0 disables OpenSSL security restrictions on weak ciphers.
        builder.set_cipher_list(LEGACY_TLS_CIPHER_LIST)
            .map_err(|e| format!("Failed to set cipher list: {}", e))?;

        // Accept self-signed certificates (standard for Hotline servers)
        builder.set_verify(openssl::ssl::SslVerifyMode::NONE);

        // Allow unsafe legacy renegotiation — Tiger-era servers don't support
        // RFC 5746 secure renegotiation, and OpenSSL 3.x rejects them by default.
        builder.set_options(openssl::ssl::SslOptions::ALLOW_UNSAFE_LEGACY_RENEGOTIATION);

        // Disable SNI for maximum compatibility — Tiger SecureTransport
        // predates SNI support and may reject connections that include it.
        let connector = builder.build();
        let mut config = connector.configure()
            .map_err(|e| format!("Failed to configure OpenSSL: {}", e))?;
        config.set_use_server_name_indication(false);

        let sni_host = legacy_tls_sni_host(host);
        let ssl = config.into_ssl(sni_host)
            .map_err(|e| format!("Failed to create SSL object: {}", e))?;

        let mut tls_stream = tokio_openssl::SslStream::new(ssl, stream)
            .map_err(|e| format!("Failed to create SSL stream: {}", e))?;

        std::pin::Pin::new(&mut tls_stream).connect()
            .await
            .map_err(|e| format!("Legacy TLS handshake failed: {}", e))?;

        Ok(tls_stream)
    }

    async fn handshake(&self, subversion: u16) -> Result<(), String> {
        println!("Performing handshake (subversion {})...", subversion);
        self.emit_protocol_log("info", format!("Protocol handshake: TRTP/HOTL v{}.{}", PROTOCOL_VERSION, subversion));

        // Build handshake packet (12 bytes)
        let mut handshake = Vec::with_capacity(12);
        handshake.extend_from_slice(PROTOCOL_ID); // "TRTP"
        handshake.extend_from_slice(SUBPROTOCOL_ID); // "HOTL"
        handshake.extend_from_slice(&PROTOCOL_VERSION.to_be_bytes()); // 0x0001
        handshake.extend_from_slice(&subversion.to_be_bytes());

        // Send handshake (raw — before any encryption)
        {
            let mut write_guard = self.transport_writer.lock().await;
            let writer = write_guard
                .as_mut()
                .ok_or("Not connected".to_string())?;
            writer
                .write_raw(&handshake)
                .await
                .map_err(|e| format!("Failed to send handshake: {}", e))?;
        }

        // Read response (8 bytes)
        let mut response = [0u8; 8];
        {
            let mut read_guard = self.transport_reader.lock().await;
            let reader = read_guard
                .as_mut()
                .ok_or("Not connected".to_string())?;
            reader
                .read_raw(&mut response)
                .await
                .map_err(|e| format!("Failed to read handshake response: {}", e))?;
        }

        // Verify response
        if &response[0..4] != PROTOCOL_ID {
            return Err("Invalid handshake response".to_string());
        }

        let error_code = u32::from_be_bytes([response[4], response[5], response[6], response[7]]);
        if error_code != 0 {
            self.emit_protocol_log("error", format!("Handshake rejected by server (error code {})", error_code));
            return Err(format!("Handshake failed with error code {}", error_code));
        }

        println!("Handshake successful (subversion {})", subversion);
        self.emit_protocol_log("info", format!("Handshake successful (subversion {})", subversion));

        Ok(())
    }

    /// Read a single transaction from the connection (raw, pre-encryption).
    /// Used during login before the receive loop starts.
    async fn read_transaction_raw(&self) -> Result<Transaction, String> {
        let mut read_guard = self.transport_reader.lock().await;
        let reader = read_guard.as_mut().ok_or("Not connected")?;

        // Read header
        let mut header = [0u8; TRANSACTION_HEADER_SIZE];
        reader.read_raw(&mut header).await
            .map_err(|e| format!("Failed to read transaction header: {}", e))?;

        let data_size = u32::from_be_bytes([header[16], header[17], header[18], header[19]]);

        if data_size > crate::protocol::constants::MAX_TRANSACTION_BODY_SIZE {
            return Err(format!(
                "Transaction body too large: {} bytes (max {})",
                data_size, crate::protocol::constants::MAX_TRANSACTION_BODY_SIZE
            ));
        }

        let mut full_data = header.to_vec();

        if data_size > 0 {
            let mut body = vec![0u8; data_size as usize];
            reader.read_raw(&mut body).await
                .map_err(|e| format!("Failed to read transaction body: {}", e))?;
            full_data.extend(body);
        }

        Transaction::decode(&full_data)
    }

    /// Send a transaction via the writer (raw, pre-encryption).
    /// Used during login before encryption is activated.
    async fn send_transaction_raw(&self, transaction: &Transaction) -> Result<(), String> {
        let encoded = transaction.encode();
        let mut write_guard = self.transport_writer.lock().await;
        let writer = write_guard.as_mut().ok_or("Not connected")?;
        writer.write_raw(&encoded).await
            .map_err(|e| format!("Failed to send transaction: {}", e))
    }

    /// Attempt HOPE identification (step 1+2). Returns the negotiation result
    /// if the server supports HOPE, or None if it doesn't. Any error (including
    /// the server closing the connection) is treated as "not supported".
    async fn try_hope_probe(&self) -> Option<hope::HopeNegotiation> {
        let mut hope_tx = Transaction::new(self.next_transaction_id(), TransactionType::Login);

        // Single null byte signals HOPE identification
        hope_tx.add_field(TransactionField::new(FieldType::UserLogin, vec![0x00]));

        // Our supported MAC algorithms (strongest first)
        hope_tx.add_field(TransactionField::new(
            FieldType::HopeMacAlgorithm,
            hope::encode_algorithm_list(hope::PREFERRED_MAC_ALGORITHMS),
        ));

        // App identification
        hope_tx.add_field(TransactionField::from_string(
            FieldType::HopeAppId,
            "HTLN",
        ));
        hope_tx.add_field(TransactionField::from_string(
            FieldType::HopeAppString,
            &format!("Hotline Navigator {}", env!("CARGO_PKG_VERSION")),
        ));

        // Request RC4 transport encryption
        hope_tx.add_field(TransactionField::new(
            FieldType::HopeClientCipher,
            hope::encode_cipher_list(hope::SUPPORTED_CIPHERS),
        ));
        hope_tx.add_field(TransactionField::new(
            FieldType::HopeServerCipher,
            hope::encode_cipher_list(hope::SUPPORTED_CIPHERS),
        ));

        println!("Sending HOPE identification...");
        self.emit_protocol_log("info", "Sending HOPE identification probe...");
        if let Err(e) = self.send_transaction_raw(&hope_tx).await {
            println!("HOPE probe send failed: {}", e);
            self.emit_protocol_log("warn", format!("HOPE probe send failed: {}", e));
            return None;
        }

        // Read server reply — if this fails, server doesn't support HOPE
        let reply = match self.read_transaction_raw().await {
            Ok(r) => r,
            Err(e) => {
                println!("HOPE probe read failed: {}", e);
                self.emit_protocol_log("warn", format!("HOPE probe — server did not respond ({})", e));
                return None;
            }
        };

        // Check for HOPE session key in the reply
        let session_key_field = reply.get_field(FieldType::HopeSessionKey)?;
        if session_key_field.data.len() != 64 {
            println!("HOPE session key wrong size ({}), not supported", session_key_field.data.len());
            self.emit_protocol_log("warn", format!("HOPE session key wrong size ({}), server does not support HOPE", session_key_field.data.len()));
            return None;
        }

        let mut session_key = [0u8; 64];
        session_key.copy_from_slice(&session_key_field.data);

        // Parse server's chosen MAC algorithm
        let mac_algorithm = reply.get_field(FieldType::HopeMacAlgorithm)?;
        let selected_mac = hope::decode_algorithm_selection(&mac_algorithm.data).ok()?;

        // Check if server wants login to be MAC'd (non-empty login field)
        let mac_login = reply
            .get_field(FieldType::UserLogin)
            .map(|f| !f.data.is_empty())
            .unwrap_or(false);

        // Parse cipher selections
        let server_cipher = reply
            .get_field(FieldType::HopeServerCipher)
            .and_then(|f| hope::decode_cipher_selection(&f.data).ok())
            .unwrap_or_else(|| "NONE".to_string());
        let client_cipher = reply
            .get_field(FieldType::HopeClientCipher)
            .and_then(|f| hope::decode_cipher_selection(&f.data).ok())
            .unwrap_or_else(|| "NONE".to_string());

        // Parse cipher mode fields (AEAD vs STREAM)
        let server_cipher_mode = reply
            .get_field(FieldType::HopeServerCipherMode)
            .and_then(|f| std::str::from_utf8(&f.data).ok().map(|s| s.to_ascii_uppercase()))
            .unwrap_or_else(|| "STREAM".to_string());
        let client_cipher_mode = reply
            .get_field(FieldType::HopeClientCipherMode)
            .and_then(|f| std::str::from_utf8(&f.data).ok().map(|s| s.to_ascii_uppercase()))
            .unwrap_or_else(|| "STREAM".to_string());

        let server_compression = reply
            .get_field(FieldType::HopeServerCompression)
            .and_then(|f| hope::decode_cipher_selection(&f.data).ok())
            .unwrap_or_else(|| "NONE".to_string());
        let client_compression = reply
            .get_field(FieldType::HopeClientCompression)
            .and_then(|f| hope::decode_cipher_selection(&f.data).ok())
            .unwrap_or_else(|| "NONE".to_string());

        println!("HOPE negotiation: MAC={:?}, mac_login={}, server_cipher={} ({}), client_cipher={} ({}), session_key[0..4]={:02X?}",
            selected_mac, mac_login, server_cipher, server_cipher_mode, client_cipher, client_cipher_mode, &session_key[..4]);
        self.emit_protocol_log(
            "info",
            format!(
                "HOPE negotiated: mac={:?}, mac_login={}, server_cipher={} ({}), client_cipher={} ({})",
                selected_mac, mac_login, server_cipher, server_cipher_mode, client_cipher, client_cipher_mode
            ),
        );

        // Reject INVERSE MAC + AEAD combination — INVERSE cannot produce
        // cryptographic key material suitable for HKDF.
        if selected_mac == hope::MacAlgorithm::Inverse
            && (server_cipher_mode == "AEAD" || client_cipher_mode == "AEAD")
        {
            println!("HOPE: rejecting INVERSE MAC + AEAD combination");
            self.emit_protocol_log("warn", "HOPE: INVERSE MAC is incompatible with AEAD mode, falling back");
            return None;
        }

        Some(hope::HopeNegotiation {
            session_key,
            mac_algorithm: selected_mac,
            mac_login,
            server_cipher,
            client_cipher,
            server_cipher_mode,
            client_cipher_mode,
            server_compression,
            client_compression,
        })
    }

    async fn login(&self) -> Result<(), String> {
        println!("Logging in as {}...", self.bookmark.login);

        // Update status
        {
            let mut status = self.status.lock().await;
            *status = ConnectionStatus::LoggingIn;
            let _ = self.event_tx.send(HotlineEvent::StatusChanged(ConnectionStatus::LoggingIn));
        }

        let password = self.bookmark.password.as_deref().unwrap_or("");
        let user_icon_id = *self.user_icon_id.lock().await;
        let username = self.username.lock().await.clone();

        // HOPE (Hotline One-time Password Extension) probe.
        // The HOPE identification (login=0x00) poisons the connection on non-HOPE
        // servers — they treat it as a failed login and close/block the connection.
        // Only attempt HOPE when the bookmark explicitly has hope=true.
        // If the probe fails, we must reconnect before falling back to legacy login
        // because the server considers the connection tainted.
        let hope_negotiation: Option<hope::HopeNegotiation> = if self.bookmark.hope {
            println!("HOPE enabled for this bookmark, attempting probe...");
            self.emit_protocol_log("info", "HOPE enabled for this bookmark, attempting probe");
            let result = self.try_hope_probe().await;
            if result.is_none() {
                println!("HOPE probe failed or unsupported, reconnecting for legacy login...");
                self.emit_protocol_log(
                    "warn",
                    "HOPE probe failed or unsupported, reconnecting for legacy login",
                );
                // Brief delay before reconnecting — some retro servers treat the
                // failed HOPE probe as a bad login and may rate-limit or ban the
                // IP if we reconnect too quickly.
                tokio::time::sleep(Duration::from_secs(2)).await;
                self.establish_connection().await?;
            }
            result
        } else {
            None
        };

        // ─── Send login ───
        // Determine transport mode: AEAD (ChaCha20-Poly1305), RC4 stream, or auth-only
        let hope_aead_active = hope_negotiation.as_ref().is_some_and(|n| {
            n.mac_algorithm.supports_transport()
                && (n.server_cipher == "CHACHA20-POLY1305" || n.client_cipher == "CHACHA20-POLY1305")
                && (n.server_cipher_mode == "AEAD" || n.client_cipher_mode == "AEAD")
        });
        let hope_rc4_active = !hope_aead_active && hope_negotiation.as_ref().is_some_and(|n| {
            n.mac_algorithm.supports_transport()
                && (n.server_cipher == "RC4" || n.client_cipher == "RC4")
        });
        let hope_transport_active = hope_aead_active || hope_rc4_active;

        let login_reply = if let Some(ref negotiation) = hope_negotiation {
            // HOPE authenticated login (step 3) is sent in the clear.
            // If transport encryption was negotiated, the server enables it
            // only after validating this packet, and encrypts the login reply.
            let mut auth_tx = Transaction::new(self.next_transaction_id(), TransactionType::Login);

            let login_bytes = self.bookmark.login.as_bytes();
            if negotiation.mac_login {
                let login_mac = hope::compute_mac(
                    negotiation.mac_algorithm,
                    login_bytes,
                    &negotiation.session_key,
                );
                auth_tx.add_field(TransactionField::new(FieldType::UserLogin, login_mac));
            } else {
                let inverted: Vec<u8> = login_bytes.iter().map(|b| !b).collect();
                auth_tx.add_field(TransactionField::new(FieldType::UserLogin, inverted));
            }

            let password_mac = hope::compute_mac(
                negotiation.mac_algorithm,
                password.as_bytes(),
                &negotiation.session_key,
            );
            auth_tx.add_field(TransactionField::new(
                FieldType::UserPassword,
                password_mac.clone(),
            ));

            auth_tx.add_field(TransactionField::from_u16(FieldType::UserIconId, user_icon_id));
            auth_tx.add_field(TransactionField::from_string(FieldType::UserName, &username));
            auth_tx.add_field(TransactionField::from_u16(FieldType::VersionNumber, 255));
            auth_tx.add_field(TransactionField::from_u16(FieldType::Capabilities, CAPABILITY_LARGE_FILES | CAPABILITY_CHAT_HISTORY));

            println!("Sending HOPE authenticated login...");
            self.emit_protocol_log("info", "Sending HOPE authenticated login");
            self.send_transaction_raw(&auth_tx).await?;

            if hope_aead_active {
                // ChaCha20-Poly1305 AEAD transport
                let encode_key = hope::compute_mac(
                    negotiation.mac_algorithm,
                    password.as_bytes(),
                    &password_mac,
                );
                let decode_key = hope::compute_mac(
                    negotiation.mac_algorithm,
                    password.as_bytes(),
                    &encode_key,
                );

                println!("[HOPE-AEAD] Key derivation: mac={:?}, encode_key len={}, decode_key len={}",
                    negotiation.mac_algorithm, encode_key.len(), decode_key.len());
                println!("[HOPE-AEAD] encode_key[0..4]={:02X?}, decode_key[0..4]={:02X?}",
                    &encode_key[..4.min(encode_key.len())], &decode_key[..4.min(decode_key.len())]);

                // Expand to 256-bit keys using HKDF-SHA256
                let encode_key_256 = hope::expand_key_for_aead(
                    &encode_key, &negotiation.session_key, "hope-chacha-encode",
                );
                let decode_key_256 = hope::expand_key_for_aead(
                    &decode_key, &negotiation.session_key, "hope-chacha-decode",
                );

                println!("[HOPE-AEAD] HKDF expanded: encode_key_256[0..4]={:02X?}, decode_key_256[0..4]={:02X?}",
                    &encode_key_256[..4], &decode_key_256[..4]);

                // Swap transport to AEAD: take the raw streams from HopeReader/HopeWriter
                // and wrap them in HopeAeadReader/HopeAeadWriter.
                // Server encrypts its outbound with encode_key_256 (we decrypt with it).
                // Client encrypts its outbound with decode_key_256.
                {
                    let mut reader_guard = self.transport_reader.lock().await;
                    if let Some(transport) = reader_guard.take() {
                        let inner = match transport {
                            TransportReader::Stream(r) => r.into_inner(),
                            TransportReader::Aead(_) => unreachable!("AEAD already active"),
                        };
                        *reader_guard = Some(TransportReader::Aead(
                            HopeAeadReader::new(inner, &encode_key_256),
                        ));
                    }
                }
                {
                    let mut writer_guard = self.transport_writer.lock().await;
                    if let Some(transport) = writer_guard.take() {
                        let inner = match transport {
                            TransportWriter::Stream(w) => w.into_inner(),
                            TransportWriter::Aead(_) => unreachable!("AEAD already active"),
                        };
                        *writer_guard = Some(TransportWriter::Aead(
                            HopeAeadWriter::new(inner, &decode_key_256),
                        ));
                    }
                }

                // Derive file transfer base key for AEAD-encrypted HTXF transfers
                let ft_key = hope::derive_ft_base_key(&encode_key_256, &decode_key_256, &negotiation.session_key);
                println!("[HOPE-AEAD] File transfer base key derived, ft_base_key[0..4]={:02X?}", &ft_key[..4]);
                *self.ft_base_key.lock().await = Some(ft_key);

                println!("HOPE transport encryption activated (ChaCha20-Poly1305 AEAD)");
                self.emit_protocol_log("info", "HOPE transport encryption activated (ChaCha20-Poly1305 AEAD)");
                self.read_transaction().await?
            } else if hope_rc4_active {
                // RC4 stream transport (existing behavior)
                let encode_key = hope::compute_mac(
                    negotiation.mac_algorithm,
                    password.as_bytes(),
                    &password_mac,
                );
                let decode_key = hope::compute_mac(
                    negotiation.mac_algorithm,
                    password.as_bytes(),
                    &encode_key,
                );

                // After HOPE step 3, the server encrypts outbound replies with
                // encode_key and expects inbound packets encrypted with
                // decode_key.
                {
                    let mut reader_guard = self.transport_reader.lock().await;
                    if let Some(TransportReader::Stream(reader)) = reader_guard.as_mut() {
                        reader.activate_encryption(
                            encode_key,
                            negotiation.session_key,
                            negotiation.mac_algorithm,
                        );
                    }
                }
                {
                    let mut writer_guard = self.transport_writer.lock().await;
                    if let Some(TransportWriter::Stream(writer)) = writer_guard.as_mut() {
                        writer.activate_encryption(
                            decode_key,
                            negotiation.session_key,
                            negotiation.mac_algorithm,
                        );
                    }
                }

                println!("HOPE transport encryption activated (RC4)");
                self.emit_protocol_log("info", "HOPE transport encryption activated (RC4)");
                self.read_transaction().await?
            } else {
                println!("HOPE auth only (no transport encryption)");
                self.emit_protocol_log("info", "HOPE secure login active (no transport encryption)");
                self.read_transaction_raw().await?
            }
        } else {
            // Standard legacy login (XOR-encoded credentials)
            let mut login_tx = Transaction::new(self.next_transaction_id(), TransactionType::Login);
            login_tx.add_field(TransactionField::from_encoded_string(
                FieldType::UserLogin,
                &self.bookmark.login,
            ));
            login_tx.add_field(TransactionField::from_encoded_string(
                FieldType::UserPassword,
                password,
            ));
            login_tx.add_field(TransactionField::from_u16(FieldType::UserIconId, user_icon_id));
            login_tx.add_field(TransactionField::from_string(FieldType::UserName, &username));
            login_tx.add_field(TransactionField::from_u16(FieldType::VersionNumber, 255));
            login_tx.add_field(TransactionField::from_u16(FieldType::Capabilities, CAPABILITY_LARGE_FILES | CAPABILITY_CHAT_HISTORY));

            println!("Sending login...");
            self.emit_protocol_log("info", "Sending legacy login (XOR-encoded credentials)");
            self.send_transaction_raw(&login_tx).await?;
            self.read_transaction_raw().await?
        };

        println!("Login reply: error_code={}, fields={}", login_reply.error_code, login_reply.fields.len());

        // Check for error
        if login_reply.error_code != 0 {
            let server_text = login_reply
                .get_field(FieldType::ErrorText)
                .and_then(|f| f.to_string().ok())
                .or_else(|| {
                    login_reply.get_field(FieldType::Data)
                        .and_then(|f| f.to_string().ok())
                });
            let error_msg = resolve_error_message(login_reply.error_code, server_text);

            println!("Login failed with error_code={}, fields={}", login_reply.error_code, login_reply.fields.len());
            for (i, field) in login_reply.fields.iter().enumerate() {
                println!("  Field {}: type={:?} ({}), size={} bytes",
                    i, field.field_type, field.field_type as u16, field.data.len());
                if let Ok(text) = field.to_string() {
                    if text.len() < 200 {
                        println!("    Text: {}", text);
                    }
                }
            }

            self.emit_protocol_log("error", format!("Login failed: {}", error_msg));
            return Err(format!("Login failed: {}", error_msg));
        }

        // ─── Process login reply (same as before) ───
        let server_name = login_reply
            .get_field(FieldType::ServerName)
            .and_then(|f| f.to_string().ok())
            .unwrap_or_else(|| self.bookmark.name.clone());

        let server_version = login_reply
            .get_field(FieldType::VersionNumber)
            .and_then(|f| f.to_u16().ok())
            .map(|v| v.to_string())
            .unwrap_or_else(|| "Unknown".to_string());

        let server_description = login_reply
            .get_field(FieldType::Data)
            .and_then(|f| f.to_string().ok())
            .filter(|s| !s.is_empty() && s != &server_name)
            .unwrap_or_else(|| String::new());

        let user_access = login_reply
            .get_field(FieldType::UserAccess)
            .and_then(|f| f.to_u64().ok())
            .unwrap_or(0);

        {
            let mut access_guard = self.user_access.lock().await;
            *access_guard = user_access;
        }

        println!("User access permissions: 0x{:016X}", user_access);

        let server_capabilities = login_reply
            .get_field(FieldType::Capabilities)
            .and_then(|f| f.to_u16().ok())
            .unwrap_or(0);

        let large_files = (server_capabilities & CAPABILITY_LARGE_FILES) != 0;
        self.large_file_support.store(large_files, Ordering::SeqCst);

        let chat_history = (server_capabilities & CAPABILITY_CHAT_HISTORY) != 0;
        self.chat_history_support.store(chat_history, Ordering::SeqCst);

        // Extract optional retention policy hints from login reply
        let history_max_msgs = login_reply
            .get_field(FieldType::HistoryMaxMsgs)
            .and_then(|f| f.to_u32().ok());
        let history_max_days = login_reply
            .get_field(FieldType::HistoryMaxDays)
            .and_then(|f| f.to_u32().ok());

        println!("Server capabilities: 0x{:04X} (large files: {}, chat history: {})", server_capabilities, large_files, chat_history);
        if chat_history {
            println!("Chat history enabled by server: max_msgs={:?}, max_days={:?}", history_max_msgs, history_max_days);
            self.emit_protocol_log("info", format!(
                "Server chat history available — retention: max_msgs={}, max_days={}",
                history_max_msgs.map_or("unlimited".to_string(), |v| if v == 0 { "unlimited".to_string() } else { v.to_string() }),
                history_max_days.map_or("unlimited".to_string(), |v| if v == 0 { "unlimited".to_string() } else { v.to_string() }),
            ));
        }
        self.emit_protocol_log("info", format!(
            "Login successful — server: \"{}\", version: {}, large files: {}, chat history: {}, HOPE: {}",
            server_name,
            server_version,
            large_files,
            chat_history,
            if hope_negotiation.is_some() {
                if hope_aead_active { "AEAD (ChaCha20-Poly1305)" }
                else if hope_rc4_active { "encrypted (RC4)" }
                else { "auth only" }
            } else { "off" },
        ));

        {
            let mut server_info = self.server_info.lock().await;
            *server_info = Some(ServerInfo {
                name: server_name,
                description: server_description,
                version: server_version,
                hope_enabled: hope_negotiation.is_some(),
                hope_transport: hope_transport_active,
                agreement: None,
                chat_history_supported: chat_history,
                history_max_msgs: history_max_msgs,
                history_max_days: history_max_days,
            });
        }

        {
            let mut status = self.status.lock().await;
            *status = ConnectionStatus::LoggedIn;
            let _ = self.event_tx.send(HotlineEvent::StatusChanged(ConnectionStatus::LoggedIn));
        }

        println!("Login successful!");

        Ok(())
    }

    pub async fn disconnect(&self) -> Result<(), String> {
        println!("Disconnecting...");

        // Stop background tasks
        self.running.store(false, Ordering::SeqCst);

        // Wait for tasks to finish
        if let Some(task) = self.receive_task.lock().await.take() {
            task.abort();
        }
        if let Some(task) = self.keepalive_task.lock().await.take() {
            task.abort();
        }

        // Close both halves of the stream
        {
            let mut read_guard = self.transport_reader.lock().await;
            if let Some(reader) = read_guard.take() {
                drop(reader);
            }
        }
        {
            let mut write_guard = self.transport_writer.lock().await;
            if let Some(writer) = write_guard.take() {
                drop(writer);
            }
        }

        // Clean up pending state
        {
            let mut paths = self.file_list_paths.write().await;
            paths.clear();
        }
        {
            let mut pending = self.pending_transactions.write().await;
            pending.clear();
        }
        *self.ft_base_key.lock().await = None;

        let mut status = self.status.lock().await;
        *status = ConnectionStatus::Disconnected;
        let _ = self.event_tx.send(HotlineEvent::StatusChanged(ConnectionStatus::Disconnected));

        println!("Disconnected");

        Ok(())
    }

    pub async fn get_status(&self) -> ConnectionStatus {
        self.status.lock().await.clone()
    }

    /// Derive a per-transfer AEAD key for an HTXF file transfer.
    /// Returns None if the connection is not using AEAD transport.
    pub(crate) async fn derive_transfer_key(&self, reference_number: u32) -> Option<[u8; 32]> {
        let ft_key = self.ft_base_key.lock().await;
        ft_key.as_ref().map(|base_key| {
            let key = hope::derive_transfer_key(base_key, reference_number);
            println!("[HOPE-AEAD-FT] Derived transfer key for ref={}, key[0..4]={:02X?}",
                reference_number, &key[..4]);
            key
        })
    }

    /// Read a single transaction through the HOPE reader (handles decryption if active).
    /// Used during login after encryption is activated.
    async fn read_transaction(&self) -> Result<Transaction, String> {
        let mut read_guard = self.transport_reader.lock().await;
        let reader = read_guard.as_mut().ok_or("Not connected")?;
        reader.read_transaction().await
    }

    /// Send a transaction through the HOPE writer (handles encryption if active).
    /// This is the primary method all sub-modules should use to send data.
    pub(crate) async fn send_transaction(&self, transaction: &Transaction) -> Result<(), String> {
        let mut write_guard = self.transport_writer.lock().await;
        let writer = write_guard
            .as_mut()
            .ok_or("Not connected".to_string())?;
        writer
            .write_transaction(transaction)
            .await
            .map_err(|e| format!("Failed to send transaction: {}", e))
    }



    // Start background task to receive messages from server
    async fn start_receive_loop(&self) {
        println!("Starting receive loop...");

        self.running.store(true, Ordering::SeqCst);

        let hope_reader = self.transport_reader.clone();
        let hope_writer = self.transport_writer.clone();
        let running = self.running.clone();
        let status = self.status.clone();
        let event_tx = self.event_tx.clone();
        let pending_transactions = self.pending_transactions.clone();
        let file_list_paths = self.file_list_paths.clone();

        let task = tokio::spawn(async move {
            while running.load(Ordering::SeqCst) {
                // Read a complete transaction (handles decryption if active)
                let transaction = {
                    let mut read_guard = hope_reader.lock().await;
                    let reader = match read_guard.as_mut() {
                        Some(r) => r,
                        None => break,
                    };
                    reader.read_transaction().await
                };

                let transaction = match transaction {
                    Ok(t) => t,
                    Err(e) => {
                        if e.contains("Failed to read") {
                            println!("Receive loop: connection closed");
                            // Clear both halves to prevent further writes
                            {
                                let mut read_guard = hope_reader.lock().await;
                                read_guard.take();
                            }
                            {
                                let mut write_guard = hope_writer.lock().await;
                                write_guard.take();
                            }
                            // Update status
                            {
                                let mut status_guard = status.lock().await;
                                *status_guard = ConnectionStatus::Disconnected;
                            }
                            let _ = event_tx.send(HotlineEvent::StatusChanged(ConnectionStatus::Disconnected));
                            break;
                        }
                        if e.contains("Transaction body too large")
                            || e.contains("Transaction data too short")
                            || e.contains("Invalid")
                        {
                            let reason = format!("HOPE/protocol decode failure: {}", e);
                            eprintln!("Receive loop: protocol decode failure, disconnecting: {}", e);
                            let _ = event_tx.send(HotlineEvent::ProtocolLog {
                                level: "error".to_string(),
                                message: reason.clone(),
                            });
                            let _ = event_tx.send(HotlineEvent::DisconnectMessage(reason));
                            {
                                let mut read_guard = hope_reader.lock().await;
                                read_guard.take();
                            }
                            {
                                let mut write_guard = hope_writer.lock().await;
                                write_guard.take();
                            }
                            {
                                let mut pending_guard = pending_transactions.write().await;
                                pending_guard.clear();
                            }
                            {
                                let mut paths_guard = file_list_paths.write().await;
                                paths_guard.clear();
                            }
                            {
                                let mut status_guard = status.lock().await;
                                *status_guard = ConnectionStatus::Disconnected;
                            }
                            let _ = event_tx.send(HotlineEvent::StatusChanged(ConnectionStatus::Disconnected));
                            break;
                        }
                        eprintln!("Failed to decode transaction: {}", e);
                        continue;
                    }
                };

                println!("Received transaction: type={:?}, id={}, isReply={}, error_code={}, fields={}",
                    transaction.transaction_type, transaction.id, transaction.is_reply,
                    transaction.error_code, transaction.fields.len());

                // Handle transaction
                if transaction.is_reply == 1 {
                    // This is a reply to one of our requests
                    // Check for UserNameWithInfo fields (from GetUserNameList reply)
                    let mut has_user_info = false;
                    let mut has_file_info = false;
                    let mut files = Vec::new();

                    for field in &transaction.fields {
                        if field.field_type == FieldType::UserNameWithInfo {
                            has_user_info = true;
                            if let Ok(user_info) = HotlineClient::parse_user_info(&field.data) {
                                println!("Parsed user: {} (ID: {}, Icon: {}, Flags: 0x{:04x})", user_info.1, user_info.0, user_info.2, user_info.3);
                                let _ = event_tx.send(HotlineEvent::UserJoined {
                                    user_id: user_info.0,
                                    user_name: user_info.1,
                                    icon: user_info.2,
                                    flags: user_info.3,
                                    color: user_info.4.map(color_u32_to_css),
                                });
                            }
                        } else if field.field_type == FieldType::FileNameWithInfo {
                            has_file_info = true;
                            if let Ok(file_info) = HotlineClient::parse_file_info(&field.data) {
                                println!("Parsed file: {} ({} bytes, folder: {})",
                                    file_info.name, file_info.size, file_info.is_folder);
                                files.push(file_info);
                            }
                        }
                    }

                    // Check if this reply corresponds to a file list request
                    // (even if empty — an empty folder has zero FileNameWithInfo fields)
                    let is_file_list_reply = {
                        let paths = file_list_paths.read().await;
                        paths.contains_key(&transaction.id)
                    };

                    if is_file_list_reply {
                        let path = {
                            let mut paths = file_list_paths.write().await;
                            paths.remove(&transaction.id).unwrap_or_default()
                        };
                        let _ = event_tx.send(HotlineEvent::FileList { files, path });
                    } else if has_file_info {
                        // Fallback: file info fields found but no tracked path
                        let _ = event_tx.send(HotlineEvent::FileList { files, path: Vec::new() });
                    }

                    // If it's not a user/file list reply, forward to pending transaction handlers
                    if !has_user_info && !is_file_list_reply && !has_file_info {
                        // Remove transaction from pending and get the sender
                        // Do this quickly to minimize lock time
                        let tx_opt = {
                            let mut pending = pending_transactions.write().await;
                            pending.remove(&transaction.id)
                        };
                        
                        // Send to channel outside the lock to avoid blocking the receive loop
                        if let Some(tx) = tx_opt {
                            // Try to send - if receiver is dropped (timeout), this will fail gracefully
                            // Use try_send to avoid blocking the receive loop
                            match tx.try_send(transaction) {
                                Ok(()) => {
                                    // Successfully sent
                                }
                                Err(tokio::sync::mpsc::error::TrySendError::Full(txn)) => {
                                    // Channel is full - receiver should be waiting, so spawn a task to send
                                    // This shouldn't normally happen with capacity 1, but handle it gracefully
                                    tokio::spawn(async move {
                                        let _ = tx.send(txn).await;
                                    });
                                }
                                Err(tokio::sync::mpsc::error::TrySendError::Closed(_)) => {
                                    // Receiver was dropped - this is fine (caller timed out and cleaned up)
                                }
                            }
                        } else {
                            // Transaction not found in pending - might have been cleaned up due to timeout
                            // This is normal and not an error - just means the caller gave up waiting
                        }
                    }
                } else {
                    // This is an unsolicited server message
                    Self::handle_server_event(&transaction, &event_tx);
                }
            }

            println!("Receive loop exited");
        });

        let mut receive_task = self.receive_task.lock().await;
        *receive_task = Some(task);
    }

    fn handle_server_event(transaction: &Transaction, event_tx: &mpsc::UnboundedSender<HotlineEvent>) {
        match transaction.transaction_type {
            TransactionType::ChatMessage => {
                // Extract chat message fields
                let user_id = transaction
                    .get_field(FieldType::UserId)
                    .and_then(|f| f.to_u16().ok())
                    .unwrap_or(0);
                let mut user_name = transaction
                    .get_field(FieldType::UserName)
                    .and_then(|f| f.to_string().ok())
                    .unwrap_or_default();
                let mut message = transaction
                    .get_field(FieldType::Data)
                    .and_then(|f| f.to_string().ok())
                    .unwrap_or_default();

                // If the server didn't send a separate UserName field, parse it
                // from the Data field. Hotline chat Data is typically formatted as
                // "\r <nick>:  <message>" or "\n <nick>:  <message>".
                // Emote messages use "*** <nick> <action>" with no colon.
                if user_name.is_empty() {
                    let trimmed = message
                        .trim_start_matches(|c: char| c == '\r' || c == '\n' || c == ' ');
                    if let Some(colon_pos) = trimmed.find(':') {
                        let candidate = trimmed[..colon_pos].trim();
                        if !candidate.is_empty() {
                            user_name = candidate.to_string();
                            message = trimmed[colon_pos + 1..].trim_start().to_string();
                        }
                    } else if let Some(rest) = trimmed.strip_prefix("*** ") {
                        if let Some(name) = rest.split_whitespace().next() {
                            user_name = name.to_string();
                        }
                    }
                }

                // Check if this is a private chat room message (has ChatId field)
                if let Some(chat_id_field) = transaction.get_field(FieldType::ChatId) {
                    if let Ok(chat_id) = chat_id_field.to_u32() {
                        let _ = event_tx.send(HotlineEvent::PrivateChatMessage {
                            chat_id,
                            user_id,
                            user_name,
                            message,
                        });
                    }
                } else {
                    let _ = event_tx.send(HotlineEvent::ChatMessage {
                        user_id,
                        user_name,
                        message,
                    });
                }
            }
            TransactionType::ServerMessage => {
                let message = transaction
                    .get_field(FieldType::Data)
                    .and_then(|f| f.to_string().ok())
                    .unwrap_or_default();

                // Check if this is a private message (has UserId field) or server broadcast
                if let Some(user_id_field) = transaction.get_field(FieldType::UserId) {
                    if let Ok(user_id) = user_id_field.to_u16() {
                        // Private message from a specific user
                        let _ = event_tx.send(HotlineEvent::PrivateMessage { user_id, message });
                    }
                } else {
                    // Server broadcast message
                    let _ = event_tx.send(HotlineEvent::ServerMessage(message));
                }
            }
            TransactionType::NewMessage => {
                // New message board post notification
                let message = transaction
                    .get_field(FieldType::Data)
                    .and_then(|f| f.to_string().ok())
                    .unwrap_or_default();

                let _ = event_tx.send(HotlineEvent::NewMessageBoardPost(message));
            }
            TransactionType::ShowAgreement => {
                println!("Received ShowAgreement transaction");
                println!("Transaction has {} fields", transaction.fields.len());
                
                // Debug: print all fields
                for (i, field) in transaction.fields.iter().enumerate() {
                    println!("  Field {}: type={:?} ({}), size={} bytes", 
                        i, field.field_type, field.field_type as u16, field.data.len());
                    if field.data.len() > 0 && field.data.len() <= 200 {
                        println!("    Data (hex): {:02X?}", &field.data);
                        if let Ok(s) = field.to_string() {
                            println!("    Data (string, first 100 chars): {}", s.chars().take(100).collect::<String>());
                        }
                    }
                }
                
                // Try to get ServerAgreement field (type 150)
                let agreement = if let Some(field) = transaction.get_field(FieldType::ServerAgreement) {
                    println!("Found ServerAgreement field (type 150), size: {} bytes", field.data.len());
                    field.to_string().unwrap_or_default()
                } else {
                    // Maybe it's in the Data field (type 101)?
                    println!("ServerAgreement field not found, trying Data field...");
                    if let Some(field) = transaction.get_field(FieldType::Data) {
                        println!("Found Data field, size: {} bytes", field.data.len());
                        field.to_string().unwrap_or_default()
                    } else {
                        // Try the first field if it's a string
                        println!("Data field not found, trying first field...");
                        if let Some(field) = transaction.fields.first() {
                            println!("First field type: {:?}, size: {} bytes", field.field_type, field.data.len());
                            field.to_string().unwrap_or_default()
                        } else {
                            String::new()
                        }
                    }
                };

                println!("Agreement text (first 100 chars): {}", agreement.chars().take(100).collect::<String>());
                println!("Sending AgreementRequired event with {} characters", agreement.len());
                let _ = event_tx.send(HotlineEvent::AgreementRequired(agreement));
            }
            TransactionType::NotifyUserChange => {
                let user_id = transaction
                    .get_field(FieldType::UserId)
                    .and_then(|f| f.to_u16().ok())
                    .unwrap_or(0);
                let user_name = transaction
                    .get_field(FieldType::UserName)
                    .and_then(|f| f.to_string().ok())
                    .unwrap_or_default();
                let icon = transaction
                    .get_field(FieldType::UserIconId)
                    .and_then(|f| f.to_u16().ok())
                    .unwrap_or(414);
                let flags = transaction
                    .get_field(FieldType::UserFlags)
                    .and_then(|f| f.to_u16().ok())
                    .unwrap_or(0);
                // fogWraith DATA_COLOR (0x0500) is the canonical delivery form.
                // Per user-management spec, when both this field and trailing
                // bytes on UserNameWithInfo appear for the same user, 0x0500
                // wins. The trailing-bytes parser in client/users.rs only runs
                // on Get User Name List replies, which don't carry this field,
                // so the two paths don't conflict in practice.
                let color = transaction
                    .get_field(FieldType::NickColor)
                    .and_then(|f| f.to_u32().ok())
                    .and_then(|c| if c == 0xFFFFFFFF { None } else { Some(color_u32_to_css(c)) });

                let _ = event_tx.send(HotlineEvent::UserChanged {
                    user_id,
                    user_name,
                    icon,
                    flags,
                    color,
                });
            }
            TransactionType::NotifyUserDelete => {
                let user_id = transaction
                    .get_field(FieldType::UserId)
                    .and_then(|f| f.to_u16().ok())
                    .unwrap_or(0);

                let _ = event_tx.send(HotlineEvent::UserLeft { user_id });
            }
            TransactionType::DisconnectMessage => {
                let message = transaction
                    .get_field(FieldType::Data)
                    .and_then(|f| f.to_string().ok())
                    .unwrap_or_else(|| "You have been disconnected.".to_string());

                let _ = event_tx.send(HotlineEvent::DisconnectMessage(message));
            }
            TransactionType::InviteToChat => {
                let chat_id = transaction
                    .get_field(FieldType::ChatId)
                    .and_then(|f| f.to_u32().ok())
                    .unwrap_or(0);
                let user_id = transaction
                    .get_field(FieldType::UserId)
                    .and_then(|f| f.to_u16().ok())
                    .unwrap_or(0);
                let user_name = transaction
                    .get_field(FieldType::UserName)
                    .and_then(|f| f.to_string().ok())
                    .unwrap_or_default();

                let _ = event_tx.send(HotlineEvent::ChatInvite { chat_id, user_id, user_name });
            }
            TransactionType::NotifyChatOfUserChange => {
                let chat_id = transaction
                    .get_field(FieldType::ChatId)
                    .and_then(|f| f.to_u32().ok())
                    .unwrap_or(0);
                let user_id = transaction
                    .get_field(FieldType::UserId)
                    .and_then(|f| f.to_u16().ok())
                    .unwrap_or(0);
                let user_name = transaction
                    .get_field(FieldType::UserName)
                    .and_then(|f| f.to_string().ok())
                    .unwrap_or_default();
                let icon = transaction
                    .get_field(FieldType::UserIconId)
                    .and_then(|f| f.to_u16().ok())
                    .unwrap_or(414);
                let flags = transaction
                    .get_field(FieldType::UserFlags)
                    .and_then(|f| f.to_u16().ok())
                    .unwrap_or(0);
                // fogWraith DATA_COLOR (0x0500) — canonical form per spec.
                // Private chat rooms don't use the legacy trailing-bytes form,
                // so there's no tiebreak to apply here.
                let color = transaction
                    .get_field(FieldType::NickColor)
                    .and_then(|f| f.to_u32().ok())
                    .and_then(|c| if c == 0xFFFFFFFF { None } else { Some(color_u32_to_css(c)) });

                let _ = event_tx.send(HotlineEvent::ChatUserJoined { chat_id, user_id, user_name, icon, flags, color });
            }
            TransactionType::NotifyChatOfUserDelete => {
                let chat_id = transaction
                    .get_field(FieldType::ChatId)
                    .and_then(|f| f.to_u32().ok())
                    .unwrap_or(0);
                let user_id = transaction
                    .get_field(FieldType::UserId)
                    .and_then(|f| f.to_u16().ok())
                    .unwrap_or(0);

                let _ = event_tx.send(HotlineEvent::ChatUserLeft { chat_id, user_id });
            }
            TransactionType::NotifyChatSubject => {
                let chat_id = transaction
                    .get_field(FieldType::ChatId)
                    .and_then(|f| f.to_u32().ok())
                    .unwrap_or(0);
                let subject = transaction
                    .get_field(FieldType::ChatSubject)
                    .and_then(|f| f.to_string().ok())
                    .unwrap_or_default();

                let _ = event_tx.send(HotlineEvent::ChatSubjectChanged { chat_id, subject });
            }
            TransactionType::ServerBanner => {
                let banner_type = transaction
                    .get_field(FieldType::ServerBannerType)
                    .and_then(|f| f.to_u16().ok());
                let url = transaction
                    .get_field(FieldType::ServerBannerUrl)
                    .and_then(|f| f.to_string().ok());

                let _ = event_tx.send(HotlineEvent::ServerBannerUpdate { banner_type, url });
            }
            _ => {
                println!("Unhandled server event: {:?}", transaction.transaction_type);
            }
        }
    }

    // Start background task to send keep-alive messages
    async fn start_keepalive(&self) {
        println!("Starting keep-alive...");

        let hope_writer = self.transport_writer.clone();
        let transport_reader = self.transport_reader.clone();
        let running = self.running.clone();
        let transaction_counter = self.transaction_counter.clone();
        let status = self.status.clone();
        let event_tx = self.event_tx.clone();

        let task = tokio::spawn(async move {
            while running.load(Ordering::SeqCst) {
                tokio::time::sleep(Duration::from_secs(180)).await; // 3 minutes like Swift client

                if !running.load(Ordering::SeqCst) {
                    break;
                }

                // Send KeepAlive (500) as keep-alive. Falls back to GetUserNameList
                // if the server doesn't support KeepAlive (older servers).
                let transaction = Transaction::new(
                    transaction_counter.fetch_add(1, Ordering::SeqCst),
                    TransactionType::KeepAlive,
                );

                let mut write_guard = hope_writer.lock().await;
                if let Some(writer) = write_guard.as_mut() {
                    if writer.write_transaction(&transaction).await.is_err() {
                        println!("Keep-alive write failed — marking disconnected");
                        // Clear writer (we already hold the guard) then reader;
                        // receive loop will unblock on the next read error.
                        *write_guard = None;
                        drop(write_guard);
                        transport_reader.lock().await.take();
                        *status.lock().await = ConnectionStatus::Disconnected;
                        let _ = event_tx.send(HotlineEvent::StatusChanged(ConnectionStatus::Disconnected));
                        break;
                    }
                    println!("Keep-alive sent");
                } else {
                    break;
                }
            }

            println!("Keep-alive exited");
        });

        let mut keepalive_task = self.keepalive_task.lock().await;
        *keepalive_task = Some(task);
    }

    pub async fn get_server_info(&self) -> Result<ServerInfo, String> {
        let server_info = self.server_info.lock().await;
        server_info
            .clone()
            .ok_or_else(|| "Server info not available".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::HotlineClient;
    use openssl::asn1::Asn1Time;
    use openssl::bn::BigNum;
    use openssl::hash::MessageDigest;
    use openssl::nid::Nid;
    use openssl::pkey::{PKey, Private};
    use openssl::rsa::Rsa;
    use openssl::ssl::{SslAcceptor, SslMethod, SslVersion};
    use openssl::x509::{X509NameBuilder, X509};
    use std::net::TcpListener;
    use std::thread;
    use tokio::net::TcpStream;

    fn build_self_signed_cert() -> Result<(PKey<Private>, X509), String> {
        let rsa = Rsa::generate(2048).map_err(|e| format!("rsa generate failed: {}", e))?;
        let pkey = PKey::from_rsa(rsa).map_err(|e| format!("pkey create failed: {}", e))?;

        let mut name_builder =
            X509NameBuilder::new().map_err(|e| format!("name builder failed: {}", e))?;
        name_builder
            .append_entry_by_nid(Nid::COMMONNAME, "localhost")
            .map_err(|e| format!("set CN failed: {}", e))?;
        let name = name_builder.build();

        let mut builder = X509::builder().map_err(|e| format!("x509 builder failed: {}", e))?;
        builder
            .set_version(2)
            .map_err(|e| format!("set version failed: {}", e))?;

        let mut serial = BigNum::new().map_err(|e| format!("serial bignum failed: {}", e))?;
        serial
            .rand(64, openssl::bn::MsbOption::MAYBE_ZERO, false)
            .map_err(|e| format!("serial rand failed: {}", e))?;
        let serial = serial
            .to_asn1_integer()
            .map_err(|e| format!("serial to asn1 failed: {}", e))?;
        builder
            .set_serial_number(&serial)
            .map_err(|e| format!("set serial failed: {}", e))?;

        builder
            .set_subject_name(&name)
            .map_err(|e| format!("set subject failed: {}", e))?;
        builder
            .set_issuer_name(&name)
            .map_err(|e| format!("set issuer failed: {}", e))?;
        builder
            .set_pubkey(&pkey)
            .map_err(|e| format!("set pubkey failed: {}", e))?;
        let not_before =
            Asn1Time::days_from_now(0).map_err(|e| format!("not_before failed: {}", e))?;
        builder
            .set_not_before(&not_before)
            .map_err(|e| format!("set not_before failed: {}", e))?;
        let not_after =
            Asn1Time::days_from_now(1).map_err(|e| format!("not_after failed: {}", e))?;
        builder
            .set_not_after(&not_after)
            .map_err(|e| format!("set not_after failed: {}", e))?;

        builder
            .sign(&pkey, MessageDigest::sha256())
            .map_err(|e| format!("cert sign failed: {}", e))?;

        Ok((pkey, builder.build()))
    }

    fn spawn_tls10_server() -> Result<(u16, thread::JoinHandle<Result<(), String>>), String> {
        let listener = TcpListener::bind("127.0.0.1:0")
            .map_err(|e| format!("bind test server failed: {}", e))?;
        let port = listener
            .local_addr()
            .map_err(|e| format!("local_addr failed: {}", e))?
            .port();

        let (pkey, cert) = build_self_signed_cert()?;

        let mut builder = SslAcceptor::mozilla_intermediate_v5(SslMethod::tls())
            .map_err(|e| format!("acceptor builder failed: {}", e))?;
        builder
            .set_private_key(&pkey)
            .map_err(|e| format!("set private key failed: {}", e))?;
        builder
            .set_certificate(&cert)
            .map_err(|e| format!("set certificate failed: {}", e))?;
        builder
            .check_private_key()
            .map_err(|e| format!("check private key failed: {}", e))?;
        builder
            .set_min_proto_version(Some(SslVersion::TLS1))
            .map_err(|e| format!("set min version failed: {}", e))?;
        builder
            .set_max_proto_version(Some(SslVersion::TLS1))
            .map_err(|e| format!("set max version failed: {}", e))?;
        builder
            .set_cipher_list("AES128-SHA:AES256-SHA:@SECLEVEL=0")
            .map_err(|e| format!("set cipher list failed: {}", e))?;

        let acceptor = builder.build();
        let handle = thread::spawn(move || {
            let (stream, _) = listener
                .accept()
                .map_err(|e| format!("accept failed: {}", e))?;
            let _ = acceptor
                .accept(stream)
                .map_err(|e| format!("tls accept failed: {}", e))?;
            Ok(())
        });

        Ok((port, handle))
    }

    #[tokio::test]
    async fn rustls_modern_tls_fails_against_tls10_only_server() {
        let (port, server) = spawn_tls10_server().expect("failed to start tls10 server");
        let stream = TcpStream::connect(("127.0.0.1", port))
            .await
            .expect("connect test server failed");

        let result = HotlineClient::wrap_tls(stream, "127.0.0.1").await;
        assert!(result.is_err(), "modern TLS unexpectedly succeeded");

        // For this test, handshake failure on the server side is expected.
        let _ = server.join();
    }

    fn spawn_tls12_server() -> Result<(u16, thread::JoinHandle<Result<(), String>>), String> {
        let listener = TcpListener::bind("127.0.0.1:0")
            .map_err(|e| format!("bind test server failed: {}", e))?;
        let port = listener
            .local_addr()
            .map_err(|e| format!("local_addr failed: {}", e))?
            .port();

        let (pkey, cert) = build_self_signed_cert()?;

        let mut builder = SslAcceptor::mozilla_intermediate_v5(SslMethod::tls())
            .map_err(|e| format!("acceptor builder failed: {}", e))?;
        builder
            .set_private_key(&pkey)
            .map_err(|e| format!("set private key failed: {}", e))?;
        builder
            .set_certificate(&cert)
            .map_err(|e| format!("set certificate failed: {}", e))?;
        builder
            .check_private_key()
            .map_err(|e| format!("check private key failed: {}", e))?;
        builder
            .set_min_proto_version(Some(SslVersion::TLS1_2))
            .map_err(|e| format!("set min version failed: {}", e))?;
        builder
            .set_max_proto_version(Some(SslVersion::TLS1_2))
            .map_err(|e| format!("set max version failed: {}", e))?;

        let acceptor = builder.build();
        let handle = thread::spawn(move || {
            let (stream, _) = listener
                .accept()
                .map_err(|e| format!("accept failed: {}", e))?;
            let _ = acceptor
                .accept(stream)
                .map_err(|e| format!("tls accept failed: {}", e))?;
            Ok(())
        });

        Ok((port, handle))
    }

    fn test_tls_bookmark(port: u16) -> crate::protocol::types::Bookmark {
        crate::protocol::types::Bookmark {
            id: "test".to_string(),
            name: "Test".to_string(),
            address: "127.0.0.1".to_string(),
            port,
            login: "guest".to_string(),
            password: None,
            has_password: false,
            icon: None,
            auto_connect: false,
            tls: true,
            hope: false,
            bookmark_type: Some(crate::protocol::types::BookmarkType::Server),
        }
    }

    #[tokio::test]
    async fn rustls_modern_tls_succeeds_against_tls12_only_server() {
        let (port, server) = spawn_tls12_server().expect("failed to start tls12 server");
        let stream = TcpStream::connect(("127.0.0.1", port))
            .await
            .expect("connect test server failed");

        let result = HotlineClient::wrap_tls(stream, "127.0.0.1").await;
        assert!(
            result.is_ok(),
            "modern TLS should succeed against TLS1.2-only server, got: {:?}",
            result.err()
        );

        server
            .join()
            .expect("tls12 server thread panicked")
            .expect("tls12 server failed");
    }

    #[tokio::test]
    async fn open_connection_prefers_modern_tls_even_when_legacy_is_enabled() {
        let (port, server) = spawn_tls12_server().expect("failed to start tls12 server");
        let client = HotlineClient::new(test_tls_bookmark(port), true);

        client
            .open_connection()
            .await
            .expect("open_connection should succeed against a TLS1.2 server");

        assert!(client.transport_reader.lock().await.is_some());
        assert!(client.transport_writer.lock().await.is_some());

        server
            .join()
            .expect("tls12 server thread panicked")
            .expect("tls12 server failed");
    }

    #[test]
    fn legacy_tls_cipher_list_includes_compatibility_ciphers() {
        assert!(super::LEGACY_TLS_CIPHER_LIST.contains("DHE-RSA-AES256-SHA"));
        assert!(super::LEGACY_TLS_CIPHER_LIST.contains("DHE-RSA-AES128-SHA"));
        assert!(super::LEGACY_TLS_CIPHER_LIST.contains("@SECLEVEL=0"));
    }

    #[test]
    fn legacy_tls_sni_host_uses_dummy_name_for_ip_literals() {
        assert_eq!(super::legacy_tls_sni_host("127.0.0.1"), "hotline");
        assert_eq!(super::legacy_tls_sni_host("::1"), "hotline");
        assert_eq!(super::legacy_tls_sni_host("fe80::1%en0"), "hotline");
        assert_eq!(
            super::legacy_tls_sni_host("hotline.example.com"),
            "hotline.example.com"
        );
    }
}
