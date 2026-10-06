use super::*;

pub(super) async fn build_session(
    app: AppHandle,
    params: StartParams,
) -> Result<Arc<Session>, String> {
    let data_directory = PathBuf::from(&params.data_directory);
    // A store only makes sense with its session; without one it belongs to a device that is gone.
    if params.session.is_none() {
        remove_dir(&data_directory)?;
    }
    std::fs::create_dir_all(&data_directory).map_err(err)?;
    let client = Client::builder()
        .homeserver_url(&params.homeserver_url)
        // The default pool is four connections per physical core for each of four
        // databases, which alone exhausts macOS's 256 open files on a large Mac.
        .sqlite_store_with_config_and_cache_path(
            SqliteStoreConfig::new(data_directory.join("store"))
                .key(Some(params.store_key.as_bytes()))
                .pool_max_size(4),
            None::<PathBuf>,
        )
        .sliding_sync_version_builder(VersionBuilder::DiscoverNative)
        .with_encryption_settings(EncryptionSettings {
            auto_enable_cross_signing: true,
            ..Default::default()
        })
        .build()
        .await
        .map_err(err)?;
    Ok(Arc::new(Session {
        app,
        client,
        params,
        sync: Mutex::new(None),
        tasks: Mutex::new(Vec::new()),
        latest_seen: Mutex::new(HashMap::new()),
        live: tokio::sync::Mutex::new(Vec::new()),
        uploads: Mutex::new(HashMap::new()),
    }))
}

#[tauri::command]
pub async fn mx_start(
    app: AppHandle,
    state: State<'_, Matrix>,
    params: StartParams,
) -> Result<Option<MxSession>, String> {
    let previous = state.0.lock().unwrap().take();
    if let Some(previous) = previous {
        previous.stop_sync().await;
    }
    let mut session = build_session(app.clone(), params.clone()).await?;
    *state.0.lock().unwrap() = Some(session.clone());

    let Some(saved) = params.session.clone() else {
        return Ok(None);
    };
    if let Err(error) = restore(&session, &saved).await {
        if !belongs_to_another_device(&error) {
            return Err(err(error));
        }
        // The store was made for another user or device, as when an account moves homeserver.
        state.0.lock().unwrap().take();
        drop(session);
        remove_dir(Path::new(&params.data_directory))?;
        session = build_session(app, params).await?;
        *state.0.lock().unwrap() = Some(session.clone());
        restore(&session, &saved).await.map_err(err)?;
    }
    session.start_sync().await?;
    Ok(Some(session.session()?))
}

async fn restore(session: &Session, saved: &MxSession) -> Result<(), matrix_sdk::Error> {
    let user_id =
        UserId::parse(&saved.user_id).map_err(|e| matrix_sdk::Error::UnknownError(e.into()))?;
    session
        .client
        .restore_session(MatrixSession {
            meta: SessionMeta {
                user_id,
                device_id: saved.device_id.clone().into(),
            },
            tokens: SessionTokens {
                access_token: saved.access_token.clone(),
                refresh_token: saved.refresh_token.clone(),
            },
        })
        .await
}

fn belongs_to_another_device(error: &matrix_sdk::Error) -> bool {
    matches!(
        error,
        matrix_sdk::Error::CryptoStoreError(store)
            if matches!(**store, matrix_sdk::encryption::CryptoStoreError::MismatchedAccount { .. })
    )
}

#[tauri::command]
pub async fn mx_login(state: State<'_, Matrix>, password: String) -> Result<MxSession, String> {
    let session = current(&state)?;
    session
        .client
        .matrix_auth()
        .login_username(&session.params.user_id, &password)
        .initial_device_display_name(&session.params.device_name)
        .await
        .map_err(err)?;
    session.start_sync().await?;
    session.session()
}

#[tauri::command]
pub async fn mx_logout(state: State<'_, Matrix>) -> Result<(), String> {
    let session = current(&state)?;
    session.stop_sync().await;
    session.client.logout().await.map_err(err)
}

#[tauri::command]
pub async fn mx_close(state: State<'_, Matrix>) -> Result<(), String> {
    take(&state).await;
    Ok(())
}

#[tauri::command]
pub async fn mx_erase(state: State<'_, Matrix>) -> Result<(), String> {
    match take(&state).await {
        Some(dir) => remove_dir(&dir),
        None => Ok(()),
    }
}
