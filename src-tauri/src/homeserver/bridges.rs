//! The bridges the server can run, from their projects' own releases, pinned
//! by SHA-256. Each gets a short config: the bridge fills in every
//! default it leaves out when it starts.

use std::path::Path;

use super::artifacts::{build_index, Pin};
use super::config::Appservice;
use super::{users::random_hex, OWNER, SERVER_NAME};
use crate::paths::write_private;

/// A bridge whose bot is `<id>bot` and whose users for people on the other
/// network start with `<id>_`.
pub struct Bridge {
    /// Its appservice id, and the name its login API sits under in the router.
    pub id: &'static str,
    pub binary: &'static str,
    pub port: u16,
    /// Configured the way bridges before mautrix's bridgev2 were.
    legacy: bool,
    /// For each of `build_index`'s computers, where it has one.
    builds: [Option<(&'static str, &'static str)>; 3],
}

macro_rules! release {
    (@url $repo:literal, $tag:literal, $asset:literal, $suffix:literal) => {
        concat!("https://github.com/mautrix/", $repo, "/releases/download/", $tag, "/", $asset, $suffix)
    };
    ($repo:literal, $tag:literal, $asset:literal, $mac:literal, $amd64:literal, $arm64:literal) => {
        [
            Some((release!(@url $repo, $tag, $asset, "-darwin-arm64"), $mac)),
            Some((release!(@url $repo, $tag, $asset, "-amd64"), $amd64)),
            Some((release!(@url $repo, $tag, $asset, "-arm64"), $arm64)),
        ]
    };
}

pub const BRIDGES: &[Bridge] = &[
    Bridge {
        id: "whatsapp",
        binary: "mautrix-whatsapp",
        port: 47290,
        legacy: false,
        builds: release!(
            "whatsapp",
            "v0.2609.0",
            "mautrix-whatsapp",
            "0aa2d5ff8c153c251309d70a5b13986f74e14cedb2c2129667b640f52aec33a2",
            "fb12e322ce536bc110a6012afeeb371a7853f92df3845177dca39a5c595c2bd7",
            "5eec1c133ae508fbe7cc0d42329647239d954148026ffe5d75873a8f22917764"
        ),
    },
    Bridge {
        id: "signal",
        binary: "mautrix-signal",
        port: 47291,
        legacy: false,
        builds: release!(
            "signal",
            "v0.2609.0",
            "mautrix-signal",
            "9f36cd6bd85688f4fa2d7edd8e656a06aaf8732a750e9142af06468ceda15b9e",
            "e4481d0abb0e8cd98eba54d3d42e119cd2bd03faac3885c544286e602b5f7b06",
            "48c00d37c4e67434770db3e462295f26f676f6ce8cc67cc9c417ec8f85a1e665"
        ),
    },
    Bridge {
        id: "facebook",
        binary: "mautrix-meta",
        port: 47292,
        legacy: false,
        builds: release!(
            "meta",
            "v0.2609.0",
            "mautrix-meta",
            "6ba99682e0303051c1957688689a8f3c79fb639aa9740a4a75c9c2d893a1a498",
            "c600d875024588e1e25469bdcd5cfde44c9a60414f35d660703805cbb3ac75e1",
            "04103545c373e1ebd3fd1b2e11e2d48b4c8f4a72fe69fbf4f78a558a141ed47a"
        ),
    },
    Bridge {
        id: "instagram",
        binary: "mautrix-instagram",
        port: 47293,
        legacy: false,
        builds: release!(
            "meta",
            "v0.2609.0",
            "mautrix-instagram",
            "41cbabc0504b2004240957e75b14b07dbff683f2664db5d8fbad3bd463a437d1",
            "971d78b8bbc9b515f6818f0b19d684110870cbd3cdddd87e1fea6b7c534f71bc",
            "ec7a4454db2c477259c0fe6ee972137d259ad878c3e06e2a97703683110f95ad"
        ),
    },
    Bridge {
        id: "slack",
        binary: "mautrix-slack",
        port: 47294,
        legacy: false,
        builds: release!(
            "slack",
            "v0.2609.1",
            "mautrix-slack",
            "9f74e1d23dcf97cd3c7e96eae3f6e07e6a528b96533b70f67416a8c51b9fedde",
            "d1e2d790c1b5cbcc52a7b011402e4d9c329646b579826af7ebfab476ecdf121f",
            "700e00b9ad1a7078ee7c3293444c5795152e9c0f3e817dd2f52a826b3d3c604f"
        ),
    },
    Bridge {
        id: "discord",
        binary: "mautrix-discord",
        port: 47295,
        legacy: true,
        builds: release!(
            "discord",
            "v0.7.7",
            "mautrix-discord",
            "8db5ce8eb239acb79e9231e76f551bffde59b0f1aa0c3b70edae81fa1c97c79b",
            "1f3b6953b4eae00d141ce706f6e97c1b5d0e50268a447bc605df2fa4f44c5d9d",
            "033c115b7e5cd31b155a242ec372b0a862962baa5401690db2e0fa967689b9c9"
        ),
    },
    Bridge {
        id: "imessage",
        binary: "corten-matrix",
        port: 47296,
        legacy: false,
        builds: [
            Some((
                "https://github.com/lrhodin/corten-matrix/releases/download/1.3.2/corten-matrix-macos",
                "1e0f5c60960cd2596ab18f04a7c6d329c982f94771a9319e2178bbd4afd01f62",
            )),
            None,
            None,
        ],
    },
];

