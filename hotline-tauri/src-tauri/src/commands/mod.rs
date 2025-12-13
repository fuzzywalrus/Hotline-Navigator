// Tauri commands - these are callable from the frontend

use crate::protocol::types::Bookmark;
use crate::protocol::tracker::TrackerClient;
use crate::state::AppState;
use tauri::State;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateRelease {
    pub tag_name: String,
    pub display_version: String,
    pub version_number: f64,
    pub build_number: u32,
    pub notes: String,
    pub download_url: String,
    pub asset_name: String,
    pub published_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    body: Option<String>,
    published_at: String,
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GitHubAsset {
    browser_download_url: String,
    name: String,
}

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
pub async fn reorder_bookmarks(
    bookmarks: Vec<Bookmark>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.reorder_bookmarks(bookmarks).await
}

#[tauri::command]
pub async fn add_default_bookmarks(
    state: State<'_, AppState>,
) -> Result<Vec<Bookmark>, String> {
    state.add_default_bookmarks().await
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
pub async fn upload_file(
    server_id: String,
    path: Vec<String>,
    file_name: String,
    file_data: Vec<u8>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    println!("Command: upload_file {} ({} bytes)", file_name, file_data.len());
    state.upload_file(&server_id, path, file_name, file_data).await
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

#[derive(serde::Serialize)]
pub struct PreviewData {
    pub mime: String,
    pub data: String,
    pub is_text: bool,
}

fn guess_mime_from_extension(path: &str) -> &'static str {
    let lower = path.to_lowercase();
    if lower.ends_with(".png") { "image/png" }
    else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") { "image/jpeg" }
    else if lower.ends_with(".gif") { "image/gif" }
    else if lower.ends_with(".bmp") { "image/bmp" }
    else if lower.ends_with(".tif") || lower.ends_with(".tiff") { "image/tiff" }
    else if lower.ends_with(".webp") { "image/webp" }
    else if lower.ends_with(".svg") { "image/svg+xml" }
    else if lower.ends_with(".mp3") { "audio/mpeg" }
    else if lower.ends_with(".wav") { "audio/wav" }
    else if lower.ends_with(".ogg") || lower.ends_with(".oga") { "audio/ogg" }
    else if lower.ends_with(".flac") { "audio/flac" }
    else if lower.ends_with(".m4a") { "audio/mp4" }
    else if lower.ends_with(".aac") { "audio/aac" }
    else if lower.ends_with(".mp4") || lower.ends_with(".m4v") { "video/mp4" }
    else if lower.ends_with(".webm") { "video/webm" }
    else if lower.ends_with(".ogv") { "video/ogg" }
    else if lower.ends_with(".mov") { "video/quicktime" }
    else if lower.ends_with(".avi") { "video/x-msvideo" }
    else if lower.ends_with(".txt") { "text/plain" }
    else if lower.ends_with(".json") { "application/json" }
    else if lower.ends_with(".xml") { "application/xml" }
    else if lower.ends_with(".html") || lower.ends_with(".htm") { "text/html" }
    else if lower.ends_with(".css") { "text/css" }
    else if lower.ends_with(".js") { "text/javascript" }
    else { "application/octet-stream" }
}

fn detect_mime_from_content(data: &[u8]) -> Option<&'static str> {
    if data.len() < 4 {
        return None;
    }

    // Image formats
    if data.len() >= 8 && &data[0..8] == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] {
        return Some("image/png");
    }
    if data.len() >= 3 && &data[0..3] == [0xFF, 0xD8, 0xFF] {
        return Some("image/jpeg");
    }
    if data.len() >= 6 && &data[0..6] == [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] || 
       data.len() >= 6 && &data[0..6] == [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] {
        return Some("image/gif");
    }
    if data.len() >= 2 && &data[0..2] == [0x42, 0x4D] {
        return Some("image/bmp");
    }
    if data.len() >= 4 && &data[0..4] == [0x52, 0x49, 0x46, 0x46] && 
       data.len() >= 12 && &data[8..12] == [0x57, 0x45, 0x42, 0x50] {
        return Some("image/webp");
    }

    // Audio formats
    // MP3: ID3v2 (starts with "ID3") or frame sync (0xFF 0xFB/0xFA/0xF3/0xF2)
    if data.len() >= 3 && &data[0..3] == [0x49, 0x44, 0x33] {
        return Some("audio/mpeg");
    }
    if data.len() >= 2 && data[0] == 0xFF && (data[1] & 0xE0) == 0xE0 {
        return Some("audio/mpeg");
    }
    // WAV: RIFF header with WAVE
    if data.len() >= 12 && &data[0..4] == [0x52, 0x49, 0x46, 0x46] && 
       &data[8..12] == [0x57, 0x41, 0x56, 0x45] {
        return Some("audio/wav");
    }
    // OGG: starts with "OggS"
    if data.len() >= 4 && &data[0..4] == [0x4F, 0x67, 0x67, 0x53] {
        return Some("audio/ogg");
    }
    // FLAC: starts with "fLaC"
    if data.len() >= 4 && &data[0..4] == [0x66, 0x4C, 0x61, 0x43] {
        return Some("audio/flac");
    }
    // MP4/M4A: ftyp box at offset 4
    if data.len() >= 12 && &data[4..8] == [0x66, 0x74, 0x79, 0x70] {
        // Check for audio (m4a) or video (mp4) variants
        if data.len() >= 20 {
            let brand = &data[8..12];
            if brand == b"M4A " || brand == b"mp41" || brand == b"isom" {
                // Could be audio or video, check more
                if data.len() >= 24 {
                    let brand2 = &data[20..24];
                    if brand2 == b"M4A " {
                        return Some("audio/mp4");
                    }
                }
                // Default to video/mp4 for now, extension will refine
                return Some("video/mp4");
            }
        }
        return Some("video/mp4");
    }

    // Video formats
    // WebM: starts with 0x1A 0x45 0xDF 0xA3
    if data.len() >= 4 && &data[0..4] == [0x1A, 0x45, 0xDF, 0xA3] {
        return Some("video/webm");
    }
    // QuickTime/MOV: ftyp box
    if data.len() >= 12 && &data[4..8] == [0x66, 0x74, 0x79, 0x70] {
        if data.len() >= 20 {
            let brand = &data[8..12];
            if brand == b"qt  " {
                return Some("video/quicktime");
            }
        }
    }
    // AVI: starts with "RIFF" and "AVI " at offset 8
    if data.len() >= 12 && &data[0..4] == [0x52, 0x49, 0x46, 0x46] && 
       &data[8..12] == [0x41, 0x56, 0x49, 0x20] {
        return Some("video/x-msvideo");
    }

    None
}

