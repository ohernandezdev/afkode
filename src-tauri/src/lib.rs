use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{
    collections::HashMap,
    io::{Read, Write},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex, OnceLock,
    },
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};

const TOGGLE_SHORTCUT: &str = "alt+x";
const GHOST_SHORTCUT: &str = "alt+g";
const APPROVE_SHORTCUT: &str = "alt+a";
const PALETTE_SHORTCUT: &str = "alt+p";
const PALETTE_SHORTCUT_ALT: &str = "ctrl+alt+p";
const DND_SHORTCUT: &str = "alt+n";

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
struct PtyState {
    sessions: Mutex<HashMap<String, PtySession>>,
}

static CLICK_THROUGH: AtomicBool = AtomicBool::new(false);

/// Settings file injected into `claude --settings` so Claude Code hooks
/// report real agent state (tool use, permissions, turn end) back to us.
static HOOKS_FILE: OnceLock<PathBuf> = OnceLock::new();

/// Local HTTP listener that Claude Code hooks POST their JSON payload to.
/// Each request body is forwarded verbatim to the frontend as `agent-hook`.
fn start_hook_server(app: AppHandle) -> Option<u16> {
    for port in 4517..4527u16 {
        match tiny_http::Server::http(("127.0.0.1", port)) {
            Ok(server) => {
                std::thread::spawn(move || {
                    for mut req in server.incoming_requests() {
                        let mut body = String::new();
                        let _ = req.as_reader().read_to_string(&mut body);
                        if !body.is_empty() {
                            let _ = app.emit("agent-hook", body);
                        }
                        let _ = req.respond(tiny_http::Response::empty(200));
                    }
                });
                return Some(port);
            }
            Err(_) => continue,
        }
    }
    None
}

fn write_hooks_settings(dir: PathBuf, port: u16) -> std::io::Result<PathBuf> {
    let post = format!("curl -s -m 2 -X POST http://127.0.0.1:{port}/e --data-binary @-");
    let tool_hook = serde_json::json!([{
        "matcher": "*",
        "hooks": [{ "type": "command", "command": post }]
    }]);
    let plain_hook = serde_json::json!([{
        "hooks": [{ "type": "command", "command": post }]
    }]);
    let settings = serde_json::json!({
        "hooks": {
            "PreToolUse": tool_hook,
            "PostToolUse": tool_hook,
            "Notification": plain_hook,
            "UserPromptSubmit": plain_hook,
            "Stop": plain_hook
        }
    });
    std::fs::create_dir_all(&dir)?;
    let path = dir.join("afkode-hooks.json");
    std::fs::write(&path, serde_json::to_string_pretty(&settings)?)?;
    Ok(path)
}

#[derive(Clone, Serialize)]
struct PtyOutput<'a> {
    id: &'a str,
    data: &'a str,
}

#[derive(Clone, Serialize)]
struct PtyExit<'a> {
    id: &'a str,
}

