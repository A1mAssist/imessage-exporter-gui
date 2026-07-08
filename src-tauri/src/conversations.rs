use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    fs,
    path::{Path, PathBuf},
};

use imessage_database::tables::{
    chat::Chat, chat_handle::ChatToHandle, handle::Handle, table::Cacheable,
};
use imessage_exporter::app::{
    compatibility::backup::{
        decrypt_backup, get_decrypted_contacts_database, get_decrypted_message_database,
    },
    contacts::{ContactsIndex, DEFAULT_PATH_IOS},
};
use rusqlite::{params, Connection, OptionalExtension};

use crate::engine;
use crate::models::ConversationCandidate;
use crate::models::{SourceConfig, SourceKind};

const SMS_DOMAIN: &str = "HomeDomain";
const SMS_RELATIVE_PATH: &str = "Library/SMS/sms.db";

pub fn scan_source_conversations(
    source: &SourceConfig,
) -> Result<Vec<ConversationCandidate>, String> {
    match source.kind {
        SourceKind::IosBackup if source.encrypted => scan_encrypted_ios_conversations(source),
        SourceKind::IosBackup => {
            let backup_path = Path::new(&source.backup_path);
            let contacts = contacts_index(Some(&backup_path.join(DEFAULT_PATH_IOS)));
            let sms_db = resolve_sms_db_path(backup_path)?;
            read_conversations_from_path(&sms_db, contacts.as_ref())
        }
        SourceKind::MacosChatDb => {
            let contacts_path = source
                .contacts_path
                .as_deref()
                .map(str::trim)
                .filter(|path| !path.is_empty())
                .map(Path::new);
            let contacts = contacts_index(contacts_path);
            read_conversations_from_path(Path::new(&source.backup_path), contacts.as_ref())
        }
    }
}

fn scan_encrypted_ios_conversations(
    source: &SourceConfig,
) -> Result<Vec<ConversationCandidate>, String> {
    let options = engine::diagnostics_options(source)?;
    let backup = decrypt_backup(&options)
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "未能打开加密备份。".to_string())?;
    let db_path = get_decrypted_message_database(&backup).map_err(|err| err.to_string())?;
    let contacts_path = get_decrypted_contacts_database(&backup).ok();
    let contacts = contacts_index(contacts_path.as_deref());
    let result = read_conversations_from_path(&db_path, contacts.as_ref());
    let _ = fs::remove_file(&db_path);
    if let Some(path) = contacts_path {
        let _ = fs::remove_file(path);
    }
    result
}

fn read_conversations_from_path(
    db_path: &Path,
    contacts: Option<&ContactsIndex>,
) -> Result<Vec<ConversationCandidate>, String> {
    let connection =
        Connection::open_with_flags(db_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|err| format!("无法读取会话数据库：{err}"))?;
    read_conversations(&connection, contacts).map_err(|err| format!("无法解析会话列表：{err}"))
}

pub(crate) fn resolve_sms_db_path(backup_path: &Path) -> Result<PathBuf, String> {
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
    let prefix = &file_id[..file_id.len().min(2)];
    let hashed = backup_path.join(prefix).join(&file_id);
    if hashed.is_file() {
        Ok(hashed)
    } else {
        Err("Messages 数据库文件不存在，备份可能不完整或已加密。".to_string())
    }
}

