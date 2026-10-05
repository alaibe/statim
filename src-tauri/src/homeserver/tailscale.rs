//! How a phone reaches the server: Tailscale Serve gives it an HTTPS address
//! that only the person's own devices can open. Port 8448 leaves whatever
//! they already serve on 443 alone.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use serde::Deserialize;

const PORT: u16 = 8448;

const CANDIDATES: &[&str] = &[
    "/usr/local/bin/tailscale",
    "/opt/homebrew/bin/tailscale",
    "/usr/bin/tailscale",
    "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
];

pub fn cli() -> Option<PathBuf> {
    CANDIDATES
        .iter()
        .map(PathBuf::from)
        .find(|path| path.exists())
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Status {
    backend_state: String,
    #[serde(rename = "Self")]
    me: Option<Peer>,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Peer {
    #[serde(rename = "DNSName")]
    dns_name: String,
}

pub fn serve(cli: &Path, local: u16) -> Result<String, String> {
    let status = Command::new(cli)
        .args(["status", "--json"])
        .output()
        .map_err(|e| format!("Could not ask Tailscale for its state: {e}"))?;
    let host = host_of(&String::from_utf8_lossy(&status.stdout))?;
    let output = run(
        cli,
        &[
            "serve",
            "--bg",
            &format!("--https={PORT}"),
            &format!("http://127.0.0.1:{local}"),
        ],
    )?;
    if let Some(link) = enable_link(&output) {
        return Err(format!(
            "Tailscale needs HTTPS turned on for your tailnet first. Open {link}, turn it on, then try again."
        ));
    }
    Ok(format!("https://{host}:{PORT}"))
}

pub fn stop(cli: &Path) {
    let _ = run(cli, &["serve", &format!("--https={PORT}"), "off"]);
}

fn host_of(status: &str) -> Result<String, String> {
    let status: Status = serde_json::from_str(status)
        .map_err(|_| "Tailscale did not say what this computer is called.".to_string())?;
    if status.backend_state != "Running" {
        return Err("Tailscale is not connected on this computer.".into());
    }
    let name = status.me.map(|me| me.dns_name).unwrap_or_default();
    let name = name.trim_end_matches('.');
    if name.is_empty() {
        return Err(
            "Tailscale gave this computer no name; turn on MagicDNS for your tailnet.".into(),
        );
    }
    Ok(name.to_string())
}

/// Runs a Tailscale command, giving up after a while: one that waits for the
/// person to enable something in the admin console prints a link and blocks.
/// The command can be a script around the real binary, as on a Mac, so the
/// whole process group goes, or the binary would hold the output open.
fn run(cli: &Path, args: &[&str]) -> Result<String, String> {
    run_within(cli, args, Duration::from_secs(15))
}

fn run_within(cli: &Path, args: &[&str], limit: Duration) -> Result<String, String> {
    let mut command = Command::new(cli);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    std::os::unix::process::CommandExt::process_group(&mut command, 0);
    let mut child = command
        .spawn()
        .map_err(|e| format!("Could not run Tailscale: {e}"))?;
    let deadline = Instant::now() + limit;
    while Instant::now() < deadline {
        if child.try_wait().map_err(|e| e.to_string())?.is_some() {
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    #[cfg(unix)]
    let _ = Command::new("kill")
        .args(["-KILL", &format!("-{}", child.id())])
        .stderr(Stdio::null())
        .status();
    let _ = child.kill();
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    Ok(format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    ))
}

fn enable_link(output: &str) -> Option<&str> {
    output
        .split_whitespace()
        .find(|word| word.starts_with("https://login.tailscale.com/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_the_computer_by_its_tailnet_address() {
        let status = r#"{"BackendState":"Running","Self":{"DNSName":"mini.tail1234.ts.net."}}"#;
        assert_eq!(host_of(status).unwrap(), "mini.tail1234.ts.net");
        let stopped = r#"{"BackendState":"Stopped","Self":{"DNSName":"mini.tail1234.ts.net."}}"#;
        assert_eq!(
            host_of(stopped).unwrap_err(),
            "Tailscale is not connected on this computer."
        );
    }

    #[cfg(unix)]
    #[test]
    fn gives_up_on_a_script_whose_child_keeps_running() {
        let dir = std::env::temp_dir().join("statim-tailscale-wrapper");
        std::fs::create_dir_all(&dir).unwrap();
        let script = dir.join("tailscale");
        std::fs::write(
            &script,
            "#!/bin/sh\necho https://login.tailscale.com/f/serve?node=abc\nsleep 600\n",
        )
        .unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        let started = Instant::now();
        let output = run_within(&script, &[], Duration::from_millis(500)).unwrap();
        assert!(started.elapsed() < Duration::from_secs(5));
        assert_eq!(
            enable_link(&output),
            Some("https://login.tailscale.com/f/serve?node=abc")
        );
    }

    #[test]
    fn finds_the_link_that_turns_https_on() {
        let output = "Serve is not enabled on your tailnet.\nTo enable, visit:\n\n         https://login.tailscale.com/f/serve?node=abc\n";
        assert_eq!(
            enable_link(output),
            Some("https://login.tailscale.com/f/serve?node=abc")
        );
        assert_eq!(enable_link("Available within your tailnet"), None);
    }
}
