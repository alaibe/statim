//! The desktop's part of usage statistics: the page (`src/core/usage`) builds each page view, and this sends it to
//! Umami at stats.laibe.cc under a plain browser's User-Agent. A debug build sends nothing.

use std::time::Duration;

use serde_json::Value;

const ENDPOINT: &str = "https://stats.laibe.cc/api/send";
const TIMEOUT_SECONDS: u64 = 5;

#[derive(Clone, Copy, Debug, PartialEq)]
#[allow(clippy::enum_variant_names)]
pub enum Os {
    MacOs,
    Windows,
    Linux,
}

impl Os {
    pub fn current() -> Os {
        if cfg!(target_os = "macos") {
            Os::MacOs
        } else if cfg!(target_os = "windows") {
            Os::Windows
        } else {
            Os::Linux
        }
    }

    /// A plain browser's, the same in every version: Umami hashes it into the session, and drops as a bot one that
    /// names the app.
    pub fn user_agent(self) -> &'static str {
        match self {
            Os::MacOs => {
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
            }
            Os::Windows => {
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
            Os::Linux => "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
        }
    }
}

/// reqwest's `rustls` feature brings its own crypto provider, so unlike Grenier's nothing is installed here.
fn client(agent: &str) -> reqwest::Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent(agent)
        .timeout(Duration::from_secs(TIMEOUT_SECONDS))
        .build()
}

async fn post(endpoint: &str, agent: &str, body: &Value) -> reqwest::Result<()> {
    client(agent)?.post(endpoint).json(body).send().await?;
    Ok(())
}

/// No retry, and the answer, Umami's or an error, is never read.
#[tauri::command]
pub async fn usage_post(body: Value) -> Result<(), String> {
    if cfg!(debug_assertions) {
        return Ok(());
    }
    post(ENDPOINT, Os::current().user_agent(), &body)
        .await
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::TcpListener;

    use serde_json::json;

    use super::*;

    fn vectors() -> Value {
        serde_json::from_str(include_str!("../../src/core/usage/usage-vectors.json")).unwrap()
    }

    fn header(head: &[String], name: &str) -> Option<String> {
        head.iter().find_map(|line| {
            let (key, value) = line.split_once(':')?;
            key.eq_ignore_ascii_case(name).then(|| value.trim().to_string())
        })
    }

    #[test]
    fn u07_user_agents_match_the_table() {
        let table = &vectors()["userAgent"];
        for (os, name) in [(Os::MacOs, "macOS"), (Os::Windows, "Windows"), (Os::Linux, "Linux")] {
            assert_eq!(os.user_agent(), table[name].as_str().unwrap());
            let lower = os.user_agent().to_lowercase();
            for word in ["kestrel", "grenier", "statim", "okhttp"] {
                assert!(!lower.contains(word), "{name} names {word}");
            }
        }
    }

    #[tokio::test]
    async fn u16_post_sends_json_with_the_user_agent() {
        let vectors = vectors();
        assert_eq!(ENDPOINT, vectors["endpoint"].as_str().unwrap());
        assert_eq!(TIMEOUT_SECONDS, vectors["timeoutSeconds"].as_u64().unwrap());

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint = format!("http://{}/api/send", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut head = Vec::new();
            loop {
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                if line == "\r\n" {
                    break;
                }
                head.push(line.trim_end().to_string());
            }
            let mut body = vec![0; header(&head, "content-length").unwrap().parse().unwrap()];
            reader.read_exact(&mut body).unwrap();
            let reply = "{\"beep\":\"boop\"}";
            write!(
                &stream,
                "HTTP/1.1 200 OK\r\ncontent-length: {}\r\n\r\n{reply}",
                reply.len()
            )
            .unwrap();
            (head, serde_json::from_slice::<Value>(&body).unwrap())
        });

        let body = json!({ "type": "event", "payload": vectors["payload"]["apps"]["statim"]["expected"]["payload"] });
        post(&endpoint, Os::MacOs.user_agent(), &body).await.unwrap();
        let (head, received) = server.join().unwrap();
        assert_eq!(head[0], "POST /api/send HTTP/1.1");
        assert_eq!(header(&head, "content-type").as_deref(), Some("application/json"));
        assert_eq!(header(&head, "user-agent").as_deref(), Some(Os::MacOs.user_agent()));
        assert_eq!(received, body);
    }
}
