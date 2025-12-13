// Hotline Tauri App

mod commands;
mod protocol;
mod state;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Get app data directory
            let app_data_dir = app
                .handle()
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");

            // Initialize app state with persistent storage
            let app_state = AppState::new(app_data_dir, app.handle().clone());
            app.manage(app_state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::connect_to_server,
            commands::disconnect_from_server,
            commands::send_chat_message,
            commands::send_private_message,
            commands::get_message_board,
            commands::post_message_board,
            commands::get_file_list,
            commands::download_file,
            commands::upload_file,
            commands::get_news_categories,
            commands::get_news_articles,
            commands::get_news_article_data,
            commands::post_news_article,
            commands::get_bookmarks,
            commands::save_bookmark,
            commands::delete_bookmark,
            commands::reorder_bookmarks,
            commands::add_default_bookmarks,
            commands::get_pending_agreement,
            commands::accept_agreement,
            commands::download_banner,
            commands::read_preview_file,
            commands::fetch_tracker_servers,
            commands::get_server_info,
            commands::get_user_access,
            commands::disconnect_user,
            commands::test_connection,
            commands::check_for_updates,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
