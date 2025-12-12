// Tauri commands - these are callable from the frontend

use crate::protocol::types::Bookmark;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn connect_to_server(
    bookmark: Bookmark,
    state: State<'_, AppState>,
) -> Result<String, String> {
    println!("Command: connect_to_server to {}:{}", bookmark.address, bookmark.port);
    state.connect_server(bookmark).await
}

#[tauri::command]
pub async fn disconnect_from_server(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    println!("Command: disconnect_from_server {}", server_id);
    state.disconnect_server(&server_id).await
}

#[tauri::command]
pub async fn send_chat_message(
    server_id: String,
    message: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    println!("Command: send_chat_message to {}: {}", server_id, message);
    state.send_chat(&server_id, message).await
}

#[tauri::command]
pub async fn get_bookmarks(state: State<'_, AppState>) -> Result<Vec<Bookmark>, String> {
    state.get_bookmarks().await
}

#[tauri::command]
pub async fn save_bookmark(
    bookmark: Bookmark,
    state: State<'_, AppState>,
) -> Result<(), String> {
    println!("Command: save_bookmark {}", bookmark.name);
    state.save_bookmark(bookmark).await
}

#[tauri::command]
pub async fn delete_bookmark(id: String, state: State<'_, AppState>) -> Result<(), String> {
    println!("Command: delete_bookmark {}", id);
    state.delete_bookmark(&id).await
}

#[tauri::command]
pub async fn get_file_list(
    server_id: String,
    path: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    println!("Command: get_file_list for server {} path {:?}", server_id, path);
    state.get_file_list(&server_id, path).await
}

#[tauri::command]
pub async fn download_file(
    server_id: String,
    path: Vec<String>,
    file_name: String,
    file_size: u32,
    state: State<'_, AppState>,
) -> Result<String, String> {
    println!("Command: download_file {} (size: {} bytes)", file_name, file_size);
    state.download_file(&server_id, path, file_name).await
}

#[tauri::command]
pub async fn test_connection(address: String, port: u16) -> Result<String, String> {
    println!("Command: test_connection to {}:{}", address, port);

    // Create a test bookmark
    let bookmark = Bookmark {
        id: "test".to_string(),
        name: "Test".to_string(),
        address,
        port,
        login: "guest".to_string(),
        password: Some("".to_string()),
        icon: Some(414),
        auto_connect: false,
    };

    // Create client and connect
    let client = crate::protocol::HotlineClient::new(bookmark);
    client.connect().await?;

    Ok("Connected successfully!".to_string())
}
