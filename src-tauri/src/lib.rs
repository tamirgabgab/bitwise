//! The desktop app: the site in a window of its own, with real files.
//!
//! The web code does the work. This side only hands it the project file the
//! app was opened with, by a double click on a `.bitwise` file or from the
//! command line, and lets it pick, read and write files through the dialog
//! and file system plugins.

use serde::Serialize;
use std::path::Path;
use std::sync::Mutex;

/// A file larger than this is not a project; the web code refuses it anyway.
const MAX_FILE_BYTES: u64 = 64 * 1024 * 1024;

/// A project file the app was asked to open: its name and its text.
#[derive(Clone, Serialize)]
struct OpenedFile {
    name: String,
    text: String,
}

/// The file the app was opened with, until the web code takes it.
struct Opened(Mutex<Option<OpenedFile>>);

fn read(path: &Path) -> Option<OpenedFile> {
    if std::fs::metadata(path).ok()?.len() > MAX_FILE_BYTES {
        return None;
    }
    let text = std::fs::read_to_string(path).ok()?;
    let name = path.file_name()?.to_string_lossy().into_owned();
    Some(OpenedFile { name, text })
}

/// The file the app was opened with, once: a second call gives nothing.
#[tauri::command]
fn opened_file(state: tauri::State<'_, Opened>) -> Option<OpenedFile> {
    state.0.lock().ok()?.take()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Windows and Linux pass the file of a double click as an argument.
    let first = std::env::args()
        .skip(1)
        .find(|arg| !arg.starts_with('-'))
        .and_then(|arg| read(Path::new(&arg)));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(Opened(Mutex::new(first)))
        .invoke_handler(tauri::generate_handler![opened_file])
        .build(tauri::generate_context!())
        .expect("Bitwise could not start")
        .run(on_event);
}

/// macOS hands the file of a double click over as an event, even while the app runs.
#[cfg(target_os = "macos")]
fn on_event(app: &tauri::AppHandle, event: tauri::RunEvent) {
    use tauri::{Emitter, Manager};
    if let tauri::RunEvent::Opened { urls } = event {
        for url in urls {
            let Some(file) = url.to_file_path().ok().and_then(|path| read(&path)) else {
                continue;
            };
            if let Ok(mut held) = app.state::<Opened>().0.lock() {
                *held = Some(file.clone());
            }
            let _ = app.emit("open-file", file);
        }
    }
}

/// Windows and Linux pass the file as an argument instead; see `run`.
#[cfg(not(target_os = "macos"))]
fn on_event(_app: &tauri::AppHandle, _event: tauri::RunEvent) {}
