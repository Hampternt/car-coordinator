// Hide the console window in release builds on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Opens the native print dialog (WebView2). "Microsoft Print to PDF" gives a PDF.
#[tauri::command]
fn print_page(window: tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![print_page])
        .run(tauri::generate_context!())
        .expect("failed to start Car Coordinator");
}
