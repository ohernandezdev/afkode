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
                        let _ = req.as_reader().take(1024 * 1024).read_to_string(&mut body);
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
    // An explicitly-quoted empty arg ("") must survive as an empty token —
    // dropping it would silently shift every argument after it.
    let mut was_quoted = false;
    for c in s.chars() {
        match c {
            '"' => {
                quoted = !quoted;
                was_quoted = true;
            }
            c if c.is_whitespace() && !quoted => {
                if !cur.is_empty() || was_quoted {
                    out.push(std::mem::take(&mut cur));
                }
                was_quoted = false;
            }
            c => cur.push(c),
        }
    }
    if !cur.is_empty() || was_quoted {
        out.push(cur);
    }
    out
}

/// Quote a string as a PowerShell single-quoted literal: everything inside
/// '…' is verbatim, and a doubled '' is the only recognized escape.
#[cfg(target_os = "windows")]
fn ps_squote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

/// Quote a string as a POSIX-shell single-quoted literal ('…' is verbatim;
/// an embedded ' becomes '\'' — close, escaped quote, reopen).
#[cfg(not(target_os = "windows"))]
fn sh_squote(s: &str) -> String {
    format!("'{}'", s.replace('\'', r"'\''"))
}

/// The user's login shell: $SHELL, falling back to the OS default. The
/// fallback matters for launchd/systemd-spawned GUI processes where $SHELL
/// may be absent.
#[cfg(not(target_os = "windows"))]
fn login_shell() -> String {
    std::env::var("SHELL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| {
            if cfg!(target_os = "macos") {
                "/bin/zsh".into()
            } else {
                "/bin/bash".into()
            }
        })
}

// ── OSC 133 shell integration (command blocks) ─────────────
//
// Plain interactive shell tabs get hooks injected at spawn time — never by
// editing the user's profile files — that emit the OSC 133 sequences
// (A prompt-start, B input-start, C pre-exec, D;exit command-end) the
// frontend's block model consumes (src/blocks.ts). Agent tabs and
// arbitrary-command tabs are untouched; the frontend stays inert until it
// sees the first sequence, so non-integrated shells behave exactly as
// before.

/// PowerShell bootstrap: wraps — never replaces — whatever `prompt`
/// function the profile defined. PowerShell has no pre-exec hook, so C is
/// never emitted; the frontend reads the command line from the buffer at D.
#[cfg(target_os = "windows")]
const PS_SHELL_INTEGRATION: &str = r#"
$global:__afkPrompt = $function:prompt
$global:__afkRan = $false
function global:prompt {
  $__ok = $?
  $__ec = if ($__ok) { 0 } elseif ($global:LASTEXITCODE -is [int] -and $global:LASTEXITCODE -ne 0) { $global:LASTEXITCODE } else { 1 }
  $__e = [char]27
  if ($global:__afkRan) { [Console]::Write("$__e]133;D;$__ec$__e\") }
  $global:__afkRan = $true
  [Console]::Write("$__e]133;A$__e\")
  "$(& $global:__afkPrompt)$__e]133;B$__e\"
}
"#;

/// Encode a script for `powershell -EncodedCommand` (base64 of UTF-16LE):
/// dodges every layer of argv/cmd quoting corruption at once.
#[cfg(target_os = "windows")]
fn ps_encode(script: &str) -> String {
    use base64::Engine;
    let utf16: Vec<u8> = script
        .encode_utf16()
        .flat_map(|u| u.to_le_bytes())
        .collect();
    base64::engine::general_purpose::STANDARD.encode(utf16)
}

/// bash bootstrap, loaded via `bash --rcfile`: sources the user's real
/// ~/.bashrc first, then layers the hooks on top. PROMPT_COMMAND is
/// prepended (D must see the real $?) with the user's entries preserved;
/// B/C ride PS1/PS0 (bash ≥ 4.4), re-appended each prompt in case the
/// user's own PROMPT_COMMAND rewrites them (git-prompt style).
#[cfg(not(target_os = "windows"))]
const BASH_SHELL_INTEGRATION: &str = r#"# AFKode shell integration: OSC 133 command blocks.
[ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"

__afk_ran=""
__afk_prompt() {
  local ec=$?
  [ -n "$__afk_ran" ] && printf '\033]133;D;%s\033\\' "$ec"
  __afk_ran=1
  printf '\033]133;A\033\\'
  return $ec
}
__afk_mark_input() {
  case "$PS1" in
    *']133;B'*) ;;
    *) PS1="$PS1"'\[\e]133;B\e\\\]' ;;
  esac
  case "$PS0" in
    *']133;C'*) ;;
    *) PS0='\e]133;C\e\\'"$PS0" ;;
  esac
}
if [[ "$(declare -p PROMPT_COMMAND 2>/dev/null)" == "declare -a"* ]]; then
  PROMPT_COMMAND=(__afk_prompt "${PROMPT_COMMAND[@]}" __afk_mark_input)
