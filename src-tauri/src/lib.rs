// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::fs::{create_dir_all, File};
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use tauri::{async_runtime::spawn, AppHandle, Emitter};

// for setup_custom_server
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;
use warp::{Filter, Rejection, Reply};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn compress_video(
    input_path: String,
    output_path: String,
    ffmpeg_path: String,
    compress_level: u32,
    app: AppHandle,
) -> Result<String, String> {
    // Lấy tổng thời lượng video bằng ffprobe
    let duration_output = Command::new(&ffmpeg_path)
        .args(["-i", &input_path, "-hide_banner"])
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| e.to_string())?;
    let stderr = String::from_utf8_lossy(&duration_output.stderr);
    let mut total_seconds = 0.0;
    for line in stderr.lines() {
        if line.contains("Duration:") {
            // Ví dụ: Duration: 00:01:23.45
            if let Some(dur) = line.split("Duration:").nth(1) {
                let dur = dur.trim().split(',').next().unwrap_or("");
                let parts: Vec<&str> = dur.trim().split(':').collect();
                if parts.len() == 3 {
                    let h: f32 = parts[0].parse().unwrap_or(0.0);
                    let m: f32 = parts[1].parse().unwrap_or(0.0);
                    let s: f32 = parts[2].parse().unwrap_or(0.0);
                    total_seconds = h * 3600.0 + m * 60.0 + s;
                }
            }
        }
    }
    if total_seconds == 0.0 {
        return Err("cannot retrieve video duration".to_string());
    }

    // Chạy ffmpeg và đọc stderr để lấy tiến trình
    let mut cmd = Command::new(&ffmpeg_path);
    cmd.args([
        "-i",
        &input_path,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        &compress_level.to_string(),
        "-progress",
        "pipe:2",
        "-nostats",
        &output_path,
    ]);
    cmd.stderr(Stdio::piped());
    cmd.stdout(Stdio::null());
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let stderr = child.stderr.take().ok_or("Cannot get stderr")?;
    let reader = BufReader::new(stderr);
    let mut error_messages = Vec::new();
    for line in reader.lines() {
        if let Ok(line) = line {
            if line.starts_with("out_time=") {
                let time_val = line.replace("out_time=", "");
                // time_val dạng 00:00:12.34
                let parts: Vec<&str> = time_val.split(':').collect();
                if parts.len() == 3 {
                    let h: f32 = parts[0].parse().unwrap_or(0.0);
                    let m: f32 = parts[1].parse().unwrap_or(0.0);
                    let s: f32 = parts[2].parse().unwrap_or(0.0);
                    let cur_sec = h * 3600.0 + m * 60.0 + s;
                    let percent = ((cur_sec / total_seconds) * 100.0).min(100.0);
                    let _ = app.emit("compress_progress", percent as u8);
                }
            } else if line.contains("error") || line.contains("Error") || line.contains("ERROR") {
                error_messages.push(line.clone());
            }
        }
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    if status.success() {
        Ok("Video compression completed successfully".to_string())
    } else {
        let error_detail = if !error_messages.is_empty() {
            format!(
                "Failed to compress video. Error details: {}",
                error_messages.join("; ")
            )
        } else {
            format!(
                "Failed to compress video. Exit code: {}",
                status.code().unwrap_or(-1)
            )
        };
        Err(error_detail)
    }
}

