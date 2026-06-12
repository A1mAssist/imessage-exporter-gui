use std::path::PathBuf;

use tauri::Manager;

use crate::models::{CommandPreview, ExportConfig, SourceConfig};

pub const SIDECAR_BASENAME: &str = "imessage-exporter";
pub const SIDECAR_VERSION: &str = "4.1.0";

pub fn sidecar_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    let packaged_name = sidecar_packaged_name();
    let source_name = sidecar_source_name();
    let resource_candidates = [
        packaged_name.clone(),
        format!("binaries/{packaged_name}"),
        source_name.clone(),
        format!("binaries/{source_name}"),
    ];
    let mut first_resolved_path = None;

    for resource in resource_candidates {
        let resource_path = app
            .path()
            .resolve(resource, tauri::path::BaseDirectory::Resource)
            .map_err(|err| format!("Failed to resolve bundled imessage-exporter: {err}"))?;
        first_resolved_path.get_or_insert_with(|| resource_path.clone());
        if resource_path.is_file() {
            return Ok(resource_path);
        }
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            for dev_path in [exe_dir.join(&packaged_name), exe_dir.join(&source_name)] {
                if dev_path.is_file() {
                    return Ok(dev_path);
                }
            }
        }
    }

    let current_dir = std::env::current_dir()
        .map_err(|err| format!("Failed to inspect current directory: {err}"))?;

    for dev_path in [
        current_dir
            .join("src-tauri")
            .join("binaries")
            .join(&source_name),
        current_dir.join("binaries").join(&source_name),
        current_dir
            .join("src-tauri")
            .join("target")
            .join("debug")
            .join(&packaged_name),
        current_dir
            .join("src-tauri")
            .join("target")
            .join("release")
            .join(&packaged_name),
    ] {
        if dev_path.is_file() {
            return Ok(dev_path);
        }
    }

    Ok(first_resolved_path.unwrap_or_else(|| {
        current_dir
            .join("src-tauri")
            .join("binaries")
            .join(source_name)
    }))
}

fn sidecar_packaged_name() -> String {
    if cfg!(windows) {
        format!("{SIDECAR_BASENAME}.exe")
    } else {
        SIDECAR_BASENAME.to_string()
    }
}

fn sidecar_source_name() -> String {
    let extension = if cfg!(windows) { ".exe" } else { "" };
    format!(
        "{SIDECAR_BASENAME}-{}{extension}",
        sidecar_target_triple()
    )
}

fn sidecar_target_triple() -> &'static str {
    if cfg!(all(target_os = "windows", target_arch = "x86_64", target_env = "msvc")) {
        "x86_64-pc-windows-msvc"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "x86_64-apple-darwin"
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "aarch64-apple-darwin"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "x86_64-unknown-linux-gnu"
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        "aarch64-unknown-linux-gnu"
    } else {
        "unknown-target"
    }
}

pub fn diagnostics_args(config: &SourceConfig) -> Result<Vec<String>, String> {
    validate_backup_path_string(&config.backup_path)?;

    let mut args = vec![
        "-d".to_string(),
        "-p".to_string(),
        config.backup_path.clone(),
        "-a".to_string(),
        "iOS".to_string(),
        "--no-progress".to_string(),
    ];

    if config.encrypted {
        push_password(&mut args, config.cleartext_password.as_deref())?;
    }

    Ok(args)
}

pub fn export_args(config: &ExportConfig) -> Result<Vec<String>, String> {
    validate_backup_path_string(&config.backup_path)?;
    validate_required_path("Export path", &config.export_path)?;
    validate_export_path(&config.backup_path, &config.export_path)?;
    validate_date("Start date", config.start_date.as_deref())?;
    validate_date("End date", config.end_date.as_deref())?;
    validate_date_range(config.start_date.as_deref(), config.end_date.as_deref())?;

    if present(config.custom_name.as_deref()) && config.use_caller_id.unwrap_or(false) {
        return Err("customName and useCallerId cannot both be enabled".to_string());
    }

    let mut args = vec![
        "-p".to_string(),
        config.backup_path.clone(),
        "-a".to_string(),
        "iOS".to_string(),
        "-o".to_string(),
        config.export_path.clone(),
        "-f".to_string(),
        config.format.as_arg().to_string(),
        "-c".to_string(),
        config.copy_method.as_arg().to_string(),
        "--no-progress".to_string(),
    ];

    if config.encrypted {
        push_password(&mut args, config.cleartext_password.as_deref())?;
    }
    if let Some(value) = clean(config.start_date.as_deref()) {
        args.extend(["-s".to_string(), value]);
    }
    if let Some(value) = clean(config.end_date.as_deref()) {
        args.extend(["-e".to_string(), value]);
    }
    if let Some(value) = clean(config.conversation_filter.as_deref()) {
        args.extend(["-t".to_string(), value]);
    }
    if matches!(config.format, crate::models::ExportFormat::Html) && config.no_lazy.unwrap_or(false)
    {
        args.push("-l".to_string());
    }
    if let Some(value) = clean(config.custom_name.as_deref()) {
        args.extend(["-m".to_string(), value]);
    }
    if config.use_caller_id.unwrap_or(false) {
        args.push("-i".to_string());
    }
    if config.ignore_disk_warning.unwrap_or(false) {
        args.push("-b".to_string());
    }

    Ok(args)
}

