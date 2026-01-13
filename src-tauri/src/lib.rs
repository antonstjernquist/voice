mod audio;
mod transcription;

use audio::{convert_to_whisper_format, list_input_devices, AudioRecorder};
use parking_lot::Mutex;
use std::sync::mpsc::channel;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, RunEvent};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use transcription::{
    download_model, get_model_path, is_model_downloaded, ModelSize, WhisperTranscriber,
};

struct AppState {
    recorder: Mutex<Option<AudioRecorder>>,
    transcriber: Mutex<Option<WhisperTranscriber>>,
    is_recording: Mutex<bool>,
    selected_device: Mutex<Option<String>>,
    selected_model: Mutex<ModelSize>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            recorder: Mutex::new(None),
            transcriber: Mutex::new(None),
            is_recording: Mutex::new(false),
            selected_device: Mutex::new(None),
            selected_model: Mutex::new(ModelSize::Small),
        }
    }
}

#[tauri::command]
fn is_model_ready() -> bool {
    is_model_downloaded(ModelSize::Small)
}

#[tauri::command]
async fn download_whisper_model(app: AppHandle) -> Result<(), String> {
    let app_clone = app.clone();
    download_model(ModelSize::Small, move |downloaded, total| {
        let _ = app_clone.emit("download-progress", (downloaded, total));
    })
    .await?;

    let model_path = get_model_path(ModelSize::Small);
    let transcriber = WhisperTranscriber::new(&model_path)?;

    let state = app.state::<AppState>();
    *state.transcriber.lock() = Some(transcriber);

    Ok(())
}

#[tauri::command]
fn init_transcriber(app: AppHandle) -> Result<(), String> {
    let model_path = get_model_path(ModelSize::Small);
    if !model_path.exists() {
        return Err("Model not downloaded".to_string());
    }

    let transcriber = WhisperTranscriber::new(&model_path)?;
    let state = app.state::<AppState>();
    *state.transcriber.lock() = Some(transcriber);
    Ok(())
}

#[tauri::command]
fn start_recording(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();

    let mut is_recording = state.is_recording.lock();
    if *is_recording {
        return Ok(());
    }

    let mut recorder_lock = state.recorder.lock();
    if recorder_lock.is_none() {
        *recorder_lock = Some(AudioRecorder::new()?);
    }

    if let Some(recorder) = recorder_lock.as_ref() {
        recorder.start_recording(None)?;
        *is_recording = true;
    }

    Ok(())
}

#[tauri::command]
fn stop_recording_and_transcribe(app: AppHandle) -> Result<String, String> {
    let state = app.state::<AppState>();

    let samples = {
        let recorder_lock = state.recorder.lock();
        let mut is_recording = state.is_recording.lock();

        if !*is_recording {
            return Err("Not recording".to_string());
        }

        *is_recording = false;

        if let Some(recorder) = recorder_lock.as_ref() {
            let samples = recorder.stop_recording()?;
            let sample_rate = recorder.sample_rate();
            let channels = recorder.channels();
            convert_to_whisper_format(samples, sample_rate, channels)
        } else {
            return Err("No recorder available".to_string());
        }
    };

    if samples.is_empty() {
        return Err("No audio recorded".to_string());
    }

    let transcriber_lock = state.transcriber.lock();
    if let Some(transcriber) = transcriber_lock.as_ref() {
        transcriber.transcribe(&samples)
    } else {
        Err("Transcriber not initialized".to_string())
    }
}

#[tauri::command]
fn paste_text(app: AppHandle, text: String) -> Result<(), String> {
    app.clipboard()
        .write_text(&text)
        .map_err(|e| format!("Failed to copy to clipboard: {}", e))?;

    println!("Text copied to clipboard: {}", text);

    // Text is in clipboard - user can paste with Cmd+V
    // Auto-paste disabled for stability - requires accessibility permissions

    Ok(())
}

#[tauri::command]
fn get_audio_devices() -> Result<Vec<String>, String> {
    list_input_devices()
}

