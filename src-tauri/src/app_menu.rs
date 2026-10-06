use std::sync::atomic::{AtomicBool, Ordering};

use tauri::menu::{AboutMetadata, Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, Wry};
use tauri_plugin_opener::OpenerExt;

use crate::cli;
use crate::paths::{app_data_dir, write_private};

const GUIDE: &str = "https://statim.laibe.cc/guide";
const ISSUES: &str = "https://github.com/alaibe/statim/issues";

/// Ids with this prefix name a command the page carries out.
const PAGE: &str = "page:";
const SHOW: &str = "show";
const CLOSE: &str = "close";
const EXIT: &str = "exit";
const OPEN_GUIDE: &str = "guide";
const REPORT: &str = "report";

const HIDDEN_FLAG: &str = "menu-bar-hidden";

/// Whether the window's menu bar on Windows and Linux stays out of sight until Alt.
#[derive(Default)]
pub struct MenuBar {
    hidden: AtomicBool,
}

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    if cfg!(target_os = "macos") {
        app.set_menu(mac_menu(app)?)?;
    } else if let Some(window) = app.get_webview_window("main") {
        window.set_menu(window_menu(app)?)?;
        let hidden = app_data_dir(app).is_ok_and(|dir| dir.join(HIDDEN_FLAG).exists());
        app.state::<MenuBar>()
            .hidden
            .store(hidden, Ordering::Relaxed);
        if hidden {
            window.hide_menu()?;
        }
    }
    app.on_menu_event(handle);
    Ok(())
}

fn handle(app: &AppHandle, event: MenuEvent) {
    let id = event.id().as_ref();
    if let Some(command) = id.strip_prefix(PAGE) {
        cli::show_main(app);
        let _ = app.emit_to("main", "app-menu", command);
    }
    match id {
        SHOW => cli::show_main(app),
        CLOSE => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.hide();
            }
        }
        EXIT => app.exit(0),
        OPEN_GUIDE => open(app, GUIDE),
        REPORT => open(app, ISSUES),
        _ => {}
    }
    peek(app, false);
}

fn open(app: &AppHandle, url: &str) {
    if let Err(error) = app.opener().open_url(url, None::<String>) {
        log::warn!("[menu] could not open {url}: {error}");
    }
}

fn page(
    app: &AppHandle,
    command: &str,
    text: &str,
    shortcut: Option<&str>,
) -> tauri::Result<MenuItem<Wry>> {
    MenuItem::with_id(app, format!("{PAGE}{command}"), text, true, shortcut)
}

fn separator(app: &AppHandle) -> tauri::Result<PredefinedMenuItem<Wry>> {
    PredefinedMenuItem::separator(app)
}

fn about(app: &AppHandle) -> tauri::Result<PredefinedMenuItem<Wry>> {
    let info = app.package_info();
    PredefinedMenuItem::about(
        app,
        Some("About Statim"),
        Some(AboutMetadata {
            name: Some(info.name.clone()),
            version: Some(info.version.to_string()),
            ..Default::default()
        }),
    )
}

#[cfg(feature = "updater")]
fn check_for_updates(app: &AppHandle) -> tauri::Result<MenuItem<Wry>> {
    page(app, "check-updates", "Check for Updates…", None)
}

fn edit(app: &AppHandle) -> tauri::Result<Submenu<Wry>> {
    Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
            &separator(app)?,
            &page(app, "find", "Find…", Some("CmdOrCtrl+F"))?,
        ],
    )
}

fn go(app: &AppHandle) -> tauri::Result<Submenu<Wry>> {
    Submenu::with_items(
        app,
        "Go",
        true,
        &[
            &page(app, "switcher", "Switch to Chat…", Some("CmdOrCtrl+K"))?,
            &separator(app)?,
            &page(app, "tab-chats", "Chats", Some("CmdOrCtrl+1"))?,
            &page(app, "tab-contacts", "Contacts", Some("CmdOrCtrl+2"))?,
            &page(app, "tab-settings", "Settings", Some("CmdOrCtrl+3"))?,
            &separator(app)?,
            &page(app, "filter-all", "All Chats", None)?,
            &page(app, "filter-unread", "Unread", None)?,
            &page(app, "filter-mentions", "Mentions", None)?,
            &page(app, "filter-dms", "DMs", None)?,
            &page(app, "filter-groups", "Groups", None)?,
            &separator(app)?,
            &page(app, "requests", "Requests", None)?,
            &page(app, "archive", "Archive", None)?,
            &page(app, "blocked", "Blocked", None)?,
        ],
    )
}

fn new_chat_items(app: &AppHandle) -> tauri::Result<[MenuItem<Wry>; 2]> {
    Ok([
        page(app, "new-message", "New Message…", Some("CmdOrCtrl+N"))?,
        page(app, "new-group", "New Group…", None)?,
    ])
}

