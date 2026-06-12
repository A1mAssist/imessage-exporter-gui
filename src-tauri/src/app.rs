use plist::Value;
use std::{
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

pub fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

pub fn plist_bool_value(path: &Path, key: &str) -> Option<bool> {
    Value::from_file(path)
        .ok()?
        .as_dictionary()?
        .get(key)?
        .as_boolean()
}

pub fn plist_string_value(path: &Path, key: &str) -> Option<String> {
    Value::from_file(path)
        .ok()?
        .as_dictionary()?
        .get(key)?
        .as_string()
        .map(ToOwned::to_owned)
}
