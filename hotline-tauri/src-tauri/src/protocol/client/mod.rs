// Hotline client implementation

mod chat;
pub(crate) mod files;
pub(crate) mod hope;
mod hope_stream;
mod news;
pub(crate) mod users;

use super::constants::{
    FieldType, TransactionType, PROTOCOL_ID, PROTOCOL_SUBVERSION,
    PROTOCOL_VERSION, SUBPROTOCOL_ID, TRANSACTION_HEADER_SIZE,
    CAPABILITY_LARGE_FILES, resolve_error_message,
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

use hope_stream::{HopeReader, HopeWriter};

// TLS support
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::DigitallySignedStruct;
use tokio_rustls::TlsConnector;

// Trait object type aliases for stream halves (supports both plain TCP and TLS)
pub(crate) type BoxedRead = Box<dyn AsyncRead + Unpin + Send>;
pub(crate) type BoxedWrite = Box<dyn AsyncWrite + Unpin + Send>;

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
    ChatUserJoined { chat_id: u32, user_id: u16, user_name: String, icon: u16, flags: u16 },
    ChatUserLeft { chat_id: u32, user_id: u16 },
    ChatSubjectChanged { chat_id: u32, subject: String },
    ServerBannerUpdate { banner_type: Option<u16>, url: Option<String> },
    ProtocolLog { level: String, message: String },
    StatusChanged(ConnectionStatus),
}

