//! The programs the server runs, downloaded once and checked against the
//! SHA-256 pinned here before anything executes them.

use std::io::Read;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

/// One file and where it comes from. `sha256` is the hash of the file that
/// runs, after a `.zst` download is unpacked. An empty one means it has not
/// been published for this computer yet, and nothing downloads it.
pub struct Pin {
    pub file: &'static str,
    pub url: &'static str,
    pub sha256: &'static str,
}

/// tuwunel, and on a Mac the libolm the bridges link.
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
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        Some(&[Pin {
            file: "tuwunel",
            url: "https://github.com/matrix-construct/tuwunel/releases/download/v1.9.3/v1.9.3-release-all-x86_64-v1-linux-gnu-tuwunel.zst",
            sha256: "825bf246641b80be441d4632f433a03045da330e75b33d508444ffd388d8cec9",
        }])
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        Some(&[Pin {
            file: "tuwunel",
            url: "https://github.com/matrix-construct/tuwunel/releases/download/v1.9.3/v1.9.3-release-all-aarch64-v8-linux-gnu-tuwunel.zst",
            sha256: "53658cb09df611dc117af03630b751ef0515eb7286db2cdc682ff6222a8bc2d8",
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
    let body = reqwest::get(pin.url)
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|e| format!("Could not download {}: {e}", pin.file))?
        .bytes()
        .await
        .map_err(|e| format!("Could not download {}: {e}", pin.file))?;
    let contents = if pin.url.ends_with(".zst") {
        unpack(&body).map_err(|e| format!("Could not unpack {}: {e}", pin.file))?
    } else {
        body.to_vec()
    };
    if hex(&Sha256::digest(&contents)) != pin.sha256 {
        return Err(format!(
            "{} did not match its pinned SHA-256 and was not kept.",
            pin.file
        ));
    }
    let partial = path.with_extension("partial");
    std::fs::write(&partial, contents).map_err(|e| e.to_string())?;
    make_executable(&partial)?;
    std::fs::rename(&partial, path).map_err(|e| e.to_string())
}

fn unpack(zstd: &[u8]) -> Result<Vec<u8>, String> {
    let mut decoder = ruzstd::decoding::StreamingDecoder::new(zstd).map_err(|e| e.to_string())?;
    let mut contents = Vec::new();
    decoder
        .read_to_end(&mut contents)
        .map_err(|e| e.to_string())?;
    Ok(contents)
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

    #[test]
    fn unpacks_a_zstd_download() {
        let packed = [
            0x28, 0xb5, 0x2f, 0xfd, 0x04, 0x58, 0x31, 0x00, 0x00, 0x62, 0x69, 0x6e, 0x61, 0x72,
            0x79, 0x54, 0xd9, 0x26, 0x77,
        ];
        assert_eq!(unpack(&packed).unwrap(), b"binary");
        assert!(unpack(b"binary").is_err());
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
