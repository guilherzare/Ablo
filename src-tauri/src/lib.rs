use std::io::Write;
use std::process::{Command, Stdio};

// Commande Tauri : appelle le backend Python et retourne la réponse JSON
#[tauri::command]
fn call_backend(method: String, params: serde_json::Value) -> Result<serde_json::Value, String> {
    let request = serde_json::json!({
        "method": method,
        "params": params,
        "id": 1
    });

    // CARGO_MANIFEST_DIR = src-tauri/ au moment de la compilation
    let backend_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("Impossible de trouver la racine du projet")
        .join("backend")
        .join("main.py");

    let mut child = Command::new("python3")
        .arg(&backend_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Impossible de démarrer le backend Python : {}", e))?;

    let stdin = child.stdin.as_mut()
        .ok_or("Impossible d'écrire sur stdin du backend")?;

    let request_str = serde_json::to_string(&request).unwrap() + "\n";
    stdin.write_all(request_str.as_bytes())
        .map_err(|e| e.to_string())?;

    let output = child.wait_with_output()
        .map_err(|e| e.to_string())?;

    let response_str = String::from_utf8(output.stdout)
        .map_err(|e| e.to_string())?;

    if response_str.trim().is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("Le backend n'a renvoyé aucune réponse. Erreur : {}", stderr));
    }

    serde_json::from_str(response_str.trim())
        .map_err(|e| format!("Réponse invalide du backend : {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![call_backend])
        .run(tauri::generate_context!())
        .expect("Erreur au démarrage de l'application Tauri");
}
