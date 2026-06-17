use std::{
    env, fs,
    path::{Path, PathBuf},
    process::Command,
    time::UNIX_EPOCH,
};

use crate::{
    app::{plist_bool_value, plist_string_value},
    engine,
    models::{BackupCandidate, EnvironmentStatus},
};

const VERIFIED_EXPORTER_VERSION: &str = "4.1.0 + JSONL";

pub fn get_environment() -> EnvironmentStatus {
    let ffmpeg_available = command_available("ffmpeg");
    let imagemagick_available = command_available("magick");
    let default_backup_roots = default_backup_roots()
        .into_iter()
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>();

    let mut warnings = Vec::new();
    if !ffmpeg_available {
        warnings.push("未检测到 ffmpeg；basic/full 附件转换中的音视频转换可能不可用。".to_string());
    }
    if !imagemagick_available {
        warnings.push(
            "未检测到 ImageMagick；basic/full 附件转换中的 HEIC 图片转换可能不可用。".to_string(),
        );
    }

    EnvironmentStatus {
        exporter_available: true,
        exporter_version: Some(format!(
            "{} {}",
            engine::ENGINE_LABEL,
            engine::ENGINE_VERSION
        )),
        exporter_path: None,
        verified_exporter_version: VERIFIED_EXPORTER_VERSION.to_string(),
        exporter_version_status: "verified".to_string(),
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

#[cfg(test)]
mod tests {
    use super::get_environment;

    #[test]
    fn built_in_exporter_is_always_available() {
        let environment = get_environment();
        assert!(environment.exporter_available);
        assert_eq!(environment.exporter_version_status, "verified");
        assert_eq!(environment.exporter_path, None);
    }
}
