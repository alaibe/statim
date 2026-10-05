//! A Matrix homeserver on this computer, for an account that uses it instead
//! of a homeserver it names. tuwunel and the bridges run beside the app while
//! it runs, behind one local address the account's Matrix session keeps.

mod artifacts;
mod bridges;
mod config;
mod process;
mod router;
mod tailscale;
mod users;

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;

use crate::paths::{data_dir, safe_component, write_private};
use bridges::Bridge;
use process::Process;
use router::{Router, Routes};

/// Every ID on the server ends with it. It can never be a hostname, and it is
/// permanent: changing it means starting again from an empty server.
pub const SERVER_NAME: &str = "statim";
/// The person's own user on their server: `@me:statim`.
pub const OWNER: &str = "me";
/// Fixed, so the address an account's Matrix session keeps stays valid.
const ROUTER_PORT: u16 = 47280;
const SERVER_PORT: u16 = 47281;
const START_TIMEOUT: Duration = Duration::from_secs(30);
const NOT_RUNNING: &str = "The homeserver on this computer is not running for this account.";

#[derive(Default)]
pub struct Homeserver(Mutex<Option<Running>>);

struct Running {
    account: String,
    dir: PathBuf,
    server: Process,
    bridges: Vec<Process>,
    router: Router,
    /// The Tailscale command, once it serves the server to the person's phone.
    served: Option<PathBuf>,
}

impl Running {
    /// Stops the programs; Tailscale keeps serving the port for a restart.
    fn stop(self) -> Option<PathBuf> {
        self.router.stop();
        for bridge in self.bridges {
            bridge.stop();
        }
        self.server.stop();
        self.served
    }

    fn close(self) {
        if let Some(cli) = self.stop() {
            tailscale::stop(&cli);
        }
    }
}

