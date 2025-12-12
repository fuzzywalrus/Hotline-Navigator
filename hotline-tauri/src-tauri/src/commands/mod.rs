// Tauri commands - these are callable from the frontend

use crate::protocol::types::Bookmark;
use crate::protocol::tracker::TrackerClient;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn connect_to_server(
    bookmark: Bookmark,
    username: String,
    user_icon_id: u16,
    state: State<'_, AppState>,
) -> Result<String, String> {
    println!("Command: connect_to_server to {}:{} as {}", bookmark.address, bookmark.port, username);
    state.connect_server(bookmark, username, user_icon_id).await
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
pub async fn send_private_message(
    server_id: String,
    user_id: u16,
    message: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    println!("Command: send_private_message to user {} on {}: {}", user_id, server_id, message);
    state.send_private_message(&server_id, user_id, message).await
}

#[tauri::command]
pub async fn get_message_board(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    println!("Command: get_message_board for {}", server_id);
    state.get_message_board(&server_id).await
}

#[tauri::command]
pub async fn post_message_board(
    server_id: String,
    message: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    println!("Command: post_message_board to {}: {} chars", server_id, message.len());
    state.post_message_board(&server_id, message).await
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
    state.download_file(&server_id, path, file_name, file_size).await
}

#[tauri::command]
pub async fn get_news_categories(
    server_id: String,
    path: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Vec<crate::protocol::types::NewsCategory>, String> {
    println!("Command: get_news_categories for {} path {:?}", server_id, path);
    state.get_news_categories(&server_id, path).await
}

#[tauri::command]
pub async fn get_news_articles(
    server_id: String,
    path: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Vec<crate::protocol::types::NewsArticle>, String> {
    println!("Command: get_news_articles for {} path {:?}", server_id, path);
    state.get_news_articles(&server_id, path).await
}

#[tauri::command]
pub async fn get_news_article_data(
    server_id: String,
    article_id: u32,
    path: Vec<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    println!("Command: get_news_article_data for {} article {} path {:?}", server_id, article_id, path);
    state.get_news_article_data(&server_id, article_id, path).await
}

#[tauri::command]
pub async fn post_news_article(
    server_id: String,
    title: String,
    text: String,
    path: Vec<String>,
    parent_id: u32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    println!("Command: post_news_article to {} path {:?}", server_id, path);
    state.post_news_article(&server_id, title, text, path, parent_id).await
}

#[tauri::command]
pub async fn get_pending_agreement(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    println!("Command: get_pending_agreement for {}", server_id);
    Ok(state.get_pending_agreement(&server_id).await)
}

#[tauri::command]
pub async fn accept_agreement(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    println!("Command: accept_agreement for {}", server_id);
    state.accept_agreement(&server_id).await
}

#[tauri::command]
pub async fn download_banner(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    println!("Command: download_banner for {}", server_id);
    let banner_path = state.download_banner(&server_id).await?;
    
    // Read the file and convert to base64 data URL
    let file_data = std::fs::read(&banner_path)
        .map_err(|e| format!("Failed to read banner file: {}", e))?;
    
    println!("Banner file read, {} bytes", file_data.len());
    
    // Detect image format from file signature
    let mime_type = if file_data.len() >= 4 && &file_data[0..4] == [0xFF, 0xD8, 0xFF, 0xE0] {
        "image/jpeg"
    } else if file_data.len() >= 8 && &file_data[0..8] == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] {
        "image/png"
    } else if file_data.len() >= 6 && &file_data[0..6] == [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] {
        "image/gif"
    } else {
        // Check for JPEG with different header
        if file_data.len() >= 3 && &file_data[0..3] == [0xFF, 0xD8, 0xFF] {
            "image/jpeg"
        } else {
            "image/png" // Default to PNG
        }
    };
    
    println!("Detected image format: {}", mime_type);
    
    // Convert to base64 data URL
    use base64::{Engine as _, engine::general_purpose};
    let base64 = general_purpose::STANDARD.encode(&file_data);
    let data_url = format!("data:{};base64,{}", mime_type, base64);
    
    println!("Banner converted to data URL, length: {} bytes", data_url.len());
    
    Ok(data_url)
}

#[tauri::command]
pub async fn fetch_tracker_servers(
    address: String,
    port: Option<u16>,
) -> Result<Vec<crate::protocol::types::TrackerServer>, String> {
    println!("Command: fetch_tracker_servers from {}:{}", address, port.unwrap_or(5498));
    TrackerClient::fetch_servers(&address, port).await
}

#[tauri::command]
pub async fn get_server_info(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<crate::protocol::types::ServerInfo, String> {
    println!("Command: get_server_info for {}", server_id);
    state.get_server_info(&server_id).await
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
        bookmark_type: None,
    };

    // Create client and connect
    let client = crate::protocol::HotlineClient::new(bookmark);
    client.connect().await?;

    Ok("Connected successfully!".to_string())
}