/// Split `buf` at the largest prefix that is valid UTF-8. Returns the split
/// point and whether the remainder is just an incomplete trailing codepoint.
fn valid_utf8_split(buf: &[u8]) -> (usize, bool) {
    match std::str::from_utf8(buf) {
        Ok(_) => (buf.len(), true),
        Err(e) => match e.error_len() {
            // Invalid sequence in the middle: caller should flush lossily.
            Some(_) => (e.valid_up_to(), false),
            // Incomplete trailing codepoint: wait for more bytes.
            None => (e.valid_up_to(), true),
        },
    }
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn spawn_pty(
    app: AppHandle,
    state: State<'_, PtyState>,
    id: String,
    cmd: String,
    cwd: Option<String>,
    hooks: bool,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let trimmed = cmd.trim();
    let mut builder = if trimmed.is_empty() {
        let mut b = CommandBuilder::new("powershell.exe");
        b.args(["-NoLogo"]);
        b
    } else if trimmed == "claude" && hooks {
        // Opt-in integration: inject hook settings so the agent reports
        // real state (tool use, permission waits, turn end).
        let mut b = CommandBuilder::new("cmd.exe");
        if let Some(hooks_file) = HOOKS_FILE.get() {
            let hooks_file = hooks_file.to_string_lossy().to_string();
            b.args(["/c", "claude", "--settings", &hooks_file]);
        } else {
            b.args(["/c", "claude"]);
        }
        b
    } else {
        let mut b = CommandBuilder::new("cmd.exe");
        b.args(["/c", trimmed]);
        b
    };
    let dir = cwd
        .filter(|c| !c.trim().is_empty())
        .or_else(|| std::env::var("USERPROFILE").ok());
    if let Some(dir) = dir {
        builder.cwd(dir);
    }
    builder.env("TERM", "xterm-256color");
    builder.env("COLORTERM", "truecolor");
    builder.env("PATH", augmented_path());

    let child = pair
        .slave
        .spawn_command(builder)
        .map_err(|e| e.to_string())?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    state.sessions.lock().unwrap().insert(
        id.clone(),
        PtySession {
            master: pair.master,
            writer,
            child,
        },
    );

    // Reader thread: pump PTY output to the frontend as UTF-8 chunks.
    // 32 KiB reads coalesce bursty TUI redraws into fewer IPC events.
    std::thread::spawn(move || {
        let mut chunk = [0u8; 32768];
        let mut pending: Vec<u8> = Vec::new();
        loop {
            match reader.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    pending.extend_from_slice(&chunk[..n]);
                    let (split, clean) = valid_utf8_split(&pending);
                    if !clean {
                        let text = String::from_utf8_lossy(&pending).into_owned();
                        let _ = app.emit(
                            "pty-output",
                            PtyOutput {
                                id: &id,
                                data: &text,
                            },
                        );
                        pending.clear();
                    } else if split > 0 {
                        let text = std::str::from_utf8(&pending[..split]).unwrap().to_owned();
                        let _ = app.emit(
                            "pty-output",
                            PtyOutput {
                                id: &id,
                                data: &text,
                            },
                        );
                        pending.drain(..split);
                    }
                }
            }
        }
        if !pending.is_empty() {
            let text = String::from_utf8_lossy(&pending).into_owned();
            let _ = app.emit(
                "pty-output",
                PtyOutput {
                    id: &id,
                    data: &text,
                },
            );
        }
        if let Some(state) = app.try_state::<PtyState>() {
            state.sessions.lock().unwrap().remove(&id);
        }
        let _ = app.emit("pty-exit", PtyExit { id: &id });
    });

    Ok(())
}

#[tauri::command]
fn write_pty(state: State<'_, PtyState>, id: String, data: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    let session = sessions.get_mut(&id).ok_or("session not found")?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn resize_pty(state: State<'_, PtyState>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    let session = sessions.get(&id).ok_or("session not found")?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn kill_pty(state: State<'_, PtyState>, id: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(mut session) = sessions.remove(&id) {
        let _ = session.child.kill();
    }
    Ok(())
}

/// PATH plus tool locations that may have been installed after this process
/// started (Node.js, npm global bin) — lets the setup wizard work without an
/// app restart.
fn augmented_path() -> String {
    let mut path = std::env::var("PATH").unwrap_or_default();
    let mut extras: Vec<String> = vec!["C:\\Program Files\\nodejs".into()];
    if let Ok(appdata) = std::env::var("APPDATA") {
        extras.push(format!("{appdata}\\npm"));
    }
    for e in extras {
        if std::path::Path::new(&e).exists() && !path.to_lowercase().contains(&e.to_lowercase()) {
            path.push(';');
            path.push_str(&e);
        }
    }
    path
}

/// Save a base64 PNG from the clipboard to a temp file; returns its path so
/// the frontend can hand it to the agent (Claude Code reads image paths).
#[tauri::command]
fn save_temp_image(data: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|e| e.to_string())?;
    let dir = std::env::temp_dir().join("afkode-paste");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let path = dir.join(format!("paste-{stamp}.png"));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[derive(Serialize)]
struct DirEntry {
    name: String,
    dir: bool,
}

