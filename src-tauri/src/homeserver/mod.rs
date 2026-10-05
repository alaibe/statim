//! A Matrix homeserver on this computer, for an account that uses it instead
//! of a homeserver it names. tuwunel and the bridges run beside the app while
//! it runs, behind one local address the account's Matrix session keeps.

mod artifacts;
mod config;
mod process;
mod router;
mod users;

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;

use crate::paths::{data_dir, safe_component};
use process::Process;
use router::{Router, Routes};

/// Every ID on the server ends with it. It can never be a hostname, and it is
/// permanent: changing it means starting again from an empty server.
pub const SERVER_NAME: &str = "statim";
/// Fixed, so the address an account's Matrix session keeps stays valid.
const ROUTER_PORT: u16 = 47280;
const SERVER_PORT: u16 = 47281;
const START_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Default)]
pub struct Homeserver(Mutex<Option<Running>>);

struct Running {
    account: String,
    dir: PathBuf,
    server: Process,
    router: Router,
}

impl Running {
    fn stop(self) {
        self.router.stop();
        self.server.stop();
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeserverState {
    /// Off in the Mac App Store build and on computers nothing is built for.
    available: bool,
    running: bool,
    url: String,
}

#[tauri::command]
pub async fn homeserver_state(
    state: State<'_, Homeserver>,
    account_id: String,
) -> Result<HomeserverState, String> {
    let running = state.0.lock().await;
    Ok(HomeserverState {
        available: available(),
        running: running
            .as_ref()
            .is_some_and(|run| run.account == account_id),
        url: url(),
    })
}

/// Starts the server of `account_id`, stopping another account's, and returns
/// its address once it answers.
#[tauri::command]
pub async fn homeserver_start(
    app: AppHandle,
    state: State<'_, Homeserver>,
    account_id: String,
) -> Result<String, String> {
    if !available() {
        return Err("A homeserver on this computer is not available in this build.".into());
    }
    safe_component(&account_id, "account id")?;
    let mut running = state.0.lock().await;
    if running
        .as_ref()
        .is_some_and(|run| run.account == account_id)
    {
        return Ok(url());
    }
    if let Some(previous) = running.take() {
        previous.stop();
    }
    let root = data_dir(&app, "homeserver")?;
    let bin = match artifacts::override_dir() {
        Some(dir) => dir,
        None => {
            let dir = root.join("bin");
            artifacts::install(&dir, artifacts::server_pins().unwrap_or_default()).await?;
            dir
        }
    };
    *running = Some(
        start(
            account_id.clone(),
            root.join("accounts").join(&account_id),
            &bin,
        )
        .await?,
    );
    Ok(url())
}

/// The account's own user on its running server, signed in from a new device
/// named `device_name`; the first call creates the user as `localpart`.
#[tauri::command]
pub async fn homeserver_session(
    state: State<'_, Homeserver>,
    account_id: String,
    localpart: String,
    device_name: String,
) -> Result<users::Session, String> {
    let running = state.0.lock().await;
    let Some(run) = running.as_ref().filter(|run| run.account == account_id) else {
        return Err("The homeserver on this computer is not running for this account.".into());
    };
    let token = registration_token(&run.dir)?;
    users::sign_in(&run.dir, &url(), &localpart, &token, &device_name).await
}

#[tauri::command]
pub async fn homeserver_stop(state: State<'_, Homeserver>) -> Result<(), String> {
    if let Some(running) = state.0.lock().await.take() {
        running.stop();
    }
    Ok(())
}

/// Stops the account's server and deletes everything it held.
#[tauri::command]
pub async fn homeserver_erase(
    app: AppHandle,
    state: State<'_, Homeserver>,
    account_id: String,
) -> Result<(), String> {
    safe_component(&account_id, "account id")?;
    let mut running = state.0.lock().await;
    if running
        .as_ref()
        .is_some_and(|run| run.account == account_id)
    {
        if let Some(run) = running.take() {
            run.stop();
        }
    }
    crate::paths::remove_dir(
        &data_dir(&app, "homeserver")?
            .join("accounts")
            .join(&account_id),
    )
}

/// The app is quitting; its children go with it.
pub fn stop_on_exit(app: &AppHandle) {
    if let Some(running) = app.state::<Homeserver>().0.blocking_lock().take() {
        running.stop();
    }
}

fn available() -> bool {
    cfg!(feature = "homeserver") && artifacts::server_pins().is_some()
}

fn url() -> String {
    format!("http://127.0.0.1:{ROUTER_PORT}")
}

async fn start(account: String, dir: PathBuf, bin: &Path) -> Result<Running, String> {
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let config = dir.join("tuwunel.toml");
    std::fs::write(
        &config,
        config::tuwunel(
            SERVER_NAME,
            &dir.join("db"),
            SERVER_PORT,
            &registration_token(&dir)?,
            &[],
        ),
    )
    .map_err(|e| e.to_string())?;
    let router = Router::start(
        ROUTER_PORT,
        Routes {
            server: SERVER_PORT,
            bridges: Vec::new(),
        },
    )?;
    let mut server = match Process::spawn(
        "tuwunel",
        &bin.join("tuwunel"),
        &dir,
        &[("TUWUNEL_CONFIG", &config)],
    ) {
        Ok(server) => server,
        Err(error) => {
            router.stop();
            return Err(error);
        }
    };
    if let Err(error) = answering(&mut server, &dir).await {
        router.stop();
        server.stop();
        return Err(error);
    }
    Ok(Running {
        account,
        dir,
        server,
        router,
    })
}

async fn answering(server: &mut Process, dir: &Path) -> Result<(), String> {
    let versions = format!("http://127.0.0.1:{SERVER_PORT}/_matrix/client/versions");
    let deadline = Instant::now() + START_TIMEOUT;
    while Instant::now() < deadline {
        if let Some(status) = server.exited() {
            return Err(format!(
                "The homeserver stopped as it started ({status}); its log is {}.",
                dir.join("tuwunel.log").display()
            ));
        }
        if reqwest::get(&versions)
            .await
            .is_ok_and(|response| response.status().is_success())
        {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    Err("The homeserver did not answer within 30 seconds.".into())
}

/// Made once per account; new Matrix users on the server need it.
fn registration_token(dir: &Path) -> Result<String, String> {
    let path = dir.join("registration-token");
    if let Ok(token) = std::fs::read_to_string(&path) {
        return Ok(token.trim().to_string());
    }
    let token = users::random_hex(32)?;
    write_private(&path, &token)?;
    Ok(token)
}

/// A secret file readable only by this user.
fn write_private(path: &Path, contents: &str) -> Result<(), String> {
    std::fs::write(path, contents).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Runs the real server from `STATIM_HOMESERVER_ARTIFACTS`:
    /// `cargo test --lib homeserver -- --ignored`.
    #[tokio::test(flavor = "multi_thread")]
    #[ignore]
    async fn starts_answers_through_the_router_and_stops() {
        let bin = artifacts::override_dir().expect("STATIM_HOMESERVER_ARTIFACTS");
        let dir = std::env::temp_dir().join("statim-homeserver-test");
        let _ = std::fs::remove_dir_all(&dir);
        let running = start("test".into(), dir.clone(), &bin).await.unwrap();
        let versions = reqwest::get(format!("{}/_matrix/client/versions", url()))
            .await
            .unwrap();
        assert!(versions.status().is_success());
        assert_eq!(registration_token(&dir).unwrap().len(), 64);
        let token = registration_token(&dir).unwrap();
        let first = users::sign_in(&dir, &url(), "me", &token, "Test")
            .await
            .unwrap();
        assert_eq!(first.user_id, format!("@me:{SERVER_NAME}"));
        let second = users::sign_in(&dir, &url(), "me", &token, "Phone")
            .await
            .unwrap();
        assert_ne!(first.device_id, second.device_id);
        running.stop();
        assert!(reqwest::get(format!("{}/_matrix/client/versions", url()))
            .await
            .is_err());
        assert!(!dir.join("tuwunel.pid").exists());
    }
}