fn help_items(app: &AppHandle) -> tauri::Result<[MenuItem<Wry>; 2]> {
    Ok([
        MenuItem::with_id(app, OPEN_GUIDE, "Statim Guide", true, None::<&str>)?,
        MenuItem::with_id(app, REPORT, "Report a Problem", true, None::<&str>)?,
    ])
}

fn mac_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let [new_message, new_group] = new_chat_items(app)?;
    let [guide, report] = help_items(app)?;
    let help = Submenu::with_items(app, "Help", true, &[&guide, &report])?;
    #[cfg(target_os = "macos")]
    help.set_as_help_menu_for_nsapp()?;

    Menu::with_items(
        app,
        &[
            &Submenu::with_items(
                app,
                "Statim",
                true,
                &[
                    &about(app)?,
                    #[cfg(feature = "updater")]
                    &check_for_updates(app)?,
                    &separator(app)?,
                    &page(app, "settings", "Settings…", Some("CmdOrCtrl+,"))?,
                    &separator(app)?,
                    &PredefinedMenuItem::services(app, None)?,
                    &separator(app)?,
                    &PredefinedMenuItem::hide(app, Some("Hide Statim"))?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::show_all(app, None)?,
                    &separator(app)?,
                    &PredefinedMenuItem::quit(app, Some("Quit Statim"))?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "File",
                true,
                &[
                    &new_message,
                    &new_group,
                    &separator(app)?,
                    &PredefinedMenuItem::close_window(app, None)?,
                ],
            )?,
            &edit(app)?,
            &Submenu::with_items(
                app,
                "View",
                true,
                &[&PredefinedMenuItem::fullscreen(
                    app,
                    Some("Enter Full Screen"),
                )?],
            )?,
            &go(app)?,
            &Submenu::with_items(
                app,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(app, None)?,
                    &PredefinedMenuItem::maximize(app, None)?,
                    &separator(app)?,
                    &MenuItem::with_id(app, SHOW, "Statim", true, Some("CmdOrCtrl+0"))?,
                    &separator(app)?,
                    &PredefinedMenuItem::bring_all_to_front(app, None)?,
                ],
            )?,
            &help,
        ],
    )
}

/// Windows and Linux have no app menu, so Settings and Quit move to File and
/// About to Help. Close and Quit are our own items because GTK has neither.
fn window_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let [new_message, new_group] = new_chat_items(app)?;
    let [guide, report] = help_items(app)?;

    Menu::with_items(
        app,
        &[
            &Submenu::with_items(
                app,
                "File",
                true,
                &[
                    &new_message,
                    &new_group,
                    &separator(app)?,
                    &page(app, "settings", "Settings…", Some("CmdOrCtrl+,"))?,
                    &separator(app)?,
                    &MenuItem::with_id(app, CLOSE, "Close Window", true, Some("CmdOrCtrl+W"))?,
                    &MenuItem::with_id(app, EXIT, "Quit Statim", true, Some("CmdOrCtrl+Q"))?,
                ],
            )?,
            &edit(app)?,
            &go(app)?,
            &Submenu::with_items(
                app,
                "Help",
                true,
                &[
                    &guide,
                    &report,
                    &separator(app)?,
                    #[cfg(feature = "updater")]
                    &check_for_updates(app)?,
                    #[cfg(feature = "updater")]
                    &separator(app)?,
                    &about(app)?,
                ],
            )?,
        ],
    )
}

fn peek(app: &AppHandle, show: bool) {
    if !app.state::<MenuBar>().hidden.load(Ordering::Relaxed) {
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = if show {
            window.show_menu()
        } else {
            window.hide_menu()
        };
    }
}

#[tauri::command]
pub fn menu_bar_hidden(state: tauri::State<'_, MenuBar>) -> bool {
    state.hidden.load(Ordering::Relaxed)
}

#[tauri::command]
pub fn menu_bar_set_hidden(
    app: AppHandle,
    state: tauri::State<'_, MenuBar>,
    hidden: bool,
) -> Result<(), String> {
    let flag = app_data_dir(&app)?.join(HIDDEN_FLAG);
    if hidden {
        write_private(&flag, "")?;
    } else if flag.exists() {
        std::fs::remove_file(&flag).map_err(|e| e.to_string())?;
    }
    state.hidden.store(hidden, Ordering::Relaxed);
    if let Some(window) = app.get_webview_window("main") {
        if hidden {
            window.hide_menu()
        } else {
            window.show_menu()
        }
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Alt shows a hidden menu bar until the next click.
#[tauri::command]
pub fn menu_bar_peek(app: AppHandle, show: bool) {
    peek(&app, show);
}