fn running_for<'a>(
    running: &'a mut Option<Running>,
    account_id: &str,
) -> Result<&'a mut Running, String> {
    running
        .as_mut()
        .filter(|run| run.account == account_id)
        .ok_or_else(|| NOT_RUNNING.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeState {
    id: &'static str,
    available: bool,
    enabled: bool,
}

/// The server's address, in a build that can run one on this computer.
#[tauri::command]
pub fn homeserver_url() -> Option<String> {
    available().then(url)
}

/// Starts the server of `account_id`, stopping another account's, and returns
/// its address once it answers.
#[tauri::command]
pub async fn homeserver_start(
    app: AppHandle,
    state: State<'_, Homeserver>,
    account_id: String,
) -> Result<String, String> {
    let dir = account_dir(&app, &account_id)?;
    let mut running = state.0.lock().await;
    if running_for(&mut running, &account_id).is_ok() {
        return Ok(url());
    }
    if let Some(previous) = running.take() {
        previous.close();
    }
    let mut started = start(account_id, dir, &bin_dir(&app).await?).await?;
    if started.dir.join("served").exists() {
        if let Some(cli) = tailscale::cli() {
            match serve(&cli).await {
                Ok(_) => started.served = Some(cli),
                Err(error) => log::warn!("[homeserver] not served to the tailnet: {error}"),
            }
        }
    }
    *running = Some(started);
    Ok(url())
}

/// The owner signed in on the account's running server from a new device
/// named `device_name`; the first call creates the owner.
#[tauri::command]
pub async fn homeserver_session(
    state: State<'_, Homeserver>,
    account_id: String,
    device_name: String,
) -> Result<users::Session, String> {
    let mut running = state.0.lock().await;
    let run = running_for(&mut running, &account_id)?;
    let token = registration_token(&run.dir)?;
    users::sign_in(&run.dir, &url(), OWNER, &token, &device_name).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhoneLink {
    /// The server's address on the tailnet.
    homeserver: String,
    /// Traded once for a session, within `expires_in_ms`.
    login_token: String,
    expires_in_ms: u64,
}

/// What another device of the owner needs to sign in to the account's server:
/// its Tailscale address, served from now on, and a one-time code.
#[tauri::command]
pub async fn homeserver_phone_link(
    state: State<'_, Homeserver>,
    account_id: String,
) -> Result<PhoneLink, String> {
    let mut running = state.0.lock().await;
    let run = running_for(&mut running, &account_id)?;
    let served = run.dir.join("served");
    let homeserver = match (&run.served, std::fs::read_to_string(&served)) {
        (Some(_), Ok(homeserver)) => homeserver,
        _ => {
            let cli = tailscale::cli().ok_or(
                "Tailscale is not installed on this computer. Install it here and on your phone, then try again.",
            )?;
            let homeserver = serve(&cli).await?;
            std::fs::write(&served, &homeserver).map_err(|e| e.to_string())?;
            run.served = Some(cli);
            homeserver
        }
    };
    let (login_token, expires_in_ms) = users::login_token(&run.dir, &url(), OWNER).await?;
    Ok(PhoneLink {
        homeserver,
        login_token,
        expires_in_ms,
    })
}

async fn serve(cli: &Path) -> Result<String, String> {
    let cli = cli.to_path_buf();
    tauri::async_runtime::spawn_blocking(move || tailscale::serve(&cli, ROUTER_PORT))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn homeserver_bridges(
    app: AppHandle,
    account_id: String,
) -> Result<Vec<BridgeState>, String> {
    let enabled = enabled_bridges(&account_dir(&app, &account_id)?);
    Ok(bridges::BRIDGES
        .iter()
        .map(|bridge| BridgeState {
            id: bridge.id,
            available: bridge.pin().is_some(),
            enabled: enabled.iter().any(|on| on.id == bridge.id),
        })
        .collect())
}

/// Turns a bridge on or off for the account, downloading it the first time,
/// and restarts the account's server if it runs.
#[tauri::command]
pub async fn homeserver_set_bridge(
    app: AppHandle,
    state: State<'_, Homeserver>,
    account_id: String,
    bridge: String,
    enabled: bool,
) -> Result<(), String> {
    let dir = account_dir(&app, &account_id)?;
    let bridge = bridges::bridge(&bridge).ok_or_else(|| format!("No bridge called {bridge}."))?;
    let mut running = state.0.lock().await;
    if enabled {
        let pin = bridge
            .pin()
            .ok_or("This bridge has no build for this computer.")?;
        artifacts::install(&bin_dir(&app).await?, &[pin]).await?;
    }
    let mut ids: Vec<_> = enabled_bridges(&dir).iter().map(|on| on.id).collect();
    ids.retain(|id| *id != bridge.id);
    if enabled {
        ids.push(bridge.id);
    }
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("enabled-bridges"), ids.join("\n")).map_err(|e| e.to_string())?;
    if running_for(&mut running, &account_id).is_ok() {
        let served = running.take().and_then(Running::stop);
        match start(account_id, dir, &bin_dir(&app).await?).await {
            Ok(mut restarted) => {
                restarted.served = served;
                *running = Some(restarted);
            }
            Err(error) => {
                if let Some(cli) = served {
                    tailscale::stop(&cli);
                }
                return Err(error);
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn homeserver_erase(
    app: AppHandle,
    state: State<'_, Homeserver>,
    account_id: String,
) -> Result<(), String> {
    let dir = account_dir(&app, &account_id)?;
    let mut running = state.0.lock().await;
    if running_for(&mut running, &account_id).is_ok() {
        if let Some(run) = running.take() {
            run.close();
        }
    }
    crate::paths::remove_dir(&dir)
}

pub fn stop_on_exit(app: &AppHandle) {
    if let Some(running) = app.state::<Homeserver>().0.blocking_lock().take() {
        running.close();
    }
}

fn available() -> bool {
    cfg!(feature = "homeserver")
        && (artifacts::override_dir().is_some() || artifacts::server_pins().is_some())
}

fn url() -> String {
    format!("http://127.0.0.1:{ROUTER_PORT}")
}

fn account_dir(app: &AppHandle, account_id: &str) -> Result<PathBuf, String> {
    if !available() {
        return Err("A homeserver on this computer is not available in this build.".into());
    }
    safe_component(account_id, "account id")?;
    Ok(data_dir(app, "homeserver")?
        .join("accounts")
        .join(account_id))
}

/// Where the programs are, with the server's own installed first.
async fn bin_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(dir) = artifacts::override_dir() {
        return Ok(dir);
    }
    let dir = data_dir(app, "homeserver")?.join("bin");
    artifacts::install(&dir, artifacts::server_pins().unwrap_or_default()).await?;
    Ok(dir)
}

fn enabled_bridges(dir: &Path) -> Vec<&'static Bridge> {
    let saved = std::fs::read_to_string(dir.join("enabled-bridges")).unwrap_or_default();
    bridges::BRIDGES
        .iter()
        .filter(|bridge| saved.lines().any(|line| line.trim() == bridge.id))
        .collect()
}

async fn start(account: String, dir: PathBuf, bin: &Path) -> Result<Running, String> {
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let double_puppet = bridges::Tokens::of(&dir.join("doublepuppet"))?;
    let enabled = enabled_bridges(&dir)
        .into_iter()
        .filter(|bridge| bin.join(bridge.binary).exists())
        .map(|bridge| {
            Ok((
                bridge,
                bridges::Tokens::of(&dir.join("bridges").join(bridge.id))?,
            ))
        })
        .collect::<Result<Vec<_>, String>>()?;
    let mut appservices: Vec<_> = enabled
        .iter()
        .map(|(bridge, tokens)| bridge.appservice(tokens))
        .collect();
    if !enabled.is_empty() {
        appservices.push(bridges::double_puppet(&double_puppet));
    }
    let config = dir.join("tuwunel.toml");
    std::fs::write(
        &config,
        config::tuwunel(
            SERVER_NAME,
            &dir.join("db"),
            SERVER_PORT,
            &registration_token(&dir)?,
            &appservices,
        ),
    )
    .map_err(|e| e.to_string())?;
    let router = Router::start(
        ROUTER_PORT,
        Routes {
            server: SERVER_PORT,
            bridges: enabled
                .iter()
                .map(|(bridge, _)| (bridge.id, bridge.port))
                .collect(),
        },
    )?;
    let mut server = match Process::spawn(
        "tuwunel",
        &bin.join("tuwunel"),
        &dir,
        &[("TUWUNEL_CONFIG", &config)],
        &[],
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
    let mut running = Running {
        account,
        dir,
        server,
        bridges: Vec::new(),
        router,
        served: None,
    };
    for (bridge, tokens) in &enabled {
        let bridge_dir = running.dir.join("bridges").join(bridge.id);
        let spawned = std::fs::write(
            bridge_dir.join("config.yaml"),
            bridge.config(SERVER_PORT, tokens, &double_puppet.as_token),
        )
        .map_err(|e| e.to_string())
        .and_then(|()| {
            Process::spawn(
                bridge.id,
                &bin.join(bridge.binary),
                &bridge_dir,
                &[("XDG_DATA_HOME", &bridge_dir)],
                &["-c", "config.yaml"],
            )
        });
        match spawned {
            Ok(process) => running.bridges.push(process),
            Err(error) => {
                running.stop();
                return Err(error);
            }
        }
    }
    Ok(running)
}

async fn answering(server: &mut Process, dir: &Path) -> Result<(), String> {
    let versions = format!("http://127.0.0.1:{SERVER_PORT}/_matrix/client/versions");
    let client = reqwest::Client::new();
    let deadline = Instant::now() + START_TIMEOUT;
    while Instant::now() < deadline {
        if let Some(status) = server.exited() {
            return Err(format!(
                "The homeserver stopped as it started ({status}); its log is {}.",
                dir.join("tuwunel.log").display()
            ));
        }
        if client
            .get(&versions)
            .send()
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Runs the real server from `STATIM_HOMESERVER_ARTIFACTS`, with the pinned
    /// WhatsApp bridge downloaded into it: `cargo test --lib homeserver -- --ignored`.
    /// One test, since the ports are fixed.
    #[tokio::test(flavor = "multi_thread")]
    #[ignore]
    async fn runs_the_server_and_a_bridge_behind_the_router() {
        let bin = artifacts::override_dir().expect("STATIM_HOMESERVER_ARTIFACTS");
        let dir = std::env::temp_dir().join("statim-homeserver-test");
        let _ = std::fs::remove_dir_all(&dir);

        let running = start("test".into(), dir.clone(), &bin).await.unwrap();
        let versions = reqwest::get(format!("{}/_matrix/client/versions", url()))
            .await
            .unwrap();
        assert!(versions.status().is_success());
        let token = registration_token(&dir).unwrap();
        assert_eq!(token.len(), 64);
        let first = users::sign_in(&dir, &url(), OWNER, &token, "Test")
            .await
            .unwrap();
        assert_eq!(first.user_id, format!("@{OWNER}:{SERVER_NAME}"));
        let second = users::sign_in(&dir, &url(), OWNER, &token, "Phone")
            .await
            .unwrap();
        assert_ne!(first.device_id, second.device_id);
        let (code, expires_in_ms) = users::login_token(&dir, &url(), OWNER).await.unwrap();
        assert!(expires_in_ms > 0);
        let traded: serde_json::Value = reqwest::Client::new()
            .post(format!("{}/_matrix/client/v3/login", url()))
            .json(&serde_json::json!({ "type": "m.login.token", "token": code }))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(traded["user_id"], first.user_id.as_str());
        running.stop();
        assert!(reqwest::get(format!("{}/_matrix/client/versions", url()))
            .await
            .is_err());
        assert!(!dir.join("tuwunel.pid").exists());

        let whatsapp = bridges::bridge("whatsapp").unwrap();
        artifacts::install(&bin, &[whatsapp.pin().unwrap()])
            .await
            .unwrap();
        std::fs::write(dir.join("enabled-bridges"), "whatsapp").unwrap();
        let running = start("test".into(), dir.clone(), &bin).await.unwrap();
        let mut flows = None;
        for _ in 0..50 {
            let response = reqwest::Client::new()
                .get(format!(
                    "{}/_matrix/provision/whatsapp/v3/login/flows?user_id={}",
                    url(),
                    first.user_id
                ))
                .bearer_auth(&first.access_token)
                .send()
                .await;
            if let Ok(response) = response {
                if response.status().is_success() {
                    flows = response.text().await.ok();
                    break;
                }
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
        running.stop();
        let flows = flows.expect("the bridge's login API answered through the router");
        assert!(flows.contains("\"qr\""), "{flows}");
    }
}
