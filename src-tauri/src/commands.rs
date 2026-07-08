use std::{
    fs::{self, File},
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::{AppHandle, Manager, State};

use crate::{
    engine, environment,
    jobs::JobRegistry,
    models::{
        AppDiagnostics, BackupCandidate, ConversationCandidate, DiagnosticDetails,
        EnvironmentStatus, ExportConfig, ExportFormat, ExportPathStatus, JobStarted,
        JsonlSearchMatch, ResourceFile, SourceConfig, SourceInspection,
    },
};

#[tauri::command]
pub fn get_environment() -> EnvironmentStatus {
    environment::get_environment()
}

#[tauri::command]
pub fn get_app_diagnostics(app: AppHandle) -> AppDiagnostics {
    let package = app.package_info();
    AppDiagnostics {
        name: package.name.clone(),
        version: package.version.to_string(),
        identifier: app.config().identifier.clone(),
        authors: package.authors.to_string(),
        description: package.description.to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        family: std::env::consts::FAMILY.to_string(),
    }
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
pub fn scan_conversations(source: SourceConfig) -> Result<Vec<ConversationCandidate>, String> {
    crate::conversations::scan_source_conversations(&source)
}

#[tauri::command]
pub fn inspect_source(source: SourceConfig) -> SourceInspection {
    crate::source::inspect_source(&source)
}

#[tauri::command]
pub fn inspect_diagnostics(source: SourceConfig) -> Result<DiagnosticDetails, String> {
    crate::diagnostics::inspect_diagnostics(&source)
}

#[tauri::command]
pub fn inspect_export_path(path: String) -> ExportPathStatus {
    inspect_export_path_impl(Path::new(&path))
}

#[tauri::command]
pub fn delete_interrupted_export(path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !is_interrupted_export_path(&path) {
        return Err("Only unfinished .partial export directories can be deleted.".to_string());
    }
    if !path.is_dir() {
        return Err("Interrupted export path is not a directory.".to_string());
    }
    fs::remove_dir_all(&path).map_err(|err| format!("Failed to delete interrupted export: {err}"))
}

#[tauri::command]
pub fn run_diagnostics(
    app: AppHandle,
    registry: State<'_, JobRegistry>,
    source: SourceConfig,
) -> Result<JobStarted, String> {
    let options = engine::diagnostics_options(&source)?;
    registry.spawn_engine(app, options)
}

#[tauri::command]
pub fn start_export(
    app: AppHandle,
    registry: State<'_, JobRegistry>,
    config: ExportConfig,
) -> Result<JobStarted, String> {
    let options = engine::export_options(&config)?;
    registry.spawn_export(app, options)
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
pub fn open_url(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Only http and https URLs can be opened.".to_string());
    }
    open_url_native(&url).map_err(|err| format!("Failed to open URL: {err}"))
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
pub fn search_jsonl_result(
    export_path: String,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<JsonlSearchMatch>, String> {
    let result = find_first_result_file(Path::new(&export_path), &ExportFormat::Jsonl)
        .ok_or_else(|| "No JSONL file was found in the export directory".to_string())?;
    search_jsonl_file(&result, &query, limit.unwrap_or(20).clamp(1, 100))
        .map_err(|err| format!("Failed to read JSONL result: {err}"))
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

fn open_url_native(url: &str) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer").arg(url).spawn()?.wait()?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(url).spawn()?.wait()?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open").arg(url).spawn()?.wait()?;
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
        ExportFormat::Jsonl => find_first_file_with_extensions(root, &["jsonl"]),
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

fn search_jsonl_file(
    path: &Path,
    query: &str,
    limit: usize,
) -> std::io::Result<Vec<JsonlSearchMatch>> {
    let query = query.trim().to_ascii_lowercase();
    let file = File::open(path)?;
    let mut matches = Vec::new();

    for (index, line) in BufReader::new(file).lines().enumerate() {
        let line = line?;
        if query.is_empty() || line.to_ascii_lowercase().contains(&query) {
            matches.push(JsonlSearchMatch {
                line_number: index + 1,
                preview: preview_text(&line, 280),
            });
        }
        if matches.len() >= limit {
            break;
        }
    }

    Ok(matches)
}

fn preview_text(value: &str, max_chars: usize) -> String {
    let mut preview = value.trim().chars().take(max_chars).collect::<String>();
    if value.trim().chars().count() > max_chars {
        preview.push_str("...");
    }
    preview
}

fn inspect_export_path_impl(path: &Path) -> ExportPathStatus {
    let path_text = path.display().to_string();
    let parent_exists = path.parent().map(Path::exists).unwrap_or(true);
    let mut status = ExportPathStatus {
        path: path_text.clone(),
        exists: path.exists(),
        is_directory: path.is_dir(),
        parent_exists,
        writable: None,
        available_bytes: available_space_for_path(path),
        path_length: path_text.chars().count(),
        entry_count: None,
        contains_html: false,
        contains_txt: false,
        contains_attachments: false,
        interrupted_exports: Vec::new(),
        warnings: Vec::new(),
        error: None,
    };
    add_interrupted_export_warnings(path, &mut status);

    if !status.exists {
        if !status.parent_exists {
            status
                .warnings
                .push("输出目录的上级目录不存在，请重新选择。".to_string());
        }
        if status.path_length > 240 {
            status.warnings.push(
                "输出路径较长，Windows 安装版或后续附件文件名可能触发路径长度限制。".to_string(),
            );
        }
        return status;
    }

    if !status.is_directory {
        status.writable = Some(false);
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

    match probe_directory_writable(path) {
        Ok(()) => {
            status.writable = Some(true);
        }
        Err(err) => {
            status.writable = Some(false);
            status.error = Some(format!("无法写入输出目录: {err}"));
            status
                .warnings
                .push("无法在输出目录创建测试文件，请检查权限或同步软件锁定。".to_string());
            return status;
        }
    }

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
    if status.path_length > 240 {
        status
            .warnings
            .push("输出路径较长，Windows 安装版或后续附件文件名可能触发路径长度限制。".to_string());
    }
    if let Some(available_bytes) = status.available_bytes {
        if available_bytes < 1024 * 1024 * 1024 {
            status
                .warnings
                .push("输出磁盘可用空间低于 1 GB，大型备份导出可能失败。".to_string());
        }
    }

    status
}

fn add_interrupted_export_warnings(path: &Path, status: &mut ExportPathStatus) {
    for partial in interrupted_export_paths(path) {
        status
            .interrupted_exports
            .push(partial.display().to_string());
        let resume_hint = if partial
            .join(".imessage-exporter-gui-checkpoint.json")
            .is_file()
        {
            "包含断点记录；下次使用相同导出设置时会自动续写。"
        } else {
            "没有断点记录；这是旧版或异常半成品，只会保留供手动取回或删除。"
        };
        status.warnings.push(format!(
            "检测到上次未完成的临时导出目录：{}。{}",
            partial.display(),
            resume_hint
        ));
    }
}

fn interrupted_export_paths(path: &Path) -> Vec<PathBuf> {
    let Some(parent) = path.parent() else {
        return Vec::new();
    };
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        return Vec::new();
    };
    let stable_name = format!(".imessage-exporter-gui-{name}.partial");
    let prefix = format!(".imessage-exporter-gui-{name}-");
    let Ok(entries) = fs::read_dir(parent) else {
        return Vec::new();
    };

    let mut matches = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|entry_path| entry_path.is_dir())
        .filter(|entry_path| {
            entry_path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|entry_name| {
                    entry_name == stable_name
                        || (entry_name.starts_with(&prefix) && entry_name.ends_with(".partial"))
                })
        })
        .collect::<Vec<_>>();
    matches.sort();
    matches
}

fn is_interrupted_export_path(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| {
            name.starts_with(".imessage-exporter-gui-") && name.ends_with(".partial")
        })
}

fn probe_directory_writable(path: &Path) -> std::io::Result<()> {
    let id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let probe_path = path.join(format!(".imessage-exporter-gui-write-test-{id}.tmp"));
    {
        let mut file = File::create(&probe_path)?;
        file.write_all(b"ok")?;
        file.sync_all()?;
    }
    fs::remove_file(probe_path)
}

fn available_space_for_path(path: &Path) -> Option<u64> {
    let target = if path.exists() { path } else { path.parent()? };
    fs2::available_space(target).ok()
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
        assert_eq!(status.writable, Some(true));
        assert!(status.available_bytes.is_some());
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
        assert_eq!(status.writable, Some(false));
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

    #[test]
    fn searches_jsonl_result_lines() {
        let dir = unique_temp_dir("jsonl-search");
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("chat.jsonl");
        fs::write(
            &file,
            "{\"text\":\"hello alex\"}\n{\"text\":\"other\"}\n{\"text\":\"alex again\"}\n",
        )
        .unwrap();

        let matches = search_jsonl_file(&file, "alex", 10).unwrap();

        assert_eq!(matches.len(), 2);
        assert_eq!(matches[0].line_number, 1);
        assert!(matches[1].preview.contains("alex again"));

        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn inspect_export_path_warns_for_long_new_path() {
        let base = unique_temp_dir("long-path");
        fs::create_dir_all(&base).unwrap();
        let long_segment = "nested-output-directory-name".repeat(10);
        let path = base.join(long_segment);

        let status = inspect_export_path_impl(&path);
        assert!(!status.exists);
        assert!(status.parent_exists);
        assert!(status.path_length > 240);
        assert!(status
            .warnings
            .iter()
            .any(|warning| warning.contains("路径较长")));

        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn inspect_export_path_warns_about_interrupted_partial_exports() {
        let dir = unique_temp_dir("partial-export");
        fs::create_dir_all(&dir).unwrap();
        let target = dir.join("Messages Export");
        fs::create_dir_all(dir.join(".imessage-exporter-gui-Messages Export-demo.partial"))
            .unwrap();

        let status = inspect_export_path_impl(&target);

        assert!(status
            .warnings
            .iter()
            .any(|warning| warning.contains(".partial")));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn inspect_export_path_detects_resumable_partial_exports() {
        let dir = unique_temp_dir("resumable-partial-export");
        fs::create_dir_all(&dir).unwrap();
        let target = dir.join("Messages Export");
        let partial = dir.join(".imessage-exporter-gui-Messages Export.partial");
        fs::create_dir_all(&partial).unwrap();
        fs::write(partial.join(".imessage-exporter-gui-checkpoint.json"), "{}").unwrap();

        let status = inspect_export_path_impl(&target);

        assert_eq!(status.interrupted_exports.len(), 1);
        assert!(status
            .warnings
            .iter()
            .any(|warning| warning.contains("断点记录")));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn delete_interrupted_export_removes_only_partial_export_directories() {
        let dir = unique_temp_dir("delete-partial");
        let partial = dir.join(".imessage-exporter-gui-Messages Export-demo.partial");
        fs::create_dir_all(partial.join("nested")).unwrap();
        fs::write(partial.join("nested").join("chat.html"), "ok").unwrap();

        delete_interrupted_export(partial.display().to_string()).unwrap();

        assert!(!partial.exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn delete_interrupted_export_rejects_unrelated_directories() {
        let dir = unique_temp_dir("delete-unrelated");
        fs::create_dir_all(&dir).unwrap();

        let err = delete_interrupted_export(dir.display().to_string()).unwrap_err();

        assert!(err.contains(".partial"));
        fs::remove_dir_all(dir).unwrap();
    }
}