else
  PROMPT_COMMAND="__afk_prompt${PROMPT_COMMAND:+;$PROMPT_COMMAND};__afk_mark_input"
fi
"#;

/// zsh bootstrap via the ZDOTDIR indirection (the same trick VS Code and
/// kitty use): ZDOTDIR points at a directory whose startup files source
/// the user's own files — with ZDOTDIR restored so paths inside them
/// resolve — then install precmd/preexec hooks with add-zsh-hook.
#[cfg(not(target_os = "windows"))]
const ZSH_ZSHENV: &str = r#"# AFKode shell integration bootstrap.
if [ -f "$AFKODE_USER_ZDOTDIR/.zshenv" ]; then
  __afk_zd="$ZDOTDIR"
  ZDOTDIR="$AFKODE_USER_ZDOTDIR"
  . "$AFKODE_USER_ZDOTDIR/.zshenv"
  [ "$ZDOTDIR" = "$AFKODE_USER_ZDOTDIR" ] && ZDOTDIR="$__afk_zd"
  unset __afk_zd
fi
"#;

#[cfg(not(target_os = "windows"))]
const ZSH_ZPROFILE: &str = r#"if [ -f "$AFKODE_USER_ZDOTDIR/.zprofile" ]; then
  __afk_zd="$ZDOTDIR"
  ZDOTDIR="$AFKODE_USER_ZDOTDIR"
  . "$AFKODE_USER_ZDOTDIR/.zprofile"
  [ "$ZDOTDIR" = "$AFKODE_USER_ZDOTDIR" ] && ZDOTDIR="$__afk_zd"
  unset __afk_zd
fi
"#;

#[cfg(not(target_os = "windows"))]
const ZSH_ZSHRC: &str = r#"# AFKode shell integration: OSC 133 command blocks.
# ZDOTDIR is handed back to the user's value permanently here, so the rest
# of startup (.zlogin) and the running session read their own files.
ZDOTDIR="$AFKODE_USER_ZDOTDIR"
[ -f "$ZDOTDIR/.zshrc" ] && . "$ZDOTDIR/.zshrc"

autoload -Uz add-zsh-hook
__afk_ran=""
__afk_b_mark="%{$(printf '\033]133;B\033\\')%}"
__afk_precmd() {
  local ec=$?
  [ -n "$__afk_ran" ] && printf '\033]133;D;%s\033\\' "$ec"
  __afk_ran=1
  printf '\033]133;A\033\\'
  case "$PS1" in
    *"$__afk_b_mark") ;;
    *) PS1="$PS1$__afk_b_mark" ;;
  esac
}
__afk_preexec() { printf '\033]133;C\033\\'; }
add-zsh-hook precmd __afk_precmd
add-zsh-hook preexec __afk_preexec
"#;

/// Write the integration files under the OS temp dir (idempotent, cheap —
/// rewritten on every spawn so upgrades never serve stale scripts).
/// Returns the directory, or None if the filesystem said no.
#[cfg(not(target_os = "windows"))]
fn write_shell_integration() -> Option<PathBuf> {
    let dir = std::env::temp_dir().join("afkode-shell-integration");
    let zdot = dir.join("zdotdir");
    std::fs::create_dir_all(&zdot).ok()?;
    std::fs::write(dir.join("bash-init.sh"), BASH_SHELL_INTEGRATION).ok()?;
    std::fs::write(zdot.join(".zshenv"), ZSH_ZSHENV).ok()?;
    std::fs::write(zdot.join(".zprofile"), ZSH_ZPROFILE).ok()?;
    std::fs::write(zdot.join(".zshrc"), ZSH_ZSHRC).ok()?;
    Some(dir)
}

