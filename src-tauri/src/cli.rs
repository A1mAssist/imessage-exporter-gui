use std::{
    env,
    path::{Path, PathBuf},
};

use crate::models::{CommandPreview, ExportConfig, SourceConfig};

pub const EXPORTER_BASENAME: &str = "imessage-exporter";

pub fn resolve_exporter_path(configured_path: Option<&str>) -> Result<PathBuf, String> {
    if let Some(path) = clean(configured_path) {
        let selected = PathBuf::from(&path);
        if selected.is_file() {
            return Ok(selected);
        }
        if is_command_name(&path) {
            if let Some(found) = find_on_path(&path) {
                return Ok(found);
            }
        }
        return Err(format!(
            "imessage-exporter was not found at {path}. Choose a valid exporter executable."
        ));
    }

    find_on_path(EXPORTER_BASENAME).ok_or_else(|| {
        "imessage-exporter was not found on PATH. Install it or choose the exporter executable."
            .to_string()
    })
}

fn find_on_path(name: &str) -> Option<PathBuf> {
    let path = env::var_os("PATH")?;
    for directory in env::split_paths(&path) {
        for candidate in executable_candidates(name) {
            let path = directory.join(candidate);
            if path.is_file() {
                return Some(path);
            }
        }
    }
    None
}

fn executable_candidates(name: &str) -> Vec<String> {
    if cfg!(windows) && Path::new(name).extension().is_none() {
        vec![format!("{name}.exe"), name.to_string()]
    } else {
        vec![name.to_string()]
    }
}

fn is_command_name(value: &str) -> bool {
    !value.contains('/') && !value.contains('\\')
}

