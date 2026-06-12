use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

use tauri::{AppHandle, State};

use crate::{
    cli, environment,
    jobs::JobRegistry,
    models::{
        BackupCandidate, CommandPreview, EnvironmentStatus, ExportConfig, ExportFormat,
        ExportPathStatus, JobStarted, ResourceFile, SourceConfig,
    },
};

#[tauri::command]
pub fn get_environment(app: AppHandle) -> EnvironmentStatus {
    environment::get_environment(&app)
}

#[tauri::command]
pub fn scan_ios_backups() -> Vec<BackupCandidate> {
    environment::scan_ios_backups()
}

#[tauri::command]
pub fn validate_backup_path(path: String) -> BackupCandidate {
    environment::validate_backup_path(&path)
}

#[tauri::command]
pub fn inspect_export_path(path: String) -> ExportPathStatus {
    inspect_export_path_impl(Path::new(&path))
}

#[tauri::command]
pub fn run_diagnostics(
    app: AppHandle,
    registry: State<'_, JobRegistry>,
    source: SourceConfig,
) -> Result<JobStarted, String> {
    let sidecar = require_sidecar(&app)?;
    let args = cli::diagnostics_args(&source)?;
    registry.spawn(app, sidecar, args)
}

#[tauri::command]
pub fn start_export(
    app: AppHandle,
    registry: State<'_, JobRegistry>,
    config: ExportConfig,
) -> Result<JobStarted, String> {
    let sidecar = require_sidecar(&app)?;
    let args = cli::export_args(&config)?;
    registry.spawn(app, sidecar, args)
}

#[tauri::command]
pub fn cancel_job(registry: State<'_, JobRegistry>, job_id: String) -> Result<(), String> {
    registry.cancel(&job_id)
}

#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    open_path_native(PathBuf::from(path)).map_err(|err| format!("Failed to open path: {err}"))
}

#[tauri::command]
pub fn open_first_html(export_path: String) -> Result<(), String> {
    let html = find_first_html(Path::new(&export_path))
        .ok_or_else(|| "No HTML file was found in the export directory".to_string())?;
    open_path_native(html).map_err(|err| format!("Failed to open HTML file: {err}"))
}

#[tauri::command]
pub fn open_first_result(export_path: String, format: ExportFormat) -> Result<(), String> {
    let result = find_first_result_file(Path::new(&export_path), &format).ok_or_else(|| {
        format!(
            "No {} file was found in the export directory",
            format.as_arg().to_uppercase()
        )
    })?;
    open_path_native(result).map_err(|err| format!("Failed to open result file: {err}"))
}

#[tauri::command]
pub fn open_resource_file(app: AppHandle, file: ResourceFile) -> Result<(), String> {
    let file_name = file.file_name();
    let path = resolve_resource_file(&app, file_name)?;
    open_path_native(path).map_err(|err| format!("Failed to open bundled resource: {err}"))
}

fn resolve_resource_file(app: &AppHandle, file_name: &str) -> Result<PathBuf, String> {
    let resource_path = app
        .path()
        .resolve(file_name, tauri::path::BaseDirectory::Resource)
        .map_err(|err| format!("Failed to resolve bundled resource {file_name}: {err}"))?;

    if resource_path.is_file() {
        return Ok(resource_path);
    }

    if let Ok(current_dir) = std::env::current_dir() {
        for dev_path in [
            current_dir.join(file_name),
            current_dir.join("..").join(file_name),
        ] {
            if dev_path.is_file() {
                return Ok(dev_path);
            }
        }
    }

    Err(format!("Bundled resource {file_name} was not found."))
}

#[tauri::command]
pub fn preview_export_command(
    app: AppHandle,
    config: ExportConfig,
) -> Result<CommandPreview, String> {
    let sidecar = cli::sidecar_path(&app)?;
    let args = cli::export_args(&config)?;
    Ok(cli::preview(sidecar.display().to_string(), &args))
}

fn require_sidecar(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let sidecar = cli::sidecar_path(app)?;
    if sidecar.is_file() {
        Ok(sidecar)
    } else {
        Err(format!(
            "Bundled imessage-exporter sidecar was not found at {}. Run scripts/build-sidecar.ps1 first.",
            sidecar.display()
        ))
    }
}

fn open_path_native(path: PathBuf) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer").arg(path).spawn()?.wait()?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(path).spawn()?.wait()?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open").arg(path).spawn()?.wait()?;
    }
    Ok(())
}

fn find_first_html(root: &Path) -> Option<PathBuf> {
    find_first_file_with_extensions(root, &["html"])
}

fn find_first_result_file(root: &Path, format: &ExportFormat) -> Option<PathBuf> {
    match format {
        ExportFormat::Html => find_first_file_with_extensions(root, &["html", "htm"]),
        ExportFormat::Txt => find_first_file_with_extensions(root, &["txt"]),
    }
}

