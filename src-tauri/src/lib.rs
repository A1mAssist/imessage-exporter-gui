mod app;
mod commands;
mod conversations;
mod diagnostics;
mod engine;
mod environment;
mod jobs;
mod models;
mod source;

use jobs::JobRegistry;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};

const TRAY_SHOW_ID: &str = "show";
const TRAY_QUIT_ID: &str = "quit";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(JobRegistry::default())
        .setup(|app| {
            setup_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_diagnostics,
            commands::get_environment,
            commands::scan_ios_backups,
            commands::scan_conversations,
            commands::inspect_source,
            commands::inspect_diagnostics,
            commands::inspect_export_path,
            commands::delete_interrupted_export,
            commands::run_diagnostics,
            commands::start_export,
            commands::cancel_job,
            commands::open_path,
            commands::open_url,
            commands::open_first_html,
            commands::open_first_result,
            commands::search_jsonl_result,
            commands::open_resource_file,
            commands::validate_backup_path,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run iMessage Exporter GUI");
}

fn setup_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, TRAY_SHOW_ID, "显示窗口", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, TRAY_QUIT_ID, "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    let mut tray = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("iMessage Exporter GUI")
        .on_menu_event(|app, event| {
            if event.id() == TRAY_SHOW_ID {
                show_main_window(app);
            } else if event.id() == TRAY_QUIT_ID {
                if app.state::<JobRegistry>().has_active() {
                    show_main_window(app);
                    let _ = app.emit("app:quit-blocked", ());
                    return;
                }
                app.exit(0);
            }
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            }
            | TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => show_main_window(tray.app_handle()),
            _ => {}
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }
    tray.build(app)?;
    Ok(())
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