pub fn preview(executable: impl Into<String>, args: &[String]) -> CommandPreview {
    let redacted_args = redact_args(args);
    let executable = executable.into();
    CommandPreview {
        executable: executable.clone(),
        args: redacted_args.clone(),
        redacted: std::iter::once(shell_quote(&executable))
            .chain(redacted_args.iter().map(|arg| shell_quote(arg)))
            .collect::<Vec<_>>()
            .join(" "),
    }
}

fn push_password(args: &mut Vec<String>, password: Option<&str>) -> Result<(), String> {
    let password =
        clean(password).ok_or_else(|| "Encrypted backups require a password".to_string())?;
    args.extend(["--cleartext-password".to_string(), password]);
    Ok(())
}

pub fn redact_args(args: &[String]) -> Vec<String> {
    let mut redacted = Vec::with_capacity(args.len());
    let mut hide_next = false;
    for arg in args {
        if hide_next {
            redacted.push("[redacted]".to_string());
            hide_next = false;
            continue;
        }

        redacted.push(arg.clone());
        if arg == "--cleartext-password" {
            hide_next = true;
        }
    }
    redacted
}

pub fn validate_backup_path_string(path: &str) -> Result<(), String> {
    validate_required_path("Backup path", path)
}

fn validate_required_path(label: &str, value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        Err(format!("{label} is required"))
    } else {
        Ok(())
    }
}

fn validate_export_path(backup_path: &str, export_path: &str) -> Result<(), String> {
    let backup_path = normalize_path(backup_path);
    let export_path = normalize_path(export_path);

    if backup_path == export_path {
        return Err("Export path cannot be the iOS backup directory".to_string());
    }
    if export_path.starts_with(&format!("{backup_path}/")) {
        return Err("Export path cannot be inside the iOS backup directory".to_string());
    }
    Ok(())
}

fn validate_date(label: &str, value: Option<&str>) -> Result<(), String> {
    let Some(value) = clean(value) else {
        return Ok(());
    };

    let bytes = value.as_bytes();
    let valid_shape = bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(idx, byte)| idx == 4 || idx == 7 || byte.is_ascii_digit());

    if !valid_shape {
        return Err(format!("{label} must use YYYY-MM-DD format"));
    }

    let year = value[0..4].parse::<u32>().unwrap_or_default();
    let month = value[5..7].parse::<u32>().unwrap_or_default();
    let day = value[8..10].parse::<u32>().unwrap_or_default();
    if valid_calendar_date(year, month, day) {
        return Ok(());
    }

    Err(format!("{label} must use a real YYYY-MM-DD date"))
}

fn valid_calendar_date(year: u32, month: u32, day: u32) -> bool {
    if year == 0 || month == 0 || month > 12 || day == 0 {
        return false;
    }

    let max_day = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap_year(year) => 29,
        2 => 28,
        _ => return false,
    };

    day <= max_day
}

