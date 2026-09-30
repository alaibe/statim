use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{include_image, AppHandle, Runtime};

use crate::cli;

const ID: &str = "main";

#[cfg(target_os = "macos")]
const ICON: Image<'static> = include_image!("icons/tray/template.png");
#[cfg(not(target_os = "macos"))]
const ICON: Image<'static> = include_image!("icons/tray/icon.png");
#[cfg(not(target_os = "macos"))]
const UNREAD: Image<'static> = include_image!("icons/tray/unread.png");

/// With the window closed, this is where the app is: Open brings it back and
/// Quit is the way out on Windows and Linux, which have no app menu.
pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "open", "Open Statim", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quit", "Quit Statim", true, None::<&str>)?,
        ],
    )?;
    TrayIconBuilder::with_id(ID)
        .icon(ICON)
        .icon_as_template(true)
        .tooltip("Statim")
        .menu(&menu)
        .show_menu_on_left_click(cfg!(target_os = "macos"))
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => cli::show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if cfg!(target_os = "macos") {
                return;
            }
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                cli::show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

/// The count shows beside the icon where the system draws text there (macOS,
/// some Linux desktops); elsewhere the icon gains a dot.
pub fn show_unread<R: Runtime>(app: &AppHandle<R>, count: i64) {
    let Some(tray) = app.tray_by_id(ID) else {
        return;
    };
    let unread = count > 0;
    let _ = tray.set_title(Some(if unread {
        count.to_string()
    } else {
        String::new()
    }));
    let _ = tray.set_tooltip(Some(if unread {
        format!("Statim: {count} unread")
    } else {
        "Statim".to_string()
    }));
    #[cfg(not(target_os = "macos"))]
    let _ = tray.set_icon(Some(if unread { UNREAD } else { ICON }));
}
