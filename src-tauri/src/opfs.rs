//! The XMTP worker's OPFS on Linux, whose WebKitGTK has no sync access handles: files under the app data, over `opfs://`.

use std::fs::{self, File, OpenOptions};
use std::io::ErrorKind;
use std::os::unix::fs::{FileExt, PermissionsExt};
use std::path::{Path, PathBuf};

use tauri::http::{header, Request, Response, StatusCode};
use tauri::{AppHandle, UriSchemeContext, UriSchemeResponder, Url, Wry};

pub const SCHEME: &str = "opfs";

/// Only the app's own page may reach the files; the sign-in window shows other sites.
const PAGE_ORIGINS: &[&str] = if cfg!(debug_assertions) {
    &["tauri://localhost", "http://localhost:8082"]
} else {
    &["tauri://localhost"]
};

pub fn handle(ctx: UriSchemeContext<'_, Wry>, request: Request<Vec<u8>>, responder: UriSchemeResponder) {
    let origin = request
        .headers()
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_owned();
    if !PAGE_ORIGINS.contains(&origin.as_str()) {
        responder.respond(reply(&origin, StatusCode::FORBIDDEN, b"Forbidden".to_vec()));
        return;
    }
    let root = match crate::paths::data_dir(ctx.app_handle(), "opfs") {
        Ok(root) => root,
        Err(error) => {
            responder.respond(reply(&origin, StatusCode::INTERNAL_SERVER_ERROR, error.into_bytes()));
            return;
        }
    };
    tauri::async_runtime::spawn_blocking(move || {
        let response = match serve(&root, &request) {
            Ok(body) => reply(&origin, StatusCode::OK, body),
            Err(Failure(status, message)) => reply(&origin, status, message.into_bytes()),
        };
        responder.respond(response);
    });
}

/// Keeps the directory to its owner, as WebKit does with its own storage.
pub fn restrict(app: &AppHandle) {
    if let Ok(root) = crate::paths::data_dir(app, "opfs") {
        let _ = fs::set_permissions(root, fs::Permissions::from_mode(0o700));
    }
}

fn reply(origin: &str, status: StatusCode, body: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/octet-stream")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin)
        .header(header::CACHE_CONTROL, "no-store")
        .body(body)
        .unwrap_or_default()
}

#[derive(Debug, PartialEq)]
struct Failure(StatusCode, String);

impl From<std::io::Error> for Failure {
    fn from(error: std::io::Error) -> Self {
        let status = match error.kind() {
            ErrorKind::NotFound => StatusCode::NOT_FOUND,
            ErrorKind::NotADirectory | ErrorKind::IsADirectory | ErrorKind::AlreadyExists => StatusCode::CONFLICT,
            ErrorKind::DirectoryNotEmpty => StatusCode::PRECONDITION_FAILED,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        };
        Failure(status, error.to_string())
    }
}

fn bad(message: &str) -> Failure {
    Failure(StatusCode::BAD_REQUEST, message.to_owned())
}

/// Every operation is a POST: WebKit answers a repeated GET from its cache without asking the app.
fn serve(root: &Path, request: &Request<Vec<u8>>) -> Result<Vec<u8>, Failure> {
    if request.method() != tauri::http::Method::POST {
        return Err(Failure(StatusCode::METHOD_NOT_ALLOWED, "Only POST".into()));
    }
    let url = Url::parse(&request.uri().to_string()).map_err(|_| bad("Invalid URL"))?;
    let param = |name: &str| {
        url.query_pairs()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.into_owned())
    };
    let number =
        |name: &str| -> Result<u64, Failure> { param(name).unwrap_or_default().parse().map_err(|_| bad(name)) };
    let path = resolve(root, &param("path").unwrap_or_default())?;

    match url.path() {
        "/kind" => Ok(kind(&fs::metadata(&path)?).as_bytes().to_vec()),
        "/directory" => {
            match fs::metadata(&path) {
                Ok(meta) if meta.is_dir() => {}
                Ok(_) => return Err(Failure(StatusCode::CONFLICT, "Not a directory".into())),
                Err(_) => fs::create_dir(&path)?,
            }
            Ok(Vec::new())
        }
        "/file" => {
            match fs::metadata(&path) {
                Ok(meta) if meta.is_file() => {}
                Ok(_) => return Err(Failure(StatusCode::CONFLICT, "Not a file".into())),
                Err(_) => {
                    OpenOptions::new().write(true).create_new(true).open(&path)?;
                }
            }
            Ok(Vec::new())
        }
        "/list" => {
            let mut entries = Vec::new();
            for entry in fs::read_dir(&path)? {
                let entry = entry?;
                if let Some(name) = entry.file_name().to_str() {
                    entries.push((name.to_owned(), kind(&entry.metadata()?)));
                }
            }
            entries.sort();
            serde_json::to_vec(&entries).map_err(|e| Failure(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
        }
        "/remove" => {
            if path == root {
                return Err(bad("The root stays"));
            }
            if fs::metadata(&path)?.is_dir() {
                if param("recursive").as_deref() == Some("1") {
                    fs::remove_dir_all(&path)?;
                } else {
                    fs::remove_dir(&path)?;
                }
            } else {
                fs::remove_file(&path)?;
            }
            Ok(Vec::new())
        }
        "/read" => {
            let file = File::open(&path)?;
            let mut buffer = vec![0; number("length")? as usize];
            let at = number("at")?;
            let mut read = 0;
            while read < buffer.len() {
                match file.read_at(&mut buffer[read..], at + read as u64)? {
                    0 => break,
                    n => read += n,
                }
            }
            buffer.truncate(read);
            Ok(buffer)
        }
        "/write" => {
            OpenOptions::new()
                .write(true)
                .open(&path)?
                .write_all_at(request.body(), number("at")?)?;
            Ok(request.body().len().to_string().into_bytes())
        }
        "/size" => Ok(file_of(&path)?.metadata()?.len().to_string().into_bytes()),
        "/truncate" => {
            OpenOptions::new().write(true).open(&path)?.set_len(number("size")?)?;
            Ok(Vec::new())
        }
        "/flush" => {
            OpenOptions::new().write(true).open(&path)?.sync_data()?;
            Ok(Vec::new())
        }
        _ => Err(Failure(StatusCode::NOT_FOUND, "No such operation".into())),
    }
}

fn kind(meta: &fs::Metadata) -> &'static str {
    if meta.is_dir() {
        "directory"
    } else {
        "file"
    }
}