fn leap_year(year: u32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn validate_date_range(start_date: Option<&str>, end_date: Option<&str>) -> Result<(), String> {
    let Some(start_date) = clean(start_date) else {
        return Ok(());
    };
    let Some(end_date) = clean(end_date) else {
        return Ok(());
    };

    if end_date < start_date {
        Err("End date cannot be earlier than start date".to_string())
    } else {
        Ok(())
    }
}

fn normalize_path(path: &str) -> String {
    let mut normalized = path.trim().replace('\\', "/").to_ascii_lowercase();
    while normalized.ends_with('/') {
        normalized.pop();
    }
    while normalized.contains("//") {
        normalized = normalized.replace("//", "/");
    }
    normalized
}

fn present(value: Option<&str>) -> bool {
    clean(value).is_some()
}

fn clean(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn shell_quote(value: &str) -> String {
    if value.is_empty() {
        "\"\"".to_string()
    } else if value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || "-_./:\\\\".contains(ch))
    {
        value.to_string()
    } else {
        format!("\"{}\"", value.replace('"', "\\\""))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{CopyMethod, ExportFormat, SourceKind};

    fn base_config() -> ExportConfig {
        ExportConfig {
            kind: SourceKind::IosBackup,
            backup_path: "C:\\Backups\\device".to_string(),
            encrypted: false,
            cleartext_password: None,
            export_path: "C:\\Exports".to_string(),
            format: ExportFormat::Html,
            copy_method: CopyMethod::Clone,
            start_date: None,
            end_date: None,
            conversation_filter: None,
            no_lazy: None,
            custom_name: None,
            use_caller_id: None,
            ignore_disk_warning: None,
        }
    }

    #[test]
    fn builds_required_ios_export_args() {
        let args = export_args(&base_config()).unwrap();
        assert_eq!(
            args,
            vec![
                "-p",
                "C:\\Backups\\device",
                "-a",
                "iOS",
                "-o",
                "C:\\Exports",
                "-f",
                "html",
                "-c",
                "clone",
                "--no-progress"
            ]
        );
    }

    #[test]
    fn redacts_cleartext_password() {
        let args = vec![
            "--cleartext-password".to_string(),
            "secret".to_string(),
            "-f".to_string(),
            "html".to_string(),
        ];
        assert_eq!(
            redact_args(&args),
            vec!["--cleartext-password", "[redacted]", "-f", "html"]
        );
    }

    #[test]
    fn maps_print_friendly_html_to_no_lazy_flag() {
        let mut config = base_config();
        config.no_lazy = Some(true);
        let args = export_args(&config).unwrap();
        assert!(args.contains(&"-l".to_string()));
        assert!(!args.contains(&"-x".to_string()));
    }

    #[test]
    fn ignores_print_friendly_mode_for_txt_exports() {
        let mut config = base_config();
        config.format = ExportFormat::Txt;
        config.no_lazy = Some(true);
        let args = export_args(&config).unwrap();
        assert!(!args.contains(&"-l".to_string()));
    }

    #[test]
    fn builds_all_supported_ios_export_options() {
        let mut config = base_config();
        config.encrypted = true;
        config.cleartext_password = Some("secret".to_string());
        config.start_date = Some("2024-01-01".to_string());
        config.end_date = Some("2024-12-31".to_string());
        config.conversation_filter = Some("Alice".to_string());
        config.no_lazy = Some(true);
        config.custom_name = Some("Me".to_string());
        config.ignore_disk_warning = Some(true);

        let args = export_args(&config).unwrap();
        assert_eq!(
            args,
            vec![
                "-p",
                "C:\\Backups\\device",
                "-a",
                "iOS",
                "-o",
                "C:\\Exports",
                "-f",
                "html",
                "-c",
                "clone",
                "--no-progress",
                "--cleartext-password",
                "secret",
                "-s",
                "2024-01-01",
                "-e",
                "2024-12-31",
                "-t",
                "Alice",
                "-l",
                "-m",
                "Me",
                "-b"
            ]
        );
    }

    #[test]
    fn diagnostics_accepts_encrypted_ios_backup_password() {
        let source = SourceConfig {
            kind: SourceKind::IosBackup,
            backup_path: "C:\\Backups\\device".to_string(),
            encrypted: true,
            cleartext_password: Some("secret".to_string()),
        };

        let args = diagnostics_args(&source).unwrap();
        assert_eq!(
            args,
            vec![
                "-d",
                "-p",
                "C:\\Backups\\device",
                "-a",
                "iOS",
                "--no-progress",
                "--cleartext-password",
                "secret"
            ]
        );
    }

    #[test]
    fn preview_redacts_password_value() {
        let preview = preview(
            "imessage-exporter",
            &[
                "--cleartext-password".to_string(),
                "secret".to_string(),
                "-f".to_string(),
                "html".to_string(),
            ],
        );
        assert!(preview.redacted.contains("[redacted]"));
        assert!(!preview.redacted.contains("secret"));
        assert!(!preview.args.contains(&"secret".to_string()));
    }

    #[test]
    fn rejects_conflicting_names() {
        let mut config = base_config();
        config.custom_name = Some("Alice".to_string());
        config.use_caller_id = Some(true);
        assert!(export_args(&config).is_err());
    }

    #[test]
    fn rejects_export_path_inside_backup_path() {
        let mut config = base_config();
        config.export_path = "C:\\Backups\\device\\".to_string();
        assert_eq!(
            export_args(&config).unwrap_err(),
            "Export path cannot be the iOS backup directory"
        );

        config.export_path = "C:/Backups/device/Messages Export".to_string();
        assert_eq!(
            export_args(&config).unwrap_err(),
            "Export path cannot be inside the iOS backup directory"
        );

        config.export_path = "C:/Backups/device-export".to_string();
        assert!(export_args(&config).is_ok());
    }

    #[test]
    fn validates_date_shape() {
        let mut config = base_config();
        config.start_date = Some("2024/01/01".to_string());
        assert!(export_args(&config).is_err());
    }

    #[test]
    fn rejects_impossible_calendar_dates() {
        let mut config = base_config();
        config.start_date = Some("2025-02-30".to_string());
        assert_eq!(
            export_args(&config).unwrap_err(),
            "Start date must use a real YYYY-MM-DD date"
        );

        config.start_date = Some("2024-02-29".to_string());
        assert!(export_args(&config).is_ok());
    }

    #[test]
    fn rejects_reversed_date_range() {
        let mut config = base_config();
        config.start_date = Some("2025-03-01".to_string());
        config.end_date = Some("2025-02-28".to_string());
        assert_eq!(
            export_args(&config).unwrap_err(),
            "End date cannot be earlier than start date"
        );
    }
}
