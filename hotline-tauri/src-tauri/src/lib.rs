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
            commands::get_file_list,
            commands::download_file,
            commands::get_bookmarks,
            commands::save_bookmark,
            commands::delete_bookmark,
            commands::test_connection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