/// Complete a relative path fragment against a base directory (palette `@`
/// completion). Returns entries with the fragment's directory part prefixed.
#[tauri::command]
fn list_dir(base: String, prefix: String) -> Vec<DirEntry> {
    let frag = prefix.replace('/', "\\");
    let (sub, pre) = match frag.rfind('\\') {
        Some(i) => (&frag[..i + 1], &frag[i + 1..]),
        None => ("", frag.as_str()),
    };
    let dir = std::path::Path::new(&base).join(sub);
    let pre_lower = pre.to_lowercase();
    let mut out = Vec::new();
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || !name.to_lowercase().starts_with(&pre_lower) {
                continue;
            }
            let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
            out.push(DirEntry {
                name: format!("{}{}", sub.replace('\\', "/"), name),
                dir: is_dir,
            });
        }
    }
    out.sort_by(|a, b| b.dir.cmp(&a.dir).then(a.name.cmp(&b.name)));
    out.truncate(8);
    out
}

/// Check which CLIs are resolvable in PATH (handles .cmd shims via where.exe).
#[tauri::command]
fn detect_clis(names: Vec<String>) -> Vec<bool> {
    names
        .iter()
        .map(|n| {
            let mut c = std::process::Command::new("where.exe");
            c.arg(n);
            c.env("PATH", augmented_path());
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
            }
            c.output().map(|o| o.status.success()).unwrap_or(false)
        })
        .collect()
}

/// True when the foreground window is a fullscreen/borderless app that is
/// not ours — the "you are in a match" signal for do-not-disturb mode.
#[cfg(target_os = "windows")]
fn game_foreground() -> bool {
    use windows_sys::Win32::Foundation::RECT;
    use windows_sys::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetClassNameW, GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId,
    };
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return false;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == std::process::id() {
            return false;
        }
        let mut class_buf = [0u16; 64];
        let n = GetClassNameW(hwnd, class_buf.as_mut_ptr(), 64);
        let class = String::from_utf16_lossy(&class_buf[..n.max(0) as usize]);
        // The desktop shell also covers the monitor; it is not a game.
        if matches!(class.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd") {
            return false;
        }
        let mut rect = RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };
        if GetWindowRect(hwnd, &mut rect) == 0 {
            return false;
        }
        let hmon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut mi: MONITORINFO = std::mem::zeroed();
        mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if GetMonitorInfoW(hmon, &mut mi) == 0 {
            return false;
        }
        let m = mi.rcMonitor;
        rect.left <= m.left && rect.top <= m.top && rect.right >= m.right && rect.bottom >= m.bottom
    }
}

#[cfg(not(target_os = "windows"))]
fn game_foreground() -> bool {
    false
}

/// Shrink memory while the overlay is hidden; restore on show. JS keeps
/// running either way — only caches/working set are released.
fn set_memory_saver(app: &AppHandle, low: bool) {
    #[cfg(target_os = "windows")]
    {
        if low {
            // Host working set trim (the number users check in Task Manager).
            unsafe {
                use windows_sys::Win32::System::ProcessStatus::K32EmptyWorkingSet;
                use windows_sys::Win32::System::Threading::GetCurrentProcess;
                K32EmptyWorkingSet(GetCurrentProcess());
            }
        }
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.with_webview(move |webview| unsafe {
                use webview2_com::Microsoft::Web::WebView2::Win32::{
                    ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
                    COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
                };
                use windows_core::Interface;
                let controller = webview.controller();
                if let Ok(core) = controller.CoreWebView2() {
                    if let Ok(wv) = core.cast::<ICoreWebView2_19>() {
                        let _ = wv.SetMemoryUsageTargetLevel(if low {
                            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
                        } else {
                            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
                        });
                    }
                }
            });
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, low);
    }
}

fn toggle_overlay(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
            let _ = app.emit("overlay-hidden", ());
            set_memory_saver(app, true);
        } else {
            let _ = window.show();
            let _ = window.set_focus();
            let _ = app.emit("overlay-shown", ());
            set_memory_saver(app, false);
        }
    }
}