/// Convert a 0x00RRGGBB u32 color to a CSS hex string like "#RRGGBB"
fn color_u32_to_css(c: u32) -> String {
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
    username: Arc<Mutex<String>>,
    user_icon_id: Arc<Mutex<u16>>,
    status: Arc<Mutex<ConnectionStatus>>,
    hope_reader: Arc<Mutex<Option<HopeReader>>>,
    hope_writer: Arc<Mutex<Option<HopeWriter>>>,
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

    pub fn new(bookmark: Bookmark) -> Self {
        let (event_tx, event_rx) = mpsc::unbounded_channel();

        Self {
            bookmark,
            username: Arc::new(Mutex::new("guest".to_string())),
            user_icon_id: Arc::new(Mutex::new(191)),
            status: Arc::new(Mutex::new(ConnectionStatus::Disconnected)),
            hope_reader: Arc::new(Mutex::new(None)),
            hope_writer: Arc::new(Mutex::new(None)),
            transaction_counter: Arc::new(AtomicU32::new(1)),
            file_list_paths: Arc::new(RwLock::new(HashMap::new())),
            server_info: Arc::new(Mutex::new(None)),
            user_access: Arc::new(Mutex::new(0)),
            large_file_support: Arc::new(AtomicBool::new(false)),
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
        let stream = tokio::time::timeout(
            Duration::from_secs(10),
            TcpStream::connect(&addr),
        )
        .await
        .map_err(|_| format!("Connection timed out after 10 seconds"))?
        .map_err(|e| format!("Failed to connect: {}", e))?;

        if self.bookmark.tls {
            let tls_stream = Self::wrap_tls(stream, &self.bookmark.address).await?;
            let (read_half, write_half) = tokio::io::split(tls_stream);
            *self.hope_reader.lock().await = Some(HopeReader::new(Box::new(read_half)));
            *self.hope_writer.lock().await = Some(HopeWriter::new(Box::new(write_half)));
        } else {
            let (read_half, write_half) = stream.into_split();
            *self.hope_reader.lock().await = Some(HopeReader::new(Box::new(read_half)));
            *self.hope_writer.lock().await = Some(HopeWriter::new(Box::new(write_half)));
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

    /// Wrap a TCP stream with TLS, accepting any certificate (for self-signed Hotline servers).
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

    async fn handshake(&self, subversion: u16) -> Result<(), String> {
        println!("Performing handshake (subversion {})...", subversion);

        // Build handshake packet (12 bytes)
        let mut handshake = Vec::with_capacity(12);
        handshake.extend_from_slice(PROTOCOL_ID); // "TRTP"
        handshake.extend_from_slice(SUBPROTOCOL_ID); // "HOTL"
        handshake.extend_from_slice(&PROTOCOL_VERSION.to_be_bytes()); // 0x0001
        handshake.extend_from_slice(&subversion.to_be_bytes());

        // Send handshake (raw — before any encryption)
        {
            let mut write_guard = self.hope_writer.lock().await;
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
            let mut read_guard = self.hope_reader.lock().await;
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
            return Err(format!("Handshake failed with error code {}", error_code));
        }

        println!("Handshake successful (subversion {})", subversion);

        Ok(())
    }

    /// Read a single transaction from the connection (raw, pre-encryption).
    /// Used during login before the receive loop starts.
    async fn read_transaction_raw(&self) -> Result<Transaction, String> {
        let mut read_guard = self.hope_reader.lock().await;
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
        let mut write_guard = self.hope_writer.lock().await;
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
        if let Err(e) = self.send_transaction_raw(&hope_tx).await {
            println!("HOPE probe send failed: {}", e);
            return None;
        }

        // Read server reply — if this fails, server doesn't support HOPE
        let reply = match self.read_transaction_raw().await {
            Ok(r) => r,
            Err(e) => {
                println!("HOPE probe read failed: {}", e);
                return None;
            }
        };

        // Check for HOPE session key in the reply
        let session_key_field = reply.get_field(FieldType::HopeSessionKey)?;
        if session_key_field.data.len() != 64 {
            println!("HOPE session key wrong size ({}), not supported", session_key_field.data.len());
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

        let server_compression = reply
            .get_field(FieldType::HopeServerCompression)
            .and_then(|f| hope::decode_cipher_selection(&f.data).ok())
            .unwrap_or_else(|| "NONE".to_string());
        let client_compression = reply
            .get_field(FieldType::HopeClientCompression)
            .and_then(|f| hope::decode_cipher_selection(&f.data).ok())
            .unwrap_or_else(|| "NONE".to_string());

        println!("HOPE negotiation: MAC={:?}, mac_login={}, server_cipher={}, client_cipher={}",
            selected_mac, mac_login, server_cipher, client_cipher);
        self.emit_protocol_log(
            "info",
            format!(
                "HOPE negotiated: mac={:?}, mac_login={}, server_cipher={}, client_cipher={}",
                selected_mac, mac_login, server_cipher, client_cipher
            ),
        );

        Some(hope::HopeNegotiation {
            session_key,
            mac_algorithm: selected_mac,
            mac_login,
            server_cipher,
            client_cipher,
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
        let hope_transport_active = hope_negotiation.as_ref().is_some_and(|negotiation| {
            negotiation.mac_algorithm.supports_transport()
                && (negotiation.server_cipher == "RC4" || negotiation.client_cipher == "RC4")
        });

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
            auth_tx.add_field(TransactionField::from_u32(FieldType::VersionNumber, 255));
            auth_tx.add_field(TransactionField::from_u16(FieldType::Capabilities, CAPABILITY_LARGE_FILES));

            println!("Sending HOPE authenticated login...");
            self.emit_protocol_log("info", "Sending HOPE authenticated login");
            self.send_transaction_raw(&auth_tx).await?;

            if hope_transport_active {
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
                    let mut reader_guard = self.hope_reader.lock().await;
                    if let Some(reader) = reader_guard.as_mut() {
                        reader.activate_encryption(
                            encode_key,
                            negotiation.session_key,
                            negotiation.mac_algorithm,
                        );
                    }
                }
                {
                    let mut writer_guard = self.hope_writer.lock().await;
                    if let Some(writer) = writer_guard.as_mut() {
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
            login_tx.add_field(TransactionField::from_u32(FieldType::VersionNumber, 255));
            login_tx.add_field(TransactionField::from_u16(FieldType::Capabilities, CAPABILITY_LARGE_FILES));

            println!("Sending login...");
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
        println!("Server capabilities: 0x{:04X} (large files: {})", server_capabilities, large_files);

        {
            let mut server_info = self.server_info.lock().await;
            *server_info = Some(ServerInfo {
                name: server_name,
                description: server_description,
                version: server_version,
                hope_enabled: hope_negotiation.is_some(),
                hope_transport: hope_transport_active,
                agreement: None,
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
            let mut read_guard = self.hope_reader.lock().await;
            if let Some(reader) = read_guard.take() {
                drop(reader);
            }
        }
        {
            let mut write_guard = self.hope_writer.lock().await;
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

        let mut status = self.status.lock().await;
        *status = ConnectionStatus::Disconnected;
        let _ = self.event_tx.send(HotlineEvent::StatusChanged(ConnectionStatus::Disconnected));

        println!("Disconnected");

        Ok(())
    }

    pub async fn get_status(&self) -> ConnectionStatus {
        self.status.lock().await.clone()
    }

    /// Read a single transaction through the HOPE reader (handles decryption if active).
    /// Used during login after encryption is activated.
    async fn read_transaction(&self) -> Result<Transaction, String> {
        let mut read_guard = self.hope_reader.lock().await;
        let reader = read_guard.as_mut().ok_or("Not connected")?;
        reader.read_transaction().await
    }

    /// Send a transaction through the HOPE writer (handles encryption if active).
    /// This is the primary method all sub-modules should use to send data.
    pub(crate) async fn send_transaction(&self, transaction: &Transaction) -> Result<(), String> {
        let mut write_guard = self.hope_writer.lock().await;
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

        let hope_reader = self.hope_reader.clone();
        let hope_writer = self.hope_writer.clone();
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
                let user_name = transaction
                    .get_field(FieldType::UserName)
                    .and_then(|f| f.to_string().ok())
                    .unwrap_or_default();
                let message = transaction
                    .get_field(FieldType::Data)
                    .and_then(|f| f.to_string().ok())
                    .unwrap_or_default();

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

                let _ = event_tx.send(HotlineEvent::ChatUserJoined { chat_id, user_id, user_name, icon, flags });
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

        let hope_writer = self.hope_writer.clone();
        let running = self.running.clone();
        let transaction_counter = self.transaction_counter.clone();

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
                        println!("Keep-alive failed, connection lost");
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
