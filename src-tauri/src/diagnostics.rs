use std::{
    fs,
    path::{Path, PathBuf},
};

use imessage_database::{
    tables::{
        attachment::Attachment,
        chat_handle::ChatToHandle,
        handle::Handle,
        messages::Message,
        table::{get_db_size, Cacheable},
    },
    util::platform::Platform,
};
use imessage_exporter::app::{
    compatibility::backup::{
        decrypt_backup, get_decrypted_contacts_database, get_decrypted_message_database,
    },
    contacts::{ContactsIndex, DEFAULT_PATH_IOS},
};
use rusqlite::Connection;

use crate::{
    conversations::resolve_sms_db_path,
    engine,
    models::{
        AttachmentDiagnosticDetails, ChatDiagnosticDetails, ContactDiagnosticDetails,
        DiagnosticDetails, HandleDiagnosticDetails, MessageDiagnosticDetails, SourceConfig,
        SourceKind,
    },
};

struct PreparedSource {
    db_path: PathBuf,
    attachment_base_path: PathBuf,
    contacts_path: Option<PathBuf>,
    platform: Platform,
    attachment_root: Option<String>,
    temp_paths: Vec<PathBuf>,
}

pub fn inspect_diagnostics(source: &SourceConfig) -> Result<DiagnosticDetails, String> {
    let prepared = prepare_source(source)?;
    let mut warnings = Vec::new();

    let details = {
        let connection = Connection::open_with_flags(
            &prepared.db_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .map_err(|err| format!("无法读取会话数据库：{err}"))?;
        inspect_connection(&connection, &prepared, &mut warnings)?
    };

    for path in prepared.temp_paths {
        let _ = fs::remove_file(path);
    }

    Ok(details)
}

fn prepare_source(source: &SourceConfig) -> Result<PreparedSource, String> {
    match source.kind {
        SourceKind::MacosChatDb => Ok(PreparedSource {
            db_path: PathBuf::from(source.backup_path.trim()),
            attachment_base_path: PathBuf::from(source.backup_path.trim()),
            contacts_path: source
                .contacts_path
                .as_deref()
                .and_then(clean)
                .map(PathBuf::from),
            platform: Platform::macOS,
            attachment_root: source.attachment_root.as_deref().and_then(clean),
            temp_paths: Vec::new(),
        }),
        SourceKind::IosBackup if source.encrypted => {
            let options = engine::diagnostics_options(source)?;
            let backup = decrypt_backup(&options)
                .map_err(|err| err.to_string())?
                .ok_or_else(|| "未能打开加密备份。".to_string())?;
            let db_path = get_decrypted_message_database(&backup).map_err(|err| err.to_string())?;
            let contacts_path =
                get_decrypted_contacts_database(&backup).map_err(|err| err.to_string())?;
            Ok(PreparedSource {
                db_path: db_path.clone(),
                attachment_base_path: PathBuf::from(source.backup_path.trim()),
                contacts_path: Some(contacts_path.clone()),
                platform: Platform::iOS,
                attachment_root: None,
                temp_paths: vec![db_path, contacts_path],
            })
        }
        SourceKind::IosBackup => {
            let backup_path = Path::new(&source.backup_path);
            Ok(PreparedSource {
                db_path: resolve_sms_db_path(backup_path)?,
                attachment_base_path: backup_path.to_path_buf(),
                contacts_path: Some(backup_path.join(DEFAULT_PATH_IOS)),
                platform: Platform::iOS,
                attachment_root: None,
                temp_paths: Vec::new(),
            })
        }
    }
}

fn inspect_connection(
    connection: &Connection,
    prepared: &PreparedSource,
    warnings: &mut Vec<String>,
) -> Result<DiagnosticDetails, String> {
    let handle = Handle::run_diagnostic(connection).map_err(|err| err.to_string())?;
    let message = Message::run_diagnostic(connection).map_err(|err| err.to_string())?;
    let attachment = Attachment::run_diagnostic(
        connection,
        &prepared.attachment_base_path,
        &prepared.platform,
        prepared.attachment_root.as_deref(),
    )
    .map_err(|err| err.to_string())?;
    let chat = ChatToHandle::run_diagnostic(connection).map_err(|err| err.to_string())?;
    let contacts = inspect_contacts(connection, prepared.contacts_path.as_deref(), warnings)?;

    Ok(DiagnosticDetails {
        handles: HandleDiagnosticDetails {
            total_handles: handle.total_handles,
            handles_with_multiple_ids: handle.handles_with_multiple_ids,
            total_duplicated: handle.total_duplicated,
        },
        messages: MessageDiagnosticDetails {
            total_messages: message.total_messages,
            messages_without_chat: message.messages_without_chat,
            messages_in_multiple_chats: message.messages_in_multiple_chats,
            recoverable_messages: message.recoverable_messages,
            first_message_date: message.first_message_date,
            last_message_date: message.last_message_date,
        },
        attachments: AttachmentDiagnosticDetails {
            total_attachments: attachment.total_attachments,
            total_bytes_referenced: attachment.total_bytes_referenced,
            total_bytes_on_disk: attachment.total_bytes_on_disk,
            missing_files: attachment.missing_files,
            no_path_provided: attachment.no_path_provided,
            no_file_located: attachment.no_file_located(),
            missing_percent: attachment.missing_percent(),
        },
        chats: ChatDiagnosticDetails {
            total_chats: chat.total_chats,
            total_duplicated: chat.total_duplicated,
            chats_with_no_handles: chat.chats_with_no_handles,
        },
        contacts,
        database_bytes: get_db_size(&prepared.db_path).ok(),
        warnings: warnings.clone(),
    })
}

fn inspect_contacts(
    connection: &Connection,
    contacts_path: Option<&Path>,
    warnings: &mut Vec<String>,
) -> Result<ContactDiagnosticDetails, String> {
    let contacts_index = match ContactsIndex::build(contacts_path) {
        Ok(index) => index,
        Err(err) => {
            warnings.push(format!("无法建立联系人索引：{err}"));
            ContactsIndex::default()
        }
    };
    let participants = Handle::cache(connection).map_err(|err| err.to_string())?;
    let real_participants = Handle::dedupe(&participants);
    let mapped = contacts_index.build_participants_map(&participants, &real_participants);
    let resolved_names = mapped
        .values()
        .filter(|name| !name.full.trim().is_empty())
        .count();

    Ok(ContactDiagnosticDetails {
        resolved_names,
        total_participants: mapped.len(),
    })
}

fn clean(value: &str) -> Option<String> {
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
    use tempfile::tempdir;

    #[test]
    fn reads_structured_diagnostics_from_messages_database() {
        let root = tempdir().unwrap();
        let db_path = root.path().join("chat.db");
        let db = Connection::open(&db_path).unwrap();
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
        db.execute("CREATE TABLE attachment (ROWID INTEGER PRIMARY KEY, filename TEXT, total_bytes INTEGER)", [])
            .unwrap();
        db.execute(
            "INSERT INTO handle (ROWID, id) VALUES (1, '+15551234567')",
            [],
        )
        .unwrap();
        db.execute("INSERT INTO message (ROWID, date) VALUES (1, 100)", [])
            .unwrap();
        db.execute(
            "INSERT INTO chat_message_join (chat_id, message_id) VALUES (1, 1)",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO chat_handle_join (chat_id, handle_id) VALUES (1, 1)",
            [],
        )
        .unwrap();

        let details = inspect_diagnostics(&SourceConfig {
            kind: SourceKind::MacosChatDb,
            backup_path: db_path.display().to_string(),
            exporter_path: None,
            attachment_root: None,
            contacts_path: None,
            encrypted: false,
            cleartext_password: None,
        })
        .unwrap();

        assert_eq!(details.messages.total_messages, 1);
        assert_eq!(details.chats.total_chats, 1);
        assert_eq!(details.handles.total_handles, 2);
    }
}
