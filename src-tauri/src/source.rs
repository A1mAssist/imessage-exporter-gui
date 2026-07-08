use std::{fs, path::Path};

use imessage_exporter::app::compatibility::backup::{
    decrypt_backup, get_decrypted_message_database,
};
use rusqlite::Connection;

use crate::{
    conversations::resolve_sms_db_path,
    engine, environment,
    models::{SourceConfig, SourceInspection, SourceKind},
};

pub fn inspect_source(source: &SourceConfig) -> SourceInspection {
    match inspect_source_inner(source) {
        Ok(inspection) => inspection,
        Err(error) => SourceInspection {
            ready: false,
            database_readable: false,
            encrypted: None,
            device_name: None,
            product_version: None,
            message_count: None,
            chat_count: None,
            attachment_count: None,
            attachment_bytes: None,
            warnings: Vec::new(),
            error: Some(error),
        },
    }
}

fn inspect_source_inner(source: &SourceConfig) -> Result<SourceInspection, String> {
    if matches!(source.kind, SourceKind::MacosChatDb) {
        let db_path = Path::new(&source.backup_path);
        if !db_path.is_file() {
            return Err("请选择 macOS Messages 的 chat.db 文件。".to_string());
        }
        let counts = read_counts(db_path)?;
        return Ok(SourceInspection {
            ready: true,
            database_readable: true,
            encrypted: Some(false),
            device_name: None,
            product_version: None,
            message_count: Some(counts.message_count),
            chat_count: Some(counts.chat_count),
            attachment_count: Some(counts.attachment_count),
            attachment_bytes: Some(counts.attachment_bytes),
            warnings: Vec::new(),
            error: None,
        });
    }

    let candidate = environment::validate_backup_path(&source.backup_path);
    if !candidate.valid {
        return Err("备份目录需要同时包含 Manifest.db 和 Info.plist。".to_string());
    }

    let encrypted = candidate.encrypted.unwrap_or(source.encrypted);
    if encrypted && !source.encrypted {
        return Err("检测到加密备份，请勾选加密备份并输入密码。".to_string());
    }
    if !encrypted && source.encrypted {
        return Err("该备份未标记为加密，请取消加密备份选项。".to_string());
    }

    let (db_path, device_name, product_version) = if encrypted {
        let options = engine::diagnostics_options(source)?;
        let backup = decrypt_backup(&options)
            .map_err(|err| err.to_string())?
            .ok_or_else(|| "未能打开加密备份。".to_string())?;
        let device_name = Some(backup.lockdown().device_name.clone());
        let product_version = Some(backup.lockdown().product_version.clone());
        let db_path = get_decrypted_message_database(&backup).map_err(|err| err.to_string())?;
        (db_path, device_name, product_version)
    } else {
        (
            resolve_sms_db_path(Path::new(&source.backup_path))?,
            candidate.device_name.clone(),
            None,
        )
    };

    let counts = read_counts(&db_path)?;
    if encrypted {
        let _ = fs::remove_file(&db_path);
    }

    Ok(SourceInspection {
        ready: true,
        database_readable: true,
        encrypted: Some(encrypted),
        device_name,
        product_version,
        message_count: Some(counts.message_count),
        chat_count: Some(counts.chat_count),
        attachment_count: Some(counts.attachment_count),
        attachment_bytes: Some(counts.attachment_bytes),
        warnings: Vec::new(),
        error: None,
    })
}

struct SourceCounts {
    message_count: usize,
    chat_count: usize,
    attachment_count: usize,
    attachment_bytes: u64,
}

fn read_counts(db_path: &Path) -> Result<SourceCounts, String> {
    let connection =
        Connection::open_with_flags(db_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|err| format!("无法读取 Messages 数据库：{err}"))?;
    Ok(SourceCounts {
        message_count: count_table(&connection, "message")?,
        chat_count: count_table(&connection, "chat")?,
        attachment_count: count_table(&connection, "attachment").unwrap_or(0),
        attachment_bytes: sum_attachment_bytes(&connection).unwrap_or(0),
    })
}