pub fn diagnostics_args(config: &SourceConfig) -> Result<Vec<String>, String> {
    validate_backup_path_string(&config.backup_path)?;

    let mut args = vec![
        "-d".to_string(),
        "-p".to_string(),
        config.backup_path.clone(),
        "-a".to_string(),
        "iOS".to_string(),
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
    use std::{
        fs,
        process::Command,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn base_config() -> ExportConfig {
        ExportConfig {
            kind: SourceKind::IosBackup,
            backup_path: "C:\\Backups\\device".to_string(),
            exporter_path: None,
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

    fn smoke_config(
        backup_path: &str,
        export_path: &str,
        format: ExportFormat,
        copy_method: CopyMethod,
    ) -> ExportConfig {
        ExportConfig {
            kind: SourceKind::IosBackup,
            backup_path: backup_path.to_string(),
            exporter_path: None,
            encrypted: false,
            cleartext_password: None,
            export_path: export_path.to_string(),
            format,
            copy_method,
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
            exporter_path: None,
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

    #[test]
    fn rejects_missing_configured_exporter_path() {
        let error = resolve_exporter_path(Some("C:\\missing\\imessage-exporter.exe")).unwrap_err();
        assert!(error.contains("imessage-exporter was not found"));
    }

    #[test]
    fn real_exporter_accepts_gui_generated_command_matrix() {
        let Ok(exporter) = std::env::var("IMESSAGE_EXPORTER_REAL_SMOKE_PATH") else {
            eprintln!(
                "IMESSAGE_EXPORTER_REAL_SMOKE_PATH is not set; real exporter CLI matrix skipped."
            );
            return;
        };

        let version = Command::new(&exporter)
            .arg("--version")
            .output()
            .expect("failed to run imessage-exporter --version");
        assert!(
            version.status.success(),
            "could not run imessage-exporter --version: {}{}",
            String::from_utf8_lossy(&version.stdout),
            String::from_utf8_lossy(&version.stderr)
        );

        let run_id = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let missing_backup = std::env::temp_dir().join(format!(
            "imessage-exporter-gui-real-cli-missing-backup-{run_id}"
        ));
        let missing_output =
            std::env::temp_dir().join(format!("imessage-exporter-gui-real-cli-output-{run_id}"));
        let missing_backup_text = missing_backup.display().to_string();
        let missing_output_text = missing_output.display().to_string();

        let _ = fs::remove_dir_all(&missing_backup);
        let _ = fs::remove_dir_all(&missing_output);

        let mut cases: Vec<(String, Vec<String>)> = Vec::new();
        let source = SourceConfig {
            kind: SourceKind::IosBackup,
            backup_path: missing_backup_text.clone(),
            exporter_path: None,
            encrypted: false,
            cleartext_password: None,
        };
        cases.push((
            "Diagnostics plain".to_string(),
            diagnostics_args(&source).unwrap(),
        ));

        let mut encrypted_source = source.clone();
        encrypted_source.encrypted = true;
        encrypted_source.cleartext_password = Some("dummy-password".to_string());
        cases.push((
            "Diagnostics encrypted backup password".to_string(),
            diagnostics_args(&encrypted_source).unwrap(),
        ));

        let formats = [(ExportFormat::Html, "html"), (ExportFormat::Txt, "txt")];
        let copy_methods = [
            (CopyMethod::Disabled, "disabled"),
            (CopyMethod::Clone, "clone"),
            (CopyMethod::Basic, "basic"),
            (CopyMethod::Full, "full"),
        ];

        for (format, format_name) in formats {
            for (copy_method, copy_name) in &copy_methods {
                let config = smoke_config(
                    &missing_backup_text,
                    &missing_output_text,
                    format.clone(),
                    copy_method.clone(),
                );
                cases.push((
                    format!("Export {format_name} / {copy_name}"),
                    export_args(&config).unwrap(),
                ));

                if matches!(&format, ExportFormat::Html) {
                    let mut no_lazy_config = config;
                    no_lazy_config.no_lazy = Some(true);
                    cases.push((
                        format!("Export {format_name} / {copy_name} / no-lazy"),
                        export_args(&no_lazy_config).unwrap(),
                    ));
                }
            }
        }

        let mut config = smoke_config(
            &missing_backup_text,
            &missing_output_text,
            ExportFormat::Html,
            CopyMethod::Clone,
        );
        config.encrypted = true;
        config.cleartext_password = Some("dummy-password".to_string());
        cases.push((
            "Export encrypted password".to_string(),
            export_args(&config).unwrap(),
        ));

        let mut config = smoke_config(
            &missing_backup_text,
            &missing_output_text,
            ExportFormat::Html,
            CopyMethod::Clone,
        );
        config.start_date = Some("2024-01-01".to_string());
        cases.push((
            "Export start date".to_string(),
            export_args(&config).unwrap(),
        ));

        let mut config = smoke_config(
            &missing_backup_text,
            &missing_output_text,
            ExportFormat::Html,
            CopyMethod::Clone,
        );
        config.end_date = Some("2024-12-31".to_string());
        cases.push(("Export end date".to_string(), export_args(&config).unwrap()));

        let mut config = smoke_config(
            &missing_backup_text,
            &missing_output_text,
            ExportFormat::Html,
            CopyMethod::Clone,
        );
        config.start_date = Some("2024-01-01".to_string());
        config.end_date = Some("2024-12-31".to_string());
        cases.push((
            "Export date range".to_string(),
            export_args(&config).unwrap(),
        ));

        let mut config = smoke_config(
            &missing_backup_text,
            &missing_output_text,
            ExportFormat::Html,
            CopyMethod::Clone,
        );
        config.conversation_filter = Some("chat-42".to_string());
        cases.push((
            "Export conversation filter".to_string(),
            export_args(&config).unwrap(),
        ));

        let mut config = smoke_config(
            &missing_backup_text,
            &missing_output_text,
            ExportFormat::Html,
            CopyMethod::Clone,
        );
        config.custom_name = Some("ArchiveName".to_string());
        cases.push((
            "Export custom display name".to_string(),
            export_args(&config).unwrap(),
        ));

        let mut config = smoke_config(
            &missing_backup_text,
            &missing_output_text,
            ExportFormat::Html,
            CopyMethod::Clone,
        );
        config.use_caller_id = Some(true);
        cases.push((
            "Export caller ID display".to_string(),
            export_args(&config).unwrap(),
        ));

        let mut config = smoke_config(
            &missing_backup_text,
            &missing_output_text,
            ExportFormat::Html,
            CopyMethod::Clone,
        );
        config.ignore_disk_warning = Some(true);
        cases.push((
            "Export ignore disk warning".to_string(),
            export_args(&config).unwrap(),
        ));

        let mut config = smoke_config(
            &missing_backup_text,
            &missing_output_text,
            ExportFormat::Html,
            CopyMethod::Full,
        );
        config.encrypted = true;
        config.cleartext_password = Some("dummy-password".to_string());
        config.start_date = Some("2024-01-01".to_string());
        config.end_date = Some("2024-12-31".to_string());
        config.conversation_filter = Some("chat-42".to_string());
        config.no_lazy = Some(true);
        config.custom_name = Some("ArchiveName".to_string());
        config.ignore_disk_warning = Some(true);
        cases.push((
            "Export combined custom-name options".to_string(),
            export_args(&config).unwrap(),
        ));

        let mut config = smoke_config(
            &missing_backup_text,
            &missing_output_text,
            ExportFormat::Html,
            CopyMethod::Basic,
        );
        config.encrypted = true;
        config.cleartext_password = Some("dummy-password".to_string());
        config.start_date = Some("2024-01-01".to_string());
        config.end_date = Some("2024-12-31".to_string());
        config.conversation_filter = Some("chat-42".to_string());
        config.no_lazy = Some(true);
        config.use_caller_id = Some(true);
        config.ignore_disk_warning = Some(true);
        cases.push((
            "Export combined caller-ID options".to_string(),
            export_args(&config).unwrap(),
        ));

        let mut config = smoke_config(
            &missing_backup_text,
            &missing_output_text,
            ExportFormat::Txt,
            CopyMethod::Disabled,
        );
        config.no_lazy = Some(true);
        let txt_normalized_args = export_args(&config).unwrap();
        assert!(
            !txt_normalized_args.contains(&"-l".to_string()),
            "TXT exports must not pass HTML-only no-lazy flag"
        );
        cases.push((
            "Export TXT normalized no-lazy off".to_string(),
            txt_normalized_args,
        ));

        println!("Real imessage-exporter CLI compatibility smoke:");
        println!("  Exporter: {exporter}");
        println!(
            "  Version: {}",
            String::from_utf8_lossy(&version.stdout).trim()
        );
        println!("  GUI-generated command matrix: {} cases", cases.len());

        for (name, args) in cases {
            let output = Command::new(&exporter)
                .args(&args)
                .output()
                .unwrap_or_else(|err| panic!("{name} failed to launch imessage-exporter: {err}"));
            let combined = format!(
                "{}\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );

            for pattern in [
                "requires --format",
                "Invalid command line options",
                "Invalid options",
                "unexpected argument",
                "unrecognized option",
            ] {
                assert!(
                    !combined.contains(pattern),
                    "{name} hit an imessage-exporter option compatibility error: {combined}"
                );
            }

            assert!(
                combined.contains("Manifest.plist") || combined.contains("Manifest.db"),
                "{name} did not reach backup validation. Output was: {combined}"
            );
            println!("  ok {name}");
        }

        let _ = fs::remove_dir_all(&missing_backup);
        let _ = fs::remove_dir_all(&missing_output);
    }
}
