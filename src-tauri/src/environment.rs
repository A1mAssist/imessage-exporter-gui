use std::{
    env, fs,
    path::{Path, PathBuf},
    process::Command,
    time::UNIX_EPOCH,
};

use tauri::AppHandle;

use crate::{
    app::{plist_bool_value, plist_string_value},
    cli::{self, SIDECAR_VERSION},
    models::{BackupCandidate, EnvironmentStatus},
};

pub fn get_environment(app: &AppHandle) -> EnvironmentStatus {
    let sidecar_path = cli::sidecar_path(app).ok();
    let sidecar_available = sidecar_path
        .as_ref()
        .map(|path| path.is_file())
        .unwrap_or(false);
    let sidecar_version = if sidecar_available {
        read_sidecar_version(sidecar_path.as_ref().expect("checked sidecar path"))
            .or_else(|| Some(format!("pinned {SIDECAR_VERSION}")))
    } else {
        None
    };
    let ffmpeg_available = command_available("ffmpeg");
    let imagemagick_available = command_available("magick");
    let default_backup_roots = default_backup_roots()
        .into_iter()
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>();

    let mut warnings = Vec::new();
    if !sidecar_available {
        warnings.push(
            "未找到内置 imessage-exporter sidecar，请先运行 scripts/build-sidecar.ps1。"
                .to_string(),
        );
    }
    if !ffmpeg_available {
        warnings.push("未检测到 ffmpeg，basic/full 附件转换可能不可用。".to_string());
    }
    if !imagemagick_available {
        warnings.push("未检测到 ImageMagick，HEIC 等图片转换可能不可用。".to_string());
    }

    EnvironmentStatus {
        sidecar_available,
        sidecar_version,
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

fn read_sidecar_version(path: &Path) -> Option<String> {
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
