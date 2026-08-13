use serde::{Serialize, Deserialize};
use walkdir::WalkDir;
use std::path::Path;

#[derive(Serialize, Deserialize, Debug)]
pub struct MediaFile {
    pub name: String,
    pub path: String,
    pub file_type: String,
    pub size: u64,          // size in bytes
    pub modified: u64,      // unix timestamp seconds
    pub created: u64,       // unix timestamp seconds
}

#[tauri::command]
fn scan_bounce_folder(folder_path: String) -> Result<Vec<MediaFile>, String> {
    let mut files = Vec::new();
    let root = Path::new(&folder_path);

    if !root.exists() || !root.is_dir() {
        return Err("The provided path is not a valid directory.".into());
    }

    for entry in WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            if let Some(ext) = entry.path().extension().and_then(|e| e.to_str()) {
                let ext_lower = ext.to_lowercase();
                let file_type = match ext_lower.as_str() {
                    "als" => "project",
                    "wav" | "mp3" | "flac" | "aiff" => "audio",
                    _ => continue,
                };

                // Extract file metadata
                let metadata = entry.metadata().ok();
                let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
                
                let modified = metadata.as_ref()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);

                let created = metadata.as_ref()
                    .and_then(|m| m.created().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(modified);

                files.push(MediaFile {
                    name: entry.file_name().to_string_lossy().into_owned(),
                    path: entry.path().to_string_lossy().into_owned(),
                    file_type: file_type.to_string(),
                    size,
                    modified,
                    created,
                });
            }
        }
    }

    Ok(files)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_bounce_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}