#[tauri::command]
fn get_current_device(app: AppHandle) -> Option<String> {
    let state = app.state::<AppState>();
    let device = state.selected_device.lock().clone();
    device
}

#[tauri::command]
fn set_audio_device(app: AppHandle, device_name: Option<String>) -> Result<(), String> {
    let state = app.state::<AppState>();
    *state.selected_device.lock() = device_name;
    *state.recorder.lock() = None;
    Ok(())
}

#[tauri::command]
fn get_model_info(app: AppHandle) -> (String, bool) {
    let state = app.state::<AppState>();
    let size = *state.selected_model.lock();
    let downloaded = is_model_downloaded(size);
    (format!("{:?}", size).to_lowercase(), downloaded)
}

#[tauri::command]
fn get_available_models() -> Vec<(String, String, bool)> {
    vec![
        ("small".to_string(), "Small (~500MB) - Fast".to_string(), is_model_downloaded(ModelSize::Small)),
        ("medium".to_string(), "Medium (~1.5GB) - Balanced".to_string(), is_model_downloaded(ModelSize::Medium)),
        ("large".to_string(), "Large (~3GB) - Accurate".to_string(), is_model_downloaded(ModelSize::Large)),
    ]
}

#[tauri::command]
async fn set_model_size(app: AppHandle, size: String) -> Result<(), String> {
    let model_size = match size.as_str() {
        "small" => ModelSize::Small,
        "medium" => ModelSize::Medium,
        "large" => ModelSize::Large,
        _ => return Err("Invalid model size".to_string()),
    };

    let state = app.state::<AppState>();
    *state.selected_model.lock() = model_size;

    if is_model_downloaded(model_size) {
        let model_path = get_model_path(model_size);
        let transcriber = WhisperTranscriber::new(&model_path)?;
        *state.transcriber.lock() = Some(transcriber);
    }

    Ok(())
}

#[tauri::command]
async fn download_model_size(app: AppHandle, size: String) -> Result<(), String> {
    let model_size = match size.as_str() {
        "small" => ModelSize::Small,
        "medium" => ModelSize::Medium,
        "large" => ModelSize::Large,
        _ => return Err("Invalid model size".to_string()),
    };

    let app_clone = app.clone();
    download_model(model_size, move |downloaded, total| {
        let _ = app_clone.emit("model-download-progress", (size.clone(), downloaded, total));
    })
    .await?;

    let state = app.state::<AppState>();
    if *state.selected_model.lock() == model_size {
        let model_path = get_model_path(model_size);
        let transcriber = WhisperTranscriber::new(&model_path)?;
        *state.transcriber.lock() = Some(transcriber);
    }

    Ok(())
}

#[tauri::command]
fn check_microphone_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        true
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[tauri::command]
fn check_accessibility_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let output = Command::new("osascript")
            .args(["-e", "tell application \"System Events\" to return true"])
            .output();
        output.map(|o| o.status.success()).unwrap_or(false)
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[tauri::command]
fn open_accessibility_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn open_microphone_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn close_settings_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.hide();
    }
}

