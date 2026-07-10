# macOS audit

A module-by-module sweep of every platform-sensitive point in `src-tauri/src/` and
`src/`, done after the fdac0f4 port (which compiled and launched, but real-device
testing kept surfacing gaps — webview transparency and Dock-icon reopen were the
first two, fixed in 680af84).

Classification per entry:

- ✅ **works** — verified correct for macOS at the code level.
- 🔧 **was broken, fixed** — broken or degraded on macOS; fixed in the referenced
  commit, gated so Windows/Linux behavior is untouched.
- 🪟 **Windows-only by design** — intentionally does nothing (or something else)
  on macOS, with the reason.

Fix commits referenced below:

- `8f6c9f9` — fix(macos): resolve nvm-installed Node/Claude in the GUI-app PATH
- `29630a1` — fix(macos): Cmd shortcuts, Option-key labels, POSIX paths, native fonts

No macOS hardware was available for this pass: the bar is code-level verification
plus a green 3-OS CI build. Everything that can only be proven on a device is
listed in [Needs device testing](#needs-device-testing).

## src-tauri/src/lib.rs — command by command

| Item | Status | Notes |
|---|---|---|
| `spawn_pty` — shell selection | ✅ works | Non-Windows spawns `$SHELL` (fallback `/bin/zsh` on macOS) as a login shell (`-l`) so Finder-launched apps get the user's profile PATH. Windows branch (`powershell.exe`/`cmd.exe`) is `#[cfg(windows)]`. |
| `spawn_pty` — claude branch | ✅ works | POSIX: `sh_squote`-quoted argv + `exec $SHELL` on exit, mirroring the Windows `-NoExit` contract. `--settings` hook injection identical. |
| `spawn_pty` — OSC 133 injection | ✅ works | zsh via the ZDOTDIR indirection (VS Code/kitty technique), user files sourced with ZDOTDIR restored; hooks installed with `add-zsh-hook` (never clobbering precmd). bash on macOS: 🪟 by design — `bash -l` ignores `--rcfile`, so a bash login shell gets no blocks (documented in README; zsh is the macOS default since Catalina). |
| `write_pty` / `resize_pty` / `kill_pty` | ✅ works | portable-pty; no platform code. |
| `JobHandle` / `job_for_child` | 🪟 by design | Windows Job Objects kill the ConPTY process tree. On POSIX, killing the PTY child suffices (SIGHUP propagates through the controlling terminal); stub returns `None`. |
| `ps_squote` / `PS_SHELL_INTEGRATION` / `ps_encode` | 🪟 by design | PowerShell-specific, `#[cfg(windows)]`. POSIX equivalents (`sh_squote`, bash/zsh integration) exist. |
| `login_shell` / `home_dir_env` | ✅ works | `$SHELL` with `/bin/zsh` fallback for launchd-spawned processes without it; `HOME` vs `USERPROFILE` handled. |
| `hook server` + `write_hooks_settings` | ✅ works | 127.0.0.1 listener is cross-platform; hook commands use `curl`, preinstalled on macOS. |
| `npm_prefix` | ✅ works | POSIX path shells out via `/bin/sh -lc` so Homebrew-managed npm resolves in GUI launches. nvm-managed npm is additionally covered by the PATH fix below. |
| `augmented_path` | 🔧 fixed `8f6c9f9` | Covered Homebrew (`/usr/local/bin`, `/opt/homebrew/bin`), `~/.npm-global/bin`, `~/.local/bin` — but not nvm, whose bin dir (`~/.nvm/versions/node/<ver>/bin`) is only wired up by shell rc files and is invisible to a launchd-launched app. `detect_clis` therefore reported claude "not installed" for nvm users and the setup wizard would loop. Now appends the newest installed nvm version's bin (`cfg(not(windows))`). |
| `detect_clis` | ✅ works | POSIX: `command -v` in `/bin/sh -lc` with the augmented PATH (including the nvm fix). Windows `where.exe` branch untouched. |
| `save_temp_image` | ✅ works | Pure std fs; temp dir is cross-platform. |
| `clipboard_image_to_temp` | ✅ works | macOS branch uses `osascript` (`the clipboard as «class PNGf»` written straight to the file) — no powershell.exe, no pngpaste dependency. The unconditional-PowerShell suspicion from the goal was already fixed in the port; verified the cfg gates are exhaustive (windows/macos/linux). Device-verify the PNGf coercion for screenshots (see below). |
| `list_dir` | ✅ works | Separator mapping is `cfg!(windows)`-gated; POSIX keeps `/`. |
| `expand_tilde` | ✅ works | Handles `~` and `~/x`; `~user` intentionally left alone. Unit-tested. |
| `read_image_data_url` / `read_text_file` | ✅ works | Pure std fs. |
| `run_git` / `git_status` | ✅ works | `CREATE_NO_WINDOW` flag is windows-cfg'd; git resolves via PATH. |
| `platform_info` | ✅ works | Reports `macos` + `tts_available: true` (macOS ships `say`). |
| `speak_text` | ✅ works | macOS spawns `say -- <text>`; Windows deliberately errors (webview speechSynthesis handles it there); Linux `spd-say`. |
| `hotkey_label` | ✅ works | Emits `⌥X`-style labels on macOS for tray items/tooltip. |
| `game_foreground` (DND detection) | ✅ works | macOS impl walks the CGWindowList front-to-back; first layer-0 window that isn't ours and exactly covers a display counts as fullscreen. Window bounds/layer/PID do **not** require the Screen Recording permission (only window names/images do). Device-verify against a real game. |
| `set_memory_saver` | 🪟 by design | `K32EmptyWorkingSet` + WebView2 memory-target are Windows APIs; macOS/Linux no-op (jetsam/OS handles paging). Documented in the README matrix. |
| `toggle_overlay` / `show_overlay` / `hide_overlay` | ✅ works | `is_minimized` guard is harmless on macOS; `unminimize`/`show`/`set_focus` are Tauri cross-platform. |
| `toggle_click_through` / `set_ghost_mode` | ✅ works | `set_ignore_cursor_events` is supported on macOS (NSWindow ignoresMouseEvents). |
| `set_window_mode` | ✅ works | `set_always_on_top` cross-platform. |
| `set_hud_visible` / palette show/hide | ✅ works | No platform code. |
| `set_tray_labels` / tray setup | ✅ works | Tray menu on the macOS menu bar; `show_menu_on_left_click(false)` is supported on macOS in Tauri 2, so left-click toggles the overlay and right-click opens the menu, matching Windows. Device-verify the left-click behavior. |
| `install_update` / startup update check | ✅ works | `createUpdaterArtifacts` produces the signed `.app.tar.gz` updater bundle on macOS; `latest.json` is merged across the 3-OS matrix by tauri-action (release.yml). The `.dmg` is the manual-install artifact only — the updater never consumes it, by design. Non-Windows reaches the `update-installed` emit (installer doesn't kill the process); frontend shows "restart to apply". |
| single-instance plugin | ✅ works | tauri-plugin-single-instance supports macOS; second launch surfaces the running overlay. macOS additionally serializes launches via Launch Services, so this is belt-and-suspenders. |
| window-state plugin | ✅ works | Cross-platform; VISIBLE flag excluded so hud/palette start hidden everywhere. |
| Global shortcuts (`alt+x/g/a/p/n`, `ctrl+alt+p`) | ✅ works | `Alt` maps to Option via global-shortcut's macOS backend (Carbon `RegisterEventHotKey` — no Accessibility permission needed). Registered individually so a taken chord doesn't abort startup. Option chords normally type special glyphs (⌥X → ≈) — registering them as global hotkeys consumes the keystroke system-wide, which is the intended trade-off. Device-verify. |
| `CloseRequested` → hide-to-tray | ✅ works | Same contract on macOS (⌘W/red button hides; Dock click reopens via the `Reopen` handler added in 680af84). |
| `RunEvent::Reopen` | ✅ works | macOS-only, added in 680af84 — Dock-icon click restores the hidden overlay. |

## src/main.ts

| Item | Status | Notes |
|---|---|---|
| Platform detection | 🔧 fixed `29630a1` | Was "assume Windows until `platform_info` resolves". Now detected synchronously from `navigator.platform`, refined by the invoke — labels/handlers correct from the first frame. |
| Terminal shortcuts Ctrl+F / Ctrl+K / Ctrl+V / Ctrl+Shift+C | 🔧 fixed `29630a1` | Were Ctrl-only: no Cmd equivalents, and worse, they hijacked Ctrl+F (forward-char) and Ctrl+K (kill-to-eol) from readline/zsh — core line-editing keys on macOS. Now: **Cmd+F** search, **Cmd+K** session search, **Cmd+V** paste (with the image-to-temp fallback), **Cmd+Shift+C** copy selection/block output, plus native **Cmd+C** copies the selection (no selection → falls through; Ctrl+C stays SIGINT). On macOS Ctrl+F/K/V now pass through to the shell. Windows/Linux conditions unchanged. |
| Block navigation Ctrl/Cmd+↑↓ | ✅ works | Was already Cmd-aware (`platform.os === "macos"`). |
| Shift+Enter → ESC+CR | ✅ works | Modifier-independent. |
| Hotkey labels in UI strings ("Alt+X", …) | 🔧 fixed `29630a1` | i18n strings, the status-bar hint, native notification bodies and tooltips hardcoded `Alt+…`. On macOS they now render Option chords (⌥X, ⌥G, …) via a display-time rewrite; `Ctrl+K`→`⌘K`, `Alt+Tab`→`⌘Tab`. Windows/Linux strings pass through untouched. |
| `openFilePreview` path join | 🔧 fixed `29630a1` | Joined relative paths as `` `${cwd}\${raw}` `` and rewrote `/`→`\` unconditionally — every relative file-link click produced a backslash path on macOS, and POSIX absolute paths (`/Users/...`) were misclassified as relative. Now `/`-joined off Windows and `/…` recognized as absolute. |
| `FONT_CANDIDATES` | 🔧 fixed `29630a1` | Windows-only list (Cascadia, Consolas, …) meant the font picker was empty-ish and the fallback was the nonexistent "Consolas" on macOS. Added SF Mono/Menlo/Monaco (filtered out by `document.fonts.check` on other OSes) and a Menlo fallback; terminal font stack gains Menlo after Consolas. |
| `applyPlatform` shell-tab label | ✅ works | Renames the "PowerShell" launcher to "Shell" off Windows. |
| `speak()` routing | ✅ works | Non-Windows invokes `speak_text` (macOS `say`) — WKWebView speechSynthesis is unreliable. |
| Notifications (`plugin-notification`) | ✅ works | Native macOS notifications; user must allow in System Settings (README documents this). |
| Drag & drop paths | ✅ works | Tauri delivers native absolute paths; space-containing paths are quoted with `"…"`, valid for POSIX shells and Claude Code alike. |
| Folder picker (`plugin-dialog`) | ✅ works | Native NSOpenPanel. |
| Clipboard (`plugin-clipboard-manager`) | ✅ works | NSPasteboard-backed; copy-on-select and paste go through Rust on all OSes. |
| `findHookSession` cwd normalization | ✅ works | Normalizes both sides identically (`/`→`\`, lowercase), so equality still holds on POSIX paths; lowercasing is only used for comparing a path against itself from two sources. |
| Setup wizard | ✅ works | `nodeInstallCmd()` uses `brew install node` on macOS with a clear fallback message; claude installs via npm as everywhere. Step-note copy still mentions winget (cosmetic, see below). |
| Update banner flow | ✅ works | Handles the non-Windows "installer didn't kill us" path via `update-installed` → "restart to apply". |
| Windows-flavored copy (help text, ConPTY/winget/toast wording, "native Windows dialog") | 🪟 by design (cosmetic) | Pure prose; no behavior. Left as-is rather than forking the i18n table per OS — candidates for a later copy pass. |

## src/blocks.ts

✅ **works** — consumes only OSC 133 sequences; no platform assumptions. On macOS
it activates for zsh tabs (the default shell) via the ZDOTDIR injection; stays
inert for agent TUIs and non-integrated shells. bash-login-shell tabs on macOS get
no blocks (see the lib.rs OSC 133 entry — documented limitation, opt-in snippet in
the README). The toolbar and gutter are DOM/CSS only.

## src/hud.ts

🔧 **fixed `29630a1`** — the open/reply tooltips hardcoded "Alt+X"/"Alt+P"; now ⌥X/⌥P
on macOS. Everything else is plain DOM + Tauri events (works).

## src/palette.ts

✅ **works** — Enter/Tab/arrows/Escape only; no modifier chords, no paths (the `@`
completion delegates separator handling to `list_dir`, which is gated in Rust).

## src/styles.css

✅ **works** — `-webkit-scrollbar` rules apply in WKWebView; standard
`scrollbar-width`/`scrollbar-color` are supported by recent Safari/WebKit and
harmlessly ignored otherwise. No `app-region` or Windows-specific hacks. Window
transparency interplay (`transparent: true` + `macOSPrivateApi`) was fixed in
680af84.

## Config / packaging

| Item | Status | Notes |
|---|---|---|
| `tauri.conf.json` | ✅ works | `macOSPrivateApi: true` for transparent windows; `.icns` icon present; `targets: "all"` produces `.dmg` + `.app` on macOS; `createUpdaterArtifacts` emits the signed `.app.tar.gz` the updater consumes. |
| `Cargo.toml` | ✅ works | `core-graphics` under `cfg(target_os = "macos")` only; `windows-sys`/`webview2-com` under windows; `x11rb` under linux. |
| CI (`build-test.yml`, `ci.yml`, `release.yml`) | ✅ works | 3-OS matrix; macOS builds `--target universal-apple-darwin` (Apple Silicon + Intel); tauri-action merges `latest.json` across platforms. |

## Needs device testing

Code-verified but only provable on real macOS hardware — please confirm on-device:

1. **Global Option hotkeys** (⌥X/⌥G/⌥P/⌥A/⌥N, ⌃⌥P): register and fire from any app;
   no Accessibility prompt expected.
2. **Command blocks in a zsh tab**: separators/gutters appear after the first
   prompt; user's own `.zshrc` prompt/plugins (oh-my-zsh, powerlevel10k) still load
   and their PS1 survives with the B-mark appended.
3. **Clipboard image paste** (Cmd+V with a screenshot on the clipboard): osascript
   `«class PNGf»` coercion writes a valid PNG for both ⇧⌘4-to-clipboard and
   browser-copied images.
4. **nvm-only machines**: with Node installed exclusively via nvm, launchers detect
   `claude` and sessions find it on PATH (fix `8f6c9f9`).
5. **Tray left-click** toggles the overlay; right-click opens the menu.
6. **Auto-DND**: a real fullscreen game (or fullscreen video app) flips game-mode
   within ~3 s; our own window focused does not.
7. **Updater end-to-end**: install an older `.dmg` build, accept the update banner,
   confirm the signed `.app.tar.gz` applies and the app relaunches updated.
8. **TTS**: `say` announces over other audio with the app unfocused.
9. **Cmd shortcut set** (Cmd+F/K/V/C/⇧C, Cmd+↑/↓) inside a Claude Code TUI tab and
   a zsh tab; Ctrl+F/K/V reach the shell.
10. **Notifications** appear after granting permission in System Settings, and are
    suppressed by auto/manual DND.
