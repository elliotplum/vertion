use notify_debouncer_mini::{new_debouncer, notify::RecursiveMode};
use std::{fs, path::PathBuf, sync::mpsc::channel, time::Duration};
use tauri::{AppHandle, Emitter, Manager};

const AUDIO_EXTENSIONS: &[&str] = &["wav", "aif", "aiff", "mp3", "flac"];

#[derive(Clone, serde::Serialize)]
pub struct ExportPayload {
    pub file_path: String,
    pub filename: String,
    pub suggested_project: String,
    pub suggested_version: String,
    pub timestamp: String,
}

pub fn start_watcher(app_handle: AppHandle, watch_dir: PathBuf) {
    std::thread::spawn(move || {
        let (tx, rx) = channel();
        let mut debouncer = new_debouncer(Duration::from_millis(1500), tx)
            .expect("Failed to initialize file debouncer");

        debouncer
            .watcher()
            .watch(&watch_dir, RecursiveMode::Recursive)
            .expect("Failed to start watching directory");

        for res in rx {
            match res {
                Ok(events) => {
                    for event in events {
                        let path = event.path;
                        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                            if AUDIO_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
                                if let Ok(meta) = fs::metadata(&path) {
                                    if meta.len() > 0 {
                                        trigger_export_popup(&app_handle, path);
                                    }
                                }
                            }
                        }
                    }
                }
                Err(err) => eprintln!("Watch error: {:?}", err),
            }
        }
    });
}

fn parse_export_metadata(filename: &str) -> (String, String) {
    let clean_name = filename.rsplit_once('.').map(|(n, _)| n).unwrap_or(filename);
    let parts: Vec<&str> = clean_name.split(&['_', '-'][..]).collect();

    if parts.len() > 1 {
        let version_tag = parts.last().unwrap().to_string();
        let project_name = parts[..parts.len() - 1].join(" ");
        (project_name, version_tag)
    } else {
        (clean_name.to_string(), "v1".to_string())
    }
}

fn trigger_export_popup(app: &AppHandle, path: PathBuf) {
    let file_path = path.to_string_lossy().to_string();
    let filename = path.file_name().unwrap_or_default().to_string_lossy().to_string();
    let (project, version) = parse_export_metadata(&filename);
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();

    let payload = ExportPayload {
        file_path,
        filename,
        suggested_project: project,
        suggested_version: version,
        timestamp: now,
    };

    let _ = app.emit("new-export-detected", payload);

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}