/// Home directory env var, per OS (Windows has no HOME).
fn home_dir_env() -> Option<String> {
    if cfg!(target_os = "windows") {
        std::env::var("USERPROFILE").ok()
    } else {
        std::env::var("HOME").ok()
    }
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
    fn split_flags_empty_quoted_arg_survives() {
        assert_eq!(split_flags(r#"-p "" --foo"#), vec!["-p", "", "--foo"]);
        assert_eq!(split_flags(r#"--foo="bar baz""#), vec!["--foo=bar baz"]);
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn sh_squote_escapes_single_quotes() {
        assert_eq!(sh_squote("plain"), "'plain'");
        assert_eq!(sh_squote("it's"), r"'it'\''s'");
    }

    // Runs the real ZDOTDIR-indirection bootstrap through an actual zsh
    // binary (present on the macOS CI runner, where oh-my-zsh sourcing was
    // otherwise only checkable by hand) and asserts a stand-in for the
    // user's real .zshrc (an oh-my-zsh install sources exactly the same
    // way) is reached.
    #[cfg(not(target_os = "windows"))]
    #[test]
    fn zsh_zdotdir_bootstrap_sources_user_zshrc() {
        if std::process::Command::new("zsh")
            .arg("--version")
            .output()
            .is_err()
        {
            eprintln!("zsh not found on this machine, skipping");
            return;
        }
        let tmp = std::env::temp_dir().join(format!("afk-zsh-test-{}", std::process::id()));
        let user_home = tmp.join("home");
        std::fs::create_dir_all(&user_home).unwrap();
        std::fs::write(
            user_home.join(".zshrc"),
            "export AFK_TEST_MARKER=from-user-zshrc\n",
        )
        .unwrap();

        let integration_dir = write_shell_integration().expect("write_shell_integration failed");

        let output = std::process::Command::new("zsh")
            .env("ZDOTDIR", integration_dir.join("zdotdir"))
            .env("AFKODE_USER_ZDOTDIR", &user_home)
            .args(["-i", "-c", "echo $AFK_TEST_MARKER"])
            .output()
            .expect("failed to spawn zsh");

        let stdout = String::from_utf8_lossy(&output.stdout);
        assert!(
            stdout.contains("from-user-zshrc"),
            "expected the ZDOTDIR bootstrap to source the user's real .zshrc; \
             stdout={stdout:?} stderr={:?}",
            String::from_utf8_lossy(&output.stderr)
        );

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn ps_squote_escapes_single_quotes() {
        assert_eq!(ps_squote("plain"), "'plain'");
        assert_eq!(ps_squote("it's"), "'it''s'");
        assert_eq!(
            ps_squote(r"C:\Users\Foo Bar\proj"),
            r"'C:\Users\Foo Bar\proj'"
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn ps_shell_integration_wraps_prompt_and_emits_osc133() {
        // Wraps, not replaces: the original prompt must be captured and
        // invoked, and all three sequences PowerShell can emit are present
        // (no C — PowerShell has no pre-exec hook).
        assert!(PS_SHELL_INTEGRATION.contains("$function:prompt"));
        assert!(PS_SHELL_INTEGRATION.contains("& $global:__afkPrompt"));
        for seq in ["]133;A", "]133;B", "]133;D;"] {
            assert!(PS_SHELL_INTEGRATION.contains(seq), "missing {seq}");
        }
        assert!(!PS_SHELL_INTEGRATION.contains("]133;C"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn ps_encode_roundtrips_utf16le_base64() {
        use base64::Engine;
        let enc = ps_encode("prompt");
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(enc)
            .unwrap();
        let utf16: Vec<u16> = bytes
            .chunks(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        assert_eq!(String::from_utf16(&utf16).unwrap(), "prompt");
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn posix_shell_integration_emits_osc133_and_preserves_user_config() {
        // bash: user rc sourced first, PROMPT_COMMAND entries preserved,
        // all four sequences emitted.
        assert!(BASH_SHELL_INTEGRATION.contains(r#". "$HOME/.bashrc""#));
        assert!(BASH_SHELL_INTEGRATION.contains(r#""${PROMPT_COMMAND[@]}""#));
        for seq in ["]133;A", "]133;B", "]133;C", "]133;D;"] {
            assert!(BASH_SHELL_INTEGRATION.contains(seq), "bash missing {seq}");
        }
        // zsh: hooks added via add-zsh-hook (never clobbering precmd), user
        // files sourced with ZDOTDIR restored.
        assert!(ZSH_ZSHRC.contains("add-zsh-hook precmd"));
        assert!(ZSH_ZSHRC.contains("add-zsh-hook preexec"));
        assert!(ZSH_ZSHRC.contains(r#". "$ZDOTDIR/.zshrc""#));
        for (name, f) in [(".zshenv", ZSH_ZSHENV), (".zprofile", ZSH_ZPROFILE)] {
            assert!(f.contains("AFKODE_USER_ZDOTDIR"), "{name} misses user dir");
        }
        for seq in ["]133;A", "]133;B", "]133;C", "]133;D;"] {
            assert!(ZSH_ZSHRC.contains(seq), "zsh missing {seq}");
        }
    }

    #[test]
    fn expand_tilde_variants() {
        let home = home_dir_env().unwrap();
        assert_eq!(expand_tilde("~"), home);
        assert_eq!(expand_tilde("~/x"), format!("{home}/x"));
        #[cfg(target_os = "windows")]
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
    #[cfg(target_os = "windows")]
    let mut builder = if trimmed.is_empty() {
        // Interactive shell: the profile loads first (no -NoProfile), then
        // the bootstrap wraps whatever prompt it defined with OSC 133
        // emission for command blocks.
        let mut b = CommandBuilder::new("powershell.exe");
        b.args([
            "-NoLogo",
            "-NoExit",
            "-EncodedCommand",
            &ps_encode(PS_SHELL_INTEGRATION),
        ]);
        b
    } else if trimmed == "claude" || trimmed.starts_with("claude ") {
        // Run the agent inside a persistent PowerShell (-NoExit) so the tab
        // drops back to a usable prompt in the same cwd when claude exits,
        // instead of dying with the PTY. User-supplied flags (--resume,
        // --dangerously-skip-permissions, …) pass through; with hook
        // integration enabled, --settings is injected so the agent reports
        // real state (tool use, permission waits, turn end).
        let mut args: Vec<String> = vec!["claude".into()];
        if let Some(rest) = trimmed.strip_prefix("claude") {
            args.extend(split_flags(rest.trim()));
        }
        if hooks {
            if let Some(hooks_file) = HOOKS_FILE.get() {
                args.push("--settings".into());
                args.push(hooks_file.to_string_lossy().to_string());
            }
        }
        // -EncodedCommand (base64 of UTF-16LE) instead of -Command: nesting
        // a command line inside argv-level quoting is the same corruption
        // trap the AFKODE_CMD env-var route below dodges for cmd.exe.
        let script = format!(
            "& {}",
            args.iter()
                .map(|a| ps_squote(a))
                .collect::<Vec<_>>()
                .join(" ")
        );
        let mut b = CommandBuilder::new("powershell.exe");
        b.args(["-NoLogo", "-NoExit", "-EncodedCommand", &ps_encode(&script)]);
        b
    } else if trimmed.contains('"') {
        // Pass the raw line through an env var that cmd expands itself:
        // handing it over as an argument would run it through ArgvQuote,
        // which escapes embedded `"` as `\"` — a syntax cmd.exe does not
        // parse — silently corrupting any command containing quotes (e.g.
        // `git commit -m "fix: x"`). Trade-off: cmd's %-expansion is
        // single-pass, so `%VARS%` inside the command stay literal on this
        // path — which is why quote-free commands keep the direct route.
        let mut b = CommandBuilder::new("cmd.exe");
        b.env("AFKODE_CMD", trimmed);
        b.args(["/c", "%AFKODE_CMD%"]);
        b
    } else {
        let mut b = CommandBuilder::new("cmd.exe");
        b.args(["/c", trimmed]);
        b
    };
    #[cfg(not(target_os = "windows"))]
    let mut builder = {
        // Login shell (-l on macOS): GUI apps launched from Finder/launchd
        // inherit a minimal environment, so without sourcing the user's
        // profile neither claude nor npm would be on PATH. Linux desktop
        // sessions already export the full user environment.
        let shell = login_shell();
        let mut b = CommandBuilder::new(&shell);
        if cfg!(target_os = "macos") {
            b.arg("-l");
        }
        if trimmed.is_empty() {
            // No args: interactive shell (stdin is the PTY), with OSC 133
            // shell integration for command blocks where the shell allows
            // spawn-time injection. bash -l (macOS) ignores --rcfile, so a
            // bash-on-macOS login shell simply gets no blocks.
            let shell_name = std::path::Path::new(&shell)
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("");
            match shell_name {
                "bash" if !cfg!(target_os = "macos") => {
                    if let Some(dir) = write_shell_integration() {
                        b.arg("--rcfile");
                        b.arg(dir.join("bash-init.sh"));
                    }
                }
                "zsh" => {
                    if let Some(dir) = write_shell_integration() {
                        let user_zdot = std::env::var("ZDOTDIR")
                            .ok()
                            .filter(|s| !s.trim().is_empty())
                            .or_else(home_dir_env);
                        if let Some(uz) = user_zdot {
                            b.env("AFKODE_USER_ZDOTDIR", uz);
                            b.env("ZDOTDIR", dir.join("zdotdir"));
                        }
                    }
                }
                // fish and friends: documented opt-in snippet, no automation.
                _ => {}
            }
            b
        } else if trimmed == "claude" || trimmed.starts_with("claude ") {
            // Same contract as the Windows -NoExit branch: when claude
            // exits (or crashes) the tab drops back to a live prompt in the
            // same cwd via `exec`, and pty-exit only fires when the shell
            // itself exits.
            let mut args: Vec<String> = vec!["claude".into()];
            if let Some(rest) = trimmed.strip_prefix("claude") {
                args.extend(split_flags(rest.trim()));
            }
            if hooks {
                if let Some(hooks_file) = HOOKS_FILE.get() {
                    args.push("--settings".into());
                    args.push(hooks_file.to_string_lossy().to_string());
                }
            }
            let script = format!(
                "{}; exec {}",
                args.iter()
                    .map(|a| sh_squote(a))
                    .collect::<Vec<_>>()
                    .join(" "),
                sh_squote(&shell)
            );
            b.args(["-c", &script]);
            b
        } else {
            // Arbitrary command (other agent CLIs): hand the raw line to
            // the shell, matching cmd.exe /c semantics.
            b.args(["-c", trimmed]);
            b
        }
    };
    let dir = cwd.filter(|c| !c.trim().is_empty()).or_else(home_dir_env);
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
        // A reused id (webview reload) leaves this thread's session
        // overwritten in the map by a newer one with a different `gen`.
        // Without this check the orphan keeps emitting `pty-output` under
        // the shared id, and the frontend writes it into whichever tab
        // currently owns that id — duplicated/interleaved lines while the
        // user types in the new session.
        let is_current = || {
            app.try_state::<PtyState>().is_some_and(|state| {
                state
                    .sessions
                    .lock()
                    .unwrap()
                    .get(&id)
                    .is_some_and(|s| s.gen == gen)
            })
        };
        loop {
            match reader.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    pending.extend_from_slice(&chunk[..n]);
                    let (split, clean) = valid_utf8_split(&pending);
                    if !clean {
                        if !is_current() {
                            break;
                        }
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
                        if !is_current() {
                            break;
                        }
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
        if !pending.is_empty() && is_current() {
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
/// NOT cached: npm can be installed manually mid-session, and caching
/// `None` forever would hide its global bin dir until an app restart.
static NPM_PREFIX_CACHE: Mutex<Option<String>> = Mutex::new(None);

fn npm_prefix() -> Option<String> {
    if let Some(cached) = NPM_PREFIX_CACHE.lock().unwrap().clone() {
        return Some(cached);
    }
    #[cfg(target_os = "windows")]
    let mut c = {
        let mut c = std::process::Command::new("cmd.exe");
        c.args(["/c", "npm", "config", "get", "prefix"]);
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        c
    };
    // Login shell so nvm/homebrew-managed npm resolves in GUI launches.
    #[cfg(not(target_os = "windows"))]
    let mut c = {
        let mut c = std::process::Command::new("/bin/sh");
        c.args(["-lc", "npm config get prefix"]);
        c
    };
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

/// nvm installs live under ~/.nvm/versions/node/<version>/bin and are only
/// wired into PATH by the shell rc file — invisible to a Finder/launchd
/// launched GUI app (and to `detect_clis`, which runs a non-interactive
/// shell). Pick the newest installed version, matching what a fresh
/// `nvm use default` would most commonly resolve.
#[cfg(not(target_os = "windows"))]
fn newest_nvm_bin(home: &str) -> Option<String> {
    let dir = std::path::Path::new(home).join(".nvm/versions/node");
    let parse = |name: &str| -> Option<(u64, u64, u64)> {
        let mut it = name.strip_prefix('v')?.split('.');
        Some((
            it.next()?.parse().ok()?,
            it.next()?.parse().ok()?,
            it.next()?.parse().ok()?,
        ))
    };
    std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            parse(&name).map(|v| (v, e.path().join("bin")))
        })
        .filter(|(_, p)| p.is_dir())
        .max_by_key(|(v, _)| *v)
        .map(|(_, p)| p.to_string_lossy().to_string())
}

/// PATH plus tool locations a GUI launch doesn't see (Node.js, npm global
/// bin, Homebrew, nvm) — shell rc files never run for a Finder/Explorer
/// launched app, so detected CLIs would otherwise fail to spawn.
fn augmented_path() -> String {
    let mut path = std::env::var("PATH").unwrap_or_default();
    #[cfg(target_os = "windows")]
    let (sep, extras) = {
        let mut extras: Vec<String> = vec!["C:\\Program Files\\nodejs".into()];
        if let Ok(appdata) = std::env::var("APPDATA") {
            extras.push(format!("{appdata}\\npm"));
        }
        if let Some(prefix) = npm_prefix() {
            extras.push(prefix);
        }
        (';', extras)
    };
    #[cfg(not(target_os = "windows"))]
    let (sep, extras) = {
        // Homebrew (both prefixes) and the common per-user npm locations.
        let mut extras: Vec<String> =
            vec!["/usr/local/bin".into(), "/opt/homebrew/bin".into()];
        if let Some(home) = home_dir_env() {
            extras.push(format!("{home}/.npm-global/bin"));
            extras.push(format!("{home}/.local/bin"));
            if let Some(nvm_bin) = newest_nvm_bin(&home) {
                extras.push(nvm_bin);
            }
        }
        if let Some(prefix) = npm_prefix() {
            // Unlike Windows, npm's global bin lives under <prefix>/bin.
            extras.push(format!("{prefix}/bin"));
        }
        (':', extras)
    };
    for e in extras {
        if std::path::Path::new(&e).exists() && !path.to_lowercase().contains(&e.to_lowercase()) {
            path.push(sep);
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
    #[cfg(target_os = "windows")]
    {
        // PowerShell single-quote escaping ('' inside '…'): %TEMP% contains
        // the username, and Windows allows ' in usernames — an unescaped
        // quote both breaks the script and is a string-injection point.
        let ps_path = path.display().to_string().replace('\'', "''");
        let script =
            format!("$img = Get-Clipboard -Format Image; if ($img) {{ $img.Save('{ps_path}') }}");
        let mut c = std::process::Command::new("powershell.exe");
        c.args(["-NoProfile", "-Command", &script]);
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        let _ = c.output();
    }
    #[cfg(target_os = "macos")]
    {
        // AppleScript writes the clipboard PNG straight to the file; no
        // external tools (pngpaste) required.
        let script = format!(
            "try\n\
             set f to open for access POSIX file \"{}\" with write permission\n\
             write (the clipboard as «class PNGf») to f\n\
             close access f\n\
             end try",
            path.display().to_string().replace('\\', "\\\\").replace('"', "\\\"")
        );
        let _ = std::process::Command::new("osascript")
            .args(["-e", &script])
            .output();
    }
    #[cfg(target_os = "linux")]
    {
        // Wayland first, then X11; each tool exits nonzero when the
        // clipboard has no image, leaving the file absent.
        let quoted = sh_squote(&path.display().to_string());
        for cmd in [
            format!("wl-paste -t image/png > {quoted}"),
            format!("xclip -selection clipboard -t image/png -o > {quoted}"),
        ] {
            let ok = std::process::Command::new("/bin/sh")
                .args(["-c", &cmd])
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);
            if ok && path.exists() {
                break;
            }
            let _ = std::fs::remove_file(&path);
        }
    }
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
    // Fragments arrive with '/' from the palette; only Windows needs them
    // mapped to the native separator for the filesystem join.
    let native_sep = if cfg!(target_os = "windows") { '\\' } else { '/' };
    let frag = if cfg!(target_os = "windows") {
        prefix.replace('/', "\\")
    } else {
        prefix
    };
    let (sub, pre) = match frag.rfind(native_sep) {
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
/// directory; these paths come from terminal output, not a shell, so no
/// shell ever expands them for us.
fn expand_tilde(path: &str) -> String {
    match path.strip_prefix('~') {
        Some(rest) if rest.is_empty() || rest.starts_with(['\\', '/']) => match home_dir_env() {
            Some(home) => format!("{home}{rest}"),
            None => path.to_string(),
        },
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

/// Read an arbitrary file as base64 for the 3D model preview panel. Model
/// formats (glb/stl binary data, gltf sibling .bin/textures) aren't valid
/// UTF-8 so `read_text_file` can't carry them; this mirrors
/// `read_image_data_url`'s "just hand back base64" approach rather than
/// widening the asset-protocol filesystem scope for arbitrary clicked-on
/// paths.
#[tauri::command]
async fn read_binary_file_base64(path: String) -> Result<String, String> {
    const MAX_BYTES: u64 = 64 * 1024 * 1024;
    let path = expand_tilde(&path);
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("not a file".into());
    }
    if meta.len() > MAX_BYTES {
        return Err("file too large to preview (>64 MB)".into());
    }
    use base64::Engine;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
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
    let slice = if truncated {
        &bytes[..MAX_BYTES as usize]
    } else {
        &bytes[..]
    };
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

/// Write edited text back to disk from the preview panel. Only ever called
/// on a path the preview already successfully read as text, so no separate
/// binary/size guard is needed here.
#[tauri::command]
async fn write_text_file(path: String, contents: String) -> Result<(), String> {
    let path = expand_tilde(&path);
    std::fs::write(&path, contents).map_err(|e| e.to_string())
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
    Some(GitStatus {
        branch,
        added,
        removed,
        dirty: !porcelain.is_empty(),
    })
}

/// Check which CLIs are resolvable in PATH (handles .cmd shims via where.exe
/// on Windows; `command -v` in a login shell elsewhere).
#[tauri::command]
async fn detect_clis(names: Vec<String>) -> Vec<bool> {
    names
        .iter()
        .map(|n| {
            #[cfg(target_os = "windows")]
            let mut c = {
                let mut c = std::process::Command::new("where.exe");
                c.arg(n);
                use std::os::windows::process::CommandExt;
                c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
                c
            };
            #[cfg(not(target_os = "windows"))]
            let mut c = {
                let mut c = std::process::Command::new("/bin/sh");
                c.args(["-lc", &format!("command -v {}", sh_squote(n))]);
                c
            };
            c.env("PATH", augmented_path());
            c.output().map(|o| o.status.success()).unwrap_or(false)
        })
        .collect()
}

/// F3 — AI command search: run the user's installed Claude Code in print
/// mode to turn natural language into one shell command. The prompt goes
/// through stdin, never the command line — cmd.exe re-parses argument
/// strings, so metacharacters in free text would otherwise break the call.
/// No API keys or network calls of our own: the local CLI carries auth.
#[tauri::command]
async fn ask_claude(prompt: String, cwd: Option<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Write;
        use std::process::Stdio;
        #[cfg(target_os = "windows")]
        let mut c = {
            // npm ships claude as a .cmd shim; cmd.exe resolves it.
            let mut c = std::process::Command::new("cmd.exe");
            c.args(["/c", "claude", "-p", "--output-format", "text"]);
            use std::os::windows::process::CommandExt;
            c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
            c
        };
        #[cfg(not(target_os = "windows"))]
        let mut c = {
            let mut c = std::process::Command::new("claude");
            c.args(["-p", "--output-format", "text"]);
            c
        };
        if let Some(d) = cwd.filter(|d| std::path::Path::new(d).is_dir()) {
            c.current_dir(d);
        }
        c.env("PATH", augmented_path());
        c.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
        let mut child = c.spawn().map_err(|e| format!("spawn: {e}"))?;
        child
            .stdin
            .take()
            .ok_or("no stdin")?
            .write_all(prompt.as_bytes())
            .map_err(|e| e.to_string())?;
        let out = child.wait_with_output().map_err(|e| e.to_string())?;
        if !out.status.success() {
            let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
            return Err(if err.is_empty() {
                format!("claude exited with {}", out.status)
            } else {
                err
            });
        }
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PlatformInfo {
    os: &'static str,
    /// Whether voice announcements can work here (Linux needs spd-say).
    tts_available: bool,
}

/// Static platform facts the frontend adapts to (labels, hidden toggles,
/// TTS routing). Queried once at startup.
#[tauri::command]
fn platform_info() -> PlatformInfo {
    #[cfg(target_os = "linux")]
    let tts_available = std::process::Command::new("spd-say")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    // Windows speaks through WebView2's speechSynthesis; macOS ships `say`.
    #[cfg(not(target_os = "linux"))]
    let tts_available = true;
    PlatformInfo {
        os: std::env::consts::OS,
        tts_available,
    }
}

/// Speak `text` through the OS voice engine (macOS `say`, Linux `spd-say`).
/// Windows never calls this — the webview's speechSynthesis handles it.
#[tauri::command]
fn speak_text(text: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let _ = text;
        Err("Windows uses the webview speechSynthesis path".into())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("say")
            .arg("--")
            .arg(&text)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("spd-say")
            .arg("--")
            .arg(&text)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        let _ = text;
        Err("TTS is not supported on this platform".into())
    }
}

/// Hotkey suffix for tray menu items: Alt is the Option key on macOS.
fn hotkey_label(key: &str) -> String {
    if cfg!(target_os = "macos") {
        format!("⌥{key}")
    } else {
        format!("Alt+{key}")
    }
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

/// macOS: the CGWindowList is ordered front-to-back; the first layer-0
/// entry is the window the user is looking at. It counts as a fullscreen
/// game when it isn't ours and exactly covers some display.
#[cfg(target_os = "macos")]
fn game_foreground() -> bool {
    use core_foundation::base::{CFType, TCFType};
    use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
    use core_foundation::number::CFNumber;
    use core_foundation::string::CFString;
    use core_graphics::display::CGDisplay;
    use core_graphics::geometry::CGRect;
    use core_graphics::window::{
        copy_window_info, kCGNullWindowID, kCGWindowListExcludeDesktopElements,
        kCGWindowListOptionOnScreenOnly,
    };

    let Some(windows) = copy_window_info(
        kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
        kCGNullWindowID,
    ) else {
        return false;
    };
    // The CGWindow dictionary keys are documented literal strings equal to
    // their constant names.
    let layer_key = CFString::from_static_string("kCGWindowLayer");
    let pid_key = CFString::from_static_string("kCGWindowOwnerPID");
    let bounds_key = CFString::from_static_string("kCGWindowBounds");
    for item in windows.iter() {
        let dict =
            unsafe { CFDictionary::<CFString, CFType>::wrap_under_get_rule(*item as CFDictionaryRef) };
        let int = |key: &CFString| -> Option<i64> {
            dict.find(key)
                .and_then(|v| v.downcast::<CFNumber>())
                .and_then(|n| n.to_i64())
        };
        if int(&layer_key) != Some(0) {
            continue;
        }
        // Our own overlay having focus is not "in a match" — same contract
        // as the Windows GetForegroundWindow pid check.
        if int(&pid_key) == Some(std::process::id() as i64) {
            return false;
        }
        let Some(rect) = dict
            .find(&bounds_key)
            .and_then(|v| v.downcast::<CFDictionary>())
            .and_then(|b| CGRect::from_dict_representation(&b))
        else {
            return false;
        };
        return CGDisplay::active_displays()
            .unwrap_or_default()
            .into_iter()
            .any(|id| {
                let b = CGDisplay::new(id).bounds();
                rect.origin.x <= b.origin.x
                    && rect.origin.y <= b.origin.y
                    && rect.origin.x + rect.size.width >= b.origin.x + b.size.width
                    && rect.origin.y + rect.size.height >= b.origin.y + b.size.height
            });
    }
    false
}

/// Linux: X11 only — ask the window manager (EWMH) whether the active
/// window is fullscreen. On Wayland (or a non-EWMH WM) the connection or
/// the atoms are missing and this stays false: do-not-disturb then only
/// works via the manual Alt+N toggle (documented limitation).
#[cfg(target_os = "linux")]
fn game_foreground() -> bool {
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::{AtomEnum, ConnectionExt};

    let Ok((conn, screen_num)) = x11rb::connect(None) else {
        return false;
    };
    let root = conn.setup().roots[screen_num].root;
    let atom = |name: &str| {
        conn.intern_atom(true, name.as_bytes())
            .ok()
            .and_then(|c| c.reply().ok())
            .map(|r| r.atom)
            .filter(|a| *a != x11rb::NONE)
    };
    let (Some(net_active), Some(net_state), Some(net_fullscreen)) = (
        atom("_NET_ACTIVE_WINDOW"),
        atom("_NET_WM_STATE"),
        atom("_NET_WM_STATE_FULLSCREEN"),
    ) else {
        return false;
    };
    let active = conn
        .get_property(false, root, net_active, AtomEnum::WINDOW, 0, 1)
        .ok()
        .and_then(|c| c.reply().ok())
        .and_then(|r| r.value32().and_then(|mut v| v.next()));
    let Some(active) = active.filter(|w| *w != 0) else {
        return false;
    };
    // Our own window having focus is not "in a match".
    if let Some(net_pid) = atom("_NET_WM_PID") {
        let pid = conn
            .get_property(false, active, net_pid, AtomEnum::CARDINAL, 0, 1)
            .ok()
            .and_then(|c| c.reply().ok())
            .and_then(|r| r.value32().and_then(|mut v| v.next()));
        if pid == Some(std::process::id()) {
            return false;
        }
    }
    conn.get_property(false, active, net_state, AtomEnum::ATOM, 0, 32)
        .ok()
        .and_then(|c| c.reply().ok())
        .and_then(|r| r.value32().map(|v| v.into_iter().any(|a| a == net_fullscreen)))
        .unwrap_or(false)
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
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
                format!("{toggle}\t{}", hotkey_label("X")),
                true,
                None::<&str>,
            )?;
            let m_ghost = MenuItem::with_id(
                &handle,
                "ghost",
                format!("{ghost}\t{}", hotkey_label("G")),
                true,
                None::<&str>,
            )?;
            let m_palette = MenuItem::with_id(
                &handle,
                "palette",
                format!("{palette}\t{}", hotkey_label("P")),
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
    // Download BEFORE killing anything: a failed download (network drop,
    // rate limit) must leave the user's sessions untouched.
    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    if let Some(state) = app.try_state::<PtyState>() {
        let mut sessions = state.sessions.lock().unwrap();
        for (_, mut s) in sessions.drain() {
            let _ = s.child.kill();
        }
    }
    update.install(bytes).map_err(|e| e.to_string())?;
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
            ask_claude,
            list_dir,
            save_temp_image,
            clipboard_image_to_temp,
            read_text_file,
            write_text_file,
            read_image_data_url,
            read_binary_file_base64,
            git_status,
            install_update,
            platform_info,
            speak_text
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
                    let Ok(updater) = handle.updater() else {
                        return;
                    };
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

                let m_toggle = MenuItem::with_id(
                    app,
                    "toggle",
                    format!("Show / Hide\t{}", hotkey_label("X")),
                    true,
                    None::<&str>,
                )?;
                let m_ghost = MenuItem::with_id(
                    app,
                    "ghost",
                    format!("Ghost mode\t{}", hotkey_label("G")),
                    true,
                    None::<&str>,
                )?;
                let m_palette = MenuItem::with_id(
                    app,
                    "palette",
                    format!("Prompt palette\t{}", hotkey_label("P")),
                    true,
                    None::<&str>,
                )?;
                let m_quit = MenuItem::with_id(app, "quit", "Quit AFKode", true, None::<&str>)?;
                let sep = PredefinedMenuItem::separator(app)?;
                let menu =
                    Menu::with_items(app, &[&m_toggle, &m_ghost, &m_palette, &sep, &m_quit])?;

                TrayIconBuilder::with_id("afkode-tray")
                    .icon(app.default_window_icon().unwrap().clone())
                    .tooltip(format!("AFKode — {}", hotkey_label("X")))
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
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app, _event| {
            // macOS: clicking the Dock icon fires Reopen (there is no
            // taskbar button or tray left-click like Windows) — bring the
            // hidden overlay back instead of ignoring the click.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                show_overlay(_app.clone());
            }
        });
}
