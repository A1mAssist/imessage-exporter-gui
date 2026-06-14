mod app;
mod cli;
mod commands;
mod conversations;
mod environment;
mod jobs;
mod models;

use jobs::JobRegistry;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(JobRegistry::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_app_diagnostics,
            commands::get_environment,
            commands::scan_ios_backups,
            commands::scan_conversations,
            commands::inspect_export_path,
            commands::run_diagnostics,
            commands::start_export,
            commands::cancel_job,
            commands::open_path,
            commands::open_url,
            commands::open_first_html,
            commands::open_first_result,
            commands::open_resource_file,
            commands::preview_export_command,
            commands::validate_backup_path,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run iMessage Exporter GUI");
}
