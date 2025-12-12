// Application state management

use crate::protocol::{types::Bookmark, HotlineClient};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::RwLock;

pub struct AppState {
    clients: Arc<RwLock<HashMap<String, HotlineClient>>>,
    bookmarks: Arc<RwLock<Vec<Bookmark>>>,
    bookmarks_path: PathBuf,
    app_handle: AppHandle,
    pending_agreements: Arc<RwLock<HashMap<String, String>>>, // server_id -> agreement_text
}

impl AppState {
    pub fn new(app_data_dir: PathBuf, app_handle: AppHandle) -> Self {
        // Ensure app data directory exists
        if let Err(e) = fs::create_dir_all(&app_data_dir) {
            eprintln!("Failed to create app data directory: {}", e);
        }

        let bookmarks_path = app_data_dir.join("bookmarks.json");

        // Load existing bookmarks
        let bookmarks = Self::load_bookmarks(&bookmarks_path).unwrap_or_default();

        Self {
            clients: Arc::new(RwLock::new(HashMap::new())),
            bookmarks: Arc::new(RwLock::new(bookmarks)),
            bookmarks_path,
            app_handle,
            pending_agreements: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    fn load_bookmarks(path: &PathBuf) -> Result<Vec<Bookmark>, String> {
        let mut bookmarks: Vec<Bookmark> = if !path.exists() {
            Vec::new()
        } else {
            let data = fs::read_to_string(path)
                .map_err(|e| format!("Failed to read bookmarks: {}", e))?;

            serde_json::from_str::<Vec<Bookmark>>(&data)
                .map_err(|e| format!("Failed to parse bookmarks: {}", e))?
        };

        // Ensure default tracker bookmark exists and fix any that lost their type
        let default_tracker_address = "hltracker.com";
        let default_tracker_port = 5498u16;
        
        let mut needs_save = false;
        
        // Fix any existing default tracker that lost its type
        for bookmark in bookmarks.iter_mut() {
            if bookmark.id == "default-tracker-hltracker" 
                || (bookmark.address == default_tracker_address && bookmark.port == default_tracker_port) {
                // This is the default tracker - ensure it has the correct type
                if !matches!(bookmark.bookmark_type, Some(crate::protocol::types::BookmarkType::Tracker)) {
                    bookmark.bookmark_type = Some(crate::protocol::types::BookmarkType::Tracker);
                    bookmark.id = "default-tracker-hltracker".to_string(); // Ensure correct ID
                    bookmark.name = "Featured Servers".to_string(); // Ensure correct name
                    needs_save = true;
                }
            }
        }
        
        let has_default_tracker = bookmarks.iter().any(|b: &Bookmark| {
            b.address == default_tracker_address 
            && b.port == default_tracker_port
            && matches!(b.bookmark_type, Some(crate::protocol::types::BookmarkType::Tracker))
        });

        if !has_default_tracker {
            let default_tracker = Bookmark {
                id: "default-tracker-hltracker".to_string(),
                name: "Featured Servers".to_string(),
                address: default_tracker_address.to_string(),
                port: default_tracker_port,
                login: "guest".to_string(),
                password: None,
                icon: None,
                auto_connect: false,
                bookmark_type: Some(crate::protocol::types::BookmarkType::Tracker),
            };
            bookmarks.insert(0, default_tracker);
            needs_save = true;
        }
        
        // Save if we made any changes
        if needs_save {
            let json = serde_json::to_string_pretty(&bookmarks)
                .map_err(|e| format!("Failed to serialize bookmarks: {}", e))?;
            fs::write(path, json)
                .map_err(|e| format!("Failed to write bookmarks: {}", e))?;
        }

        Ok(bookmarks)
    }

    fn save_bookmarks_to_disk(&self, bookmarks: &[Bookmark]) -> Result<(), String> {
        let json = serde_json::to_string_pretty(bookmarks)
            .map_err(|e| format!("Failed to serialize bookmarks: {}", e))?;

        fs::write(&self.bookmarks_path, json)
            .map_err(|e| format!("Failed to write bookmarks: {}", e))?;

        Ok(())
    }

    pub async fn connect_server(&self, bookmark: Bookmark, username: String, user_icon_id: u16) -> Result<String, String> {
        // Don't allow connecting to trackers - they use a different protocol
        if matches!(bookmark.bookmark_type, Some(crate::protocol::types::BookmarkType::Tracker)) {
            return Err("Cannot connect to tracker. Trackers are used to browse servers, not to connect directly.".to_string());
        }

        let server_id = bookmark.id.clone();
        let client = HotlineClient::new(bookmark);
        client.set_user_info(username, user_icon_id).await;

        client.connect().await?;

        // Get the event receiver from the client
        let mut event_rx = {
            let mut rx_guard = client.event_rx.lock().await;
            rx_guard.take().ok_or("Event receiver already taken")?
        };

        // Start event forwarding task
        let app_handle = self.app_handle.clone();
        let server_id_clone = server_id.clone();
        let state_clone = Arc::clone(&self.pending_agreements);
        tokio::spawn(async move {
            while let Some(event) = event_rx.recv().await {
                use crate::protocol::client::HotlineEvent;

                match event {
                    HotlineEvent::ChatMessage { user_id, user_name, message } => {
                        let payload = serde_json::json!({
                            "userId": user_id,
                            "userName": user_name,
                            "message": message,
                        });
                        let _ = app_handle.emit(&format!("chat-message-{}", server_id_clone), payload);
                    }
                    HotlineEvent::UserJoined { user_id, user_name, icon, flags } => {
                        let payload = serde_json::json!({
                            "userId": user_id,
                            "userName": user_name,
                            "iconId": icon,
                            "flags": flags,
                        });
                        let _ = app_handle.emit(&format!("user-joined-{}", server_id_clone), payload);
                    }
                    HotlineEvent::UserLeft { user_id } => {
                        let payload = serde_json::json!({
                            "userId": user_id,
                        });
                        let _ = app_handle.emit(&format!("user-left-{}", server_id_clone), payload);
                    }
                    HotlineEvent::UserChanged { user_id, user_name, icon, flags } => {
                        let payload = serde_json::json!({
                            "userId": user_id,
                            "userName": user_name,
                            "iconId": icon,
                            "flags": flags,
                        });
                        let _ = app_handle.emit(&format!("user-changed-{}", server_id_clone), payload);
                    }
                    HotlineEvent::ServerMessage(msg) => {
                        println!("Server message: {}", msg);
                    }
                    HotlineEvent::AgreementRequired(agreement) => {
                        println!("State: Received AgreementRequired event, agreement length: {}", agreement.len());
                        
                        // Store agreement in pending_agreements
                        {
                            let mut pending = state_clone.write().await;
                            pending.insert(server_id_clone.clone(), agreement.clone());
                            println!("State: Stored agreement for server {}", server_id_clone);
                        }
                        
                        let payload = serde_json::json!({
                            "agreement": agreement,
                        });
                        let event_name = format!("agreement-required-{}", server_id_clone);
                        println!("State: Emitting event: {}", event_name);
                        match app_handle.emit(&event_name, payload) {
                            Ok(_) => println!("State: Event emitted successfully"),
                            Err(e) => println!("State: Failed to emit event: {:?}", e),
                        }
                    }
                    HotlineEvent::FileList { files } => {
                        let payload = serde_json::json!({
                            "files": files.iter().map(|f| serde_json::json!({
                                "name": f.name,
                                "size": f.size,
                                "isFolder": f.is_folder,
                                "fileType": f.file_type,
                                "creator": f.creator,
                            })).collect::<Vec<_>>(),
                        });
                        let _ = app_handle.emit(&format!("file-list-{}", server_id_clone), payload);
                    }
                    HotlineEvent::NewMessageBoardPost(message) => {
                        let payload = serde_json::json!({
                            "message": message,
                        });
                        let _ = app_handle.emit(&format!("message-board-post-{}", server_id_clone), payload);
                    }
                    HotlineEvent::PrivateMessage { user_id, message } => {
                        let payload = serde_json::json!({
                            "userId": user_id,
                            "message": message,
                        });
                        let _ = app_handle.emit(&format!("private-message-{}", server_id_clone), payload);
                    }
                }
            }
            println!("Event forwarding task ended for server {}", server_id_clone);
        });

        let mut clients = self.clients.write().await;
        clients.insert(server_id.clone(), client);

        Ok(server_id)
    }

    pub async fn disconnect_server(&self, server_id: &str) -> Result<(), String> {
        let mut clients = self.clients.write().await;

        if let Some(client) = clients.get(server_id) {
            client.disconnect().await?;
            clients.remove(server_id);
            Ok(())
        } else {
            Err("Server not found".to_string())
        }
    }

    pub async fn send_chat(&self, server_id: &str, message: String) -> Result<(), String> {
        let clients = self.clients.read().await;

        if let Some(client) = clients.get(server_id) {
            client.send_chat(message).await
        } else {
            Err("Server not connected".to_string())
        }
    }

    pub async fn send_private_message(&self, server_id: &str, user_id: u16, message: String) -> Result<(), String> {
        let clients = self.clients.read().await;

        if let Some(client) = clients.get(server_id) {
            client.send_private_message(user_id, message).await
        } else {
            Err("Server not connected".to_string())
        }
    }

    pub async fn get_pending_agreement(&self, server_id: &str) -> Option<String> {
        let pending = self.pending_agreements.read().await;
        pending.get(server_id).cloned()
    }

    pub async fn accept_agreement(&self, server_id: &str) -> Result<(), String> {
        let clients = self.clients.read().await;

        if let Some(client) = clients.get(server_id) {
            // Remove agreement from pending after acceptance
            {
                let mut pending = self.pending_agreements.write().await;
                pending.remove(server_id);
            }
            client.accept_agreement().await
        } else {
            Err("Server not connected".to_string())
        }
    }

    pub async fn download_banner(&self, server_id: &str) -> Result<String, String> {
        let clients = self.clients.read().await;

        if let Some(client) = clients.get(server_id) {
            // Get reference number and transfer size
            let (reference_number, transfer_size) = client.download_banner().await?;
            
            println!("Banner download info - reference: {}, transferSize: {}", reference_number, transfer_size);

            // Download banner as raw image data (not FILP format)
            let file_data = client.download_banner_raw(reference_number, transfer_size).await?;

            println!("Banner download complete, {} bytes received", file_data.len());

            // Save banner to app data directory
            let banner_path = self.bookmarks_path.parent()
                .ok_or("Failed to get app data directory".to_string())?
                .join(format!("banner-{}.png", server_id));
            
            std::fs::write(&banner_path, &file_data)
                .map_err(|e| format!("Failed to save banner: {}", e))?;

            println!("Banner saved to: {:?}", banner_path);

            // Return path as string
            banner_path.to_str()
                .ok_or("Failed to convert banner path to string".to_string())
                .map(|s| s.to_string())
        } else {
            Err("Server not connected".to_string())
        }
    }

    pub async fn get_message_board(&self, server_id: &str) -> Result<Vec<String>, String> {
        let clients = self.clients.read().await;

        if let Some(client) = clients.get(server_id) {
            client.get_message_board().await
        } else {
            Err("Server not connected".to_string())
        }
    }

    pub async fn post_message_board(&self, server_id: &str, message: String) -> Result<(), String> {
        let clients = self.clients.read().await;

        if let Some(client) = clients.get(server_id) {
            client.post_message_board(message).await
        } else {
            Err("Server not connected".to_string())
        }
    }

    pub async fn get_file_list(&self, server_id: &str, path: Vec<String>) -> Result<(), String> {
        let clients = self.clients.read().await;

        if let Some(client) = clients.get(server_id) {
            client.get_file_list(path).await
        } else {
            Err("Server not connected".to_string())
        }
    }

    pub async fn download_file(&self, server_id: &str, path: Vec<String>, file_name: String, file_size: u32) -> Result<String, String> {
        let clients = self.clients.read().await;

        if let Some(client) = clients.get(server_id) {
            // Get reference number from server
            let reference_number = client.download_file(path, file_name.clone()).await?;

            println!("Got reference number {}, starting file transfer...", reference_number);

            // Perform the file transfer with progress callback
            let app_handle = self.app_handle.clone();
            let server_id_clone = server_id.to_string();
            let file_name_clone = file_name.clone();
            let file_data = client.perform_file_transfer(
                reference_number,
                file_size,
                move |bytes_read, total_bytes| {
                    let progress = (bytes_read as f64 / total_bytes as f64 * 100.0) as u32;
                    let payload = serde_json::json!({
                        "fileName": file_name_clone,
                        "bytesRead": bytes_read,
                        "totalBytes": total_bytes,
                        "progress": progress,
                    });
                    let _ = app_handle.emit(&format!("download-progress-{}", server_id_clone), payload);
                }
            ).await?;

            println!("File transfer complete, {} bytes received", file_data.len());

            // Get downloads directory
            let downloads_dir = self.app_handle
                .path()
                .download_dir()
                .map_err(|e| format!("Failed to get downloads directory: {}", e))?;

            // Create full file path
            let file_path = downloads_dir.join(&file_name);

            println!("Saving file to: {:?}", file_path);

            // Save file to disk
            fs::write(&file_path, file_data)
                .map_err(|e| format!("Failed to write file: {}", e))?;

            println!("File saved successfully to {:?}", file_path);

            Ok(format!("Downloaded to: {}", file_path.display()))
        } else {
            Err("Server not connected".to_string())
        }
    }

    pub async fn get_bookmarks(&self) -> Result<Vec<Bookmark>, String> {
        let bookmarks = self.bookmarks.read().await;
        Ok(bookmarks.clone())
    }

    pub async fn save_bookmark(&self, bookmark: Bookmark) -> Result<(), String> {
        let mut bookmarks = self.bookmarks.write().await;

        // Check if bookmark already exists, update it
        if let Some(existing) = bookmarks.iter_mut().find(|b| b.id == bookmark.id) {
            *existing = bookmark;
        } else {
            bookmarks.push(bookmark);
        }

        // Persist to disk
        self.save_bookmarks_to_disk(&bookmarks)?;

        Ok(())
    }

    pub async fn delete_bookmark(&self, id: &str) -> Result<(), String> {
        let mut bookmarks = self.bookmarks.write().await;
        bookmarks.retain(|b| b.id != id);

        // Persist to disk
        self.save_bookmarks_to_disk(&bookmarks)?;

        Ok(())
    }

    pub async fn get_news_categories(&self, server_id: &str, path: Vec<String>) -> Result<Vec<crate::protocol::types::NewsCategory>, String> {
        let clients = self.clients.read().await;

        if let Some(client) = clients.get(server_id) {
            client.get_news_categories(path).await
        } else {
            Err("Server not connected".to_string())
        }
    }

    pub async fn get_news_articles(&self, server_id: &str, path: Vec<String>) -> Result<Vec<crate::protocol::types::NewsArticle>, String> {
        let clients = self.clients.read().await;

        if let Some(client) = clients.get(server_id) {
            client.get_news_articles(path).await
        } else {
            Err("Server not connected".to_string())
        }
    }

    pub async fn get_news_article_data(&self, server_id: &str, article_id: u32, path: Vec<String>) -> Result<String, String> {
        let clients = self.clients.read().await;

        if let Some(client) = clients.get(server_id) {
            client.get_news_article_data(article_id, path).await
        } else {
            Err("Server not connected".to_string())
        }
    }

    pub async fn post_news_article(&self, server_id: &str, title: String, text: String, path: Vec<String>, parent_id: u32) -> Result<(), String> {
        let clients = self.clients.read().await;

        if let Some(client) = clients.get(server_id) {
            client.post_news_article(title, text, path, parent_id).await
        } else {
            Err("Server not connected".to_string())
        }
    }
}
