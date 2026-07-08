use std::{
    collections::HashMap,
    fs::{self, File},
    io::{BufWriter, Write},
    path::{Path, PathBuf},
};

use serde_json::{Value, json};

use crate::app::error::RuntimeError;

pub const CHECKPOINT_FILE: &str = ".imessage-exporter-gui-checkpoint.json";

const CHECKPOINT_VERSION: u64 = 1;
const FLUSH_INTERVAL: u64 = 100;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExportCheckpoint {
    pub completed: u64,
    pub last_rowid: i64,
    pub files: HashMap<String, u64>,
}

impl ExportCheckpoint {
    pub fn should_update(completed: u64) -> bool {
        completed > 0 && (completed == 1 || completed.is_multiple_of(FLUSH_INTERVAL))
    }
}

pub fn checkpoint_path(export_path: &Path) -> PathBuf {
    export_path.join(CHECKPOINT_FILE)
}

pub fn remove_checkpoint(export_path: &Path) -> Result<(), RuntimeError> {
    let path = checkpoint_path(export_path);
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

pub fn load_checkpoint(
    export_path: &Path,
    format: &str,
    fingerprint: Option<&str>,
) -> Result<Option<ExportCheckpoint>, RuntimeError> {
    let path = checkpoint_path(export_path);
    if !path.is_file() {
        return Ok(None);
    }

    let value: Value = serde_json::from_reader(File::open(&path)?)?;
    if value.get("version").and_then(Value::as_u64) != Some(CHECKPOINT_VERSION)
        || value.get("format").and_then(Value::as_str) != Some(format)
        || value.get("fingerprint").and_then(Value::as_str) != fingerprint
    {
        return Ok(None);
    }

    let completed = value.get("completed").and_then(Value::as_u64).unwrap_or(0);
    let last_rowid = value
        .get("last_rowid")
        .and_then(Value::as_i64)
        .unwrap_or(-1);
    let files = value
        .get("files")
        .and_then(Value::as_object)
        .map(|files| {
            files
                .iter()
                .filter_map(|(name, size)| size.as_u64().map(|size| (name.clone(), size)))
                .collect()
        })
        .unwrap_or_default();

    Ok(Some(ExportCheckpoint {
        completed,
        last_rowid,
        files,
    }))
}

pub fn truncate_checkpoint_files(
    export_path: &Path,
    checkpoint: &ExportCheckpoint,
) -> Result<(), RuntimeError> {
    for (name, length) in &checkpoint.files {
        let path = export_path.join(name);
        if path.is_file() {
            File::options().write(true).open(path)?.set_len(*length)?;
        }
    }
    Ok(())
}

pub fn save_checkpoint(
    export_path: &Path,
    format: &str,
    fingerprint: Option<&str>,
    completed: u64,
    last_rowid: i64,
    files: &mut HashMap<String, BufWriter<File>>,
    orphaned: &mut BufWriter<File>,
    orphaned_name: &str,
) -> Result<(), RuntimeError> {
    let mut file_lengths = HashMap::new();
    for (name, file) in files {
        file_lengths.insert(name.clone(), flushed_len(file)?);
    }
    file_lengths.insert(orphaned_name.to_string(), flushed_len(orphaned)?);

    let checkpoint = json!({
        "version": CHECKPOINT_VERSION,
        "format": format,
        "fingerprint": fingerprint,
        "completed": completed,
        "last_rowid": last_rowid,
        "files": file_lengths,
    });

    let path = checkpoint_path(export_path);
    let temp_path = export_path.join(format!("{CHECKPOINT_FILE}.tmp"));
    {
        let mut file = File::create(&temp_path)?;
        serde_json::to_writer(&mut file, &checkpoint)?;
        file.write_all(b"\n")?;
        file.sync_all()?;
    }
    fs::rename(temp_path, path)?;
    Ok(())
}

fn flushed_len(file: &mut BufWriter<File>) -> Result<u64, RuntimeError> {
    file.flush()?;
    Ok(file.get_ref().metadata()?.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("{name}-{suffix}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn checkpoint_round_trips_and_truncates_files() {
        let dir = unique_temp_dir("checkpoint-round-trip");
        let chat_path = dir.join("chat.txt");
        let orphaned_path = dir.join("orphaned.txt");

        let mut files = HashMap::new();
        let mut chat = BufWriter::new(File::create(&chat_path).unwrap());
        chat.write_all(b"hello").unwrap();
        files.insert("chat.txt".to_string(), chat);
        let mut orphaned = BufWriter::new(File::create(&orphaned_path).unwrap());
        orphaned.write_all(b"orphaned").unwrap();

        save_checkpoint(
            &dir,
            "txt",
            Some("fingerprint"),
            2,
            42,
            &mut files,
            &mut orphaned,
            "orphaned.txt",
        )
        .unwrap();
        let checkpoint = load_checkpoint(&dir, "txt", Some("fingerprint"))
            .unwrap()
            .unwrap();
        assert_eq!(checkpoint.completed, 2);
        assert_eq!(checkpoint.last_rowid, 42);
        assert_eq!(checkpoint.files.get("chat.txt"), Some(&5));
        assert_eq!(checkpoint.files.get("orphaned.txt"), Some(&8));

        fs::write(&chat_path, b"hello dirty tail").unwrap();
        truncate_checkpoint_files(&dir, &checkpoint).unwrap();
        assert_eq!(fs::read(&chat_path).unwrap(), b"hello");

        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn mismatched_fingerprint_is_not_resumable() {
        let dir = unique_temp_dir("checkpoint-fingerprint");
        let mut files = HashMap::new();
        let mut orphaned = BufWriter::new(File::create(dir.join("orphaned.jsonl")).unwrap());

        save_checkpoint(
            &dir,
            "jsonl",
            Some("a"),
            1,
            1,
            &mut files,
            &mut orphaned,
            "orphaned.jsonl",
        )
        .unwrap();

        assert!(load_checkpoint(&dir, "jsonl", Some("b")).unwrap().is_none());
        assert!(load_checkpoint(&dir, "txt", Some("a")).unwrap().is_none());

        fs::remove_dir_all(dir).unwrap();
    }
}
