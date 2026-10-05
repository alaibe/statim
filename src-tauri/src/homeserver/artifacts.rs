//! The programs the server runs, downloaded once and checked against the
//! SHA-256 pinned here before anything executes them.

use std::io::Write;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

/// One file and where it comes from. An empty `sha256` means it has not been
/// published for this computer yet, and nothing downloads it.
pub struct Pin {
    pub file: &'static str,
    pub url: &'static str,
    pub sha256: &'static str,
}

/// tuwunel, and on a Mac the libolm the bridges link, from Statim's own release.
pub fn server_pins() -> Option<&'static [Pin]> {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        Some(&[
            Pin {
                file: "tuwunel",
                url: "",
                sha256: "",
            },
            Pin {
                file: "libolm.3.dylib",
                url: "",
                sha256: "",
            },
        ])
    } else if cfg!(all(
        target_os = "linux",
        any(target_arch = "x86_64", target_arch = "aarch64")
    )) {
        Some(&[Pin {
            file: "tuwunel",
            url: "",
            sha256: "",
        }])
    } else {
        None
    }
}

/// Puts every pinned file in `dir`, reusing one whose hash already matches.
pub async fn install(dir: &Path, pins: &[Pin]) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    for pin in pins {
        if pin.sha256.is_empty() || pin.url.is_empty() {
            return Err(format!(
                "{} is not published for this computer yet.",
                pin.file
            ));
        }
        let path = dir.join(pin.file);
        if hash_of(&path).as_deref() == Some(pin.sha256) {
            continue;
        }
        download(pin, &path).await?;
    }
    Ok(())
}

/// Debug builds may run files from a folder instead, before a release has them.
pub fn override_dir() -> Option<PathBuf> {
    if cfg!(debug_assertions) {
        std::env::var_os("STATIM_HOMESERVER_ARTIFACTS").map(PathBuf::from)
    } else {
        None
    }
}

async fn download(pin: &Pin, path: &Path) -> Result<(), String> {
    let partial = path.with_extension("partial");
    let mut response = reqwest::get(pin.url)
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|e| format!("Could not download {}: {e}", pin.file))?;
    let mut file = std::fs::File::create(&partial).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        hasher.update(&chunk);
        file.write_all(&chunk).map_err(|e| e.to_string())?;
    }
    drop(file);
    if hex(&hasher.finalize()) != pin.sha256 {
        let _ = std::fs::remove_file(&partial);
        return Err(format!(
            "{} did not match its pinned SHA-256 and was not kept.",
            pin.file
        ));
    }
    make_executable(&partial)?;
    std::fs::rename(&partial, path).map_err(|e| e.to_string())
}

fn hash_of(path: &Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    Some(hex(&Sha256::digest(bytes)))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(unix)]
fn make_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))
        .map_err(|e| e.to_string())
}

#[cfg(not(unix))]
fn make_executable(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn refuses_a_file_that_has_no_pin_yet() {
        let dir = std::env::temp_dir().join("statim-pins-test");
        let pins = [Pin {
            file: "tuwunel",
            url: "https://example.org/tuwunel",
            sha256: "",
        }];
        let error = install(&dir, &pins).await.unwrap_err();
        assert_eq!(error, "tuwunel is not published for this computer yet.");
    }

    #[tokio::test]
    async fn keeps_a_file_whose_hash_already_matches() {
        let dir = std::env::temp_dir().join("statim-pins-kept");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("tuwunel"), b"binary").unwrap();
        let pins = [Pin {
            file: "tuwunel",
            url: "https://unreachable.invalid/tuwunel",
            sha256: "9a3a45d01531a20e89ac6ae10b0b0beb0492acd7216a368aa062d1a5fecaf9cd",
        }];
        assert_eq!(install(&dir, &pins).await, Ok(()));
    }
}
