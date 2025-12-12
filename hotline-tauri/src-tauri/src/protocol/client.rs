// Hotline client implementation

use super::constants::{
    FieldType, TransactionType, PROTOCOL_ID, PROTOCOL_SUBVERSION, PROTOCOL_VERSION, SUBPROTOCOL_ID,
    TRANSACTION_HEADER_SIZE,
};
use super::transaction::{Transaction, TransactionField};
use super::types::{Bookmark, ConnectionStatus, ServerInfo};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::{mpsc, Mutex, RwLock};
use tokio::task::JoinHandle;

// Event types that can be received from the server
#[derive(Debug, Clone)]
pub enum HotlineEvent {
    ChatMessage { user_id: u16, user_name: String, message: String },
    ServerMessage(String),
    UserJoined { user_id: u16, user_name: String, icon: u16 },
    UserLeft { user_id: u16 },
    UserChanged { user_id: u16, user_name: String, icon: u16 },
    AgreementRequired(String),
    FileList { files: Vec<FileInfo> },
}

#[derive(Debug, Clone)]
pub struct FileInfo {
    pub name: String,
    pub size: u32,
    pub is_folder: bool,
    pub file_type: String,
    pub creator: String,
}

use tokio::net::tcp::{OwnedReadHalf, OwnedWriteHalf};

pub struct HotlineClient {
    bookmark: Bookmark,
    status: Arc<Mutex<ConnectionStatus>>,
    read_half: Arc<Mutex<Option<OwnedReadHalf>>>,
    write_half: Arc<Mutex<Option<OwnedWriteHalf>>>,
    transaction_counter: Arc<AtomicU32>,
    running: Arc<AtomicBool>,

    // Event channel
    event_tx: mpsc::UnboundedSender<HotlineEvent>,
    pub event_rx: Arc<Mutex<Option<mpsc::UnboundedReceiver<HotlineEvent>>>>,

    // Pending transactions (for request/reply pattern)
    pending_transactions: Arc<RwLock<HashMap<u32, mpsc::Sender<Transaction>>>>,

    // Background tasks
    receive_task: Arc<Mutex<Option<JoinHandle<()>>>>,
    keepalive_task: Arc<Mutex<Option<JoinHandle<()>>>>,
}

impl HotlineClient {
    pub fn new(bookmark: Bookmark) -> Self {
        let (event_tx, event_rx) = mpsc::unbounded_channel();

        Self {
            bookmark,
            status: Arc::new(Mutex::new(ConnectionStatus::Disconnected)),
            read_half: Arc::new(Mutex::new(None)),
            write_half: Arc::new(Mutex::new(None)),
            transaction_counter: Arc::new(AtomicU32::new(1)),
            running: Arc::new(AtomicBool::new(false)),
            event_tx,
            event_rx: Arc::new(Mutex::new(Some(event_rx))),
            pending_transactions: Arc::new(RwLock::new(HashMap::new())),
            receive_task: Arc::new(Mutex::new(None)),
            keepalive_task: Arc::new(Mutex::new(None)),
        }
    }

    fn next_transaction_id(&self) -> u32 {
        self.transaction_counter.fetch_add(1, Ordering::SeqCst)
    }

