//! The programs the server runs, downloaded once and checked against the
//! SHA-256 pinned here before anything executes them.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use sha2::{Digest, Sha256};

/// One file and where it comes from. `sha256` is the hash of the file that
/// runs, after a `.zst` download is unpacked.
pub struct Pin {
    pub file: &'static str,
    pub url: &'static str,
    pub sha256: &'static str,
}

/// Which of a release's builds this computer runs: an Apple-silicon Mac,
/// Linux on x86-64, or Linux on ARM.
pub fn build_index() -> Option<usize> {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        Some(0)
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        Some(1)
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        Some(2)
    } else {
        None
    }
}

/// Per `build_index`. `.github/workflows/homeserver.yml` builds the Mac's, with the
/// libolm its mautrix bridges link.
const SERVER: [Option<&[Pin]>; 3] = [
    Some(&[
        Pin {
            file: "tuwunel",
            url: "https://github.com/alaibe/statim/releases/download/homeserver-v1.9.3/tuwunel-macos-arm64",
            sha256: "57f5e797a4e1d9ceddba24d09dfa8d6b828d49855a7ae37a2a5b19a230967f98",
        },
        Pin {
            file: "libolm.3.dylib",
            url: "https://github.com/alaibe/statim/releases/download/homeserver-v1.9.3/libolm.3.dylib",
            sha256: "477811be5ff2d7aebf932021c4d22c1193a7fcd4e45f4c62fc2c0df89e694719",
        },
    ]),
    Some(&[Pin {
        file: "tuwunel",
        url: "https://github.com/matrix-construct/tuwunel/releases/download/v1.9.3/v1.9.3-release-all-x86_64-v1-linux-gnu-tuwunel.zst",
        sha256: "825bf246641b80be441d4632f433a03045da330e75b33d508444ffd388d8cec9",
    }]),
    Some(&[Pin {
        file: "tuwunel",
        url: "https://github.com/matrix-construct/tuwunel/releases/download/v1.9.3/v1.9.3-release-all-aarch64-v8-linux-gnu-tuwunel.zst",
        sha256: "53658cb09df611dc117af03630b751ef0515eb7286db2cdc682ff6222a8bc2d8",
    }]),
];

pub fn server_pins() -> Option<&'static [Pin]> {
    SERVER[build_index()?]
}

/// Files already checked by this run of the app.
static VERIFIED: Mutex<Vec<(PathBuf, &str)>> = Mutex::new(Vec::new());

pub async fn install(dir: &Path, pins: &[Pin]) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    for pin in pins {
        let path = dir.join(pin.file);
        let checked = (path.clone(), pin.sha256);
        if VERIFIED
            .lock()
            .map_err(|e| e.to_string())?
            .contains(&checked)
        {
            continue;
        }
        if hash_of(&path).as_deref() != Some(pin.sha256) {
            download(pin, &path).await?;
        }
        VERIFIED.lock().map_err(|e| e.to_string())?.push(checked);
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
    let unpacked;
    let contents: &[u8] = if pin.url.ends_with(".zst") {
        unpacked = unpack(&body).map_err(|e| format!("Could not unpack {}: {e}", pin.file))?;
        &unpacked
    } else {
        &body
    };
    if format!("{:x}", Sha256::digest(contents)) != pin.sha256 {
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
    let mut file = std::fs::File::open(path).ok()?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher).ok()?;
    Some(format!("{:x}", hasher.finalize()))
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

    #[test]
    fn pins_every_server_build_from_a_github_release() {
        for pins in SERVER.iter().flatten() {
            for pin in *pins {
                assert!(pin.url.starts_with("https://github.com/"), "{}", pin.url);
                assert_eq!(pin.sha256.len(), 64, "{}", pin.url);
            }
        }
    }
}
