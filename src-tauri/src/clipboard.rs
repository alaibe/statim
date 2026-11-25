use std::path::PathBuf;

use tauri::{AppHandle, Manager};

/// Files copied in a file manager, let through the asset protocol so the composer can attach them.
#[tauri::command]
pub async fn clipboard_files(app: AppHandle) -> Result<Vec<PathBuf>, String> {
    let paths = copied_files(&app).await?;
    let scope = app.asset_protocol_scope();
    for path in &paths {
        scope.allow_file(path).map_err(|e| e.to_string())?;
    }
    Ok(paths)
}

#[cfg(target_os = "linux")]
async fn copied_files(app: &AppHandle) -> Result<Vec<PathBuf>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        gtk::Clipboard::get(&gtk::gdk::SELECTION_CLIPBOARD).request_uris(move |_, uris| {
            let paths = uris
                .iter()
                .filter_map(|uri| gtk::glib::filename_from_uri(uri).ok())
                .map(|(path, _)| path)
                .filter(|path| path.is_file())
                .collect();
            let _ = sender.send(paths);
        });
    })
    .map_err(|e| e.to_string())?;
    receiver.await.map_err(|e| e.to_string())
}

#[cfg(not(target_os = "linux"))]
async fn copied_files(_app: &AppHandle) -> Result<Vec<PathBuf>, String> {
    Ok(Vec::new())
}
