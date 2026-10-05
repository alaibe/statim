//! The account's own Matrix user on its server. Registered once with the
//! server's token, under a password made here and kept beside it, so another
//! device of the person can sign in to the same server later.

use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// What the app's Matrix session restores from.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub access_token: String,
    pub user_id: String,
    pub device_id: String,
    pub homeserver_url: String,
}

#[derive(Deserialize)]
struct LoggedIn {
    access_token: String,
    user_id: String,
    device_id: String,
}

/// Signs `localpart` in on the server at `server`, registering it first if it is new.
pub async fn sign_in(
    dir: &Path,
    server: &str,
    localpart: &str,
    registration_token: &str,
    device_name: &str,
) -> Result<Session, String> {
    let client = reqwest::Client::new();
    let password_file = dir.join("password");
    let password = match std::fs::read_to_string(&password_file) {
        Ok(password) => password.trim().to_string(),
        Err(_) => {
            let password = random_hex(24)?;
            register(&client, server, localpart, &password, registration_token).await?;
            crate::paths::write_private(&password_file, &password)?;
            password
        }
    };
    let logged_in = login(&client, server, localpart, &password, device_name).await?;
    Ok(Session {
        access_token: logged_in.access_token,
        user_id: logged_in.user_id,
        device_id: logged_in.device_id,
        homeserver_url: server.to_string(),
    })
}

/// A code another device of the owner trades for its own session, once and
/// within `expires_in_ms`. A session opened only to ask for it is closed again.
pub async fn login_token(
    dir: &Path,
    server: &str,
    localpart: &str,
) -> Result<(String, u64), String> {
    let password = std::fs::read_to_string(dir.join("password"))
        .map_err(|_| "Sign in to Matrix on this computer first.".to_string())?;
    let password = password.trim();
    let client = reqwest::Client::new();
    let asking = login(
        &client,
        server,
        localpart,
        password,
        "Statim, linking a device",
    )
    .await?;
    let url = format!("{server}/_matrix/client/v1/login/get_token");
    let mut response = client
        .post(&url)
        .bearer_auth(&asking.access_token)
        .json(&json!({}))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        let challenge: Value = response.json().await.map_err(|e| e.to_string())?;
        response = client
            .post(&url)
            .bearer_auth(&asking.access_token)
            .json(&json!({ "auth": {
                "type": "m.login.password",
                "identifier": { "type": "m.id.user", "user": localpart },
                "password": password,
                "session": challenge["session"],
            }}))
            .send()
            .await
            .map_err(|e| e.to_string())?;
    }
    let ok = response.status().is_success();
    let body: Option<Value> = response.json().await.ok();
    let _ = client
        .post(format!("{server}/_matrix/client/v3/logout"))
        .bearer_auth(&asking.access_token)
        .send()
        .await;
    let token = body.as_ref().filter(|_| ok).and_then(|body| {
        Some((
            body["login_token"].as_str()?.to_string(),
            body["expires_in_ms"].as_u64()?,
        ))
    });
    token.ok_or_else(|| matrix_error(body, "make a sign-in code"))
}

async fn login(
    client: &reqwest::Client,
    server: &str,
    localpart: &str,
    password: &str,
    device_name: &str,
) -> Result<LoggedIn, String> {
    let response = client
        .post(format!("{server}/_matrix/client/v3/login"))
        .json(&json!({
            "type": "m.login.password",
            "identifier": { "type": "m.id.user", "user": localpart },
            "password": password,
            "initial_device_display_name": device_name,
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(matrix_error(response.json().await.ok(), "sign in"));
    }
    response.json().await.map_err(|e| e.to_string())
}

/// The two rounds registration by token takes: the first opens a session, the
/// second answers it with the token.
async fn register(
    client: &reqwest::Client,
    server: &str,
    localpart: &str,
    password: &str,
    token: &str,
) -> Result<(), String> {
    let url = format!("{server}/_matrix/client/v3/register");
    let opened: Value = client
        .post(&url)
        .json(&json!({ "username": localpart, "password": password }))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let session = opened["session"].as_str().unwrap_or_default();
    let response = client
        .post(&url)
        .json(&json!({
            "username": localpart,
            "password": password,
            "inhibit_login": true,
            "auth": { "type": "m.login.registration_token", "token": token, "session": session },
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(matrix_error(response.json().await.ok(), "create your user"))
    }
}

fn matrix_error(body: Option<Value>, what: &str) -> String {
    let reason = body
        .as_ref()
        .and_then(|body| body["error"].as_str())
        .unwrap_or("no reason given");
    format!("The homeserver on this computer could not {what}: {reason}")
}

pub fn random_hex(bytes: usize) -> Result<String, String> {
    let mut buffer = vec![0u8; bytes];
    getrandom::getrandom(&mut buffer).map_err(|e| e.to_string())?;
    Ok(buffer.iter().map(|byte| format!("{byte:02x}")).collect())
}