fn toggle_click_through(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let ghost = !CLICK_THROUGH.load(Ordering::Relaxed);
        CLICK_THROUGH.store(ghost, Ordering::Relaxed);
        let _ = window.set_ignore_cursor_events(ghost);
        if !ghost {
            let _ = window.set_focus();
        }
        let _ = app.emit("ghost-mode", ghost);
    }
}

#[tauri::command]
fn set_ghost_mode(app: AppHandle, enabled: bool) {
    if CLICK_THROUGH.load(Ordering::Relaxed) != enabled {
        toggle_click_through(&app);
    }
}

#[tauri::command]
fn hide_overlay(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
        let _ = app.emit("overlay-hidden", ());
        set_memory_saver(&app, true);
    }
}

#[tauri::command]
fn show_overlay(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = app.emit("overlay-shown", ());
        set_memory_saver(&app, false);
    }
}

#[tauri::command]
fn set_hud_visible(app: AppHandle, visible: bool) {
    if let Some(hud) = app.get_webview_window("hud") {
        if visible {
            if !hud.is_visible().unwrap_or(false) {
                let _ = hud.show();
            }
        } else if hud.is_visible().unwrap_or(false) {
            let _ = hud.hide();
        }
    }
}

fn toggle_palette(app: &AppHandle) {
    if let Some(palette) = app.get_webview_window("palette") {
        if palette.is_visible().unwrap_or(false) {
            let _ = palette.hide();
        } else {
            let _ = palette.show();
            let _ = palette.set_focus();
            let _ = app.emit("palette-shown", ());
        }
    }
}

/// Rebuild the tray menu with localized labels (called by the frontend
/// whenever the UI language changes).
#[tauri::command]
fn set_tray_labels(app: AppHandle, toggle: String, ghost: String, palette: String, quit: String) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
        let Some(tray) = handle.tray_by_id("afkode-tray") else {
            return;
        };
        let build = || -> tauri::Result<_> {
            let m_toggle = MenuItem::with_id(
                &handle,
                "toggle",
                format!("{toggle}\tAlt+X"),
                true,
                None::<&str>,
            )?;
            let m_ghost = MenuItem::with_id(
                &handle,
                "ghost",
                format!("{ghost}\tAlt+G"),
                true,
                None::<&str>,
            )?;
            let m_palette = MenuItem::with_id(
                &handle,
                "palette",
                format!("{palette}\tAlt+P"),
                true,
                None::<&str>,
            )?;
            let m_quit = MenuItem::with_id(&handle, "quit", quit.clone(), true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(&handle)?;
            Menu::with_items(&handle, &[&m_toggle, &m_ghost, &m_palette, &sep, &m_quit])
        };
        if let Ok(menu) = build() {
            let _ = tray.set_menu(Some(menu));
        }
    });
}

#[tauri::command]
fn show_palette(app: AppHandle) {
    if let Some(palette) = app.get_webview_window("palette") {
        let _ = palette.show();
        let _ = palette.set_focus();
        let _ = app.emit("palette-shown", ());
    }
}