pub fn bridge(id: &str) -> Option<&'static Bridge> {
    BRIDGES.iter().find(|bridge| bridge.id == id)
}

/// The tokens a bridge and the server share. Made once, beside its data.
pub struct Tokens {
    pub as_token: String,
    pub hs_token: String,
    pub sender: String,
}

impl Tokens {
    pub fn of(dir: &Path) -> Result<Self, String> {
        let path = dir.join("tokens");
        let saved = std::fs::read_to_string(&path).unwrap_or_default();
        let mut lines = saved.lines().map(str::to_string);
        if let (Some(as_token), Some(hs_token), Some(sender)) =
            (lines.next(), lines.next(), lines.next())
        {
            return Ok(Self {
                as_token,
                hs_token,
                sender,
            });
        }
        let tokens = Self {
            as_token: random_hex(32)?,
            hs_token: random_hex(32)?,
            sender: random_hex(16)?,
        };
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        write_private(
            &path,
            &format!(
                "{}\n{}\n{}\n",
                tokens.as_token, tokens.hs_token, tokens.sender
            ),
        )?;
        Ok(tokens)
    }
}

impl Bridge {
    pub fn pin(&self) -> Option<Pin> {
        let (url, sha256) = self.builds[build_index()?]?;
        Some(Pin {
            file: self.binary,
            url,
            sha256,
        })
    }

    pub fn appservice(&self, tokens: &Tokens) -> Appservice {
        Appservice {
            id: self.id.into(),
            url: Some(format!("http://127.0.0.1:{}", self.port)),
            as_token: tokens.as_token.clone(),
            hs_token: tokens.hs_token.clone(),
            sender_localpart: tokens.sender.clone(),
            users: vec![
                format!("^@{}bot:{SERVER_NAME}$", self.id),
                format!("^@{}_.*:{SERVER_NAME}$", self.id),
            ],
            exclusive: true,
        }
    }

    /// `double_puppet` is the token that lets it post as the owner.
    pub fn config(&self, server_port: u16, tokens: &Tokens, double_puppet: &str) -> String {
        let (id, port) = (self.id, self.port);
        let homeserver = format!(
            "homeserver:\n    address: http://127.0.0.1:{server_port}\n    domain: {SERVER_NAME}\n"
        );
        let appservice = format!(
            "appservice:\n    address: http://127.0.0.1:{port}\n    hostname: 127.0.0.1\n    port: {port}\n    id: {id}\n    bot:\n        username: {id}bot\n    as_token: {as_token}\n    hs_token: {hs_token}\n",
            as_token = tokens.as_token,
            hs_token = tokens.hs_token,
        );
        let permissions = format!(
            "    permissions:\n        \"{SERVER_NAME}\": user\n        \"@{OWNER}:{SERVER_NAME}\": admin\n"
        );
        let database = |indent: &str| {
            format!("type: sqlite3-fk-wal\n{indent}uri: file:{id}.db?_txlock=immediate\n")
        };
        if self.legacy {
            format!(
                "{homeserver}{appservice}    database:\n        {database}bridge:\n    username_template: {id}_{{{{.}}}}\n{permissions}    login_shared_secret_map:\n        {SERVER_NAME}: \"as_token:{double_puppet}\"\n",
                database = database("        "),
            )
        } else {
            format!(
                "{homeserver}{appservice}    username_template: {id}_{{{{.}}}}\ndatabase:\n    {database}bridge:\n{permissions}double_puppet:\n    secrets:\n        {SERVER_NAME}: \"as_token:{double_puppet}\"\n",
                database = database("    "),
            )
        }
    }
}