fn read_conversations(
    connection: &Connection,
    contacts: Option<&ContactsIndex>,
) -> Result<Vec<ConversationCandidate>, String> {
    let chatrooms = Chat::cache(connection).map_err(|err| err.to_string())?;
    let handles = Handle::cache(connection).map_err(|err| err.to_string())?;
    let real_handles = contacts
        .map(|contacts| contacts.canonicalize_deduped_handles(&handles, &Handle::dedupe(&handles)))
        .unwrap_or_else(|| Handle::dedupe(&handles));
    let chatroom_participants = ChatToHandle::cache(connection).map_err(|err| err.to_string())?;
    let chat_lookup =
        ChatToHandle::get_chat_lookup_map(connection).map_err(|err| err.to_string())?;
    let canonical_chatroom_participants =
        canonical_chatroom_participants(&chatroom_participants, &real_handles);
    let real_chatrooms = ChatToHandle::dedupe(&canonical_chatroom_participants, &chat_lookup)
        .map_err(|err| err.to_string())?;
    let participant_labels = participant_labels(&handles, &real_handles, contacts);
    let stats = message_stats(connection).map_err(|err| err.to_string())?;

    let mut groups: BTreeMap<ConversationGroupKey, ConversationGroup> = BTreeMap::new();
    let mut sorted_chatrooms = chatrooms.iter().collect::<Vec<_>>();
    sorted_chatrooms.sort_by_key(|(chat_id, _)| **chat_id);
    for (chat_id, chat) in sorted_chatrooms {
        let chat_id = *chat_id;
        let group_key = real_chatrooms
            .get(&chat_id)
            .map(|group_id| ConversationGroupKey::Deduped(*group_id))
            .unwrap_or(ConversationGroupKey::Chat(chat_id));
        let direct_identifiers = direct_chat_identifiers(
            &chat.chat_identifier,
            chatroom_participants.get(&chat_id),
            &real_handles,
        );
        let group = groups.entry(group_key).or_default();
        group.chat_ids.insert(chat_id);
        group.direct_identifiers.extend(direct_identifiers);

        if group.display_name.is_none() {
            group.display_name = chat.display_name().map(ToOwned::to_owned);
        }
        if group.chat_identifier.is_none() && !chat.chat_identifier.trim().is_empty() {
            group.chat_identifier = Some(chat.chat_identifier.clone());
        }
        if let Some(service) = chat.service_name.clone().and_then(empty_to_none) {
            group.services.insert(service);
        }
        if let Some(stat) = stats.get(&chat_id) {
            group.message_count += stat.message_count;
            group.last_message_at = max_timestamp(group.last_message_at, stat.last_message_at);
        }
        if let Some(participants) = chatroom_participants.get(&chat_id) {
            for handle_id in participants {
                group
                    .participant_ids
                    .insert(real_handles.get(handle_id).copied().unwrap_or(*handle_id));
            }
        }
    }

    let mut conversations = merge_direct_groups(groups)
        .into_iter()
        .filter_map(|group| conversation_from_group(group, &participant_labels))
        .collect::<Vec<_>>();

    conversations.sort_by(|left, right| {
        right
            .message_count
            .cmp(&left.message_count)
            .then_with(|| {
                right
                    .last_message_at
                    .as_deref()
                    .unwrap_or("")
                    .cmp(left.last_message_at.as_deref().unwrap_or(""))
            })
            .then_with(|| left.title.cmp(&right.title))
    });
    Ok(conversations)
}

fn canonical_chatroom_participants(
    chatroom_participants: &HashMap<i32, BTreeSet<i32>>,
    real_handles: &HashMap<i32, i32>,
) -> HashMap<i32, BTreeSet<i32>> {
    chatroom_participants
        .iter()
        .map(|(chat_id, participants)| {
            (
                *chat_id,
                participants
                    .iter()
                    .map(|id| real_handles.get(id).copied().unwrap_or(*id))
                    .collect(),
            )
        })
        .collect()
}

