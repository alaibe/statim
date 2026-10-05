//! What tuwunel reads at start: one server per account, reachable only from this
//! computer, closed to federation, with registration by a token the app keeps.

use std::fmt::Write as _;
use std::path::Path;

/// A bridge as tuwunel sees it: the appservice block its registration describes.
pub struct Appservice {
    pub id: String,
    pub url: String,
    pub as_token: String,
    pub hs_token: String,
    pub sender_localpart: String,
    /// Regular expressions of the users it owns exclusively.
    pub users: Vec<String>,
}

pub fn tuwunel(
    server_name: &str,
    database: &Path,
    port: u16,
    registration_token: &str,
    appservices: &[Appservice],
) -> String {
    let mut toml = format!(
        "[global]\n\
         server_name = {server_name}\n\
         database_path = {database}\n\
         address = [\"127.0.0.1\"]\n\
         port = {port}\n\
         allow_registration = true\n\
         registration_token = {token}\n\
         allow_federation = false\n\
         trusted_servers = []\n\
         startup_netburst = false\n\
         log = \"warn\"\n",
        server_name = quoted(server_name),
        database = quoted(&database.to_string_lossy()),
        token = quoted(registration_token),
    );
    for service in appservices {
        let _ = write!(
            toml,
            "\n[global.appservice.{id}]\n\
             url = {url}\n\
             as_token = {as_token}\n\
             hs_token = {hs_token}\n\
             sender_localpart = {sender}\n\
             receive_ephemeral = true\n",
            id = service.id,
            url = quoted(&service.url),
            as_token = quoted(&service.as_token),
            hs_token = quoted(&service.hs_token),
            sender = quoted(&service.sender_localpart),
        );
        for regex in &service.users {
            // A literal string, so a regex's backslashes need no escaping.
            let _ = write!(
                toml,
                "\n[[global.appservice.{id}.users]]\nexclusive = true\nregex = '{regex}'\n",
                id = service.id,
            );
        }
    }
    toml
}

fn quoted(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bridge() -> Appservice {
        Appservice {
            id: "whatsapp".into(),
            url: "http://127.0.0.1:47290".into(),
            as_token: "as".into(),
            hs_token: "hs".into(),
            sender_localpart: "sender".into(),
            users: vec![
                r"^@whatsappbot:statim$".into(),
                r"^@whatsapp_.*:statim$".into(),
            ],
        }
    }

    #[test]
    fn opens_registration_by_token_on_this_computer_only() {
        let toml = tuwunel("statim", Path::new("/data/db"), 47281, "secret", &[]);
        for line in [
            "server_name = \"statim\"",
            "database_path = \"/data/db\"",
            "address = [\"127.0.0.1\"]",
            "port = 47281",
            "registration_token = \"secret\"",
            "allow_federation = false",
        ] {
            assert!(toml.contains(line), "missing {line} in\n{toml}");
        }
        assert!(!toml.contains("appservice"));
    }

    #[test]
    fn declares_each_bridge_with_the_users_it_owns() {
        let toml = tuwunel("statim", Path::new("/db"), 1, "t", &[bridge()]);
        assert!(toml.contains("[global.appservice.whatsapp]\nurl = \"http://127.0.0.1:47290\""));
        assert!(
            toml.contains("as_token = \"as\"\nhs_token = \"hs\"\nsender_localpart = \"sender\"")
        );
        assert_eq!(
            toml.matches("[[global.appservice.whatsapp.users]]").count(),
            2
        );
        assert!(toml.contains("regex = '^@whatsappbot:statim$'"));
    }

    #[test]
    fn escapes_quotes_and_backslashes_in_strings() {
        let toml = tuwunel("statim", Path::new(r#"C:\a "b""#), 1, "t", &[]);
        assert!(toml.contains(r#"database_path = "C:\\a \"b\"""#));
    }
}
