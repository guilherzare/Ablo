use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::sync::mpsc::{self, Sender};
use tauri::{Emitter, Manager};

// ---------- Commande Python ----------

fn backend_command() -> Result<Command, String> {
    if cfg!(debug_assertions) {
        let script = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("Impossible de trouver la racine du projet")
            .join("backend")
            .join("main.py");
        let mut cmd = Command::new("python3");
        cmd.arg(script);
        Ok(cmd)
    } else {
        let exe_dir = std::env::current_exe()
            .map_err(|e| e.to_string())?
            .parent()
            .ok_or_else(|| "Impossible de localiser le dossier de l'application".to_string())?
            .to_path_buf();
        let binary_name = if cfg!(target_os = "windows") {
            "ablo-backend.exe"
        } else {
            "ablo-backend"
        };
        let binary_path = exe_dir.join(binary_name);
        if !binary_path.exists() {
            let dir_contents = std::fs::read_dir(&exe_dir)
                .map(|entries| {
                    entries
                        .filter_map(|e| e.ok())
                        .map(|e| e.file_name().to_string_lossy().to_string())
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_else(|_| "impossible de lire le dossier".to_string());
            return Err(format!(
                "Backend introuvable : {}  |  Fichiers présents dans {} : [{}]",
                binary_path.display(),
                exe_dir.display(),
                dir_contents
            ));
        }
        Ok(Command::new(binary_path))
    }
}

fn spawn_backend() -> Result<std::process::Child, String> {
    let mut cmd = backend_command()?;
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    cmd.spawn()
        .map_err(|e| format!("Impossible de démarrer le backend : {}", e))
}

// ---------- Backend persistant (thread dédié) ----------

struct BackendHandle {
    stdin: std::process::ChildStdin,
    stdout: BufReader<std::process::ChildStdout>,
}

enum BackendRequest {
    Simple {
        payload: String,
        tx: mpsc::SyncSender<Result<serde_json::Value, String>>,
    },
    Stream {
        payload: String,
        window: tauri::WebviewWindow,
        event_name: &'static str,
    },
}

struct AppState {
    tx: Sender<BackendRequest>,
}

fn run_backend_thread(mut handle: BackendHandle, rx: mpsc::Receiver<BackendRequest>) {
    // Attendre le signal {"type":"ready"} avant tout — absorbe les sorties
    // parasites des bibliothèques natives (ctranslate2, llama_cpp) au démarrage.
    loop {
        let mut line = String::new();
        match handle.stdout.read_line(&mut line) {
            Ok(0) | Err(_) => {
                // Python a quitté avant d'envoyer "ready" — vider la file avec des erreurs
                for req in rx {
                    match req {
                        BackendRequest::Simple { tx, .. } => {
                            let _ = tx.send(Err("Le backend a quitté au démarrage".to_string()));
                        }
                        BackendRequest::Stream { window, event_name, .. } => {
                            let _ = window.emit(
                                event_name,
                                serde_json::json!({"type": "error", "message": "Le backend a quitté au démarrage"}),
                            );
                        }
                    }
                }
                return;
            }
            Ok(_) => {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(line.trim()) {
                    if val.get("type").and_then(|t| t.as_str()) == Some("ready") {
                        break;
                    }
                }
            }
        }
    }

    for req in rx {
        match req {
            BackendRequest::Simple { payload, tx } => {
                let result = (|| -> Result<serde_json::Value, String> {
                    handle
                        .stdin
                        .write_all(payload.as_bytes())
                        .map_err(|e| e.to_string())?;
                    let mut line = String::new();
                    handle
                        .stdout
                        .read_line(&mut line)
                        .map_err(|e| e.to_string())?;
                    if line.trim().is_empty() {
                        return Err("Aucune réponse du backend".to_string());
                    }
                    serde_json::from_str(line.trim())
                        .map_err(|e| format!("Réponse invalide : {}", e))
                })();
                let _ = tx.send(result);
            }

            BackendRequest::Stream { payload, window, event_name } => {
                if let Err(e) = handle.stdin.write_all(payload.as_bytes()) {
                    let _ = window.emit(
                        event_name,
                        serde_json::json!({"type": "error", "message": e.to_string()}),
                    );
                    continue;
                }
                loop {
                    let mut line = String::new();
                    match handle.stdout.read_line(&mut line) {
                        Ok(0) | Err(_) => break,
                        Ok(_) => {}
                    }
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    if let Ok(event) = serde_json::from_str::<serde_json::Value>(trimmed) {
                        let ty = event
                            .get("type")
                            .and_then(|t| t.as_str())
                            .unwrap_or("");
                        let _ = window.emit(event_name, &event);
                        if ty == "complete" || ty == "error" {
                            break;
                        }
                    }
                }
            }
        }
    }
}

// ---------- Commandes Tauri ----------

#[tauri::command]
fn call_backend(
    state: tauri::State<AppState>,
    method: String,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let (tx, rx) = mpsc::sync_channel(1);
    let payload = format!(
        "{}\n",
        serde_json::json!({"method": method, "params": params, "id": 1})
    );
    state
        .tx
        .send(BackendRequest::Simple { payload, tx })
        .map_err(|_| "Backend non disponible".to_string())?;
    rx.recv()
        .map_err(|_| "Pas de réponse du backend".to_string())?
}

#[tauri::command]
fn start_model_download(
    state: tauri::State<AppState>,
    window: tauri::WebviewWindow,
) -> Result<(), String> {
    let payload = format!(
        "{}\n",
        serde_json::json!({"method": "download_models", "params": {}, "id": 1})
    );
    state
        .tx
        .send(BackendRequest::Stream { payload, window, event_name: "model-download-progress" })
        .map_err(|_| "Backend non disponible".to_string())
}

#[tauri::command]
fn start_transcription(
    state: tauri::State<AppState>,
    window: tauri::WebviewWindow,
    audio_path: String,
) -> Result<(), String> {
    let payload = format!(
        "{}\n",
        serde_json::json!({"method": "transcribe", "params": {"audio_path": audio_path}, "id": 1})
    );
    state
        .tx
        .send(BackendRequest::Stream { payload, window, event_name: "transcription-progress" })
        .map_err(|_| "Backend non disponible".to_string())
}

#[tauri::command]
fn start_generation(
    state: tauri::State<AppState>,
    window: tauri::WebviewWindow,
    text: String,
) -> Result<(), String> {
    let payload = format!(
        "{}\n",
        serde_json::json!({"method": "generate", "params": {"text": text}, "id": 1})
    );
    state
        .tx
        .send(BackendRequest::Stream { payload, window, event_name: "generation-progress" })
        .map_err(|_| "Backend non disponible".to_string())
}

#[tauri::command]
fn start_final_generation(
    state: tauri::State<AppState>,
    window: tauri::WebviewWindow,
    sessions: serde_json::Value,
    final_text: String,
) -> Result<(), String> {
    let payload = format!(
        "{}\n",
        serde_json::json!({"method": "generate_final", "params": {"sessions": sessions, "final_text": final_text}, "id": 1})
    );
    state
        .tx
        .send(BackendRequest::Stream { payload, window, event_name: "generation-progress" })
        .map_err(|_| "Backend non disponible".to_string())
}

#[tauri::command]
fn start_export(
    state: tauri::State<AppState>,
    window: tauri::WebviewWindow,
    sections: serde_json::Value,
    template_name: String,
    patient_name: String,
    patient_id: String,
) -> Result<(), String> {
    let payload = format!(
        "{}\n",
        serde_json::json!({"method": "export", "params": {"sections": sections, "template_name": template_name, "patient_name": patient_name, "patient_id": patient_id}, "id": 1})
    );
    state
        .tx
        .send(BackendRequest::Stream { payload, window, event_name: "export-progress" })
        .map_err(|_| "Backend non disponible".to_string())
}

#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    let cmd = if cfg!(target_os = "windows") {
        "explorer"
    } else if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };
    std::process::Command::new(cmd)
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------- Point d'entrée ----------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let mut child = spawn_backend()
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

            // Lit stderr dans un thread séparé pour éviter le blocage du pipe
            let stderr = child.stderr.take().unwrap();
            std::thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines().flatten() {
                    eprintln!("[backend] {}", line);
                }
            });

            let handle = BackendHandle {
                stdin: child.stdin.take().unwrap(),
                stdout: BufReader::new(child.stdout.take().unwrap()),
            };

            let (tx, rx) = mpsc::channel::<BackendRequest>();
            std::thread::spawn(move || run_backend_thread(handle, rx));
            app.manage(AppState { tx });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            call_backend,
            start_model_download,
            start_transcription,
            start_generation,
            start_final_generation,
            start_export,
            open_folder,
        ])
        .run(tauri::generate_context!())
        .expect("Erreur au démarrage de Ablo");
}