fn guess_mime(path: &str, data: Option<&[u8]>) -> &'static str {
    // First try to detect from file content (magic bytes)
    if let Some(data) = data {
        if let Some(mime) = detect_mime_from_content(data) {
            return mime;
        }
    }
    
    // Fall back to extension-based detection
    guess_mime_from_extension(path)
}

/// Read a downloaded file into a data payload for safe previewing (avoids asset:// CORS issues)
#[tauri::command]
pub async fn read_preview_file(path: String) -> Result<PreviewData, String> {
    use std::fs;

    // Read file bytes first for content-based MIME detection
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    
    // Detect MIME type from content (magic bytes) first, then fall back to extension
    let mime = guess_mime(&path, Some(&bytes)).to_string();
    let is_text = mime.starts_with("text/") || 
                  mime == "application/json" || 
                  mime == "application/xml" ||
                  mime == "text/html" ||
                  mime == "text/css" ||
                  mime == "text/javascript";

    if is_text {
        // Try to read as UTF-8 text
        match String::from_utf8(bytes.clone()) {
            Ok(text) => {
                return Ok(PreviewData { mime, data: text, is_text: true });
            }
            Err(_) => {
                // If not valid UTF-8, treat as binary and base64 encode
                let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
                return Ok(PreviewData { mime, data: encoded, is_text: false });
            }
        }
    }

    // For binary files (images, audio, video), base64 encode
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(PreviewData { mime, data: encoded, is_text: false })
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
pub async fn get_user_access(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<u64, String> {
    state.get_user_access(&server_id).await
}

#[tauri::command]
pub async fn disconnect_user(
    server_id: String,
    user_id: u16,
    options: Option<u16>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.disconnect_user(&server_id, user_id, options).await
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

#[tauri::command]
pub async fn check_for_updates() -> Result<Option<UpdateRelease>, String> {
    println!("Command: check_for_updates");
    
    // GitHub releases API URL for fuzzywalrus/hotline
    let releases_url = "https://api.github.com/repos/fuzzywalrus/hotline/releases?per_page=10";
    
    // Fetch releases from GitHub
    let client = reqwest::Client::new();
    let response = client
        .get(releases_url)
        .header("User-Agent", "Hotline-Navigator")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch releases: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("GitHub API returned status: {}", response.status()));
    }
    
    let releases: Vec<GitHubRelease> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse releases: {}", e))?;
    
    // Get current version from package.json (we'll pass it from frontend)
    // For now, we'll parse the first release and return it
    // The frontend will handle version comparison
    
    if releases.is_empty() {
        return Ok(None);
    }
    
    // Parse the latest release
    let latest = &releases[0];
    
    // Find macOS asset (look for .dmg, .app, or universal)
    let macos_asset = latest.assets.iter()
        .find(|asset| {
            let name = asset.name.to_lowercase();
            name.contains(".dmg") || 
            name.contains("macos") || 
            name.contains("universal") ||
            name.contains("darwin")
        });
    
    let asset = macos_asset.ok_or("No macOS release asset found")?;
    
    // Parse version from tag_name (e.g., "v0.1.0" or "0.1.0")
    let tag_name = latest.tag_name.trim_start_matches('v');
    let version_parts: Vec<&str> = tag_name.split('.').collect();
    
    let version_number = if version_parts.len() >= 2 {
        format!("{}.{}", version_parts[0], version_parts[1])
            .parse::<f64>()
            .unwrap_or(0.0)
    } else {
        0.0
    };
    
    let build_number = if version_parts.len() >= 3 {
        version_parts[2].parse::<u32>().unwrap_or(0)
    } else {
        0
    };
    
    let display_version = tag_name.to_string();
    
    Ok(Some(UpdateRelease {
        tag_name: latest.tag_name.clone(),
        display_version,
        version_number,
        build_number,
        notes: latest.body.clone().unwrap_or_default(),
        download_url: asset.browser_download_url.clone(),
        asset_name: asset.name.clone(),
        published_at: latest.published_at.clone(),
    }))
}