/// Lets each bridge post as the owner, so what they send from the other
/// network's own app shows as them. It owns no users and gets no traffic.
pub fn double_puppet(tokens: &Tokens) -> Appservice {
    Appservice {
        id: "doublepuppet".into(),
        url: None,
        as_token: tokens.as_token.clone(),
        hs_token: tokens.hs_token.clone(),
        sender_localpart: tokens.sender.clone(),
        users: vec![format!("^@{OWNER}:{SERVER_NAME}$")],
        exclusive: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tokens() -> Tokens {
        Tokens {
            as_token: "as".into(),
            hs_token: "hs".into(),
            sender: "sender".into(),
        }
    }

    #[test]
    fn configures_a_bridge_to_reach_the_server_and_answer_the_owner() {
        let config = bridge("whatsapp").unwrap().config(47281, &tokens(), "dp");
        assert_eq!(
            config,
            "homeserver:\n    address: http://127.0.0.1:47281\n    domain: statim\n\
             appservice:\n    address: http://127.0.0.1:47290\n    hostname: 127.0.0.1\n    port: 47290\n    id: whatsapp\n    bot:\n        username: whatsappbot\n    as_token: as\n    hs_token: hs\n    username_template: whatsapp_{{.}}\n\
             database:\n    type: sqlite3-fk-wal\n    uri: file:whatsapp.db?_txlock=immediate\n\
             bridge:\n    permissions:\n        \"statim\": user\n        \"@me:statim\": admin\n\
             double_puppet:\n    secrets:\n        statim: \"as_token:dp\"\n"
        );
    }

    #[test]
    fn configures_discord_the_way_bridges_before_bridgev2_were() {
        let config = bridge("discord").unwrap().config(47281, &tokens(), "dp");
        assert!(config.contains(
            "    database:\n        type: sqlite3-fk-wal\n        uri: file:discord.db?_txlock=immediate\n"
        ));
        assert!(config.contains("bridge:\n    username_template: discord_{{.}}\n"));
        assert!(config.contains("    login_shared_secret_map:\n        statim: \"as_token:dp\"\n"));
        assert!(!config.contains("double_puppet:"));
    }

    #[test]
    fn owns_its_bot_and_its_users_on_the_server() {
        let service = bridge("slack").unwrap().appservice(&tokens());
        assert_eq!(service.url.as_deref(), Some("http://127.0.0.1:47294"));
        assert_eq!(service.users, ["^@slackbot:statim$", "^@slack_.*:statim$"]);
        assert!(service.exclusive);
        assert_eq!(double_puppet(&tokens()).users, ["^@me:statim$"]);
    }

    #[test]
    fn keeps_its_tokens_once_made() {
        let dir = std::env::temp_dir().join("statim-bridge-tokens");
        let _ = std::fs::remove_dir_all(&dir);
        let first = Tokens::of(&dir).unwrap();
        let again = Tokens::of(&dir).unwrap();
        assert_eq!(first.as_token, again.as_token);
        assert_eq!(first.as_token.len(), 64);
    }

    #[test]
    fn pins_every_build_from_a_github_release() {
        for bridge in BRIDGES {
            for (url, sha256) in bridge.builds.iter().flatten() {
                assert!(url.starts_with("https://github.com/"), "{url}");
                assert!(url.contains("/releases/download/"), "{url}");
                assert_eq!(sha256.len(), 64, "{url}");
            }
        }
    }

    #[test]
    fn runs_imessage_on_a_mac_only() {
        let builds = bridge("imessage").unwrap().builds;
        assert!(builds[0].is_some());
        assert!(builds[1].is_none() && builds[2].is_none());
    }
}