fn setup_global_shortcut(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let shortcut = Shortcut::new(Some(Modifiers::SHIFT | Modifiers::META), Code::Space);

    app.global_shortcut().on_shortcut(shortcut, {
        let app = app.clone();
        move |_app_handle, _shortcut, event| {
            let state = app.state::<AppState>();

            match event.state {
                ShortcutState::Pressed => {
                    let is_recording = *state.is_recording.lock();
                    if !is_recording {
                        if let Some(window) = app.get_webview_window("overlay") {
                            let _ = window.show();
                            // Position at bottom center of screen
                            if let Ok(monitor) = window.current_monitor() {
                                if let Some(monitor) = monitor {
                                    let size = monitor.size();
                                    let scale = monitor.scale_factor();
                                    let win_width = 240.0;
                                    let win_height = 80.0;
                                    let x = (size.width as f64 / scale - win_width) / 2.0;
                                    let y = size.height as f64 / scale - win_height - 200.0;
                                    let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)));
                                }
                            }
                        }
                        let _ = app.emit("recording-started", ());
                        let app_clone = app.clone();
                        std::thread::spawn(move || {
                            let state = app_clone.state::<AppState>();
                            let mut recorder_lock = state.recorder.lock();
                            if recorder_lock.is_none() {
                                match AudioRecorder::new() {
                                    Ok(rec) => *recorder_lock = Some(rec),
                                    Err(e) => {
                                        eprintln!("Failed to create recorder: {}", e);
                                        return;
                                    }
                                }
                            }

                            let (level_tx, level_rx) = channel::<f32>();

                            if let Some(recorder) = recorder_lock.as_ref() {
                                if let Err(e) = recorder.start_recording(Some(level_tx)) {
                                    eprintln!("Failed to start recording: {}", e);
                                    return;
                                }
                                *state.is_recording.lock() = true;
                            }
                            drop(recorder_lock);

                            while let Ok(level) = level_rx.recv() {
                                let _ = app_clone.emit("audio-level", level);
                            }
                        });
                    }
                }
                ShortcutState::Released => {
                    let is_recording = *state.is_recording.lock();
                    if is_recording {
                        let _ = app.emit("recording-stopped", ());
                        let app_clone = app.clone();
                        std::thread::spawn(move || {
                            let _ = app_clone.emit("transcription-started", ());

                            match stop_recording_and_transcribe(app_clone.clone()) {
                                Ok(text) => {
                                    println!("Transcribed: {}", text);
                                    if !text.is_empty() && !text.contains("[BLANK_AUDIO]") {
                                        match paste_text(app_clone.clone(), text.clone()) {
                                            Ok(_) => println!("Copied to clipboard"),
                                            Err(e) => eprintln!("Clipboard error: {}", e),
                                        }
                                        let _ = app_clone.emit("transcription-complete", text);
                                    } else {
                                        let _ = app_clone.emit("transcription-error", "No speech detected".to_string());
                                    }
                                }
                                Err(e) => {
                                    eprintln!("Transcription error: {}", e);
                                    let _ = app_clone.emit("transcription-error", e);
                                }
                            }

                            // Hide window after a delay
                            std::thread::sleep(std::time::Duration::from_millis(1200));
                            if let Some(window) = app_clone.get_webview_window("overlay") {
                                let _ = window.hide();
                            }
                        });
                    }
                }
            }
        }
    })?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Set panic hook to log panics instead of crashing
    std::panic::set_hook(Box::new(|panic_info| {
        eprintln!("PANIC: {:?}", panic_info);
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            is_model_ready,
            download_whisper_model,
            init_transcriber,
            start_recording,
            stop_recording_and_transcribe,
            paste_text,
            get_audio_devices,
            get_current_device,
            set_audio_device,
            get_model_info,
            get_available_models,
            set_model_size,
            download_model_size,
            check_microphone_permission,
            check_accessibility_permission,
            open_accessibility_settings,
            open_microphone_settings,
            close_settings_window,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // Create system tray menu
            let settings_item = MenuItem::with_id(app, "settings", "Settings...", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Voice", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&settings_item, &separator, &quit_item])?;

            // Create system tray
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("Voice - ⇧⌘Space to record")
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "settings" => {
                            if let Some(window) = app.get_webview_window("settings") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            // Load transcriber if model exists
            if is_model_downloaded(ModelSize::Small) {
                let model_path = get_model_path(ModelSize::Small);
                match WhisperTranscriber::new(&model_path) {
                    Ok(transcriber) => {
                        let state = handle.state::<AppState>();
                        *state.transcriber.lock() = Some(transcriber);
                        println!("Whisper model loaded successfully");
                    }
                    Err(e) => {
                        eprintln!("Failed to load Whisper model: {}", e);
                    }
                }
            } else {
                println!("Whisper model not found, will download on first use");
            }

            // Setup global shortcut
            if let Err(e) = setup_global_shortcut(&handle) {
                eprintln!("Failed to setup global shortcut: {}", e);
            } else {
                println!("Global shortcut registered: ⇧⌘Space");
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}
