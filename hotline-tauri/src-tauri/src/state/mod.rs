// Application state management

use crate::protocol::{types::Bookmark, HotlineClient};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;

pub struct AppState {
    clients: Arc<RwLock<HashMap<String, HotlineClient>>>,
    bookmarks: Arc<RwLock<Vec<Bookmark>>>,
    bookmarks_path: PathBuf,
    app_handle: AppHandle,
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
        }
    }

    fn load_bookmarks(path: &PathBuf) -> Result<Vec<Bookmark>, String> {
        if !path.exists() {
            return Ok(Vec::new());
        }

        let data = fs::read_to_string(path)
            .map_err(|e| format!("Failed to read bookmarks: {}", e))?;

        let bookmarks: Vec<Bookmark> = serde_json::from_str(&data)
            .map_err(|e| format!("Failed to parse bookmarks: {}", e))?;

        Ok(bookmarks)
    }

    fn save_bookmarks_to_disk(&self, bookmarks: &[Bookmark]) -> Result<(), String> {
        let json = serde_json::to_string_pretty(bookmarks)
            .map_err(|e| format!("Failed to serialize bookmarks: {}", e))?;

        fs::write(&self.bookmarks_path, json)
            .map_err(|e| format!("Failed to write bookmarks: {}", e))?;

        Ok(())
    }

    pub async fn connect_server(&self, bookmark: Bookmark) -> Result<String, String> {
        let server_id = bookmark.id.clone();
        let client = HotlineClient::new(bookmark);

        client.connect().await?;

        // Get the event receiver from the client
        let mut event_rx = {
            let mut rx_guard = client.event_rx.lock().await;
            rx_guard.take().ok_or("Event receiver already taken")?
        };

        // Start event forwarding task
        let app_handle = self.app_handle.clone();
        let server_id_clone = server_id.clone();
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
                    HotlineEvent::UserJoined { user_id, user_name, icon } => {
                        let payload = serde_json::json!({
                            "userId": user_id,
                            "userName": user_name,
                            "iconId": icon,
                        });
                        let _ = app_handle.emit(&format!("user-joined-{}", server_id_clone), payload);
                    }
                    HotlineEvent::UserLeft { user_id } => {
                        let payload = serde_json::json!({
                            "userId": user_id,
                        });
                        let _ = app_handle.emit(&format!("user-left-{}", server_id_clone), payload);
                    }
                    HotlineEvent::UserChanged { user_id, user_name, icon } => {
                        let payload = serde_json::json!({
                            "userId": user_id,
                            "userName": user_name,
                            "iconId": icon,
                        });
                        let _ = app_handle.emit(&format!("user-changed-{}", server_id_clone), payload);
                    }
                    HotlineEvent::ServerMessage(msg) => {
                        println!("Server message: {}", msg);
                    }
                    HotlineEvent::AgreementRequired(agreement) => {
                        println!("Agreement required: {}", agreement);
                        // TODO: Show agreement UI
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

    pub async fn get_file_list(&self, server_id: &str, path: Vec<String>) -> Result<(), String> {
        let clients = self.clients.read().await;

        if let Some(client) = clients.get(server_id) {
            client.get_file_list(path).await
        } else {
            Err("Server not connected".to_string())
        }
    }

    pub async fn download_file(&self, server_id: &str, path: Vec<String>, file_name: String) -> Result<String, String> {
        let clients = self.clients.read().await;

        if let Some(client) = clients.get(server_id) {
            // Get reference number from server
            let reference_number = client.download_file(path, file_name.clone()).await?;

            // TODO: Implement actual file transfer
            // For now, just return success message
            Ok(format!("Download initiated (ref: {})", reference_number))
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
}
