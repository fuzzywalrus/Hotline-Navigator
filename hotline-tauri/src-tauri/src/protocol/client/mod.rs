// Hotline client implementation

mod chat;
mod files;
mod news;
mod users;

use super::constants::{
    FieldType, TransactionType, PROTOCOL_ID, PROTOCOL_SUBVERSION,
    PROTOCOL_VERSION, SUBPROTOCOL_ID, TRANSACTION_HEADER_SIZE,
};
use super::transaction::{Transaction, TransactionField};
use super::types::{Bookmark, ConnectionStatus, ServerInfo};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::tcp::{OwnedReadHalf, OwnedWriteHalf};
use tokio::net::TcpStream;
use tokio::sync::{mpsc, Mutex, RwLock};
use tokio::task::JoinHandle;

// Event types that can be received from the server
#[derive(Debug, Clone)]
pub enum HotlineEvent {
    ChatMessage { user_id: u16, user_name: String, message: String },
    ServerMessage(String),
    PrivateMessage { user_id: u16, message: String },
    UserJoined { user_id: u16, user_name: String, icon: u16, flags: u16 },
    UserLeft { user_id: u16 },
    UserChanged { user_id: u16, user_name: String, icon: u16, flags: u16 },
    AgreementRequired(String),
    FileList { files: Vec<FileInfo>, path: Vec<String> },
    NewMessageBoardPost(String),
    StatusChanged(ConnectionStatus),
}

#[derive(Debug, Clone)]
pub struct FileInfo {
    pub name: String,
    pub size: u32,
    pub is_folder: bool,
    pub file_type: String,
    pub creator: String,
}

pub struct HotlineClient {
    bookmark: Bookmark,
    username: Arc<Mutex<String>>,
    user_icon_id: Arc<Mutex<u16>>,
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

    // Track file list paths by transaction ID
    file_list_paths: Arc<RwLock<HashMap<u32, Vec<String>>>>,

    // Server info (extracted from login reply)
    server_info: Arc<Mutex<Option<ServerInfo>>>,

    // Background tasks
    receive_task: Arc<Mutex<Option<JoinHandle<()>>>>,
    keepalive_task: Arc<Mutex<Option<JoinHandle<()>>>>,
}

