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

/// Owns a Windows Job Object with KILL_ON_JOB_CLOSE: dropping the last
/// handle terminates every process assigned to the job. Killing only the
/// direct PTY child (always `cmd.exe` here) leaves the real workload —
/// claude/node — running headless after the tab is "closed"; the job takes
/// the whole tree down with it.
#[cfg(target_os = "windows")]
struct JobHandle(windows_sys::Win32::Foundation::HANDLE);
#[cfg(target_os = "windows")]
unsafe impl Send for JobHandle {}
#[cfg(target_os = "windows")]
unsafe impl Sync for JobHandle {}
#[cfg(target_os = "windows")]
impl Drop for JobHandle {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}
#[cfg(not(target_os = "windows"))]
struct JobHandle;

#[cfg(target_os = "windows")]
fn job_for_child(pid: u32) -> Option<JobHandle> {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE,
    };
    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            return None;
        }
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const _,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        ) == 0
        {
            CloseHandle(job);
            return None;
        }
        let proc = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
        if proc.is_null() {
            CloseHandle(job);
            return None;
        }
        let ok = AssignProcessToJobObject(job, proc);
        CloseHandle(proc);
        if ok == 0 {
            CloseHandle(job);
            return None;
        }
        Some(JobHandle(job))
    }
}

#[cfg(not(target_os = "windows"))]
fn job_for_child(_pid: u32) -> Option<JobHandle> {
    None
}

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    // Arc so write_pty can pull the writer out and release the sessions map
    // before doing blocking I/O: a full ConPTY input pipe (child stopped,
    // user pasting) blocking write_all while holding the map lock would
    // wedge every other command — including the kill_pty that could unblock
    // it — freezing the whole app.
    writer: std::sync::Arc<Mutex<Box<dyn Write + Send>>>,
    child: Box<dyn Child + Send + Sync>,
    /// Generation stamp: lets a stale reader thread (from a session id
    /// reused after a webview reload) detect that the entry now belongs to
    /// a newer session and leave it alone.
    gen: u64,
    /// Kills the whole process tree when the session is dropped.
    _job: Option<JobHandle>,
}

static SESSION_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

#[derive(Default)]
struct PtyState {
    sessions: Mutex<HashMap<String, PtySession>>,
}

static CLICK_THROUGH: AtomicBool = AtomicBool::new(false);

/// Settings file injected into `claude --settings` so Claude Code hooks
/// report real agent state (tool use, permissions, turn end) back to us.
static HOOKS_FILE: OnceLock<PathBuf> = OnceLock::new();

/// Shared secret baked into the hook URLs. The listener binds to 127.0.0.1,
/// but that alone doesn't stop other local processes — or any webpage doing a
/// `fetch()` to a localhost port — from POSTing forged agent-hook events.
/// Requests without the token are dropped.
static HOOK_TOKEN: OnceLock<String> = OnceLock::new();

fn hook_token() -> &'static str {
    HOOK_TOKEN.get_or_init(|| {
        use std::hash::{BuildHasher, Hasher};
        // RandomState is seeded from OS randomness; two independent states
        // give 128 unpredictable bits without pulling in a rand crate.
        let mut out = String::with_capacity(32);
        for _ in 0..2 {
            let mut h = std::collections::hash_map::RandomState::new().build_hasher();
            h.write_u32(std::process::id());
            out.push_str(&format!("{:016x}", h.finish()));
        }
        out
    })
}