fn contacts_index(path: Option<&Path>) -> Option<ContactsIndex> {
    ContactsIndex::build(path).ok()
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
enum ConversationGroupKey {
    Deduped(i32),
    Chat(i32),
}

#[derive(Default)]
struct ConversationGroup {
    chat_ids: BTreeSet<i32>,
    participant_ids: BTreeSet<i32>,
    direct_identifiers: BTreeSet<String>,
    display_name: Option<String>,
    chat_identifier: Option<String>,
    services: BTreeSet<String>,
    message_count: usize,
    last_message_at: Option<i64>,
}

impl ConversationGroup {
    fn absorb(&mut self, other: ConversationGroup) {
        self.chat_ids.extend(other.chat_ids);
        self.participant_ids.extend(other.participant_ids);
        self.direct_identifiers.extend(other.direct_identifiers);
        if self.display_name.is_none() {
            self.display_name = other.display_name;
        }
        if self.chat_identifier.is_none() {
            self.chat_identifier = other.chat_identifier;
        }
        self.services.extend(other.services);
        self.message_count += other.message_count;
        self.last_message_at = max_timestamp(self.last_message_at, other.last_message_at);
    }
}

#[derive(Clone, Copy)]
struct MessageStats {
    message_count: usize,
    last_message_at: Option<i64>,
}

fn message_stats(connection: &Connection) -> rusqlite::Result<HashMap<i32, MessageStats>> {
    let mut statement = connection.prepare(
        r#"
        SELECT
          chat_message_join.chat_id,
          COUNT(message.ROWID),
          MAX(message.date)
        FROM chat_message_join
        LEFT JOIN message ON message.ROWID = chat_message_join.message_id
        GROUP BY chat_message_join.chat_id
        "#,
    )?;
    let rows = statement.query_map([], |row| {
        let chat_id: i32 = row.get(0)?;
        let message_count: i64 = row.get(1)?;
        let last_message_at: Option<i64> = row.get(2)?;
        Ok((
            chat_id,
            MessageStats {
                message_count: message_count.max(0) as usize,
                last_message_at,
            },
        ))
    })?;

    let mut stats = HashMap::new();
    for row in rows {
        let (chat_id, stat) = row?;
        stats.insert(chat_id, stat);
    }
    Ok(stats)
}

fn direct_chat_identifiers(
    chat_identifier: &str,
    participants: Option<&BTreeSet<i32>>,
    real_handles: &HashMap<i32, i32>,
) -> BTreeSet<String> {
    let mut identifiers = BTreeSet::new();
    let identifier = chat_identifier.trim();
    if participants.map_or(false, |participants| participants.len() > 1) {
        return identifiers;
    }
    if !identifier.is_empty() && !identifier.to_ascii_lowercase().starts_with("chat") {
        identifiers.insert(normalize_direct_identifier(identifier));
    }
    if let Some(participant_id) = participants.and_then(|participants| participants.first()) {
        if *participant_id != 0 {
            let participant_id = real_handles
                .get(participant_id)
                .copied()
                .unwrap_or(*participant_id);
            identifiers.insert(format!("participant:{participant_id}"));
        }
    }
    identifiers
}

fn normalize_direct_identifier(identifier: &str) -> String {
    let value = identifier.trim().to_ascii_lowercase();
    if value.contains('@') {
        return value;
    }
    if value
        .chars()
        .all(|char| char.is_ascii_digit() || matches!(char, '+' | '-' | '(' | ')' | '.' | ' '))
    {
        let digits = value
            .chars()
            .filter(char::is_ascii_digit)
            .collect::<String>();
        if digits.len() == 10 {
            return format!("+1{digits}");
        }
        if digits.len() == 11 && digits.starts_with('1') {
            return format!("+{digits}");
        }
        if value.starts_with('+') && !digits.is_empty() {
            return format!("+{digits}");
        }
        if !digits.is_empty() {
            return digits;
        }
    }
    value
}

fn merge_direct_groups(
    groups: BTreeMap<ConversationGroupKey, ConversationGroup>,
) -> Vec<ConversationGroup> {
    let mut merged: Vec<Option<ConversationGroup>> = Vec::new();
    let mut direct_lookup: HashMap<String, usize> = HashMap::new();

    for group in groups.into_values() {
        let matching_indexes = group
            .direct_identifiers
            .iter()
            .filter_map(|identifier| direct_lookup.get(identifier).copied())
            .collect::<BTreeSet<_>>();
        let Some(target_index) = matching_indexes.first().copied() else {
            let index = merged.len();
            for identifier in &group.direct_identifiers {
                direct_lookup.insert(identifier.clone(), index);
            }
            merged.push(Some(group));
            continue;
        };

        for index in matching_indexes {
            if index == target_index {
                continue;
            }
            if let Some(other) = merged[index].take() {
                if let Some(target) = merged[target_index].as_mut() {
                    target.absorb(other);
                }
            }
        }
        if let Some(target) = merged[target_index].as_mut() {
            target.absorb(group);
            for identifier in &target.direct_identifiers {
                direct_lookup.insert(identifier.clone(), target_index);
            }
        }
    }

    merged.into_iter().flatten().collect()
}

fn participant_labels(
    handles: &HashMap<i32, String>,
    real_handles: &HashMap<i32, i32>,
    contacts: Option<&ContactsIndex>,
) -> HashMap<i32, String> {
    let mut labels = HashMap::new();
    let mut sorted_handles = handles.iter().collect::<Vec<_>>();
    sorted_handles.sort_by_key(|(handle_id, _)| **handle_id);
    for (handle_id, details) in sorted_handles {
        let participant_id = real_handles.get(handle_id).copied().unwrap_or(*handle_id);
        labels
            .entry(participant_id)
            .or_insert_with(|| display_participant(details, contacts));
    }
    labels
}

fn display_participant(participant: &str, contacts: Option<&ContactsIndex>) -> String {
    contacts
        .and_then(|index| index.lookup(participant))
        .map(|name| name.get_display_name().to_string())
        .unwrap_or_else(|| participant.to_string())
}

fn conversation_from_group(
    group: ConversationGroup,
    participant_labels: &HashMap<i32, String>,
) -> Option<ConversationCandidate> {
    let chat_ids = group.chat_ids.iter().copied().collect::<Vec<_>>();
    let primary_id = *chat_ids.first()?;
    let participants = group
        .participant_ids
        .iter()
        .filter_map(|participant_id| participant_labels.get(participant_id).cloned())
        .collect::<Vec<_>>();
    let display_name = group.display_name.unwrap_or_default();
    let chat_identifier = group.chat_identifier.unwrap_or_default();
    let is_direct = !group.direct_identifiers.is_empty();
    let is_group = !is_direct && (participants.len() > 1 || chat_identifier.starts_with("chat"));
    let title = conversation_title(&display_name, &chat_identifier, &participants, is_group);
    let subtitle = conversation_subtitle(&chat_identifier, &participants, is_group);
    let filter_value = if is_group && !chat_identifier.trim().is_empty() {
        chat_identifier.clone()
    } else if is_direct && !chat_identifier.trim().is_empty() {
        chat_identifier.clone()
    } else {
        participants
            .first()
            .cloned()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| empty_to_none(chat_identifier.clone()))
            .or_else(|| empty_to_none(display_name.clone()))
            .unwrap_or_else(|| primary_id.to_string())
    };

    Some(ConversationCandidate {
        id: primary_id.to_string(),
        chat_ids,
        title,
        subtitle,
        filter_value,
        service: service_label(&group.services),
        message_count: group.message_count,
        last_message_at: group.last_message_at.map(|value| value.to_string()),
        is_group,
    })
}