#[tauri::command]
fn hide_palette(app: AppHandle) {
    if let Some(palette) = app.get_webview_window("palette") {
        let _ = palette.hide();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                // Don't restore visibility: hud/palette must start hidden.
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        & !tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .build(),
        )
        .manage(PtyState::default())
        .invoke_handler(tauri::generate_handler![
            spawn_pty,
            write_pty,
            resize_pty,
            kill_pty,
            set_ghost_mode,
            hide_overlay,
            show_overlay,
            set_hud_visible,
            show_palette,
            hide_palette,
            set_tray_labels,
            detect_clis,
            list_dir,
            save_temp_image
        ])
        .setup(|app| {
            // Silent auto-update: check GitHub Releases in the background,
            // install if newer, and let the frontend tell the user to restart.
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    use tauri_plugin_updater::UpdaterExt;
                    let Ok(updater) = handle.updater() else { return };
                    let Ok(Some(update)) = updater.check().await else {
                        return;
                    };
                    let version = update.version.clone();
                    if update.download_and_install(|_, _| {}, || {}).await.is_ok() {
                        let _ = handle.emit("update-installed", version);
                    }
                });
            }

            // Agent hook feed: local listener + generated settings file.
            if let Some(port) = start_hook_server(app.handle().clone()) {
                if let Ok(dir) = app.path().app_config_dir() {
                    match write_hooks_settings(dir, port) {
                        Ok(path) => {
                            let _ = HOOKS_FILE.set(path);
                        }
                        Err(e) => eprintln!("could not write hooks settings: {e}"),
                    }
                }
            }

            // Match detection: poll the foreground window and notify the
            // frontend when a fullscreen game gains or loses focus.
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    let mut last = false;
                    loop {
                        std::thread::sleep(std::time::Duration::from_secs(3));
                        let now = game_foreground();
                        if now != last {
                            last = now;
                            let _ = handle.emit("game-mode", now);
                        }
                    }
                });
            }

            let toggle: Shortcut = TOGGLE_SHORTCUT.parse().unwrap();
            let ghost: Shortcut = GHOST_SHORTCUT.parse().unwrap();
            let approve: Shortcut = APPROVE_SHORTCUT.parse().unwrap();
            let palette: Shortcut = PALETTE_SHORTCUT.parse().unwrap();
            let palette2: Shortcut = PALETTE_SHORTCUT_ALT.parse().unwrap();
            let dnd: Shortcut = DND_SHORTCUT.parse().unwrap();
            // Shortcut is Copy: the handler keeps its own copies.
            let (t, g, a, p, p2, d) = (toggle, ghost, approve, palette, palette2, dnd);
            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(move |app, shortcut, event| {
                        if event.state() != ShortcutState::Pressed {
                            return;
                        }
                        if shortcut == &t {
                            toggle_overlay(app);
                        } else if shortcut == &g {
                            toggle_click_through(app);
                        } else if shortcut == &a {
                            let _ = app.emit("approve-request", ());
                        } else if shortcut == &p || shortcut == &p2 {
                            toggle_palette(app);
                        } else if shortcut == &d {
                            let _ = app.emit("dnd-toggle", ());
                        }
                    })
                    .build(),
            )?;

            // Register individually: a hotkey taken by another app (e.g. the
            // NVIDIA overlay) must not prevent startup.
            use tauri_plugin_global_shortcut::GlobalShortcutExt;
            for sc in [toggle, ghost, approve, palette, palette2, dnd] {
                if let Err(e) = app.global_shortcut().register(sc) {
                    eprintln!("could not register hotkey {sc:?}: {e}");
                }
            }

            // System tray: the overlay lives in the hidden-icons area.
            {
                use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

                let m_toggle =
                    MenuItem::with_id(app, "toggle", "Show / Hide\tAlt+X", true, None::<&str>)?;
                let m_ghost =
                    MenuItem::with_id(app, "ghost", "Ghost mode\tAlt+G", true, None::<&str>)?;
                let m_palette =
                    MenuItem::with_id(app, "palette", "Prompt palette\tAlt+P", true, None::<&str>)?;
                let m_quit = MenuItem::with_id(app, "quit", "Quit AFKode", true, None::<&str>)?;
                let sep = PredefinedMenuItem::separator(app)?;
                let menu =
                    Menu::with_items(app, &[&m_toggle, &m_ghost, &m_palette, &sep, &m_quit])?;

                TrayIconBuilder::with_id("afkode-tray")
                    .icon(app.default_window_icon().unwrap().clone())
                    .tooltip("AFKode — Alt+X")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "toggle" => toggle_overlay(app),
                        "ghost" => toggle_click_through(app),
                        "palette" => toggle_palette(app),
                        "quit" => {
                            if let Some(state) = app.try_state::<PtyState>() {
                                let mut sessions = state.sessions.lock().unwrap();
                                for (_, mut s) in sessions.drain() {
                                    let _ = s.child.kill();
                                }
                            }
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            toggle_overlay(tray.app_handle());
                        }
                    })
                    .build(app)?;
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Kill PTY children on close so conhost/claude don't outlive us
            // and wedge process shutdown.
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.app_handle().state::<PtyState>();
                let mut sessions = state.sessions.lock().unwrap();
                for (_, mut s) in sessions.drain() {
                    let _ = s.child.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
