use std::io::{self, BufRead, Write};
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::thread;

use interprocess::local_socket::Stream;
use serde_json::{json, Value};

use super::{client, transport};

/// Newest first; a client asking for another version gets the newest.
const PROTOCOL_VERSIONS: &[&str] = &["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

type Reply = Result<Value, (i64, String)>;

fn spec() -> &'static Value {
    static SPEC: OnceLock<Value> = OnceLock::new();
    SPEC.get_or_init(|| {
        serde_json::from_str(include_str!("../../cli/mcp.json")).expect("mcp.json is valid")
    })
}

/// An MCP server on stdin and stdout: each tool call is one command run in the app.
pub fn serve() -> i32 {
    for line in io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let Ok(message) = serde_json::from_str::<Value>(&line) else {
            respond(Value::Null, Err((-32700, "Parse error".into())));
            continue;
        };
        let (Some(method), Some(id)) = (message["method"].as_str(), message.get("id").cloned())
        else {
            continue;
        };
        let params = &message["params"];
        let reply = match method {
            "initialize" => Ok(initialize(params)),
            "ping" => Ok(json!({})),
            "tools/list" => Ok(json!({ "tools": spec()["tools"] })),
            "tools/call" => {
                let params = params.clone();
                thread::spawn(move || respond(id, call_tool(&params)));
                continue;
            }
            _ => Err((-32601, format!("Method not found: {method}"))),
        };
        respond(id, reply);
    }
    0
}

fn respond(id: Value, reply: Reply) {
    let message = match reply {
        Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
        Err((code, message)) => {
            json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
        }
    };
    let mut stdout = io::stdout().lock();
    let _ = super::write_line(&mut stdout, &message);
    let _ = stdout.flush();
}

fn initialize(params: &Value) -> Value {
    let asked = params["protocolVersion"].as_str().unwrap_or_default();
    let version = PROTOCOL_VERSIONS
        .iter()
        .find(|v| **v == asked)
        .unwrap_or(&PROTOCOL_VERSIONS[0]);
    json!({
        "protocolVersion": version,
        "capabilities": { "tools": {} },
        "serverInfo": { "name": "statim", "title": "Statim", "version": env!("CARGO_PKG_VERSION") },
        "instructions": spec()["instructions"],
    })
}

fn call_tool(params: &Value) -> Reply {
    let name = params["name"].as_str().unwrap_or_default();
    let Some(call) = spec()["calls"].get(name) else {
        return Err((-32602, format!("Unknown tool: {name}")));
    };
    let stream = match connect() {
        Ok(stream) => stream,
        Err(error) => return Ok(result(&format!("Could not start Statim: {error}"), true)),
    };
    let request = json!({
        "type": "request",
        "argv": argv(call, &params["arguments"]),
        "tty": false,
        "stdinTty": false,
        "mcp": true,
    });
    let (mut out, mut err) = (String::new(), String::new());
    let collect = |kind: &str, text: &str| {
        if kind == "out" { &mut out } else { &mut err }.push_str(text);
    };
    Ok(match client::exchange(stream, &request, collect, answer) {
        Some(0) => result(out.trim_end(), false),
        Some(_) => result(err.trim_end(), true),
        None => result("Statim closed the connection.", true),
    })
}

/// One at a time: dialling changes the working directory, and two calls
/// finding the app closed would otherwise start it twice.
fn connect() -> io::Result<Stream> {
    static CONNECTING: Mutex<()> = Mutex::new(());
    let _turn = CONNECTING.lock().unwrap();
    transport::connect().or_else(|_| client::start_app())
}

fn result(text: &str, is_error: bool) -> Value {
    json!({ "content": [{ "type": "text", "text": text }], "isError": is_error })
}

/// The command line a tool call stands for. Flags come first and inline, and
/// `--` keeps an argument that starts with `--` from reading as one.
fn argv(call: &Value, arguments: &Value) -> Vec<String> {
    let mut argv = words(&call["path"]);
    for (property, flag) in call["flags"].as_object().into_iter().flatten() {
        let flag = flag.as_str().unwrap_or_default();
        match &arguments[property] {
            Value::Bool(true) => argv.push(format!("--{flag}")),
            value => argv.extend(words(value).iter().map(|word| format!("--{flag}={word}"))),
        }
    }
    argv.extend(["--json".into(), "--".into()]);
    for property in call["args"].as_array().into_iter().flatten() {
        argv.extend(words(&arguments[property.as_str().unwrap_or_default()]));
    }
    argv
}

fn words(value: &Value) -> Vec<String> {
    match value {
        Value::String(text) => vec![text.clone()],
        Value::Number(number) => vec![number.to_string()],
        Value::Array(items) => items.iter().flat_map(words).collect(),
        _ => Vec::new(),
    }
}

fn answer(message: &Value) -> Value {
    let path = message["path"].as_str().unwrap_or_default();
    match message["type"].as_str().unwrap_or_default() {
        "prompt" => json!({ "error": "Nothing can be typed in here; pass it as an argument." }),
        "stdin" => json!({ "data": "" }),
        _ if !Path::new(path).is_absolute() => {
            json!({ "error": format!("Give an absolute path instead of \"{path}\".") })
        }
        _ => client::answer(message),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    #[test]
    fn turns_arguments_into_the_command_line() {
        let send = &super::spec()["calls"]["send"];
        let argv = super::argv(
            send,
            &json!({ "chat": "alice", "text": "--hi there", "reply": "m1", "file": null }),
        );
        assert_eq!(
            argv,
            ["send", "--reply=m1", "--json", "--", "alice", "--hi there"]
        );

        let add = &super::spec()["calls"]["group_add"];
        let argv = super::argv(add, &json!({ "chat": "team", "address": ["a", "b"] }));
        assert_eq!(argv, ["group", "add", "--json", "--", "team", "a", "b"]);

        let read = &super::spec()["calls"]["read"];
        let on = super::argv(read, &json!({ "chat": "x", "mark_read": true, "limit": 5 }));
        let off = super::argv(read, &json!({ "chat": "x", "mark_read": false }));
        assert!(on.contains(&"--mark-read".into()) && on.contains(&"--limit=5".into()));
        assert_eq!(off, ["read", "--json", "--", "x"]);
    }
}
