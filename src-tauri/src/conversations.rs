use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};

use crate::models::ConversationCandidate;

const SMS_DOMAIN: &str = "HomeDomain";
const SMS_RELATIVE_PATH: &str = "Library/SMS/sms.db";

pub fn scan_conversations(backup_path: &Path) -> Result<Vec<ConversationCandidate>, String> {
    let sms_db = resolve_sms_db_path(backup_path)?;
    let connection =
        Connection::open_with_flags(&sms_db, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|err| format!("无法读取会话数据库：{err}"))?;
    read_conversations(&connection).map_err(|err| format!("无法解析会话列表：{err}"))
}

fn resolve_sms_db_path(backup_path: &Path) -> Result<PathBuf, String> {
    let direct = backup_path.join("Library").join("SMS").join("sms.db");
    if direct.is_file() {
        return Ok(direct);
    }

    let manifest = backup_path.join("Manifest.db");
    if !manifest.is_file() {
        return Err("备份目录缺少 Manifest.db，无法定位 sms.db。".to_string());
    }

    let connection =
        Connection::open_with_flags(&manifest, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|err| format!("无法读取 Manifest.db：{err}"))?;
    let file_id: Option<String> = connection
        .query_row(
            "SELECT fileID FROM Files WHERE domain = ?1 AND relativePath = ?2 LIMIT 1",
            params![SMS_DOMAIN, SMS_RELATIVE_PATH],
            |row| row.get(0),
        )
        .optional()
        .map_err(|err| format!("无法查询 sms.db 备份映射：{err}"))?;

    let file_id = file_id.ok_or_else(|| "Manifest.db 中没有找到 Messages 数据库。".to_string())?;
    let (prefix, rest) = file_id.split_at(file_id.len().min(2));
    let hashed = backup_path.join(prefix).join(rest);
    if hashed.is_file() {
        Ok(hashed)
    } else {
        Err("Messages 数据库文件不存在，备份可能不完整或已加密。".to_string())
    }
}

fn read_conversations(connection: &Connection) -> rusqlite::Result<Vec<ConversationCandidate>> {
    let mut statement = connection.prepare(
        r#"
        WITH message_stats AS (
          SELECT
            chat_message_join.chat_id AS chat_id,
            COUNT(message.ROWID) AS message_count,
            MAX(message.date) AS last_message_at
          FROM chat_message_join
          LEFT JOIN message ON message.ROWID = chat_message_join.message_id
          GROUP BY chat_message_join.chat_id
        ),
        participant_stats AS (
          SELECT
            chat_handle_join.chat_id AS chat_id,
            GROUP_CONCAT(DISTINCT handle.id) AS participants
          FROM chat_handle_join
          LEFT JOIN handle ON handle.ROWID = chat_handle_join.handle_id
          GROUP BY chat_handle_join.chat_id
        )
        SELECT
          chat.ROWID,
          COALESCE(NULLIF(chat.display_name, ''), '') AS display_name,
          COALESCE(chat.chat_identifier, '') AS chat_identifier,
          COALESCE(chat.service_name, '') AS service_name,
          COALESCE(message_stats.message_count, 0) AS message_count,
          message_stats.last_message_at AS last_message_at,
          participant_stats.participants AS participants
        FROM chat
        LEFT JOIN message_stats ON message_stats.chat_id = chat.ROWID
        LEFT JOIN participant_stats ON participant_stats.chat_id = chat.ROWID
        ORDER BY message_count DESC, last_message_at DESC
        LIMIT 250
        "#,
    )?;

    let rows = statement.query_map([], |row| {
        let row_id: i64 = row.get(0)?;
        let display_name: String = row.get(1)?;
        let chat_identifier: String = row.get(2)?;
        let service_name: String = row.get(3)?;
        let message_count: i64 = row.get(4)?;
        let last_message_at: Option<i64> = row.get(5)?;
        let participants: Option<String> = row.get(6)?;
        let participants = split_participants(participants);
        let is_group = participants.len() > 1 || chat_identifier.starts_with("chat");
        let title = conversation_title(&display_name, &chat_identifier, &participants);
        let subtitle = conversation_subtitle(&chat_identifier, &participants, is_group);
        let filter_value = if is_group && !chat_identifier.trim().is_empty() {
            chat_identifier.clone()
        } else {
            participants
                .first()
                .cloned()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| chat_identifier.clone())
        };

        Ok(ConversationCandidate {
            id: row_id.to_string(),
            title,
            subtitle,
            filter_value,
            service: empty_to_none(service_name),
            message_count: message_count.max(0) as usize,
            last_message_at: last_message_at.map(|value| value.to_string()),
            is_group,
        })
    })?;

    let mut conversations = Vec::new();
    for row in rows {
        let conversation = row?;
        if !conversation.filter_value.trim().is_empty() {
            conversations.push(conversation);
        }
    }
    Ok(conversations)
}