fn count_table(connection: &Connection, table: &str) -> Result<usize, String> {
    let sql = format!("SELECT COUNT(*) FROM \"{}\"", table.replace('"', "\"\""));
    let count: i64 = connection
        .query_row(&sql, [], |row| row.get(0))
        .map_err(|err| format!("无法读取 {table} 表：{err}"))?;
    usize::try_from(count).map_err(|_| format!("{table} 表计数超出范围"))
}

fn sum_attachment_bytes(connection: &Connection) -> Result<u64, String> {
    let bytes: i64 = connection
        .query_row(
            "SELECT IFNULL(SUM(total_bytes), 0) FROM attachment",
            [],
            |row| row.get(0),
        )
        .map_err(|err| format!("无法读取附件大小：{err}"))?;
    u64::try_from(bytes).map_err(|_| "附件大小超出范围".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::SourceKind;
    use rusqlite::params;
    use tempfile::tempdir;

    #[test]
    fn inspects_manifest_mapped_sms_database() {
        let root = tempdir().unwrap();
        let backup = root.path();
        let file_id = "abcdef1234567890";
        fs::write(backup.join("Info.plist"), b"").unwrap();
        fs::create_dir_all(backup.join("ab")).unwrap();

        let manifest = Connection::open(backup.join("Manifest.db")).unwrap();
        manifest
            .execute(
                "CREATE TABLE Files (fileID TEXT, domain TEXT, relativePath TEXT)",
                [],
            )
            .unwrap();
        manifest
            .execute(
                "INSERT INTO Files (fileID, domain, relativePath) VALUES (?1, 'HomeDomain', 'Library/SMS/sms.db')",
                params![file_id],
            )
            .unwrap();

        let sms = Connection::open(backup.join("ab").join(file_id)).unwrap();
        sms.execute("CREATE TABLE message (ROWID INTEGER PRIMARY KEY)", [])
            .unwrap();
        sms.execute("CREATE TABLE chat (ROWID INTEGER PRIMARY KEY)", [])
            .unwrap();
        sms.execute("CREATE TABLE attachment (ROWID INTEGER PRIMARY KEY)", [])
            .unwrap();
        sms.execute("INSERT INTO message DEFAULT VALUES", [])
            .unwrap();
        sms.execute("INSERT INTO chat DEFAULT VALUES", []).unwrap();
        sms.execute("INSERT INTO attachment DEFAULT VALUES", [])
            .unwrap();

        let inspection = inspect_source(&SourceConfig {
            kind: SourceKind::IosBackup,
            backup_path: backup.display().to_string(),
            exporter_path: None,
            attachment_root: None,
            contacts_path: None,
            encrypted: false,
            cleartext_password: None,
        });

        assert!(inspection.ready);
        assert_eq!(inspection.message_count, Some(1));
        assert_eq!(inspection.chat_count, Some(1));
        assert_eq!(inspection.attachment_count, Some(1));
        assert_eq!(inspection.attachment_bytes, Some(0));
    }

    #[test]
    fn inspects_macos_chat_database_file() {
        let root = tempdir().unwrap();
        let db_path = root.path().join("chat.db");
        let db = Connection::open(&db_path).unwrap();
        db.execute("CREATE TABLE message (ROWID INTEGER PRIMARY KEY)", [])
            .unwrap();
        db.execute("CREATE TABLE chat (ROWID INTEGER PRIMARY KEY)", [])
            .unwrap();
        db.execute(
            "CREATE TABLE attachment (ROWID INTEGER PRIMARY KEY, total_bytes INTEGER)",
            [],
        )
        .unwrap();
        db.execute("INSERT INTO message DEFAULT VALUES", [])
            .unwrap();
        db.execute("INSERT INTO chat DEFAULT VALUES", []).unwrap();
        db.execute("INSERT INTO attachment (total_bytes) VALUES (2048)", [])
            .unwrap();

        let inspection = inspect_source(&SourceConfig {
            kind: SourceKind::MacosChatDb,
            backup_path: db_path.display().to_string(),
            exporter_path: None,
            attachment_root: None,
            contacts_path: None,
            encrypted: false,
            cleartext_password: None,
        });

        assert!(inspection.ready);
        assert_eq!(inspection.message_count, Some(1));
        assert_eq!(inspection.attachment_bytes, Some(2048));
    }
}