/// Local HTTP listener that Claude Code hooks POST their JSON payload to.
/// Each request body is forwarded to the frontend as `agent-hook`. The
/// `Notification` hook's `matcher` (permission_prompt vs idle_prompt — a
/// documented, stable enum) is a config-time filter, so `write_hooks_settings`
/// registers it via a distinct URL per matcher and this recovers it from the
/// query string, merging it into the JSON as `afkode_notif_type` before
/// forwarding — a defensive fallback for the frontend, which primarily reads
/// Claude Code's own native `notification_type` field (confirmed present via
/// a live hook-payload capture; earlier docs review had wrongly assumed the
/// matcher never appears in the JSON at all).
fn start_hook_server(app: AppHandle) -> Option<u16> {
    for port in 4517..4527u16 {
        match tiny_http::Server::http(("127.0.0.1", port)) {
            Ok(server) => {
                std::thread::spawn(move || {
                    for mut req in server.incoming_requests() {
                        let query = req.url().split_once('?').map(|(_, q)| q.to_string());
                        let param = |name: &str| {
                            query.as_deref().and_then(|q| {
                                q.split('&').find_map(|kv| {
                                    kv.strip_prefix(name)
                                        .and_then(|v| v.strip_prefix('='))
                                        .map(|v| v.to_string())
                                })
                            })
                        };
                        if param("k").as_deref() != Some(hook_token()) {
                            let _ = req.respond(tiny_http::Response::empty(403));
                            continue;
                        }
                        let mut body = String::new();
                        // Cap the accepted body: hook payloads are small JSON;
                        // don't let a rogue local client feed us gigabytes.
                        let _ = req
                            .as_reader()
                            .take(1024 * 1024)
                            .read_to_string(&mut body);
                        if body.is_empty() {
                            let _ = req.respond(tiny_http::Response::empty(200));
                            continue;
                        }
                        let notif_type = param("notif");
                        let payload = match notif_type {
                            Some(kind) => match serde_json::from_str::<serde_json::Value>(&body) {
                                Ok(mut v) => {
                                    if let Some(obj) = v.as_object_mut() {
                                        obj.insert(
                                            "afkode_notif_type".into(),
                                            serde_json::Value::String(kind),
                                        );
                                    }
                                    v.to_string()
                                }
                                Err(_) => body,
                            },
                            None => body,
                        };
                        let _ = app.emit("agent-hook", payload);
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
    let token = hook_token();
    let post = |suffix: &str| {
        format!(
            "curl -s -m 2 -X POST \"http://127.0.0.1:{port}/e?k={token}{suffix}\" --data-binary @-"
        )
    };
    let tool_hook = serde_json::json!([{
        "matcher": "*",
        "hooks": [{ "type": "command", "command": post("") }]
    }]);
    let plain_hook = serde_json::json!([{
        "hooks": [{ "type": "command", "command": post("") }]
    }]);
    // permission_prompt/idle_prompt are documented, stable matcher values
    // for Notification (see https://code.claude.com/docs/en/hooks) — far
    // more reliable than string-matching the notification message text,
    // which isn't part of any documented/stable format. The matcher itself
    // is a registration-time filter, not part of the JSON payload Claude
    // Code sends, so it's recovered via the URL query string instead (see
    // start_hook_server).
    let notification_hook = serde_json::json!([
        {
            "matcher": "permission_prompt",
            "hooks": [{ "type": "command", "command": post("&notif=permission_prompt") }]
        },
        {
            "matcher": "idle_prompt",
            "hooks": [{ "type": "command", "command": post("&notif=idle_prompt") }]
        }
    ]);
    let settings = serde_json::json!({
        "hooks": {
            "SessionStart": plain_hook,
            "PreToolUse": tool_hook,
            "PostToolUse": tool_hook,
            "Notification": notification_hook,
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
    exit_code: Option<u32>,
}

/// Split a user-typed flags string Windows-style: whitespace separates,
/// double quotes group, and backslash is a literal path character. (POSIX
/// splitters like shell_words treat `\` as an escape and silently eat it —
/// `--add-dir C:\projects\app` came out as `C:projectsapp`.)
fn split_flags(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quoted = false;
    for c in s.chars() {
        match c {
            '"' => quoted = !quoted,
            c if c.is_whitespace() && !quoted => {
                if !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                }
            }
            c => cur.push(c),
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_flags_windows_paths_survive() {
        assert_eq!(
            split_flags(r"--add-dir C:\projects\app --resume"),
            vec![r"--add-dir", r"C:\projects\app", "--resume"]
        );
    }

    #[test]
    fn split_flags_quotes_group() {
        assert_eq!(
            split_flags(r#"--append-system-prompt "be very careful" -c"#),
            vec!["--append-system-prompt", "be very careful", "-c"]
        );
    }

    #[test]
    fn split_flags_quoted_path_with_spaces() {
        assert_eq!(
            split_flags(r#"--add-dir "C:\Users\Foo Bar\proj""#),
            vec!["--add-dir", r"C:\Users\Foo Bar\proj"]
        );
    }

    #[test]
    fn split_flags_empty_and_whitespace() {
        assert!(split_flags("").is_empty());
        assert!(split_flags("   ").is_empty());
    }

    #[test]
    fn expand_tilde_variants() {
        let home = std::env::var("USERPROFILE").unwrap();
        assert_eq!(expand_tilde("~"), home);
        assert_eq!(expand_tilde(r"~\x"), format!(r"{home}\x"));
        assert_eq!(expand_tilde("~user/x"), "~user/x");
        assert_eq!(expand_tilde(r"C:\x"), r"C:\x");
    }

    #[test]
    fn utf8_split_handles_partial_codepoint() {
        // "é" = 0xC3 0xA9; feed only the first byte.
        assert_eq!(valid_utf8_split(&[b'a', 0xC3]), (1, true));
        // Invalid byte mid-stream flushes lossily.
        assert_eq!(valid_utf8_split(&[b'a', 0xFF, b'b']), (1, false));
    }
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
async fn spawn_pty(
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
    } else if (trimmed == "claude" || trimmed.starts_with("claude ")) && hooks {
        // Opt-in integration: inject hook settings so the agent reports
        // real state (tool use, permission waits, turn end). User-supplied
        // flags (--resume, --dangerously-skip-permissions, …) pass through.
        let mut b = CommandBuilder::new("cmd.exe");
        let mut args: Vec<String> = vec!["/c".into(), "claude".into()];
        if let Some(rest) = trimmed.strip_prefix("claude") {
            args.extend(split_flags(rest.trim()));
        }
        if let Some(hooks_file) = HOOKS_FILE.get() {
            args.push("--settings".into());
            args.push(hooks_file.to_string_lossy().to_string());
        }
        let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        b.args(refs);
        b
    } else {
        // Pass the raw line through an env var that cmd expands itself:
        // handing it over as an argument would run it through ArgvQuote,
        // which wraps the whole command in quotes and escapes embedded `"`
        // as `\"` — a syntax cmd.exe does not parse — silently corrupting
        // any command containing quotes (e.g. `git commit -m "fix: x"`).
        let mut b = CommandBuilder::new("cmd.exe");
        b.env("AFKODE_CMD", trimmed);
        b.args(["/c", "%AFKODE_CMD%"]);
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

    let gen = SESSION_GEN.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let job = child.process_id().and_then(job_for_child);
    state.sessions.lock().unwrap().insert(
        id.clone(),
        PtySession {
            master: pair.master,
            writer: std::sync::Arc::new(Mutex::new(writer)),
            child,
            gen,
            _job: job,
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
        // The PTY closing means the child is gone or about to be reaped.
        // Take the session out under the lock, but wait() on the child
        // OUTSIDE it — WaitForSingleObject under the map lock would stall
        // every other session if teardown is slow. If the entry's gen
        // doesn't match, a newer session reused this id (webview reload):
        // it isn't ours to reap, and emitting pty-exit for it would kill a
        // live tab in the UI.
        let mut superseded = false;
        let session = app.try_state::<PtyState>().and_then(|state| {
            let mut sessions = state.sessions.lock().unwrap();
            if sessions.get(&id).is_some_and(|s| s.gen != gen) {
                superseded = true;
                return None;
            }
            sessions.remove(&id)
        });
        let exit_code = session
            .and_then(|mut s| s.child.wait().ok())
            .map(|status| status.exit_code());
        if !superseded {
            let _ = app.emit("pty-exit", PtyExit { id: &id, exit_code });
        }
    });

    Ok(())
}

#[tauri::command]
async fn write_pty(state: State<'_, PtyState>, id: String, data: String) -> Result<(), String> {
    // Fetch the writer and drop the map lock before the (potentially
    // blocking) write — see the comment on PtySession::writer.
    let writer = {
        let sessions = state.sessions.lock().unwrap();
        sessions.get(&id).ok_or("session not found")?.writer.clone()
    };
    let result = writer
        .lock()
        .unwrap()
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string());
    result
}

#[tauri::command]
async fn resize_pty(
    state: State<'_, PtyState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
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
async fn kill_pty(state: State<'_, PtyState>, id: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(mut session) = sessions.remove(&id) {
        let _ = session.child.kill();
    }
    Ok(())
}

/// A pre-existing npm install with a custom `prefix` (nvm-windows, a manual
/// `npm config set prefix`, ...) puts its global bin dir somewhere neither
/// hardcoded fallback below covers. Shelling out to `npm` (a .cmd shim —
/// needs `cmd.exe`; a bare `Command::new("npm")` won't resolve it) on every
/// single tab open would slow down plain shell tabs that don't need it, so
/// a successful result is cached — npm's persisted prefix doesn't change
/// mid-session. A *failed* lookup (npm not installed yet) is deliberately
/// NOT cached: that's exactly the case this exists for — Node/npm getting
/// installed mid-session via the setup wizard — and caching `None` forever
/// would permanently defeat it.
static NPM_PREFIX_CACHE: Mutex<Option<String>> = Mutex::new(None);

fn npm_prefix() -> Option<String> {
    if let Some(cached) = NPM_PREFIX_CACHE.lock().unwrap().clone() {
        return Some(cached);
    }
    let mut c = std::process::Command::new("cmd.exe");
    c.args(["/c", "npm", "config", "get", "prefix"]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let prefix = c.output().ok().and_then(|o| {
        if !o.status.success() {
            return None;
        }
        let prefix = String::from_utf8_lossy(&o.stdout).trim().to_string();
        (!prefix.is_empty()).then_some(prefix)
    })?;
    *NPM_PREFIX_CACHE.lock().unwrap() = Some(prefix.clone());
    Some(prefix)
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
    if let Some(prefix) = npm_prefix() {
        extras.push(prefix);
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
async fn save_temp_image(data: String) -> Result<String, String> {
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

/// If the OS clipboard holds an image, save it as a temp PNG and return the
/// path (hidden PowerShell does the bitmap decoding — no extra crates).
#[tauri::command]
async fn clipboard_image_to_temp() -> Result<String, String> {
    let dir = std::env::temp_dir().join("afkode-paste");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let path = dir.join(format!("paste-{stamp}.png"));
    // PowerShell single-quote escaping ('' inside '…'): %TEMP% contains the
    // username, and Windows allows ' in usernames — an unescaped quote both
    // breaks the script and is a string-injection point.
    let ps_path = path.display().to_string().replace('\'', "''");
    let script = format!(
        "$img = Get-Clipboard -Format Image; if ($img) {{ $img.Save('{ps_path}') }}"
    );
    let mut c = std::process::Command::new("powershell.exe");
    c.args(["-NoProfile", "-Command", &script]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let _ = c.output();
    if path.exists() {
        Ok(path.to_string_lossy().to_string())
    } else {
        Err("no image in clipboard".into())
    }
}

#[derive(Serialize)]
struct DirEntry {
    name: String,
    dir: bool,
}

/// Complete a relative path fragment against a base directory (palette `@`
/// completion). Returns entries with the fragment's directory part prefixed.
#[tauri::command]
async fn list_dir(base: String, prefix: String) -> Vec<DirEntry> {
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

/// Expand a leading `~` (agents print paths this way) to the user's home
/// directory; Windows has no shell to do this for us.
fn expand_tilde(path: &str) -> String {
    match path.strip_prefix('~') {
        Some(rest) if rest.is_empty() || rest.starts_with(['\\', '/']) => {
            match std::env::var("USERPROFILE") {
                Ok(home) => format!("{home}{rest}"),
                Err(_) => path.to_string(),
            }
        }
        _ => path.to_string(),
    }
}

/// Read an image file as a data URL for the preview panel. Tauri's asset
/// protocol would need a broader filesystem scope grant for arbitrary
/// clicked-on paths, so this just hands back inline base64 instead.
#[tauri::command]
async fn read_image_data_url(path: String) -> Result<String, String> {
    const MAX_BYTES: u64 = 8 * 1024 * 1024;
    let path = expand_tilde(&path);
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("not a file".into());
    }
    if meta.len() > MAX_BYTES {
        return Err("image too large to preview (>8 MB)".into());
    }
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "svg" => "image/svg+xml",
        _ => return Err("unsupported image type".into()),
    };
    use base64::Engine;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{b64}"))
}

/// Read a text file for the in-app preview panel. Capped so a click on a huge
/// log doesn't stall the UI; binary files are rejected rather than dumped as
/// garbled text.
#[tauri::command]
async fn read_text_file(path: String) -> Result<String, String> {
    const MAX_BYTES: u64 = 512 * 1024;
    let path = expand_tilde(&path);
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("not a file".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let truncated = bytes.len() as u64 > MAX_BYTES;
    let slice = if truncated { &bytes[..MAX_BYTES as usize] } else { &bytes[..] };
    if slice.contains(&0) {
        return Err("binary file".into());
    }
    let text = String::from_utf8_lossy(slice).into_owned();
    Ok(if truncated {
        format!("{text}\n\n… truncated (file is larger than 512 KB)")
    } else {
        text
    })
}

fn run_git(cwd: &str, args: &[&str]) -> Option<String> {
    let mut c = std::process::Command::new("git");
    c.args(args);
    c.current_dir(cwd);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let out = c.output().ok()?;
    if !out.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

#[derive(Serialize)]
struct GitStatus {
    branch: String,
    added: u32,
    removed: u32,
    dirty: bool,
}

/// Branch + working-tree diff stat for the footer, Warp-style. `None` when
/// `cwd` isn't inside a git repo (or `git` isn't on PATH) — the footer just
/// hides the chip rather than showing an error.
#[tauri::command]
async fn git_status(cwd: String) -> Option<GitStatus> {
    let branch = run_git(&cwd, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    let shortstat = run_git(&cwd, &["diff", "--shortstat"]).unwrap_or_default();
    let porcelain = run_git(&cwd, &["status", "--porcelain"]).unwrap_or_default();
    let mut added = 0u32;
    let mut removed = 0u32;
    for part in shortstat.split(',') {
        let part = part.trim();
        if let Some(n) = part
            .strip_suffix(" insertion(+)")
            .or_else(|| part.strip_suffix(" insertions(+)"))
        {
            added = n.trim().parse().unwrap_or(0);
        } else if let Some(n) = part
            .strip_suffix(" deletion(-)")
            .or_else(|| part.strip_suffix(" deletions(-)"))
        {
            removed = n.trim().parse().unwrap_or(0);
        }
    }
    Some(GitStatus { branch, added, removed, dirty: !porcelain.is_empty() })
}

/// Check which CLIs are resolvable in PATH (handles .cmd shims via where.exe).
#[tauri::command]
async fn detect_clis(names: Vec<String>) -> Vec<bool> {
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
        GetClassNameW, GetForegroundWindow, GetWindowLongPtrW, GetWindowRect,
        GetWindowThreadProcessId, GWL_STYLE, WS_MAXIMIZE,
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
        // A maximized normal window is not a fullscreen game, but with an
        // auto-hidden taskbar its rect (inflated by invisible resize
        // borders) covers the whole monitor and would pass the check below
        // — maximizing Chrome must not flip do-not-disturb on.
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
        if style & WS_MAXIMIZE != 0 {
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
        // A minimized window still reports is_visible() == true on Windows
        // (WS_VISIBLE stays set while iconified), so without this check
        // Alt+X on a minimized window just hides it again instead of
        // restoring it — looks like the app is stuck.
        let shown = window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false);
        if shown {
            let _ = window.hide();
            let _ = app.emit("overlay-hidden", ());
            set_memory_saver(app, true);
        } else {
            let _ = window.unminimize();
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

/// Overlay mode (always-on-top) vs. a normal window — users forget it's an
/// overlay outside of games, where staying topmost just means it randomly
/// buries or gets buried by other fullscreen apps instead of behaving
/// predictably. The taskbar icon itself is intentionally NOT tied to this:
/// hiding "the app is open" affordance made the window feel like it could
/// vanish entirely, on top of the always-on-top confusion this exists to fix.
#[tauri::command]
fn set_window_mode(app: AppHandle, overlay: bool) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_top(overlay);
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
        // In window mode the OS minimize button can leave it minimized;
        // show() alone doesn't undo that, so always unminimize too.
        let _ = window.unminimize();
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

/// Download and install a pending update after explicit user consent. On
/// Windows the installer terminates this process, so PTY children are
/// killed first — otherwise claude/conhost would be orphaned mid-install.
#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("no update available")?;
    if let Some(state) = app.try_state::<PtyState>() {
        let mut sessions = state.sessions.lock().unwrap();
        for (_, mut s) in sessions.drain() {
            let _ = s.child.kill();
        }
    }
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    // Only reached if the installer didn't terminate us (e.g. non-Windows).
    let _ = app.emit("update-installed", update.version.clone());
    Ok(())
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
        // Must be the first plugin. A second launch would fight the first
        // over global hotkeys, hook ports and the shared afkode-hooks.json
        // (each instance overwrites it with its own port+token) — surface
        // the already-running overlay instead.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
                let _ = app.emit("overlay-shown", ());
                set_memory_saver(app, false);
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
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
            set_window_mode,
            hide_overlay,
            show_overlay,
            set_hud_visible,
            show_palette,
            hide_palette,
            set_tray_labels,
            detect_clis,
            list_dir,
            save_temp_image,
            clipboard_image_to_temp,
            read_text_file,
            read_image_data_url,
            git_status,
            install_update
        ])
        .setup(|app| {
            // Update check only — installing is gated on user consent
            // (install_update command): on Windows download_and_install
            // terminates the process to run the installer, so doing it
            // silently in the background would kill the app out from under
            // the user mid-session and orphan every PTY child.
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    use tauri_plugin_updater::UpdaterExt;
                    let Ok(updater) = handle.updater() else { return };
                    let Ok(Some(update)) = updater.check().await else {
                        return;
                    };
                    let _ = handle.emit("update-available", update.version.clone());
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
            match event {
                // Alt+F4 (works even without decorations) would otherwise
                // destroy the webview: every PTY dies and the tray icon is
                // left pointing at a gone window. Behave like the × button
                // instead — hide to the tray, recoverable via Alt+X.
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = window.hide();
                    if window.label() == "main" {
                        let app = window.app_handle();
                        let _ = app.emit("overlay-hidden", ());
                        set_memory_saver(app, true);
                    }
                }
                // Kill PTY children on close so conhost/claude don't outlive
                // us and wedge process shutdown.
                tauri::WindowEvent::Destroyed => {
                    let state = window.app_handle().state::<PtyState>();
                    let mut sessions = state.sessions.lock().unwrap();
                    for (_, mut s) in sessions.drain() {
                        let _ = s.child.kill();
                    }
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