impl HotlineClient {
    pub fn new(bookmark: Bookmark) -> Self {
        let (event_tx, event_rx) = mpsc::unbounded_channel();

        Self {
            bookmark,
            username: Arc::new(Mutex::new("guest".to_string())),
            user_icon_id: Arc::new(Mutex::new(191)),
            status: Arc::new(Mutex::new(ConnectionStatus::Disconnected)),
            read_half: Arc::new(Mutex::new(None)),
            write_half: Arc::new(Mutex::new(None)),
            transaction_counter: Arc::new(AtomicU32::new(1)),
            file_list_paths: Arc::new(RwLock::new(HashMap::new())),
            server_info: Arc::new(Mutex::new(None)),
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

    pub async fn connect(&self) -> Result<(), String> {
        println!("Connecting to {}:{}...", self.bookmark.address, self.bookmark.port);

        // Update status
        {
            let mut status = self.status.lock().await;
            *status = ConnectionStatus::Connecting;
            let _ = self.event_tx.send(HotlineEvent::StatusChanged(ConnectionStatus::Connecting));
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
            let _ = self.event_tx.send(HotlineEvent::StatusChanged(ConnectionStatus::Connected));
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
            let _ = self.event_tx.send(HotlineEvent::StatusChanged(ConnectionStatus::LoggingIn));
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
        let user_icon_id = *self.user_icon_id.lock().await;
        let username = self.username.lock().await.clone();
        
        transaction.add_field(TransactionField::from_u16(
            FieldType::UserIconId,
            user_icon_id,
        ));
        transaction.add_field(TransactionField::from_string(
            FieldType::UserName,
            &username,
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
            // Try to get error text from various possible fields
            let error_msg = reply
                .get_field(FieldType::ErrorText)
                .and_then(|f| f.to_string().ok())
                .or_else(|| {
                    // Some servers put error text in Data field
                    reply.get_field(FieldType::Data)
                        .and_then(|f| f.to_string().ok())
                })
                .unwrap_or_else(|| {
                    // Map common error codes to messages
                    match reply.error_code {
                        1 => "Invalid login credentials or server rejected login".to_string(),
                        2 => "Server is full".to_string(),
                        3 => "Banned from server".to_string(),
                        _ => format!("Error code: {}", reply.error_code),
                    }
                });

            // Log all fields for debugging
            println!("Login failed with error_code={}, fields={}", reply.error_code, reply.fields.len());
            for (i, field) in reply.fields.iter().enumerate() {
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

        // Extract server info from login reply
        let server_name = reply
            .get_field(FieldType::ServerName)
            .and_then(|f| f.to_string().ok())
            .unwrap_or_else(|| self.bookmark.name.clone());
        
        let server_version = reply
            .get_field(FieldType::VersionNumber)
            .and_then(|f| f.to_u16().ok())
            .map(|v| v.to_string())
            .unwrap_or_else(|| "Unknown".to_string());
        
        // Server description may be in Data field or not present
        let server_description = reply
            .get_field(FieldType::Data)
            .and_then(|f| f.to_string().ok())
            .filter(|s| !s.is_empty() && s != &server_name)
            .unwrap_or_else(|| String::new());

        // Store server info
        {
            let mut server_info = self.server_info.lock().await;
            *server_info = Some(ServerInfo {
                name: server_name,
                description: server_description,
                version: server_version,
                agreement: None, // Agreement is handled separately
            });
        }

        // Update status
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
        let _ = self.event_tx.send(HotlineEvent::StatusChanged(ConnectionStatus::Disconnected));

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
        let write_half = self.write_half.clone();
        let running = self.running.clone();
        let status = self.status.clone();
        let event_tx = self.event_tx.clone();
        let pending_transactions = self.pending_transactions.clone();
        let file_list_paths = self.file_list_paths.clone();

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
                    // Clear both halves to prevent further writes
                    {
                        let mut read_guard = read_half.lock().await;
                        read_guard.take();
                    }
                    {
                        let mut write_guard = write_half.lock().await;
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

                    let read_result = read_stream.read_exact(&mut additional_data).await;
                    drop(read_guard);
                    
                    if read_result.is_err() {
                        println!("Receive loop: connection closed while reading data");
                        // Clear both halves to prevent further writes
                        {
                            let mut read_guard = read_half.lock().await;
                            read_guard.take();
                        }
                        {
                            let mut write_guard = write_half.lock().await;
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
                            if let Ok(user_info) = HotlineClient::parse_user_info(&field.data) {
                                println!("Parsed user: {} (ID: {}, Icon: {}, Flags: 0x{:04x})", user_info.1, user_info.0, user_info.2, user_info.3);
                                let _ = event_tx.send(HotlineEvent::UserJoined {
                                    user_id: user_info.0,
                                    user_name: user_info.1,
                                    icon: user_info.2,
                                    flags: user_info.3,
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

                    // Send file list event if we parsed any files
                    if has_file_info {
                        // Get the path for this transaction
                        let path = {
                            let paths = file_list_paths.read().await;
                            paths.get(&transaction.id).cloned().unwrap_or_default()
                        };
                        // Remove the path from tracking
                        {
                            let mut paths = file_list_paths.write().await;
                            paths.remove(&transaction.id);
                        }
                        let _ = event_tx.send(HotlineEvent::FileList { files, path });
                    }

                    // If it's not a user/file list reply, forward to pending transaction handlers
                    if !has_user_info && !has_file_info {
                        let mut pending = pending_transactions.write().await;
                        if let Some(tx) = pending.remove(&transaction.id) {
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

                let _ = event_tx.send(HotlineEvent::UserChanged {
                    user_id,
                    user_name,
                    icon,
                    flags,
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
                tokio::time::sleep(Duration::from_secs(180)).await; // 3 minutes like Swift client

                if !running.load(Ordering::SeqCst) {
                    break;
                }

                // Send GetUserNameList as keep-alive (works for all server versions)
                // Swift client uses ConnectionKeepAlive for servers >= 185, but falls back to GetUserNameList
                // Since we don't have ConnectionKeepAlive in our protocol, we'll use GetUserNameList
                let transaction = Transaction::new(
                    transaction_counter.fetch_add(1, Ordering::SeqCst),
                    TransactionType::GetUserNameList,
                );
                let encoded = transaction.encode();

                let mut write_guard = write_half.lock().await;
                if let Some(write_stream) = write_guard.as_mut() {
                    if write_stream.write_all(&encoded).await.is_err() {
                        println!("Keep-alive failed, connection lost");
                        break;
                    }
                    println!("Keep-alive sent (GetUserNameList)");
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