fn find_first_file_with_extensions(root: &Path, extensions: &[&str]) -> Option<PathBuf> {
    if !root.is_dir() {
        return None;
    }

    let mut pending = vec![root.to_path_buf()];
    let mut matches = Vec::new();

    while let Some(dir) = pending.pop() {
        let Ok(entries) = fs::read_dir(dir) else {
            continue;
        };

        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            if path.is_dir() {
                pending.push(path);
            } else if path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| {
                    extensions
                        .iter()
                        .any(|candidate| ext.eq_ignore_ascii_case(candidate))
                })
                .unwrap_or(false)
            {
                matches.push(path);
            }
        }
    }

    matches.sort();
    matches.into_iter().next()
}

fn inspect_export_path_impl(path: &Path) -> ExportPathStatus {
    let path_text = path.display().to_string();
    let parent_exists = path.parent().map(Path::exists).unwrap_or(true);
    let mut status = ExportPathStatus {
        path: path_text,
        exists: path.exists(),
        is_directory: path.is_dir(),
        parent_exists,
        entry_count: None,
        contains_html: false,
        contains_txt: false,
        contains_attachments: false,
        warnings: Vec::new(),
        error: None,
    };

    if !status.exists {
        if !status.parent_exists {
            status
                .warnings
                .push("输出目录的上级目录不存在，请重新选择。".to_string());
        }
        return status;
    }

    if !status.is_directory {
        status
            .warnings
            .push("输出路径已存在，但它不是文件夹。".to_string());
        return status;
    }

    let entries = match fs::read_dir(path) {
        Ok(entries) => entries,
        Err(err) => {
            status.error = Some(format!("无法读取输出目录: {err}"));
            status
                .warnings
                .push("无法读取输出目录，请检查权限。".to_string());
            return status;
        }
    };

    let mut count = 0usize;
    for entry in entries.filter_map(Result::ok) {
        count += 1;
        let entry_path = entry.path();
        let file_name = entry_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        let extension = entry_path
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();

        status.contains_html |= extension == "html" || extension == "htm";
        status.contains_txt |= extension == "txt";
        status.contains_attachments |= entry_path.is_dir()
            && matches!(
                file_name.as_str(),
                "attachments" | "attachment" | "assets" | "media"
            );
    }

    status.entry_count = Some(count);
    if count > 0 {
        status.warnings.push(format!(
            "输出目录已有 {count} 个项目，导出结果可能会与旧文件混在一起。"
        ));
    }
    if status.contains_html || status.contains_txt || status.contains_attachments {
        status
            .warnings
            .push("检测到疑似旧导出文件，建议选择一个新的空目录。".to_string());
    }

    status
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs::{self, File},
        time::{SystemTime, UNIX_EPOCH},
    };

    fn unique_temp_dir(name: &str) -> PathBuf {
        let id = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("imessage-exporter-gui-{name}-{id}"))
    }

    #[test]
    fn inspect_export_path_detects_existing_export_files() {
        let dir = unique_temp_dir("export-status");
        fs::create_dir_all(dir.join("Attachments")).unwrap();
        File::create(dir.join("chat.html")).unwrap();

        let status = inspect_export_path_impl(&dir);
        assert!(status.exists);
        assert!(status.is_directory);
        assert!(status.contains_html);
        assert!(status.contains_attachments);
        assert!(status.entry_count.unwrap_or_default() >= 2);
        assert!(status
            .warnings
            .iter()
            .any(|warning| warning.contains("旧导出")));

        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn inspect_export_path_rejects_file_path() {
        let dir = unique_temp_dir("export-file");
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("not-a-directory.txt");
        File::create(&file).unwrap();

        let status = inspect_export_path_impl(&file);
        assert!(status.exists);
        assert!(!status.is_directory);
        assert!(status
            .warnings
            .iter()
            .any(|warning| warning.contains("不是文件夹")));

        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn finds_first_result_file_by_export_format() {
        let dir = unique_temp_dir("result-file");
        fs::create_dir_all(dir.join("nested")).unwrap();
        File::create(dir.join("z-chat.html")).unwrap();
        File::create(dir.join("a-chat.txt")).unwrap();
        File::create(dir.join("nested").join("a-chat.htm")).unwrap();

        let html = find_first_result_file(&dir, &ExportFormat::Html).unwrap();
        let txt = find_first_result_file(&dir, &ExportFormat::Txt).unwrap();

        assert_eq!(
            html.file_name().and_then(|name| name.to_str()),
            Some("a-chat.htm")
        );
        assert_eq!(
            txt.file_name().and_then(|name| name.to_str()),
            Some("a-chat.txt")
        );

        fs::remove_dir_all(dir).unwrap();
    }
}