#[tauri::command]
async fn merge_videos(
    video_paths: Vec<String>,
    output_path: String,
    ffmpeg_path: String,
    app: AppHandle,
) -> Result<String, String> {
    let handle = spawn(async move {
        // Create a temporary file to store the list of input files
        let temp_file = std::env::temp_dir().join("concat_list.txt");
        let mut file = File::create(&temp_file).map_err(|e| e.to_string())?;

        // Write file paths to the temporary file
        for path in &video_paths {
            writeln!(file, "file '{}'", path).map_err(|e| e.to_string())?;
        }

        let merge_ffmpeg_path = ffmpeg_path.clone();
        let mut cmd = Command::new(merge_ffmpeg_path.to_string());
        cmd.args([
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            temp_file.to_str().unwrap(),
            "-c",
            "copy",
            "-avoid_negative_ts",
            "make_zero",
            "-progress",
            "pipe:2",
            "-nostats",
            &output_path,
        ]);
        cmd.stderr(Stdio::piped());
        cmd.stdout(Stdio::null());
        let mut child = cmd.spawn().map_err(|e| e.to_string())?;
        let stderr = child.stderr.take().ok_or("Failed to get stderr")?;
        let reader = BufReader::new(stderr);
        let mut error_messages = Vec::new();
        for line in reader.lines() {
            if let Ok(line) = line {
                if line.starts_with("out_time=") {
                    let time_val = line.replace("out_time=", "");
                    let parts: Vec<&str> = time_val.split(':').collect();
                    if parts.len() == 3 {
                        let h: f32 = parts[0].parse().unwrap_or(0.0);
                        let m: f32 = parts[1].parse().unwrap_or(0.0);
                        let s: f32 = parts[2].parse().unwrap_or(0.0);
                        let cur_sec = h * 3600.0 + m * 60.0 + s;
                        // For merging, we don't know total duration, so just emit current time
                        let _ = app.emit("merge_progress", cur_sec as u32);
                    }
                } else if line.contains("error") || line.contains("Error") || line.contains("ERROR")
                {
                    error_messages.push(line.clone());
                }
            }
        }
        let status = child.wait().map_err(|e| e.to_string())?;
        // Clean up temporary file
        std::fs::remove_file(temp_file).ok();
        if status.success() {
            Ok("Videos merged successfully".to_string())
        } else {
            let error_detail = if !error_messages.is_empty() {
                format!(
                    "Failed to merge videos. Error details: {}",
                    error_messages.join("; ")
                )
            } else {
                format!(
                    "Failed to merge videos. Exit code: {}",
                    status.code().unwrap_or(-1)
                )
            };
            Err(error_detail)
        }
    });
    handle.await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn split_video(
    input_path: String,
    output_pattern: String,
    ffmpeg_path: String,
    by_time: bool,
    unit: Option<String>, // Only used if by_time = true
    value: u32,           // Either duration (time) or parts count
    app: AppHandle,
) -> Result<String, String> {
    let handle = spawn(async move {
        // Ensure output folder exists
        if let Some(parent) = std::path::Path::new(&output_pattern).parent() {
            if let Err(e) = create_dir_all(parent) {
                return Err(format!("Cannot create output folder: {}", e));
            }
        }

        // Get total video duration in seconds
        let probe_output = Command::new(&ffmpeg_path)
            .args(["-i", &input_path, "-hide_banner"])
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| e.to_string())?;

        let stderr_str = String::from_utf8_lossy(&probe_output.stderr);
        let mut total_seconds: f32 = 0.0;
        for line in stderr_str.lines() {
            if line.contains("Duration:") {
                if let Some(dur) = line.split("Duration:").nth(1) {
                    let dur = dur.trim().split(',').next().unwrap_or("");
                    let parts: Vec<&str> = dur.trim().split(':').collect();
                    if parts.len() == 3 {
                        let h: f32 = parts[0].parse().unwrap_or(0.0);
                        let m: f32 = parts[1].parse().unwrap_or(0.0);
                        let s: f32 = parts[2].parse().unwrap_or(0.0);
                        total_seconds = h * 3600.0 + m * 60.0 + s;
                    }
                }
            }
        }
        if total_seconds <= 0.0 {
            return Err("Could not detect video duration".to_string());
        }

        // Calculate segment_time
        let mut segment_time = 5.0;
        if by_time {
            let multiplier = match unit.unwrap_or("seconds".to_string()).as_str() {
                "minutes" => 60.0,
                "hours" => 3600.0,
                _ => 1.0,
            };
            segment_time = value as f32 * multiplier;
        } else {
            // Split by parts
            if value < 2 {
                return Err("Parts count must be at least 2".to_string());
            }
            segment_time = total_seconds / value as f32;
        }

        // Check for audio
        let probe_output2 = Command::new(&ffmpeg_path)
            .args(["-i", &input_path, "-hide_banner", "-f", "null", "-"])
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| e.to_string())?;
        let probe_stderr = String::from_utf8_lossy(&probe_output2.stderr);
        let has_audio = probe_stderr.contains("Audio:");

        // Build ffmpeg command
        let mut cmd = Command::new(ffmpeg_path.clone());
        if has_audio {
            cmd.args([
                "-i",
                &input_path,
                "-map",
                "0:v:0",
                "-map",
                "0:a:0",
                "-c:v",
                "copy",
                "-c:a",
                "copy",
                "-segment_time",
                &segment_time.to_string(),
                "-reset_timestamps",
                "1",
                "-segment_time_delta",
                "0.1",
                "-avoid_negative_ts",
                "make_zero",
                "-f",
                "segment",
                "-progress",
                "pipe:2",
                "-nostats",
                &output_pattern,
            ]);
        } else {
            cmd.args([
                "-i",
                &input_path,
                "-map",
                "0:v:0",
                "-c:v",
                "copy",
                "-segment_time",
                &segment_time.to_string(),
                "-reset_timestamps",
                "1",
                "-segment_time_delta",
                "0.1",
                "-avoid_negative_ts",
                "make_zero",
                "-f",
                "segment",
                "-progress",
                "pipe:2",
                "-nostats",
                &output_pattern,
            ]);
        }

        cmd.stderr(Stdio::piped());
        cmd.stdout(Stdio::null());
        let mut child = cmd.spawn().map_err(|e| e.to_string())?;
        let stderr = child.stderr.take().ok_or("Failed to get stderr")?;
        let reader = BufReader::new(stderr);
        let mut error_messages = Vec::new();

        for line in reader.lines() {
            if let Ok(line) = line {
                if line.starts_with("out_time=") {
                    let time_val = line.replace("out_time=", "");
                    let parts: Vec<&str> = time_val.split(':').collect();
                    if parts.len() == 3 {
                        let h: f32 = parts[0].parse().unwrap_or(0.0);
                        let m: f32 = parts[1].parse().unwrap_or(0.0);
                        let s: f32 = parts[2].parse().unwrap_or(0.0);
                        let cur_sec = h * 3600.0 + m * 60.0 + s;
                        let percent = ((cur_sec / total_seconds) * 100.0).min(100.0);
                        let _ = app.emit("split_progress", percent as u8);
                    }
                } else if line.to_lowercase().contains("error") {
                    error_messages.push(line.clone());
                }
            }
        }

        let status = child.wait().map_err(|e| e.to_string())?;
        if status.success() {
            Ok("Video split completed successfully".to_string())
        } else {
            let error_detail = if !error_messages.is_empty() {
                format!(
                    "Failed to split video. Error details: {}",
                    error_messages.join("; ")
                )
            } else {
                format!(
                    "Failed to split video. Exit code: {}",
                    status.code().unwrap_or(-1)
                )
            };
            Err(error_detail)
        }
    });
    handle.await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn unique_output_subdir(base_dir: String, filename: String) -> String {
    use std::path::Path;
    let mut counter = 1;
    let mut candidate = format!("{}/{}", base_dir, filename);
    while Path::new(&candidate).exists() {
        candidate = format!("{}/{}_{}", base_dir, filename, counter);
        counter += 1;
    }
    candidate
}

