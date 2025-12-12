// Hotline client implementation

use super::constants::{
    FieldType, TransactionType, FILE_TRANSFER_ID, PROTOCOL_ID, PROTOCOL_SUBVERSION,
    PROTOCOL_VERSION, SUBPROTOCOL_ID, TRANSACTION_HEADER_SIZE,
};
use super::transaction::{Transaction, TransactionField};
use super::types::{Bookmark, ConnectionStatus, NewsArticle, NewsCategory, ServerInfo};
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
    NewMessageBoardPost(String),
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
            TransactionType::NewMessage => {
                // New message board post notification
                let message = transaction
                    .get_field(FieldType::Data)
                    .and_then(|f| f.to_string().ok())
                    .unwrap_or_default();

                let _ = event_tx.send(HotlineEvent::NewMessageBoardPost(message));
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

    pub async fn get_message_board(&self) -> Result<Vec<String>, String> {
        println!("Requesting message board");

        let transaction = Transaction::new(self.next_transaction_id(), TransactionType::GetMessageBoard);
        let transaction_id = transaction.id;
        let (tx, mut rx) = mpsc::channel(1);

        // Register pending transaction
        {
            let mut pending = self.pending_transactions.write().await;
            pending.insert(transaction_id, tx);
        }

        // Send transaction
        let encoded = transaction.encode();
        let mut write_guard = self.write_half.lock().await;
        let write_stream = write_guard
            .as_mut()
            .ok_or("Not connected".to_string())?;

        write_stream
            .write_all(&encoded)
            .await
            .map_err(|e| format!("Failed to send get message board request: {}", e))?;

        write_stream.flush().await.map_err(|e| format!("Failed to flush: {}", e))?;
        drop(write_guard);

        // Wait for reply
        let reply = tokio::time::timeout(Duration::from_secs(10), rx.recv())
            .await
            .map_err(|_| "Timeout waiting for message board reply".to_string())?
            .ok_or("Channel closed".to_string())?;

        if reply.error_code != 0 {
            let error_msg = reply
                .get_field(FieldType::ErrorText)
                .and_then(|f| f.to_string().ok())
                .unwrap_or_else(|| format!("Error code: {}", reply.error_code));
            return Err(format!("Get message board failed: {}", error_msg));
        }

        // Get the Data field containing all posts
        let posts_data = reply
            .get_field(FieldType::Data)
            .and_then(|f| f.to_string().ok())
            .unwrap_or_default();

        // For now, return as single string in array (Swift does this too)
        // TODO: Parse individual posts if server uses dividers
        let posts = if posts_data.is_empty() {
            Vec::new()
        } else {
            vec![posts_data]
        };

        println!("Received message board: {} posts", posts.len());

        Ok(posts)
    }

    pub async fn post_message_board(&self, text: String) -> Result<(), String> {
        println!("Posting to message board: {} chars", text.len());

        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::OldPostNews);
        transaction.add_field(TransactionField::from_string(FieldType::Data, &text));

        let encoded = transaction.encode();

        let mut write_guard = self.write_half.lock().await;
        let write_stream = write_guard
            .as_mut()
            .ok_or("Not connected".to_string())?;

        write_stream
            .write_all(&encoded)
            .await
            .map_err(|e| format!("Failed to post message: {}", e))?;

        write_stream.flush().await.map_err(|e| format!("Failed to flush: {}", e))?;

        println!("Message board post sent successfully");

        Ok(())
    }

    // News protocol methods

    pub async fn get_news_categories(&self, path: Vec<String>) -> Result<Vec<NewsCategory>, String> {
        println!("Requesting news categories for path: {:?}", path);

        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::GetNewsCategoryList);
        if !path.is_empty() {
            transaction.add_field(TransactionField::from_path(FieldType::NewsPath, &path));
        }

        let transaction_id = transaction.id;
        let (tx, mut rx) = mpsc::channel(1);

        // Register pending transaction
        {
            let mut pending = self.pending_transactions.write().await;
            pending.insert(transaction_id, tx);
        }

        // Send transaction
        let encoded = transaction.encode();

        {
            let mut write_guard = self.write_half.lock().await;
            let write_stream = write_guard
                .as_mut()
                .ok_or("Not connected".to_string())?;

            write_stream
                .write_all(&encoded)
                .await
                .map_err(|e| format!("Failed to send request: {}", e))?;

            write_stream.flush().await.map_err(|e| format!("Failed to flush: {}", e))?;
        }

        // Wait for reply
        let reply = tokio::time::timeout(Duration::from_secs(10), rx.recv())
            .await
            .map_err(|_| "Timeout waiting for news categories reply".to_string())?
            .ok_or("Channel closed".to_string())?;

        if reply.error_code != 0 {
            let error_msg = reply
                .get_field(FieldType::ErrorText)
                .and_then(|f| f.to_string().ok())
                .unwrap_or_else(|| format!("Error code: {}", reply.error_code));
            return Err(format!("Get news categories failed: {}", error_msg));
        }

        // Parse categories from NewsCategoryListData15 fields
        let mut categories = Vec::new();
        for field in &reply.fields {
            if field.field_type == FieldType::NewsCategoryListData15 {
                if let Ok(category) = self.parse_news_category(&field.data, &path) {
                    categories.push(category);
                }
            }
        }

        println!("Received {} news categories", categories.len());

        Ok(categories)
    }

    pub async fn get_news_articles(&self, path: Vec<String>) -> Result<Vec<NewsArticle>, String> {
        println!("Requesting news articles for path: {:?}", path);

        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::GetNewsArticleList);
        if !path.is_empty() {
            transaction.add_field(TransactionField::from_path(FieldType::NewsPath, &path));
        }

        let transaction_id = transaction.id;
        let (tx, mut rx) = mpsc::channel(1);

        // Register pending transaction
        {
            let mut pending = self.pending_transactions.write().await;
            pending.insert(transaction_id, tx);
        }

        // Send transaction
        let encoded = transaction.encode();

        {
            let mut write_guard = self.write_half.lock().await;
            let write_stream = write_guard
                .as_mut()
                .ok_or("Not connected".to_string())?;

            write_stream
                .write_all(&encoded)
                .await
                .map_err(|e| format!("Failed to send request: {}", e))?;

            write_stream.flush().await.map_err(|e| format!("Failed to flush: {}", e))?;
        }

        // Wait for reply
        let reply = tokio::time::timeout(Duration::from_secs(10), rx.recv())
            .await
            .map_err(|_| "Timeout waiting for news articles reply".to_string())?
            .ok_or("Channel closed".to_string())?;

        if reply.error_code != 0 {
            let error_msg = reply
                .get_field(FieldType::ErrorText)
                .and_then(|f| f.to_string().ok())
                .unwrap_or_else(|| format!("Error code: {}", reply.error_code));
            return Err(format!("Get news articles failed: {}", error_msg));
        }

        // Parse articles from NewsArticleListData field
        let articles = if let Some(field) = reply.get_field(FieldType::NewsArticleListData) {
            self.parse_news_article_list(&field.data, &path)?
        } else {
            Vec::new()
        };

        println!("Received {} news articles", articles.len());

        Ok(articles)
    }

    pub async fn get_news_article_data(&self, article_id: u32, path: Vec<String>) -> Result<String, String> {
        println!("Requesting news article data for ID {} at path: {:?}", article_id, path);

        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::GetNewsArticleData);
        transaction.add_field(TransactionField::from_path(FieldType::NewsPath, &path));
        transaction.add_field(TransactionField::from_u32(FieldType::NewsArticleId, article_id));
        transaction.add_field(TransactionField::from_string(FieldType::NewsArticleDataFlavor, "text/plain"));

        let transaction_id = transaction.id;
        let (tx, mut rx) = mpsc::channel(1);

        // Register pending transaction
        {
            let mut pending = self.pending_transactions.write().await;
            pending.insert(transaction_id, tx);
        }

        // Send transaction
        let encoded = transaction.encode();

        {
            let mut write_guard = self.write_half.lock().await;
            let write_stream = write_guard
                .as_mut()
                .ok_or("Not connected".to_string())?;

            write_stream
                .write_all(&encoded)
                .await
                .map_err(|e| format!("Failed to send request: {}", e))?;

            write_stream.flush().await.map_err(|e| format!("Failed to flush: {}", e))?;
        }

        // Wait for reply
        let reply = tokio::time::timeout(Duration::from_secs(10), rx.recv())
            .await
            .map_err(|_| "Timeout waiting for news article data reply".to_string())?
            .ok_or("Channel closed".to_string())?;

        if reply.error_code != 0 {
            let error_msg = reply
                .get_field(FieldType::ErrorText)
                .and_then(|f| f.to_string().ok())
                .unwrap_or_else(|| format!("Error code: {}", reply.error_code));
            return Err(format!("Get news article data failed: {}", error_msg));
        }

        // Get article content from NewsArticleData field
        let content = reply
            .get_field(FieldType::NewsArticleData)
            .and_then(|f| f.to_string().ok())
            .unwrap_or_default();

        println!("Received news article content: {} chars", content.len());

        Ok(content)
    }

    pub async fn post_news_article(&self, title: String, text: String, path: Vec<String>, parent_id: u32) -> Result<(), String> {
        println!("Posting news article '{}' to path: {:?}", title, path);

        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::PostNewsArticle);
        transaction.add_field(TransactionField::from_path(FieldType::NewsPath, &path));
        transaction.add_field(TransactionField::from_u32(FieldType::NewsArticleId, parent_id));
        transaction.add_field(TransactionField::from_string(FieldType::NewsArticleTitle, &title));
        transaction.add_field(TransactionField::from_string(FieldType::NewsArticleDataFlavor, "text/plain"));
        transaction.add_field(TransactionField::from_u32(FieldType::NewsArticleFlags, 0));
        transaction.add_field(TransactionField::from_string(FieldType::NewsArticleData, &text));

        let transaction_id = transaction.id;
        let (tx, mut rx) = mpsc::channel(1);

        // Register pending transaction
        {
            let mut pending = self.pending_transactions.write().await;
            pending.insert(transaction_id, tx);
        }

        // Send transaction
        let encoded = transaction.encode();

        {
            let mut write_guard = self.write_half.lock().await;
            let write_stream = write_guard
                .as_mut()
                .ok_or("Not connected".to_string())?;

            write_stream
                .write_all(&encoded)
                .await
                .map_err(|e| format!("Failed to send request: {}", e))?;

            write_stream.flush().await.map_err(|e| format!("Failed to flush: {}", e))?;
        }

        // Wait for reply
        let reply = tokio::time::timeout(Duration::from_secs(10), rx.recv())
            .await
            .map_err(|_| "Timeout waiting for post news article reply".to_string())?
            .ok_or("Channel closed".to_string())?;

        if reply.error_code != 0 {
            let error_msg = reply
                .get_field(FieldType::ErrorText)
                .and_then(|f| f.to_string().ok())
                .unwrap_or_else(|| format!("Error code: {}", reply.error_code));
            println!("Post news article error: code={}, message={}", reply.error_code, error_msg);
            return Err(format!("Post news article failed: {}", error_msg));
        }

        println!("News article posted successfully");

        Ok(())
    }

    // Helper method to parse a single news category from binary data
    fn parse_news_category(&self, data: &[u8], parent_path: &[String]) -> Result<NewsCategory, String> {
        if data.len() < 4 {
            return Err("Category data too short".to_string());
        }

        let category_type = u16::from_be_bytes([data[0], data[1]]);
        let count = u16::from_be_bytes([data[2], data[3]]);

        let name = if category_type == 2 {
            // Bundle: PString at offset 4
            if data.len() < 5 {
                return Err("Bundle data too short".to_string());
            }
            let name_len = data[4] as usize;
            if data.len() < 5 + name_len {
                return Err("Bundle name too short".to_string());
            }
            String::from_utf8_lossy(&data[5..5 + name_len]).to_string()
        } else if category_type == 3 {
            // Category: PString at offset 28
            if data.len() < 29 {
                return Err("Category data too short".to_string());
            }
            let name_len = data[28] as usize;
            if data.len() < 29 + name_len {
                return Err("Category name too short".to_string());
            }
            let (decoded, _, _) = encoding_rs::MACINTOSH.decode(&data[29..29 + name_len]);
            decoded.to_string()
        } else {
            return Err(format!("Unknown category type: {}", category_type));
        };

        let mut path = parent_path.to_vec();
        path.push(name.clone());

        Ok(NewsCategory {
            category_type,
            count,
            name,
            path,
        })
    }

    // Helper method to parse news article list from binary data
    fn parse_news_article_list(&self, data: &[u8], parent_path: &[String]) -> Result<Vec<NewsArticle>, String> {
        if data.len() < 8 {
            return Err("Article list data too short".to_string());
        }

        let mut offset = 0;

        // Read list metadata (skip for now)
        // let list_id = u32::from_be_bytes([data[0], data[1], data[2], data[3]]);
        let article_count = u32::from_be_bytes([data[4], data[5], data[6], data[7]]);
        offset += 8;

        // Skip list name and description (PStrings)
        if offset >= data.len() {
            return Ok(Vec::new());
        }
        let name_len = data[offset] as usize;
        offset += 1 + name_len;

        if offset >= data.len() {
            return Ok(Vec::new());
        }
        let desc_len = data[offset] as usize;
        offset += 1 + desc_len;

        // Parse articles
        let mut articles = Vec::new();
        for _ in 0..article_count {
            if offset + 20 > data.len() {
                break;
            }

            let article_id = u32::from_be_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]);
            offset += 4;

            // Skip date (8 bytes)
            offset += 8;

            let parent_id = u32::from_be_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]);
            offset += 4;

            let flags = u32::from_be_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]);
            offset += 4;

            if offset + 3 > data.len() {
                break;
            }

            let flavor_count = u16::from_be_bytes([data[offset], data[offset + 1]]);
            offset += 2;

            let title_len = data[offset] as usize;
            offset += 1;

            if offset + title_len > data.len() {
                break;
            }
            let (title_decoded, _, _) = encoding_rs::MACINTOSH.decode(&data[offset..offset + title_len]);
            let title = title_decoded.to_string();
            offset += title_len;

            if offset >= data.len() {
                break;
            }
            let poster_len = data[offset] as usize;
            offset += 1;

            if offset + poster_len > data.len() {
                break;
            }
            let (poster_decoded, _, _) = encoding_rs::MACINTOSH.decode(&data[offset..offset + poster_len]);
            let poster = poster_decoded.to_string();
            offset += poster_len;

            // Skip flavors
            for _ in 0..flavor_count {
                if offset >= data.len() {
                    break;
                }
                let flavor_len = data[offset] as usize;
                offset += 1;

                if offset + flavor_len + 2 > data.len() {
                    break;
                }
                offset += flavor_len;

                // Skip article size
                offset += 2;
            }

            articles.push(NewsArticle {
                id: article_id,
                parent_id,
                flags,
                title,
                poster,
                date: None,
                path: parent_path.to_vec(),
            });
        }

        Ok(articles)
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

        println!("DownloadFile reply received: error_code={}, {} fields", reply.error_code, reply.fields.len());

        // Print all fields for debugging
        for (i, field) in reply.fields.iter().enumerate() {
            println!("  Field {}: type={:?}, size={} bytes, data={:02X?}",
                i, field.field_type, field.data.len(),
                &field.data[..std::cmp::min(20, field.data.len())]);
        }

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

        // Get transfer size if available
        let transfer_size = reply.get_field(FieldType::TransferSize)
            .and_then(|f| f.to_u32().ok());

        if let Some(size) = transfer_size {
            println!("Transfer size from server: {} bytes", size);
        }

        // Get file size if available
        let file_size = reply.get_field(FieldType::FileSize)
            .and_then(|f| f.to_u32().ok());

        if let Some(size) = file_size {
            println!("File size from server: {} bytes", size);
        }

        // Check for file transfer options
        if let Some(options_field) = reply.get_field(FieldType::FileTransferOptions) {
            println!("File transfer options: {:02X?}", options_field.data);
        }

        Ok(reference_number)
    }

    pub async fn perform_file_transfer<F>(&self, reference_number: u32, expected_size: u32, mut progress_callback: F) -> Result<Vec<u8>, String>
    where
        F: FnMut(u32, u32) + Send,
    {
        println!("Starting file transfer with reference number: {}", reference_number);

        // Open a new TCP connection to the server for file transfer
        // File transfers use port+1 (e.g., 5501 for main port 5500)
        let transfer_port = self.bookmark.port + 1;
        let addr = format!("{}:{}", self.bookmark.address, transfer_port);
        println!("Connecting to file transfer port: {}", transfer_port);

        let mut transfer_stream = TcpStream::connect(&addr)
            .await
            .map_err(|e| format!("Failed to connect for file transfer: {}", e))?;

        println!("File transfer connection established");

        // Send file transfer handshake
        // Format: HTXF (4) + reference_number (4) + 0 (4) + 0 (4) = 16 bytes
        let mut handshake = Vec::with_capacity(16);
        handshake.extend_from_slice(FILE_TRANSFER_ID); // "HTXF"
        handshake.extend_from_slice(&reference_number.to_be_bytes());
        handshake.extend_from_slice(&0u32.to_be_bytes());
        handshake.extend_from_slice(&0u32.to_be_bytes());

        println!("Sending file transfer handshake ({} bytes): {:02X?}", handshake.len(), &handshake);
        transfer_stream
            .write_all(&handshake)
            .await
            .map_err(|e| format!("Failed to send file transfer handshake: {}", e))?;

        transfer_stream
            .flush()
            .await
            .map_err(|e| format!("Failed to flush handshake: {}", e))?;

        println!("File transfer handshake sent, waiting for response...");

        // Try to read any response from server first
        let mut peek_buffer = [0u8; 4];
        println!("Attempting to peek at server response...");
        let bytes_read = match tokio::time::timeout(
            Duration::from_secs(5),
            transfer_stream.read(&mut peek_buffer)
        ).await {
            Ok(Ok(n)) => {
                println!("Server sent {} bytes: {:02X?}", n, &peek_buffer[..n]);
                n
            }
            Ok(Err(e)) => {
                return Err(format!("Error reading from server: {}", e));
            }
            Err(_) => {
                return Err("Timeout waiting for server response - server sent nothing".to_string());
            }
        };

        if bytes_read == 0 {
            return Err("Server closed connection immediately after handshake".to_string());
        }

        // Read rest of header (total 24 bytes for FILP header)
        // Format: FILP (4) + version (2) + reserved (16) + fork count (2)
        let mut response_header = [0u8; 24];
        response_header[..bytes_read].copy_from_slice(&peek_buffer[..bytes_read]);

        if bytes_read < 24 {
            transfer_stream
                .read_exact(&mut response_header[bytes_read..])
                .await
                .map_err(|e| format!("Failed to read rest of file transfer header: {}", e))?;
        }

        println!("File transfer header received (24 bytes): {:02X?}", &response_header);

        // The header should start with "FILP"
        if &response_header[0..4] != b"FILP" {
            return Err(format!(
                "Invalid file transfer header: expected FILP, got {:?}",
                String::from_utf8_lossy(&response_header[0..4])
            ));
        }

        let version = u16::from_be_bytes([response_header[4], response_header[5]]);
        println!("FILP version: {}", version);

        // Read fork count from bytes 22-23 (after 4 + 2 + 16 bytes)
        let fork_count = u16::from_be_bytes([response_header[22], response_header[23]]);
        println!("File has {} fork(s)", fork_count);

        // Read each fork header and data
        let mut file_data = Vec::new();

        for fork_idx in 0..fork_count {
            // Fork header format:
            // Fork type (4 bytes) - "DATA" or "MACR" (resource fork) or "INFO"
            // Compression type (4 bytes)
            // Reserved (4 bytes)
            // Data size (4 bytes)
            let mut fork_header = [0u8; 16];
            transfer_stream
                .read_exact(&mut fork_header)
                .await
                .map_err(|e| format!("Failed to read fork {} header: {}", fork_idx, e))?;

            println!("Fork {} header bytes: {:02X?}", fork_idx, &fork_header);

            let fork_type = String::from_utf8_lossy(&fork_header[0..4]).to_string();
            let compression = u32::from_be_bytes([fork_header[4], fork_header[5], fork_header[6], fork_header[7]]);
            let data_size = u32::from_be_bytes([fork_header[12], fork_header[13], fork_header[14], fork_header[15]]);

            println!("Fork {}: type='{}', compression={}, size={} bytes", fork_idx, fork_type.trim(), compression, data_size);

            // Determine actual size to read
            // If fork header shows 0 size but this is a DATA fork, use expected_size
            let actual_size = if data_size == 0 && fork_type.trim() == "DATA" && expected_size > 0 {
                println!("Fork header shows 0 size, using expected size from file list: {} bytes", expected_size);
                expected_size
            } else {
                if fork_type.trim() == "DATA" && data_size != expected_size && expected_size > 0 {
                    println!("Note: DATA fork header size ({}) differs from file list size ({})", data_size, expected_size);
                }
                data_size
            };

            // Read fork data
            if actual_size > 0 {
                let is_data_fork = fork_type.trim() == "DATA";

                if is_data_fork {
                    // For DATA fork, read in chunks and report progress
                    let chunk_size = 65536; // 64KB chunks
                    let mut fork_data = Vec::with_capacity(actual_size as usize);
                    let mut bytes_read = 0u32;
                    let mut last_reported_progress = 0u32;

                    while bytes_read < actual_size {
                        let remaining = actual_size - bytes_read;
                        let to_read = std::cmp::min(remaining, chunk_size) as usize;
                        let mut chunk = vec![0u8; to_read];

                        transfer_stream
                            .read_exact(&mut chunk)
                            .await
                            .map_err(|e| format!("Failed to read fork {} data: {}", fork_idx, e))?;

                        bytes_read += to_read as u32;
                        fork_data.extend_from_slice(&chunk);

                        // Only emit progress every 2% or on completion to avoid UI stuttering
                        let current_progress = (bytes_read as f64 / actual_size as f64 * 100.0) as u32;
                        if current_progress >= last_reported_progress + 2 || bytes_read == actual_size {
                            progress_callback(bytes_read, actual_size);
                            last_reported_progress = current_progress;
                        }
                    }

                    println!("Received DATA fork: {} bytes", fork_data.len());
                    file_data = fork_data;
                } else {
                    // For INFO/MACR forks, read all at once
                    let mut fork_data = vec![0u8; actual_size as usize];
                    transfer_stream
                        .read_exact(&mut fork_data)
                        .await
                        .map_err(|e| format!("Failed to read fork {} data: {}", fork_idx, e))?;

                    if fork_type.trim() == "INFO" {
                        println!("Skipped INFO fork: {} bytes", fork_data.len());
                    } else if fork_type.trim() == "MACR" {
                        println!("Skipped MACR (resource) fork: {} bytes", fork_data.len());
                    }
                }
            }
        }

        println!("File transfer complete: {} bytes received", file_data.len());

        Ok(file_data)
    }

    pub async fn get_server_info(&self) -> Result<ServerInfo, String> {
        // TODO: Implement server info retrieval from login reply
        Err("Not implemented".to_string())
    }
}