fn file_of(path: &Path) -> Result<File, Failure> {
    let file = File::open(path)?;
    if file.metadata()?.is_dir() {
        return Err(Failure(StatusCode::CONFLICT, "Not a file".into()));
    }
    Ok(file)
}

/// A slash-separated path under `root`; every name is one plain entry, so nothing escapes it.
fn resolve(root: &Path, path: &str) -> Result<PathBuf, Failure> {
    let mut resolved = root.to_path_buf();
    for name in path.split('/').filter(|name| !name.is_empty()) {
        if name == "." || name == ".." || name.contains(['\\', '\0']) {
            return Err(bad("Invalid name"));
        }
        resolved.push(name);
    }
    Ok(resolved)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn call(root: &Path, uri: &str, body: &[u8]) -> Result<Vec<u8>, Failure> {
        let request = Request::builder().method("POST").uri(uri).body(body.to_vec()).unwrap();
        serve(root, &request)
    }

    fn temp() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "statim-opfs-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn names_never_leave_the_root() {
        let root = Path::new("/data/opfs");
        assert_eq!(resolve(root, ".opaque/AbC").unwrap(), root.join(".opaque/AbC"));
        assert_eq!(resolve(root, "").unwrap(), root);
        for path in ["..", "a/../../etc", "./x", "a\\b"] {
            assert_eq!(resolve(root, path).unwrap_err().0, StatusCode::BAD_REQUEST, "{path}");
        }
    }

    #[test]
    fn a_file_keeps_what_was_written_where() {
        let root = temp();
        call(&root, "opfs://localhost/directory?path=.opaque", b"").unwrap();
        call(&root, "opfs://localhost/file?path=.opaque/db", b"").unwrap();
        call(&root, "opfs://localhost/write?path=.opaque/db&at=4", b"page").unwrap();
        assert_eq!(call(&root, "opfs://localhost/size?path=.opaque/db", b"").unwrap(), b"8");
        let read = call(&root, "opfs://localhost/read?path=.opaque/db&at=2&length=10", b"").unwrap();
        assert_eq!(read, b"\0\0page");
        call(&root, "opfs://localhost/truncate?path=.opaque/db&size=5", b"").unwrap();
        assert_eq!(call(&root, "opfs://localhost/size?path=.opaque/db", b"").unwrap(), b"5");
        let listed = call(&root, "opfs://localhost/list?path=.opaque", b"").unwrap();
        assert_eq!(listed, br#"[["db","file"]]"#);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_get_is_refused_so_webkit_never_caches_an_answer() {
        let root = temp();
        let request = Request::builder()
            .uri("opfs://localhost/list?path=")
            .body(Vec::new())
            .unwrap();
        assert_eq!(serve(&root, &request).unwrap_err().0, StatusCode::METHOD_NOT_ALLOWED);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_missing_entry_is_not_found_and_the_root_cannot_go() {
        let root = temp();
        assert_eq!(
            call(&root, "opfs://localhost/kind?path=nope", b"").unwrap_err().0,
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            call(&root, "opfs://localhost/remove?path=", b"").unwrap_err().0,
            StatusCode::BAD_REQUEST
        );
        fs::remove_dir_all(root).unwrap();
    }
}
