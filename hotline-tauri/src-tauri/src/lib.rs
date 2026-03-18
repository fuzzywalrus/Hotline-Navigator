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
        .plugin(tauri_plugin_stronghold::Builder::new(|password| {
            // Use argon2 key derivation with app-specific salt
            use argon2::{hash_raw, Config, Variant, Version};
            let config = Config {
                lanes: 4,
                mem_cost: 10_000,
                time_cost: 10,
                variant: Variant::Argon2id,
                version: Version::Version13,
                ..Default::default()
            };
            let salt = b"hotline-navigator-stronghold-salt";
            let key = hash_raw(password.as_ref(), salt, &config)
                .expect("Failed to derive key");
            key.to_vec()
        }).build())
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
            commands::cancel_connection,
            commands::disconnect_from_server,
            commands::update_user_info,
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
            commands::get_client_info,
            commands::delete_file,
            commands::move_file,
            commands::get_file_info,
            commands::set_file_info,
            commands::disconnect_user,
            commands::test_connection,
            commands::check_for_updates,
            commands::pick_download_folder,
            commands::send_broadcast,
            commands::create_folder,
            commands::create_news_category,
            commands::create_news_folder,
            commands::delete_news_item,
            commands::delete_news_article,
            commands::invite_to_new_chat,
            commands::invite_to_chat,
            commands::reject_chat_invite,
            commands::join_chat,
            commands::leave_chat,
            commands::set_chat_subject,
            commands::send_private_chat,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