#[tauri::command]
fn unique_output_filename(base_dir: String, stem: String, ext: String) -> String {
    use std::path::Path;
    let normalized_ext = if ext.starts_with('.') {
        ext
    } else {
        format!(".{}", ext)
    };
    let mut counter = 1;
    let mut candidate = format!("{}/{}{}", base_dir, stem, &normalized_ext);
    while Path::new(&candidate).exists() {
        candidate = format!("{}/{}_{}{}", base_dir, stem, counter, &normalized_ext);
        counter += 1;
    }
    candidate
}

#[tauri::command]
async fn write_file(path: String, contents: Vec<u8>) -> Result<String, String> {
    use std::fs;
    use std::path::Path;

    // Ensure the parent directory exists
    if let Some(parent) = Path::new(&path).parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            return Err(format!("Failed to create directory: {}", e));
        }
    }

    // Write the file
    match fs::write(&path, contents) {
        Ok(_) => Ok(format!("File written successfully to: {}", path)),
        Err(e) => Err(format!("Failed to write file: {}", e)),
    }
}

#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    use std::fs;
    fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
async fn trim_video(
    input_path: String,
    output_path: String,
    ffmpeg_path: String,
    start_time: String, // Format: "HH:MM:SS.mmm"
    end_time: String,   // Format: "HH:MM:SS.mmm"
    app: AppHandle,
) -> Result<String, String> {
    let handle = spawn(async move {
        // Ensure output folder exists
        if let Some(parent) = std::path::Path::new(&output_path).parent() {
            if let Err(e) = create_dir_all(parent) {
                return Err(format!("Cannot create output folder: {}", e));
            }
        }

        // Get total video duration in seconds
        let probe_output = Command::new(&ffmpeg_path)
            .args(["-i", &input_path, "-hide_banner", "-f", "null", "_"])
            .stderr(Stdio::piped())
            .stdout(Stdio::null()) // Suppress stdout
            .output()
            .map_err(|e| e.to_string())?;

        let stderr_str = String::from_utf8_lossy(&probe_output.stderr);
        let mut total_seconds: f32 = 0.0;
        for line in stderr_str.lines() {
            if line.contains("Duration:") {
                if let Some(dur) = line.split("Duration:").nth(1) {
                    let dur = dur.trim().split(',').next().unwrap_or("");
                    let parts: Vec<&str> = dur.trim().split(':').collect();
                    if parts.len() == 3 {
                        let h: f32 = parts[0].parse().unwrap_or(0.0);
                        let m: f32 = parts[1].parse().unwrap_or(0.0);
                        let s: f32 = parts[2].parse().unwrap_or(0.0);
                        total_seconds = h * 3600.0 + m * 60.0 + s;
                    }
                }
            }
        }
        if total_seconds <= 0.0 {
            return Err("Could not detect video duration".to_string());
        }

        // Calculate trim duration
        let parse_time = |time_str: &str| -> Result<f32, String> {
            let parts: Vec<&str> = time_str.split(':').collect();
            if parts.len() != 3 {
                return Err(format!("Invalid time format: {}", time_str));
            }
            let h: f32 = parts[0]
                .parse()
                .map_err(|_| format!("Invalid hour: {}", parts[0]))?;
            let m: f32 = parts[1]
                .parse()
                .map_err(|_| format!("Invalid minute: {}", parts[1]))?;
            let s: f32 = parts[2]
                .parse()
                .map_err(|_| format!("Invalid second: {}", parts[2]))?;
            Ok(h * 3600.0 + m * 60.0 + s)
        };

        let start_seconds = parse_time(&start_time)?;
        let end_seconds = parse_time(&end_time)?;

        if start_seconds >= end_seconds {
            return Err("Start time must be before end time".to_string());
        }

        if end_seconds > total_seconds {
            return Err(format!(
                "End time exceeds video duration ({:.2}s)",
                total_seconds
            ));
        }

        let duration = end_seconds - start_seconds;

        // Build ffmpeg command for trimming
        let mut cmd = Command::new(&ffmpeg_path);
        cmd.args([
            "-ss",
            &start_time,
            "-i",
            &input_path,
            "-t",
            &duration.to_string(),
            "-c:v",
            "copy", // Use copy codec for faster processing
            "-c:a",
            "copy", // Copy audio without re-encoding
            "-avoid_negative_ts",
            "make_zero",
            "-progress",
            "pipe:2",
            "-nostats",
            &output_path,
        ]);

        cmd.stderr(Stdio::piped());
        cmd.stdout(Stdio::null());
        let mut child = cmd.spawn().map_err(|e| e.to_string())?;
        let stderr = child.stderr.take().ok_or("Failed to get stderr")?;
        let reader = BufReader::new(stderr);
        let mut error_messages = Vec::new();

        for line in reader.lines() {
            if let Ok(line) = line {
                if line.starts_with("out_time=") {
                    let time_val = line.replace("out_time=", "");
                    let parts: Vec<&str> = time_val.split(':').collect();
                    if parts.len() == 3 {
                        let h: f32 = parts[0].parse().unwrap_or(0.0);
                        let m: f32 = parts[1].parse().unwrap_or(0.0);
                        let s: f32 = parts[2].parse().unwrap_or(0.0);
                        let cur_sec = h * 3600.0 + m * 60.0 + s;
                        let percent = ((cur_sec / duration) * 100.0).min(100.0);
                        let _ = app.emit("trim_progress", percent as u8);
                    }
                } else if line.to_lowercase().contains("error") {
                    error_messages.push(line.clone());
                }
            }
        }

        let status = child.wait().map_err(|e| e.to_string())?;
        if status.success() {
            Ok("Video trim completed successfully".to_string())
        } else {
            let error_detail = if !error_messages.is_empty() {
                format!(
                    "Failed to trim video. Error details: {}",
                    error_messages.join("; ")
                )
            } else {
                format!(
                    "Failed to trim video. Exit code: {}",
                    status.code().unwrap_or(-1)
                )
            };
            Err(error_detail)
        }
    });
    handle.await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn delete_temp_file(path: String) -> Result<(), String> {
    fs::remove_file(&path).map_err(|e| e.to_string())?;
    Ok(())
}

// Configuration
const PORT: u16 = 34012;

#[derive(Debug, Serialize)]
struct UploadResponse {
    url: String,
    temp_path: String,
}

// Global state to manage dynamic static file serving
#[derive(Default)]
struct ServerState {
    current_static_path: Mutex<PathBuf>,
    server_ready: Mutex<bool>,
}

type SharedState = Arc<ServerState>;

#[tauri::command]
async fn setup_custom_server(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, SharedState>,
) -> Result<(), String> {
    // Get system temp directory
    let temp_dir = std::env::temp_dir();

    // Create a subdirectory for our app in temp
    let app_temp_dir = temp_dir.join("tauri-video-server");
    tokio::fs::create_dir_all(&app_temp_dir)
        .await
        .map_err(|e| format!("Failed to create temp directory: {}", e))?;

    // Initialize the state with temp directory
    {
        let mut current_path = state.current_static_path.lock();
        *current_path = app_temp_dir.clone();

        let mut server_ready = state.server_ready.lock();
        *server_ready = true;
    }

    // Clone the state for the server task
    let state_clone = state.inner().clone();

    // Start the server in a background task
    tokio::spawn(async move {
        if let Err(e) = start_server(state_clone, app_temp_dir).await {
            eprintln!("Server error: {}", e);
        }
    });

    println!(
        "Custom server setup complete with temp directory: {:?}",
        std::env::temp_dir()
    );
    Ok(())
}

#[tauri::command]
async fn upload_video(
    video_uri: String,
    state: tauri::State<'_, SharedState>,
) -> Result<UploadResponse, String> {
    println!("Received upload request - video_uri: {}", video_uri);

    // Check if server is ready
    let server_ready = {
        let ready = state.server_ready.lock();
        *ready
    };

    if !server_ready {
        return Err("Server is not ready yet. Please call setup_custom_server first.".to_string());
    }

    // Get the current static path (temp directory)
    let temp_dir = {
        let current_path = state.current_static_path.lock();
        current_path.clone()
    };

    // Get file extension from original file
    let source_path = PathBuf::from(&video_uri);
    let extension = source_path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("mp4"); // Default to mp4 if no extension

    // Create consistent filename: temp_video_file_for_browser.{ext}
    let new_filename = format!("temp_video_file_for_browser.{}", extension);
    let dest_path = temp_dir.join(&new_filename);

    // Check if source file exists
    if !source_path.exists() {
        return Err(format!("Source file does not exist: {}", video_uri));
    }

    // Copy the file (this will automatically overwrite if exists)
    tokio::fs::copy(&source_path, &dest_path)
        .await
        .map_err(|e| format!("Failed to copy file to temp directory: {}", e))?;

    println!("Copied file from {:?} to {:?}", source_path, dest_path);

    // Construct the file URL
    let file_url = format!("http://localhost:{}/{}", PORT, new_filename);

    Ok(UploadResponse {
        url: file_url,
        temp_path: dest_path.to_string_lossy().to_string(),
    })
}

async fn start_server(
    state: SharedState,
    temp_dir: PathBuf,
) -> Result<(), Box<dyn std::error::Error>> {
    // CORS setup
    let cors = warp::cors()
        .allow_any_origin()
        .allow_methods(vec!["GET", "POST", "OPTIONS"])
        .allow_headers(vec!["Content-Type"]);

    // Dynamic static file serving
    let static_files = warp::get()
        .and(warp::path::full())
        .and(with_state(state.clone()))
        .and_then(serve_static_file);

    // Combine routes
    let routes = static_files.with(cors).with(warp::log("custom_server"));

    println!("Server listening on port {}", PORT);
    println!("Serving files from temp directory: {:?}", temp_dir);

    warp::serve(routes).run(([127, 0, 0, 1], PORT)).await;

    Ok(())
}

// Handler for serving static files from the dynamic path
async fn serve_static_file(
    path: warp::path::FullPath,
    state: SharedState,
) -> Result<Box<dyn Reply>, Rejection> {
    let current_path = {
        let path_guard = state.current_static_path.lock();
        path_guard.clone()
    };

    // Get the requested file path
    let requested_file = path.as_str().trim_start_matches('/');
    if requested_file.is_empty() {
        return Ok(Box::new(warp::reply::with_status(
            "Not Found".to_string(),
            warp::http::StatusCode::NOT_FOUND,
        )));
    }

    let file_path = current_path.join(requested_file);

    // Check if file exists and is within the allowed directory
    if !file_path.exists() || !file_path.is_file() {
        return Ok(Box::new(warp::reply::with_status(
            "Not Found".to_string(),
            warp::http::StatusCode::NOT_FOUND,
        )));
    }

    // Security check: ensure the file is within the current static path
    if !file_path.starts_with(&current_path) {
        return Ok(Box::new(warp::reply::with_status(
            "Forbidden".to_string(),
            warp::http::StatusCode::FORBIDDEN,
        )));
    }

    // Serve the file
    match tokio::fs::read(&file_path).await {
        Ok(content) => {
            // Content type detection
            let content_type = if let Some(extension) = file_path.extension() {
                match extension.to_str().unwrap_or("") {
                    "mp4" | "m4v" => "video/mp4",
                    "avi" => "video/x-msvideo",
                    "mov" => "video/quicktime",
                    "mkv" => "video/x-matroska",
                    "webm" => "video/webm",
                    "jpg" | "jpeg" => "image/jpeg",
                    "png" => "image/png",
                    "gif" => "image/gif",
                    _ => "application/octet-stream",
                }
            } else {
                "application/octet-stream"
            };

            let reply = warp::reply::with_header(content, "Content-Type", content_type);
            Ok(Box::new(reply))
        }
        Err(_) => Ok(Box::new(warp::reply::with_status(
            "Internal Server Error".to_string(),
            warp::http::StatusCode::INTERNAL_SERVER_ERROR,
        ))),
    }
}

// Helper function to inject state into filters
fn with_state(
    state: SharedState,
) -> impl Filter<Extract = (SharedState,), Error = std::convert::Infallible> + Clone {
    warp::any().map(move || state.clone())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Create the shared state
    let server_state = Arc::new(ServerState::default());

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(server_state)
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            compress_video,
            merge_videos,
            split_video,
            trim_video,
            unique_output_subdir,
            unique_output_filename,
            write_file,
            read_file_bytes,
            delete_temp_file,
            setup_custom_server,
            upload_video,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| match event {
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                // Cleanup temp video files for displaying in html <video />
                let temp_dir = std::env::temp_dir().join("tauri-video-server");
                if temp_dir.exists() {
                    println!("🧹 Cleaning up temp video files...");

                    // Delete all temp video files
                    if let Ok(entries) = fs::read_dir(&temp_dir) {
                        for entry in entries.flatten() {
                            if let Some(name) = entry.file_name().to_str() {
                                if name.starts_with("temp_video_file_for_browser") {
                                    let path = entry.path();
                                    if fs::remove_file(&path).is_ok() {
                                        println!("🗑️ Deleted temp video file: {:?}", path);
                                    } else {
                                        eprintln!(
                                            "❌ Failed to delete temp video file: {:?}",
                                            path
                                        );
                                    }
                                }
                            }
                        }

                        // Try to remove the empty directory (optional)
                        let _ = fs::remove_dir(&temp_dir);
                    }
                }
            }
            _ => {}
        });
}