    pub async fn connect(&self) -> Result<(), String> {
        println!("Connecting to {}:{}...", self.bookmark.address, self.bookmark.port);

        // Update status
        {
            let mut status = self.status.lock().await;
            *status = ConnectionStatus::Connecting;
        }

        // Connect TCP
        let addr = format!("{}:{}", self.bookmark.address, self.bookmark.port);
        let stream = TcpStream::connect(&addr)
            .await
            .map_err(|e| format!("Failed to connect: {}", e))?;

        // Split stream into read and write halves for concurrent access
        let (read_half, write_half) = stream.into_split();

        // Store halves
        {
            let mut read_guard = self.read_half.lock().await;
            *read_guard = Some(read_half);
        }
        {
            let mut write_guard = self.write_half.lock().await;
            *write_guard = Some(write_half);
        }

        // Update status
        {
            let mut status = self.status.lock().await;
            *status = ConnectionStatus::Connected;
        }

        // Perform handshake
        self.handshake().await?;

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

    async fn handshake(&self) -> Result<(), String> {
        println!("Performing handshake...");

        // Build handshake packet (12 bytes)
        let mut handshake = Vec::with_capacity(12);
        handshake.extend_from_slice(PROTOCOL_ID); // "TRTP"
        handshake.extend_from_slice(SUBPROTOCOL_ID); // "HOTL"
        handshake.extend_from_slice(&PROTOCOL_VERSION.to_be_bytes()); // 0x0001
        handshake.extend_from_slice(&PROTOCOL_SUBVERSION.to_be_bytes()); // 0x0002

        // Send handshake
        {
            let mut write_guard = self.write_half.lock().await;
            let write_stream = write_guard
                .as_mut()
                .ok_or("Not connected".to_string())?;
            write_stream
                .write_all(&handshake)
                .await
                .map_err(|e| format!("Failed to send handshake: {}", e))?;
        }

        // Read response (8 bytes)
        let mut response = [0u8; 8];
        {
            let mut read_guard = self.read_half.lock().await;
            let read_stream = read_guard
                .as_mut()
                .ok_or("Not connected".to_string())?;
            read_stream
                .read_exact(&mut response)
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

        println!("Handshake successful");

        Ok(())
    }

    async fn login(&self) -> Result<(), String> {
        println!("Logging in as {}...", self.bookmark.login);

        // Update status
        {
            let mut status = self.status.lock().await;
            *status = ConnectionStatus::LoggingIn;
        }

        // Build login transaction
        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::Login);

        // Add fields
        transaction.add_field(TransactionField::from_encoded_string(
            FieldType::UserLogin,
            &self.bookmark.login,
        ));
        transaction.add_field(TransactionField::from_encoded_string(
            FieldType::UserPassword,
            self.bookmark.password.as_deref().unwrap_or(""),
        ));
        transaction.add_field(TransactionField::from_u16(
            FieldType::UserIconId,
            self.bookmark.icon.unwrap_or(414),
        ));
        transaction.add_field(TransactionField::from_string(
            FieldType::UserName,
            &self.bookmark.name,
        ));
        transaction.add_field(TransactionField::from_u32(FieldType::VersionNumber, 123));

        // Send transaction
        let encoded = transaction.encode();
        println!("Login transaction: {} bytes, fields={}", encoded.len(), transaction.fields.len());
        println!("Transaction data: {:02X?}", &encoded[..std::cmp::min(40, encoded.len())]);

        {
            let mut write_guard = self.write_half.lock().await;
            let write_stream = write_guard
                .as_mut()
                .ok_or("Not connected".to_string())?;
            write_stream
                .write_all(&encoded)
                .await
                .map_err(|e| format!("Failed to send login: {}", e))?;
        }

        println!("Login transaction sent, waiting for reply...");

        // Read reply header
        let mut header = [0u8; TRANSACTION_HEADER_SIZE];
        println!("Reading login reply header...");
        {
            let mut read_guard = self.read_half.lock().await;
            let read_stream = read_guard
                .as_mut()
                .ok_or("Not connected".to_string())?;
            read_stream
                .read_exact(&mut header)
                .await
                .map_err(|e| format!("Failed to read login reply: {}", e))?;
        }

        println!("Login reply header received: {:02X?}", &header);

        // Check data size to see if we need to read more
        let data_size = u32::from_be_bytes([header[16], header[17], header[18], header[19]]);
        let mut full_data = header.to_vec();

        // Read additional data if present
        if data_size > 0 {
            let mut additional_data = vec![0u8; data_size as usize];
            let mut read_guard = self.read_half.lock().await;
            let read_stream = read_guard
                .as_mut()
                .ok_or("Not connected".to_string())?;
            read_stream
                .read_exact(&mut additional_data)
                .await
                .map_err(|e| format!("Failed to read login reply data: {}", e))?;
            full_data.extend(additional_data);
        }

        // Decode full transaction
        let reply = Transaction::decode(&full_data).map_err(|e| format!("Failed to decode reply: {}", e))?;

        println!("Login reply: error_code={}, fields={}", reply.error_code, reply.fields.len());

        // Check for error
        if reply.error_code != 0 {
            let error_msg = reply
                .get_field(FieldType::ErrorText)
                .and_then(|f| f.to_string().ok())
                .unwrap_or_else(|| format!("Error code: {}", reply.error_code));

            return Err(format!("Login failed: {}", error_msg));
        }

        // Update status
        {
            let mut status = self.status.lock().await;
            *status = ConnectionStatus::LoggedIn;
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
            let mut read_guard = self.read_half.lock().await;
            if let Some(read_half) = read_guard.take() {
                drop(read_half);
            }
        }
        {
            let mut write_guard = self.write_half.lock().await;
            if let Some(write_half) = write_guard.take() {
                drop(write_half);
            }
        }

        let mut status = self.status.lock().await;
        *status = ConnectionStatus::Disconnected;

        println!("Disconnected");

        Ok(())
    }

    pub async fn get_status(&self) -> ConnectionStatus {
        self.status.lock().await.clone()
    }

    // Start background task to receive messages from server
    async fn start_receive_loop(&self) {
        println!("Starting receive loop...");

        self.running.store(true, Ordering::SeqCst);

        let read_half = self.read_half.clone();
        let running = self.running.clone();
        let event_tx = self.event_tx.clone();
        let pending_transactions = self.pending_transactions.clone();

        let task = tokio::spawn(async move {
            while running.load(Ordering::SeqCst) {
                // Read transaction header
                let mut header = [0u8; TRANSACTION_HEADER_SIZE];

                let mut read_guard = read_half.lock().await;
                let read_stream = match read_guard.as_mut() {
                    Some(s) => s,
                    None => break,
                };

                let read_result = read_stream.read_exact(&mut header).await;
                drop(read_guard);

                if read_result.is_err() {
                    println!("Receive loop: connection closed");
                    break;
                }

                // Decode transaction
                let transaction = match Transaction::decode(&header) {
                    Ok(t) => t,
                    Err(e) => {
                        eprintln!("Failed to decode transaction: {}", e);
                        continue;
                    }
                };

                // Read additional data if needed
                let data_size = u32::from_be_bytes([header[16], header[17], header[18], header[19]]);
                let mut full_data = header.to_vec();

                if data_size > 0 {
                    let mut additional_data = vec![0u8; data_size as usize];
                    let mut read_guard = read_half.lock().await;
                    let read_stream = match read_guard.as_mut() {
                        Some(s) => s,
                        None => break,
                    };

                    if read_stream.read_exact(&mut additional_data).await.is_err() {
                        break;
                    }
                    drop(read_guard);

                    full_data.extend(additional_data);
                }

                // Re-decode with full data
                let transaction = match Transaction::decode(&full_data) {
                    Ok(t) => t,
                    Err(e) => {
                        eprintln!("Failed to decode full transaction: {}", e);
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
                            if let Ok(user_info) = Self::parse_user_info(&field.data) {
                                println!("Parsed user: {} (ID: {}, Icon: {})", user_info.1, user_info.0, user_info.2);
                                let _ = event_tx.send(HotlineEvent::UserJoined {
                                    user_id: user_info.0,
                                    user_name: user_info.1,
                                    icon: user_info.2,
                                });
                            }
                        } else if field.field_type == FieldType::FileNameWithInfo {
                            has_file_info = true;
                            if let Ok(file_info) = Self::parse_file_info(&field.data) {
                                println!("Parsed file: {} ({} bytes, folder: {})",
                                    file_info.name, file_info.size, file_info.is_folder);
                                files.push(file_info);
                            }
                        }
                    }

                    // Send file list event if we parsed any files
                    if has_file_info {
                        let _ = event_tx.send(HotlineEvent::FileList { files });
                    }

                    // If it's not a user/file list reply, forward to pending transaction handlers
                    if !has_user_info && !has_file_info {
                        let pending = pending_transactions.read().await;
                        if let Some(tx) = pending.get(&transaction.id) {
                            let _ = tx.send(transaction).await;
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

    fn parse_file_info(data: &[u8]) -> Result<FileInfo, String> {
        // FileNameWithInfo format:
        // 4 bytes: File type (4-char code)
        // 4 bytes: Creator (4-char code)
        // 4 bytes: File size
        // 4 bytes: Unknown/reserved
        // 2 bytes: Unknown/flags
        // 2 bytes: Name length
        // N bytes: File name

        if data.len() < 20 {
            return Err(format!("FileNameWithInfo data too short: {} bytes", data.len()));
        }

        let file_type = String::from_utf8_lossy(&data[0..4]).to_string();
        let creator = String::from_utf8_lossy(&data[4..8]).to_string();
        let size = u32::from_be_bytes([data[8], data[9], data[10], data[11]]);
        // Skip bytes 12-15 (unknown/reserved)
        // Skip bytes 16-17 (unknown/flags)
        let name_len = u16::from_be_bytes([data[18], data[19]]) as usize;

        if data.len() < 20 + name_len {
            return Err(format!("FileNameWithInfo name data too short: have {} bytes, need {}", data.len(), 20 + name_len));
        }

        let name = String::from_utf8_lossy(&data[20..20 + name_len]).to_string();

        // Folders have file type "fldr"
        let is_folder = file_type.trim() == "fldr";

        Ok(FileInfo {
            name,
            size,
            is_folder,
            file_type,
            creator,
        })
    }

    fn parse_user_info(data: &[u8]) -> Result<(u16, String, u16), String> {
        // UserNameWithInfo format:
        // 2 bytes: User ID
        // 2 bytes: Icon ID
        // 2 bytes: User flags
        // 2 bytes: Username length
        // N bytes: Username

        if data.len() < 8 {
            return Err("UserNameWithInfo data too short".to_string());
        }

        let user_id = u16::from_be_bytes([data[0], data[1]]);
        let icon_id = u16::from_be_bytes([data[2], data[3]]);
        // Skip user flags (bytes 4-5)
        let name_len = u16::from_be_bytes([data[6], data[7]]) as usize;

        if data.len() < 8 + name_len {
            return Err("UserNameWithInfo username data too short".to_string());
        }

        let username = String::from_utf8_lossy(&data[8..8 + name_len]).to_string();

        Ok((user_id, username, icon_id))
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

                let _ = event_tx.send(HotlineEvent::ChatMessage {
                    user_id,
                    user_name,
                    message,
                });
            }
            TransactionType::ServerMessage => {
                let message = transaction
                    .get_field(FieldType::Data)
                    .and_then(|f| f.to_string().ok())
                    .unwrap_or_default();

                let _ = event_tx.send(HotlineEvent::ServerMessage(message));
            }
            TransactionType::ShowAgreement => {
                let agreement = transaction
                    .get_field(FieldType::ServerAgreement)
                    .and_then(|f| f.to_string().ok())
                    .unwrap_or_default();

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

                let _ = event_tx.send(HotlineEvent::UserChanged {
                    user_id,
                    user_name,
                    icon,
                });
            }
            TransactionType::NotifyUserDelete => {
                let user_id = transaction
                    .get_field(FieldType::UserId)
                    .and_then(|f| f.to_u16().ok())
                    .unwrap_or(0);

                let _ = event_tx.send(HotlineEvent::UserLeft { user_id });
            }
            _ => {
                println!("Unhandled server event: {:?}", transaction.transaction_type);
            }
        }
    }

    // Start background task to send keep-alive messages
    async fn start_keepalive(&self) {
        println!("Starting keep-alive...");

        let write_half = self.write_half.clone();
        let running = self.running.clone();
        let transaction_counter = self.transaction_counter.clone();

        let task = tokio::spawn(async move {
            while running.load(Ordering::SeqCst) {
                tokio::time::sleep(Duration::from_secs(60)).await;

                if !running.load(Ordering::SeqCst) {
                    break;
                }

                // Send empty transaction as keep-alive
                let transaction = Transaction::new(
                    transaction_counter.fetch_add(1, Ordering::SeqCst),
                    TransactionType::Reply,
                );
                let encoded = transaction.encode();

                let mut write_guard = write_half.lock().await;
                if let Some(write_stream) = write_guard.as_mut() {
                    if write_stream.write_all(&encoded).await.is_err() {
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

    pub async fn send_chat(&self, message: String) -> Result<(), String> {
        println!("Sending chat: {}", message);

        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::SendChat);
        transaction.add_field(TransactionField::from_string(FieldType::Data, &message));
        transaction.add_field(TransactionField::from_u16(FieldType::ChatOptions, 0)); // 0 = normal chat, 1 = announce

        let encoded = transaction.encode();
        println!("Chat transaction: {} bytes", encoded.len());

        println!("Writing chat to stream...");
        let mut write_guard = self.write_half.lock().await;
        let write_stream = write_guard
            .as_mut()
            .ok_or("Not connected".to_string())?;

        write_stream
            .write_all(&encoded)
            .await
            .map_err(|e| {
                let err = format!("Failed to send chat: {}", e);
                eprintln!("{}", err);
                err
            })?;

        println!("Flushing stream...");
        // Flush the stream to ensure the message is sent immediately
        write_stream
            .flush()
            .await
            .map_err(|e| {
                let err = format!("Failed to flush stream: {}", e);
                eprintln!("{}", err);
                err
            })?;

        println!("Chat sent successfully");

        Ok(())
    }

    pub async fn get_file_list(&self, path: Vec<String>) -> Result<(), String> {
        println!("Requesting file list for path: {:?}", path);

        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::GetFileNameList);

        // Encode path as FilePath field
        // FilePath format: 2 bytes item count + for each item: 2 bytes (0x0000) + 1 byte name length + name
        if !path.is_empty() {
            let mut path_data = Vec::new();
            path_data.extend_from_slice(&(path.len() as u16).to_be_bytes());

            for folder in &path {
                let folder_bytes = folder.as_bytes();
                // Add separator bytes (0x0000)
                path_data.extend_from_slice(&[0x00, 0x00]);
                // Add name length as single byte
                path_data.push(folder_bytes.len() as u8);
                // Add name
                path_data.extend_from_slice(folder_bytes);
            }

            println!("Path data encoded ({} bytes): {:02X?}", path_data.len(), path_data);

            transaction.add_field(TransactionField {
                field_type: FieldType::FilePath,
                data: path_data,
            });
        }

        let encoded = transaction.encode();

        println!("Sending GetFileNameList transaction...");
        let mut write_guard = self.write_half.lock().await;
        let write_stream = write_guard
            .as_mut()
            .ok_or("Not connected".to_string())?;

        write_stream
            .write_all(&encoded)
            .await
            .map_err(|e| format!("Failed to send GetFileNameList: {}", e))?;

        write_stream
            .flush()
            .await
            .map_err(|e| format!("Failed to flush stream: {}", e))?;

        println!("GetFileNameList request sent");

        Ok(())
    }

    pub async fn get_user_list(&self) -> Result<(), String> {
        println!("Requesting user list...");

        let transaction = Transaction::new(self.next_transaction_id(), TransactionType::GetUserNameList);
        let encoded = transaction.encode();

        println!("Sending GetUserNameList transaction...");
        let mut write_guard = self.write_half.lock().await;
        let write_stream = write_guard
            .as_mut()
            .ok_or("Not connected".to_string())?;

        write_stream
            .write_all(&encoded)
            .await
            .map_err(|e| format!("Failed to send GetUserNameList: {}", e))?;

        write_stream
            .flush()
            .await
            .map_err(|e| format!("Failed to flush stream: {}", e))?;

        println!("GetUserNameList request sent");

        Ok(())
    }

    pub async fn download_file(&self, path: Vec<String>, file_name: String) -> Result<u32, String> {
        println!("Requesting download for file: {:?} / {}", path, file_name);

        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::DownloadFile);

        // Add FileName field
        transaction.add_field(TransactionField::from_string(FieldType::FileName, &file_name));

        // Add FilePath field if not at root
        if !path.is_empty() {
            let mut path_data = Vec::new();
            path_data.extend_from_slice(&(path.len() as u16).to_be_bytes());

            for folder in &path {
                let folder_bytes = folder.as_bytes();
                path_data.extend_from_slice(&[0x00, 0x00]);
                path_data.push(folder_bytes.len() as u8);
                path_data.extend_from_slice(folder_bytes);
            }

            transaction.add_field(TransactionField {
                field_type: FieldType::FilePath,
                data: path_data,
            });
        }

        let encoded = transaction.encode();
        let transaction_id = transaction.id;

        // Create channel to receive reply
        let (tx, mut rx) = mpsc::channel(1);
        {
            let mut pending = self.pending_transactions.write().await;
            pending.insert(transaction_id, tx);
        }

        // Send transaction
        println!("Sending DownloadFile transaction...");
        let mut write_guard = self.write_half.lock().await;
        let write_stream = write_guard
            .as_mut()
            .ok_or("Not connected".to_string())?;

        write_stream
            .write_all(&encoded)
            .await
            .map_err(|e| format!("Failed to send DownloadFile: {}", e))?;

        write_stream
            .flush()
            .await
            .map_err(|e| format!("Failed to flush stream: {}", e))?;

        drop(write_guard);

        // Wait for reply
        println!("Waiting for DownloadFile reply...");
        let reply = tokio::time::timeout(Duration::from_secs(10), rx.recv())
            .await
            .map_err(|_| "Timeout waiting for download reply".to_string())?
            .ok_or("Channel closed".to_string())?;

        println!("DownloadFile reply received: error_code={}", reply.error_code);

        if reply.error_code != 0 {
            let error_msg = reply
                .get_field(FieldType::ErrorText)
                .and_then(|f| f.to_string().ok())
                .unwrap_or_else(|| format!("Error code: {}", reply.error_code));
            return Err(format!("Download failed: {}", error_msg));
        }

        // Get reference number from reply
        let reference_number = reply
            .get_field(FieldType::ReferenceNumber)
            .and_then(|f| f.to_u32().ok())
            .ok_or("No reference number in reply".to_string())?;

        println!("Download reference number: {}", reference_number);

        Ok(reference_number)
    }

    pub async fn get_server_info(&self) -> Result<ServerInfo, String> {
        // TODO: Implement server info retrieval from login reply
        Err("Not implemented".to_string())
    }
}
