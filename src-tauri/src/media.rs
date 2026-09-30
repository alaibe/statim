//! Attachments and other downloaded media, one directory per account under
//! the app data directory. The page displays them through the asset protocol.

use std::path::{Path, PathBuf};

use base64::prelude::*;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::paths::{data_dir, remove_dir, safe_component};

fn media_path(
    app: &AppHandle,
    account_id: &str,
    area: &str,
    name: &str,
) -> Result<PathBuf, String> {
    safe_component(account_id, "account")?;
    safe_component(area, "area")?;
    safe_component(name, "name")?;
    Ok(data_dir(app, "media")?
        .join(account_id)
        .join(area)
        .join(name))
}

/// Writes the file unless it already exists, and returns its path.
#[tauri::command]
pub async fn media_write(
    app: AppHandle,
    account_id: String,
    area: String,
    name: String,
    base64: String,
) -> Result<String, String> {
    let path = media_path(&app, &account_id, &area, &name)?;
    if !path.exists() {
        let bytes = BASE64_STANDARD.decode(base64).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(path.parent().expect("media dir")).map_err(|e| e.to_string())?;
        std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    }
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn media_stat(
    app: AppHandle,
    account_id: String,
    area: String,
    name: String,
) -> Result<Option<(String, u64)>, String> {
    let path = media_path(&app, &account_id, &area, &name)?;
    match std::fs::metadata(&path) {
        Ok(meta) => Ok(Some((path.to_string_lossy().into_owned(), meta.len()))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn media_erase(app: AppHandle, account_id: String) -> Result<(), String> {
    safe_component(&account_id, "account")?;
    remove_dir(&data_dir(&app, "media")?.join(&account_id))
}

/// Asks where to save a copy of a file the page can display, starting in
/// Downloads. Returns false when the user cancels.
#[tauri::command]
pub async fn media_export(
    app: AppHandle,
    path: String,
    name: Option<String>,
) -> Result<bool, String> {
    let source = PathBuf::from(&path);
    if !app.asset_protocol_scope().is_allowed(&source) || !source.is_file() {
        return Err(format!("Not a file the app keeps: {path}"));
    }
    let file_name = name
        .as_deref()
        .and_then(|name| Path::new(name).file_name())
        .or_else(|| source.file_name())
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();

    let mut dialog = app.dialog().file().set_file_name(file_name);
    if let Ok(downloads) = app.path().download_dir() {
        dialog = dialog.set_directory(downloads);
    }
    let (sender, receiver) = tokio::sync::oneshot::channel();
    dialog.save_file(move |picked| {
        let _ = sender.send(picked);
    });
    let Some(target) = receiver.await.map_err(|e| e.to_string())? else {
        return Ok(false);
    };
    let target = target.into_path().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || std::fs::copy(source, target))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    Ok(true)
}
