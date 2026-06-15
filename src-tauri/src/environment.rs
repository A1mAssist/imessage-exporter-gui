use std::{
    env, fs,
    path::{Path, PathBuf},
    process::Command,
    time::UNIX_EPOCH,
};

use crate::{
    app::{plist_bool_value, plist_string_value},
    cli,
    models::{BackupCandidate, EnvironmentStatus},
};

const VERIFIED_EXPORTER_VERSION: &str = "4.1.0";

pub fn get_environment(configured_exporter_path: Option<&str>) -> EnvironmentStatus {
    let (exporter_path, exporter_error) = match cli::resolve_exporter_path(configured_exporter_path)
    {
        Ok(path) => (Some(path), None),
        Err(err) => (None, Some(err)),
    };
    let exporter_available = exporter_path.is_some();
    let exporter_version = exporter_path
        .as_ref()
        .and_then(|path| read_exporter_version(path));
    let exporter_version_status = exporter_version_status(exporter_version.as_deref());
    let ffmpeg_available = command_available("ffmpeg");
    let imagemagick_available = command_available("magick");
    let default_backup_roots = default_backup_roots()
        .into_iter()
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>();

    let mut warnings = Vec::new();
    if !exporter_available {
        warnings.push(
            "未找到 imessage-exporter。请安装命令行工具，或在界面中选择 imessage-exporter 可执行文件。"
                .to_string(),
        );
        if let Some(err) = exporter_error {
            warnings.push(err);
        }
    } else if exporter_version_status == "older" {
        warnings.push(format!(
            "当前 imessage-exporter 版本低于已验证版本 {VERIFIED_EXPORTER_VERSION}；如果诊断或导出失败，请更新导出引擎。"
        ));
    } else if exporter_version_status == "unknown" {
        warnings.push(format!(
            "无法识别当前 imessage-exporter 版本；GUI 已验证版本为 {VERIFIED_EXPORTER_VERSION}。如果遇到参数错误，请更新 GUI 或导出引擎。"
        ));
    }
    if !ffmpeg_available {
        warnings.push("未检测到 ffmpeg，basic/full 附件转换可能不可用。".to_string());
    }
    if !imagemagick_available {
        warnings.push("未检测到 ImageMagick，HEIC 等图片转换可能不可用。".to_string());
    }

    EnvironmentStatus {
        exporter_available,
        exporter_version,
        exporter_path: exporter_path.map(|path| path.display().to_string()),
        verified_exporter_version: VERIFIED_EXPORTER_VERSION.to_string(),
        exporter_version_status: exporter_version_status.to_string(),
        ffmpeg_available,
        imagemagick_available,
        default_backup_roots,
        warnings,
    }
}

pub fn scan_ios_backups() -> Vec<BackupCandidate> {
    default_backup_roots()
        .into_iter()
        .filter_map(|root| fs::read_dir(root).ok())
        .flat_map(|entries| entries.filter_map(Result::ok))
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .filter_map(|path| backup_candidate(&path))
        .collect()
}

pub fn validate_backup_path(path: &str) -> BackupCandidate {
    backup_candidate(Path::new(path)).unwrap_or_else(|| BackupCandidate {
        path: path.to_string(),
        display_name: display_name(Path::new(path)),
        device_name: None,
        last_modified: None,
        has_manifest_db: false,
        has_info_plist: false,
        encrypted: None,
        valid: false,
    })
}

pub fn default_backup_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if let Ok(appdata) = env::var("APPDATA") {
        roots.push(PathBuf::from(appdata).join("Apple Computer\\MobileSync\\Backup"));
    }
    if let Ok(user_profile) = env::var("USERPROFILE") {
        roots.push(PathBuf::from(&user_profile).join("Apple\\MobileSync\\Backup"));
        roots.push(
            PathBuf::from(user_profile)
                .join("AppData\\Roaming\\Apple Computer\\MobileSync\\Backup"),
        );
    }

    roots.sort();
    roots.dedup();
    roots
}

fn backup_candidate(path: &Path) -> Option<BackupCandidate> {
    let has_manifest_db = path.join("Manifest.db").is_file();
    let has_info_plist = path.join("Info.plist").is_file();
    let valid = path.is_dir() && has_manifest_db && has_info_plist;
    let device_name = plist_string_value(&path.join("Info.plist"), "Device Name");
    let encrypted = plist_bool_value(&path.join("Manifest.plist"), "IsEncrypted");
    let last_modified = fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs().to_string());

    Some(BackupCandidate {
        path: path.display().to_string(),
        display_name: device_name.clone().unwrap_or_else(|| display_name(path)),
        device_name,
        last_modified,
        has_manifest_db,
        has_info_plist,
        encrypted,
        valid,
    })
}

fn display_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("iOS Backup")
        .to_string()
}

fn command_available(name: &str) -> bool {
    Command::new(name)
        .arg("--version")
        .output()
        .map(|output| {
            output.status.success() || !output.stdout.is_empty() || !output.stderr.is_empty()
        })
        .unwrap_or(false)
}

fn read_exporter_version(path: &Path) -> Option<String> {
    Command::new(path)
        .arg("--version")
        .output()
        .ok()
        .and_then(|output| {
            if output.status.success() {
                String::from_utf8(output.stdout)
                    .ok()
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty())
            } else {
                None
            }
        })
}

fn exporter_version_status(version: Option<&str>) -> &'static str {
    let Some(version) = version.and_then(parse_version_triplet) else {
        return "unknown";
    };
    let Some(verified) = parse_version_triplet(VERIFIED_EXPORTER_VERSION) else {
        return "unknown";
    };

    if version >= verified {
        "verified"
    } else {
        "older"
    }
}

fn parse_version_triplet(value: &str) -> Option<(u32, u32, u32)> {
    for token in value.split(|ch: char| !(ch.is_ascii_alphanumeric() || ch == '.')) {
        let mut parts = token.split('.');
        let (Some(major), Some(minor), Some(patch), None) =
            (parts.next(), parts.next(), parts.next(), parts.next())
        else {
            continue;
        };
        if major.is_empty()
            || minor.is_empty()
            || patch.is_empty()
            || !major.chars().all(|ch| ch.is_ascii_digit())
            || !minor.chars().all(|ch| ch.is_ascii_digit())
            || !patch.chars().all(|ch| ch.is_ascii_digit())
        {
            continue;
        }
        return Some((
            major.parse().ok()?,
            minor.parse().ok()?,
            patch.parse().ok()?,
        ));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::{exporter_version_status, parse_version_triplet};

    #[test]
    fn parses_exporter_version_output() {
        assert_eq!(
            parse_version_triplet("iMessage Exporter 4.1.0"),
            Some((4, 1, 0))
        );
        assert_eq!(
            parse_version_triplet("imessage-exporter 4.2.3"),
            Some((4, 2, 3))
        );
        assert_eq!(parse_version_triplet("imessage-exporter dev"), None);
    }

    #[test]
    fn classifies_exporter_version_status() {
        assert_eq!(
            exporter_version_status(Some("iMessage Exporter 4.1.0")),
            "verified"
        );
        assert_eq!(
            exporter_version_status(Some("iMessage Exporter 4.2.0")),
            "verified"
        );
        assert_eq!(
            exporter_version_status(Some("iMessage Exporter 4.0.9")),
            "older"
        );
        assert_eq!(
            exporter_version_status(Some("imessage-exporter dev")),
            "unknown"
        );
        assert_eq!(exporter_version_status(None), "unknown");
    }
}