fn max_timestamp(left: Option<i64>, right: Option<i64>) -> Option<i64> {
    match (left, right) {
        (Some(left), Some(right)) => Some(left.max(right)),
        (Some(left), None) => Some(left),
        (None, Some(right)) => Some(right),
        (None, None) => None,
    }
}

fn conversation_title(
    display_name: &str,
    chat_identifier: &str,
    participants: &[String],
    is_group: bool,
) -> String {
    if !display_name.trim().is_empty() {
        return display_name.trim().to_string();
    }
    if !is_group {
        if let Some(participant) = participants.first() {
            return participant.clone();
        }
        if !chat_identifier.trim().is_empty() {
            return chat_identifier.trim().to_string();
        }
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

fn service_label(services: &BTreeSet<String>) -> Option<String> {
    let mut services = services.iter().cloned().collect::<Vec<_>>();
    services.sort_by(|left, right| {
        service_rank(left)
            .cmp(&service_rank(right))
            .then_with(|| left.cmp(right))
    });
    if services.is_empty() {
        None
    } else {
        Some(services.join(" + "))
    }
}

fn service_rank(service: &str) -> usize {
    match service {
        "iMessage" => 0,
        "SMS" => 1,
        "RCS" => 2,
        _ => 3,
    }
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

        let sms = Connection::open(backup.join("12").join(file_id)).unwrap();
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

        let conversations = scan_source_conversations(&SourceConfig {
            kind: SourceKind::IosBackup,
            backup_path: backup.display().to_string(),
            exporter_path: None,
            attachment_root: None,
            contacts_path: None,
            encrypted: false,
            cleartext_password: None,
        })
        .unwrap();
        assert_eq!(conversations.len(), 1);
        assert_eq!(conversations[0].title, "Family");
        assert_eq!(conversations[0].chat_ids, vec![1]);
        assert_eq!(conversations[0].filter_value, "chat-family");
        assert_eq!(conversations[0].message_count, 2);
        assert!(conversations[0].is_group);
    }

    #[test]
    fn scans_conversations_with_engine_deduped_chat_ids() {
        let db = Connection::open_in_memory().unwrap();
        db.execute("CREATE TABLE chat (ROWID INTEGER PRIMARY KEY, display_name TEXT, chat_identifier TEXT, service_name TEXT)", [])
            .unwrap();
        db.execute(
            "CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT, person_centric_id TEXT)",
            [],
        )
        .unwrap();
        db.execute(
            "CREATE TABLE message (ROWID INTEGER PRIMARY KEY, date INTEGER)",
            [],
        )
        .unwrap();
        db.execute(
            "CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER)",
            [],
        )
        .unwrap();
        db.execute(
            "CREATE TABLE chat_handle_join (chat_id INTEGER, handle_id INTEGER)",
            [],
        )
        .unwrap();
        db.execute(
            "CREATE TABLE chat_lookup (chat INTEGER, identifier TEXT)",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO chat (ROWID, display_name, chat_identifier, service_name)
             VALUES (1, '', '+15551230001', 'iMessage'),
                    (2, '', '+15551230001', 'SMS')",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO handle (ROWID, id, person_centric_id)
             VALUES (1, '+15551230001', 'person-1'),
                    (2, 'alex@example.com', 'person-1')",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO message (ROWID, date) VALUES (1, 100), (2, 200), (3, 300)",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO chat_message_join (chat_id, message_id) VALUES (1, 1), (2, 2), (2, 3)",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO chat_handle_join (chat_id, handle_id) VALUES (1, 1), (2, 2)",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO chat_lookup (chat, identifier) VALUES (1, 'same-chat'), (2, 'same-chat')",
            [],
        )
        .unwrap();

        let conversations = read_conversations(&db, None).unwrap();

        assert_eq!(conversations.len(), 1);
        assert_eq!(conversations[0].chat_ids, vec![1, 2]);
        assert_eq!(conversations[0].message_count, 3);
        assert!(!conversations[0].is_group);
    }

    #[test]
    fn merges_direct_chats_with_same_caller_id_across_services_without_lookup() {
        let db = Connection::open_in_memory().unwrap();
        db.execute("CREATE TABLE chat (ROWID INTEGER PRIMARY KEY, display_name TEXT, chat_identifier TEXT, service_name TEXT)", [])
            .unwrap();
        db.execute(
            "CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT)",
            [],
        )
        .unwrap();
        db.execute(
            "CREATE TABLE message (ROWID INTEGER PRIMARY KEY, date INTEGER)",
            [],
        )
        .unwrap();
        db.execute(
            "CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER)",
            [],
        )
        .unwrap();
        db.execute(
            "CREATE TABLE chat_handle_join (chat_id INTEGER, handle_id INTEGER)",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO chat (ROWID, display_name, chat_identifier, service_name)
             VALUES (1, '', '+15551230001', 'iMessage'),
                    (2, '', '+15551230001', 'SMS')",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO handle (ROWID, id)
             VALUES (1, '+15551230001'),
                    (2, 'alex@example.com')",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO message (ROWID, date) VALUES (1, 100), (2, 200), (3, 300)",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO chat_message_join (chat_id, message_id) VALUES (1, 1), (2, 2), (2, 3)",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO chat_handle_join (chat_id, handle_id) VALUES (1, 1), (2, 2)",
            [],
        )
        .unwrap();

        let conversations = read_conversations(&db, None).unwrap();

        assert_eq!(conversations.len(), 1);
        assert_eq!(conversations[0].chat_ids, vec![1, 2]);
        assert_eq!(conversations[0].filter_value, "+15551230001");
        assert_eq!(conversations[0].service.as_deref(), Some("iMessage + SMS"));
        assert_eq!(conversations[0].message_count, 3);
        assert_eq!(conversations[0].last_message_at.as_deref(), Some("300"));
        assert!(!conversations[0].is_group);
    }

    #[test]
    fn merges_direct_chats_by_deduped_single_participant_when_chat_identifier_is_private() {
        let db = Connection::open_in_memory().unwrap();
        db.execute("CREATE TABLE chat (ROWID INTEGER PRIMARY KEY, display_name TEXT, chat_identifier TEXT, service_name TEXT)", [])
            .unwrap();
        db.execute(
            "CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT, person_centric_id TEXT)",
            [],
        )
        .unwrap();
        db.execute(
            "CREATE TABLE message (ROWID INTEGER PRIMARY KEY, date INTEGER)",
            [],
        )
        .unwrap();
        db.execute(
            "CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER)",
            [],
        )
        .unwrap();
        db.execute(
            "CREATE TABLE chat_handle_join (chat_id INTEGER, handle_id INTEGER)",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO chat (ROWID, display_name, chat_identifier, service_name)
             VALUES (1, 'Favorite', 'chat-sms-private', 'SMS'),
                    (2, 'Favorite', 'chat-imessage-private', 'iMessage')",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO handle (ROWID, id, person_centric_id)
             VALUES (1, '+15551230001', 'person-1'),
                    (2, 'alex@example.com', 'person-1')",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO message (ROWID, date) VALUES (1, 100), (2, 200)",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO chat_message_join (chat_id, message_id) VALUES (1, 1), (2, 2)",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO chat_handle_join (chat_id, handle_id) VALUES (1, 1), (2, 2)",
            [],
        )
        .unwrap();

        let conversations = read_conversations(&db, None).unwrap();

        assert_eq!(conversations.len(), 1);
        assert_eq!(conversations[0].title, "Favorite");
        assert_eq!(conversations[0].chat_ids, vec![1, 2]);
        assert_eq!(conversations[0].service.as_deref(), Some("iMessage + SMS"));
        assert_eq!(conversations[0].message_count, 2);
        assert!(!conversations[0].is_group);
    }

    #[test]
    fn merges_direct_chats_by_contacts_identity() {
        let db = Connection::open_in_memory().unwrap();
        db.execute("CREATE TABLE chat (ROWID INTEGER PRIMARY KEY, display_name TEXT, chat_identifier TEXT, service_name TEXT)", [])
            .unwrap();
        db.execute(
            "CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT)",
            [],
        )
        .unwrap();
        db.execute(
            "CREATE TABLE message (ROWID INTEGER PRIMARY KEY, date INTEGER)",
            [],
        )
        .unwrap();
        db.execute(
            "CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER)",
            [],
        )
        .unwrap();
        db.execute(
            "CREATE TABLE chat_handle_join (chat_id INTEGER, handle_id INTEGER)",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO chat (ROWID, display_name, chat_identifier, service_name)
             VALUES (1, '', '+15551230001', 'SMS'),
                    (2, '', 'alex@example.com', 'iMessage')",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO handle (ROWID, id)
             VALUES (1, '+15551230001'),
                    (2, 'alex@example.com')",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO message (ROWID, date) VALUES (1, 100), (2, 200)",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO chat_message_join (chat_id, message_id) VALUES (1, 1), (2, 2)",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO chat_handle_join (chat_id, handle_id) VALUES (1, 1), (2, 2)",
            [],
        )
        .unwrap();

        let root = tempdir().unwrap();
        let contacts_path = root.path().join("AddressBook.sqlitedb");
        let contacts_db = Connection::open(&contacts_path).unwrap();
        contacts_db
            .execute(
                "CREATE TABLE ABPersonFullTextSearch_content (
                    c0First TEXT,
                    c1Last TEXT,
                    c16Phone TEXT,
                    c17Email TEXT
                )",
                [],
            )
            .unwrap();
        contacts_db
            .execute(
                "INSERT INTO ABPersonFullTextSearch_content (rowid, c0First, c1Last, c16Phone, c17Email)
                 VALUES (1, 'Alex', 'Chen', '+15551230001', 'alex@example.com')",
                [],
            )
            .unwrap();
        drop(contacts_db);
        let contacts = ContactsIndex::build(Some(&contacts_path)).unwrap();

        let conversations = read_conversations(&db, Some(&contacts)).unwrap();

        assert_eq!(conversations.len(), 1);
        assert_eq!(conversations[0].title, "Alex Chen");
        assert_eq!(conversations[0].chat_ids, vec![1, 2]);
        assert_eq!(conversations[0].message_count, 2);
        assert!(!conversations[0].is_group);
    }

    #[test]
    fn normalizes_phone_caller_ids_before_merging_direct_chats() {
        let db = Connection::open_in_memory().unwrap();
        db.execute("CREATE TABLE chat (ROWID INTEGER PRIMARY KEY, display_name TEXT, chat_identifier TEXT, service_name TEXT)", [])
            .unwrap();
        db.execute(
            "CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT)",
            [],
        )
        .unwrap();
        db.execute(
            "CREATE TABLE message (ROWID INTEGER PRIMARY KEY, date INTEGER)",
            [],
        )
        .unwrap();
        db.execute(
            "CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER)",
            [],
        )
        .unwrap();
        db.execute(
            "CREATE TABLE chat_handle_join (chat_id INTEGER, handle_id INTEGER)",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO chat (ROWID, display_name, chat_identifier, service_name)
             VALUES (1, '', '+1 (555) 123-0001', 'iMessage'),
                    (2, '', '555.123.0001', 'SMS')",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO handle (ROWID, id) VALUES (1, '+15551230001'), (2, '5551230001')",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO message (ROWID, date) VALUES (1, 100), (2, 200)",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO chat_message_join (chat_id, message_id) VALUES (1, 1), (2, 2)",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO chat_handle_join (chat_id, handle_id) VALUES (1, 1), (2, 2)",
            [],
        )
        .unwrap();

        let conversations = read_conversations(&db, None).unwrap();

        assert_eq!(conversations.len(), 1);
        assert_eq!(conversations[0].chat_ids, vec![1, 2]);
        assert_eq!(conversations[0].message_count, 2);
    }

    #[test]
    fn scans_realistic_sqlite_fixture_with_direct_split_and_group() {
        let root = tempdir().unwrap();
        let db_path = root.path().join("sms.db");
        let db = Connection::open(&db_path).unwrap();
        db.execute("CREATE TABLE chat (ROWID INTEGER PRIMARY KEY, display_name TEXT, chat_identifier TEXT, service_name TEXT)", [])
            .unwrap();
        db.execute(
            "CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT)",
            [],
        )
        .unwrap();
        db.execute(
            "CREATE TABLE message (ROWID INTEGER PRIMARY KEY, date INTEGER)",
            [],
        )
        .unwrap();
        db.execute(
            "CREATE TABLE attachment (ROWID INTEGER PRIMARY KEY, filename TEXT, total_bytes INTEGER)",
            [],
        )
        .unwrap();
        db.execute(
            "CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER)",
            [],
        )
        .unwrap();
        db.execute(
            "CREATE TABLE chat_handle_join (chat_id INTEGER, handle_id INTEGER)",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO chat (ROWID, display_name, chat_identifier, service_name)
             VALUES (1, '', '+15551230001', 'iMessage'),
                    (2, '', '+1 555 123 0001', 'SMS'),
                    (3, 'Family', 'chat-family', 'iMessage')",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO handle (ROWID, id)
             VALUES (1, '+15551230001'),
                    (2, 'alex@example.com'),
                    (3, '+15551230002'),
                    (4, 'mom@example.com')",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO message (ROWID, date) VALUES (1, 100), (2, 200), (3, 300), (4, 400)",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO chat_message_join (chat_id, message_id)
             VALUES (1, 1), (2, 2), (3, 3), (3, 4)",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO chat_handle_join (chat_id, handle_id)
             VALUES (1, 1), (2, 2), (3, 3), (3, 4)",
            [],
        )
        .unwrap();

        drop(db);
        let conversations = read_conversations_from_path(&db_path, None).unwrap();

        assert_eq!(conversations.len(), 2);
        let direct = conversations
            .iter()
            .find(|conversation| !conversation.is_group)
            .unwrap();
        assert_eq!(direct.chat_ids, vec![1, 2]);
        assert_eq!(direct.message_count, 2);
        let group = conversations
            .iter()
            .find(|conversation| conversation.is_group)
            .unwrap();
        assert_eq!(group.title, "Family");
        assert_eq!(group.chat_ids, vec![3]);
    }
}