fn split_participants(value: Option<String>) -> Vec<String> {
    value
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn conversation_title(
    display_name: &str,
    chat_identifier: &str,
    participants: &[String],
) -> String {
    if !display_name.trim().is_empty() {
        return display_name.trim().to_string();
    }
    if participants.len() == 1 {
        return participants[0].clone();
    }
    if participants.len() > 1 {
        return participants
            .iter()
            .take(3)
            .cloned()
            .collect::<Vec<_>>()
            .join(", ");
    }
    if !chat_identifier.trim().is_empty() {
        return chat_identifier.trim().to_string();
    }
    "未命名会话".to_string()
}

fn conversation_subtitle(
    chat_identifier: &str,
    participants: &[String],
    is_group: bool,
) -> Option<String> {
    let mut parts = Vec::new();
    if is_group && !chat_identifier.trim().is_empty() {
        parts.push(chat_identifier.trim().to_string());
    }
    if !participants.is_empty() {
        parts.push(
            participants
                .iter()
                .take(5)
                .cloned()
                .collect::<Vec<_>>()
                .join(", "),
        );
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join(" · "))
    }
}

fn empty_to_none(value: String) -> Option<String> {
    let value = value.trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;
    use tempfile::tempdir;

    #[test]
    fn scans_conversations_from_manifest_mapped_sms_database() {
        let root = tempdir().unwrap();
        let backup = root.path();
        let file_id = "1234567890abcdef";
        std::fs::create_dir_all(backup.join("12")).unwrap();

        let manifest = Connection::open(backup.join("Manifest.db")).unwrap();
        manifest
            .execute(
                "CREATE TABLE Files (fileID TEXT, domain TEXT, relativePath TEXT)",
                [],
            )
            .unwrap();
        manifest
            .execute(
                "INSERT INTO Files (fileID, domain, relativePath) VALUES (?1, ?2, ?3)",
                params![file_id, SMS_DOMAIN, SMS_RELATIVE_PATH],
            )
            .unwrap();

        let sms = Connection::open(backup.join("12").join("34567890abcdef")).unwrap();
        sms.execute("CREATE TABLE chat (ROWID INTEGER PRIMARY KEY, display_name TEXT, chat_identifier TEXT, service_name TEXT)", [])
            .unwrap();
        sms.execute(
            "CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT)",
            [],
        )
        .unwrap();
        sms.execute(
            "CREATE TABLE message (ROWID INTEGER PRIMARY KEY, date INTEGER)",
            [],
        )
        .unwrap();
        sms.execute(
            "CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER)",
            [],
        )
        .unwrap();
        sms.execute(
            "CREATE TABLE chat_handle_join (chat_id INTEGER, handle_id INTEGER)",
            [],
        )
        .unwrap();
        sms.execute(
            "INSERT INTO chat (ROWID, display_name, chat_identifier, service_name) VALUES (1, 'Family', 'chat-family', 'iMessage')",
            [],
        )
        .unwrap();
        sms.execute(
            "INSERT INTO handle (ROWID, id) VALUES (1, '+15551230001'), (2, 'mom@example.com')",
            [],
        )
        .unwrap();
        sms.execute(
            "INSERT INTO message (ROWID, date) VALUES (1, 100), (2, 200)",
            [],
        )
        .unwrap();
        sms.execute(
            "INSERT INTO chat_message_join (chat_id, message_id) VALUES (1, 1), (1, 2)",
            [],
        )
        .unwrap();
        sms.execute(
            "INSERT INTO chat_handle_join (chat_id, handle_id) VALUES (1, 1), (1, 2)",
            [],
        )
        .unwrap();

        let conversations = scan_conversations(backup).unwrap();
        assert_eq!(conversations.len(), 1);
        assert_eq!(conversations[0].title, "Family");
        assert_eq!(conversations[0].filter_value, "chat-family");
        assert_eq!(conversations[0].message_count, 2);
        assert!(conversations[0].is_group);
    }
}
