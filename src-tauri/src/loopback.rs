//! Signing in through the browser: the page sends it back to a port on this
//! computer, so nothing it hands over passes through a website.

use std::io::{BufRead, BufReader, ErrorKind, Write};
use std::net::{Ipv4Addr, Ipv6Addr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

const WAIT: Duration = Duration::from_secs(300);
const PAGE: &str = "<!doctype html><meta charset=\"utf-8\"><title>Statim</title>\
<p style=\"font:17px -apple-system,system-ui,sans-serif;text-align:center;margin-top:30vh\">\
Signed in. You can close this tab and go back to Statim.</p>";

/// Counts sign-ins, so a newer one takes the port from one left waiting.
#[derive(Default)]
pub struct Loopback(Arc<AtomicU64>);

/// Opens `url` in the browser and returns the path and query of the request
/// for `path` that the sign-in ends with, on `port` of this computer.
#[tauri::command]
pub async fn loopback_sign_in(
    app: AppHandle,
    loopback: State<'_, Loopback>,
    url: String,
    port: u16,
    path: String,
) -> Result<String, String> {
    let turns = Arc::clone(&loopback.0);
    let turn = turns.fetch_add(1, Ordering::SeqCst) + 1;
    let listeners = tauri::async_runtime::spawn_blocking(move || bind(port))
        .await
        .map_err(|e| e.to_string())??;
    app.opener()
        .open_url(url, None::<String>)
        .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        wait(&listeners, &path, || turns.load(Ordering::SeqCst) == turn)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Both loopback addresses, since a browser may resolve `localhost` to either.
fn bind(port: u16) -> Result<Vec<TcpListener>, String> {
    let deadline = Instant::now() + Duration::from_secs(1);
    let v4 = loop {
        match TcpListener::bind((Ipv4Addr::LOCALHOST, port)) {
            Ok(listener) => break listener,
            Err(_) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(50)),
            Err(e) => return Err(format!("Port {port} on this computer is in use: {e}")),
        }
    };
    let mut listeners = vec![v4];
    listeners.extend(TcpListener::bind((Ipv6Addr::LOCALHOST, port)).ok());
    for listener in &listeners {
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    }
    Ok(listeners)
}

fn wait(
    listeners: &[TcpListener],
    path: &str,
    current: impl Fn() -> bool,
) -> Result<String, String> {
    let deadline = Instant::now() + WAIT;
    while current() && Instant::now() < deadline {
        let mut idle = true;
        for listener in listeners {
            match listener.accept() {
                Ok((stream, _)) => {
                    idle = false;
                    if let Some(target) = answer(stream, path) {
                        return Ok(target);
                    }
                }
                Err(e) if e.kind() == ErrorKind::WouldBlock => {}
                Err(e) => return Err(e.to_string()),
            }
        }
        if idle {
            std::thread::sleep(Duration::from_millis(100));
        }
    }
    Err("The sign-in in the browser did not finish.".into())
}

/// The request's target when it is for `path`; anything else, such as the
/// browser asking for an icon, is turned away.
fn answer(mut stream: TcpStream, path: &str) -> Option<String> {
    stream.set_nonblocking(false).ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(5))).ok()?;
    let mut line = String::new();
    BufReader::new(&stream).read_line(&mut line).ok()?;
    let target = line.split_whitespace().nth(1)?.to_string();
    let found = target.split('?').next() == Some(path);
    let (status, body) = if found {
        ("200 OK", PAGE)
    } else {
        ("404 Not Found", "")
    };
    let _ = write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    found.then_some(target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    fn free_port() -> u16 {
        TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .unwrap()
            .local_addr()
            .unwrap()
            .port()
    }

    fn get(port: u16, target: &str) -> String {
        let mut stream = TcpStream::connect((Ipv4Addr::LOCALHOST, port)).unwrap();
        write!(stream, "GET {target} HTTP/1.1\r\nHost: localhost\r\n\r\n").unwrap();
        let mut reply = String::new();
        stream.read_to_string(&mut reply).unwrap();
        reply
    }

    #[test]
    fn returns_the_callback_and_turns_away_the_rest() {
        let port = free_port();
        let listeners = bind(port).unwrap();
        let waiting = std::thread::spawn(move || wait(&listeners, "/icloud", || true));
        assert!(get(port, "/favicon.ico").starts_with("HTTP/1.1 404"));
        assert!(get(port, "/icloud?ckWebAuthToken=a%2Bb").contains("Signed in"));
        assert_eq!(
            waiting.join().unwrap().unwrap(),
            "/icloud?ckWebAuthToken=a%2Bb"
        );
    }

    #[test]
    fn gives_up_once_a_newer_sign_in_starts() {
        let listeners = bind(free_port()).unwrap();
        assert!(wait(&listeners, "/icloud", || false).is_err());
    }
}
