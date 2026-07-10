# AFKode

**Your AI codes while you play.** An in-game overlay to supervise AI coding agents (Claude Code, OpenCode, Codex) — or any terminal — without leaving your game.

Built with **Tauri 2** (Rust + the OS webview) and **xterm.js with the WebGL renderer** — instant startup, minimal RAM, and near-zero FPS impact. The Windows installer is ~2 MB. Runs on **Windows, macOS and Linux** (see the [feature support matrix](#platform-support)).

## Global hotkeys

| Hotkey | Action |
|---|---|
| `Alt + X` | Show / hide the overlay |
| `Alt + G` | Ghost mode: translucent overlay, clicks pass through to the game |
| `Alt + P` / `Ctrl + Alt + P` | Prompt palette: type a task, it goes to the active agent |
| `Alt + A` | Approve: answer "yes" to the agent waiting for permission, without opening the overlay |
| `Alt + N` | Toggle do-not-disturb manually (lobbies are fullscreen too); auto-resets when the game closes |

On macOS, `Alt` is the **Option (⌥)** key: the shortcuts are `⌥X`, `⌥G`, `⌥P` / `⌃⌥P`, `⌥A`, `⌥N`.

### In-app shortcuts

| Windows / Linux | macOS | Action |
|---|---|---|
| `Ctrl+F` | `⌘F` | Search the terminal scrollback |
| `Ctrl+K` | `⌘K` | Search open sessions |
| `Ctrl+V` | `⌘V` | Paste (clipboard image → temp PNG path for the agent) |
| — | `⌘C` | Copy the selection (`Ctrl+C` stays SIGINT) |
| `Ctrl+Shift+C` | `⌘⇧C` | Copy selection, or the selected block's output |
| `Ctrl+↑/↓` | `⌘↑/↓` | Jump between command blocks |
| `Shift+Enter` | `Shift+Enter` | Literal newline in agent TUIs (no submit) |

On macOS, `Ctrl+F`, `Ctrl+K` and `Ctrl+V` pass through to the shell (they are readline editing keys there).

## Features

- **System tray**: AFKode lives next to the clock — left-click toggles the overlay, right-click opens the menu (ghost mode, palette, quit). The window's × hides to the tray instead of closing.
- **Mini-HUD**: a tiny draggable pill, visible while the overlay is hidden: 🟠 working · 3:42 / 🟡 waiting for you / 🟢 done. Click ⤢ to open the overlay. Toggle it in ⚙.
- **Hotkey approvals**: `Alt+A` answers the agent's permission prompt (Enter or `y` depending on the prompt type) without opening the overlay.
- **Prompt palette**: `Alt+P` opens a Spotlight-style input; Enter sends the text to the active agent session.
- **Auto-launch**: optional (⚙) — starts Claude Code in your last-used folder when AFKode opens.
- **Real agent integration (Claude Code hooks)**: optional (⚙, on by default) — sessions launch with injected hooks that report exact state to a local listener (127.0.0.1): which tool runs, when it waits for permission, when a turn ends. The HUD, `Alt+A` and the summary are exact, not guessed. Other CLIs fall back to text heuristics.
- **Do-not-disturb in match**: while a fullscreen game holds focus, AFKode stays silent; pending items queue in the **between-matches inbox** (approve/jump per row) and one ping fires when silence lifts. `Alt+N` overrides manually (lobbies are fullscreen too), 🔕 shows on the HUD.
- **"While you were away" summary**: coming back after 2+ minutes shows turns completed, tools run, files touched, and how long agents sat waiting for you.
- **Prompt palette with autocomplete**: history (↑), Claude Code `/commands`, and `@file` completion against the session's folder (Tab).
- **Quick reply**: the HUD pill grows a ↩ button when an agent waits — the palette opens pre-targeted at the asking session with a context line.
- **Voice announcements (TTS)**: optional copilot-style voice over game audio; immune to Windows fullscreen toast suppression.
- **Agent-aware notifications**: if the overlay is hidden and your agent finishes or gets stuck waiting for input (permission prompt, `y/n`, ANSI bell), you get a Windows toast + optional beep.
- **Command blocks (Warp-style)**: shell tabs group each command + its output into a block via OSC 133 shell integration (injected at spawn — your profile files are never edited). Colored gutter bar per block (green ✓ / red ✗ by exit status), hover toolbar (copy command / output / both, re-run), `Ctrl+↑/↓` (`Cmd` on macOS) jumps between blocks, and `Ctrl+Shift+C` with a block selected copies its output. Automatic for PowerShell (Windows), bash (Linux) and zsh; other shells can [opt in manually](#command-blocks-in-other-shells). Agent TUI tabs are unaffected.
- **Search** (`Ctrl+F` / `⌘F`), **Unicode 11** cell widths, and **drag & drop** of files/folders (path pasted into the active session).
- **Memory saver**: hiding the overlay trims the host working set (~6 MB) and puts WebView2 in low-memory mode — lightest exactly while you play.
- **Folder picker**: sessions start in a project folder chosen via the native Windows dialog.
- **CLI detection**: launchers detect which agents are installed; missing ones install with one click (`npm install -g …` in a tab).
- **Tabs**: multiple parallel sessions (Claude Code, OpenCode, Codex, PowerShell — your login shell on macOS/Linux) — double-click to rename, right-click for a color tag; live state dots per tab; `Ctrl+K` (`⌘K`) searches open sessions.
- **Git footer**: branch, `+added/-removed` diff stat and dirty indicator for the active session's folder, Warp-style.
- **Real terminal (ConPTY)**: truecolor, interactive apps, GPU-rendered. Copy-on-select, `Ctrl+Shift+C/V` (`⌘C`/`⌘V` on macOS), right-click copy/paste (inside TUIs, select with `Shift+drag`).
- **Customization**: 9 themes (Warp Dark, Claude Warm, Dracula, Nord, Tokyo Night, Gruvbox, Solarized, GitHub Dark, Monokai), font family/size, English/Spanish UI, background opacity slider.
- **Window memory**: position and size are restored across sessions.

## Platform support

AFKode is Windows-first; macOS and Linux builds ship from the same codebase with per-OS implementations. Anything degraded or unavailable is listed here — no silent gaps.

| Feature | Windows | macOS | Linux |
|---|---|---|---|
| Terminal (PTY), tabs, themes, palette, search | ✅ ConPTY | ✅ | ✅ |
| Shell tab | PowerShell | login shell (`$SHELL`, fallback zsh) | login shell (`$SHELL`, fallback bash) |
| Claude Code hooks integration (HUD, `Alt+A`, summary) | ✅ | ✅ (needs `curl`, preinstalled) | ✅ (needs `curl`) |
| Global hotkeys | ✅ `Alt+…` | ✅ `⌥…` (Option) | ✅ `Alt+…` (X11; compositor-dependent on Wayland) |
| Auto do-not-disturb (fullscreen game detection) | ✅ Win32 | ✅ CGWindowList | ✅ X11 (EWMH) · ❌ Wayland — use manual `Alt+N` |
| Voice announcements (TTS) | ✅ WebView2 speech | ✅ `say` | ⚠️ `spd-say` (speech-dispatcher); toggle hidden if missing |
| Notifications | ✅ toasts | ✅ (allow in System Settings) | ✅ (libnotify) |
| Memory saver on hide (working-set trim + low-memory webview) | ✅ | ❌ automatic no-op | ❌ automatic no-op |
| Setup wizard Node.js install | ✅ winget | ⚠️ Homebrew if present | ⚠️ apt/dnf (needs sudo password in the tab) |
| Clipboard image paste to agent | ✅ | ✅ AppleScript | ⚠️ needs `wl-paste` or `xclip` |
| Tray icon | ✅ | ✅ menu bar | ✅ (needs an appindicator-capable desktop) |
| Auto-updater (signed artifacts) | ✅ NSIS | ✅ `.app.tar.gz` (manual install via `.dmg`) | ✅ AppImage only (deb/rpm update via package manager) |
| Overlay transparency / always-on-top | ✅ | ✅ | ⚠️ X11 yes; Wayland depends on the compositor |
| In-app shortcuts | `Ctrl+…` | `⌘…` (`Ctrl+F/K/V` pass to the shell) | `Ctrl+…` |
| CLI detection under GUI PATH | ✅ | ✅ Homebrew, npm prefix, `~/.nvm` | ✅ |

Notes:
- **Wayland**: fullscreen-game detection is out of scope (no protocol for inspecting foreign windows); DND works via the manual `Alt+N` toggle. Under XWayland-capable setups the X11 path may still work.
- macOS/Linux builds are CI-verified (build + `cargo check`/tests per OS); day-to-day development happens on Windows, so treat non-Windows paths as less battle-tested and report issues.
- A full per-module macOS audit (what works, what was fixed, what is Windows-only by design, and what still needs on-device verification) lives in [MACOS-AUDIT.md](MACOS-AUDIT.md).

### Command blocks in other shells

Command blocks activate automatically for PowerShell (Windows), bash (Linux) and zsh (macOS/Linux). Any other shell works too if it emits [OSC 133](https://gitlab.freedesktop.org/Per_Bothner/specifications/blob/master/proposals/semantic-prompts.md) sequences — add the equivalent of this to its config (fish ≥ 3.6 example, `~/.config/fish/config.fish`):

```fish
function __afk_prompt_start --on-event fish_prompt
    printf '\e]133;D;%s\e\\' $status
    printf '\e]133;A\e\\'
end
function __afk_preexec --on-event fish_preexec
    printf '\e]133;C\e\\'
end
# B (input start) at the end of your prompt:
functions --copy fish_prompt __afk_orig_prompt
function fish_prompt
    __afk_orig_prompt
    printf '\e]133;B\e\\'
end
```

Notes: bash integration is injected via `--rcfile`, which bash ignores for login shells (`-l`), so a bash login shell on macOS gets no blocks — zsh (the macOS default) is fully supported. If your `.bashrc` already sets a `PROMPT_COMMAND`, it is preserved (AFKode prepends its hook).

## Development

```powershell
npm install
npm run tauri dev
```

On Linux you need the Tauri 2 system packages first: `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev libssl-dev patchelf`.

## Production build

```powershell
npm run tauri build
```

Installers land in `src-tauri/target/release/bundle/` — NSIS `.exe` + MSI on Windows, `.dmg` on macOS, `.deb`/`.rpm`/`.AppImage` on Linux. CI builds all of them from a 3-OS matrix on every `v*` tag.

## Install

- **Windows**: grab the NSIS installer from [Releases](https://github.com/ohernandezdev/afkode/releases) (or `winget install OmarHernandez.AFKode`).
- **macOS**: download the `.dmg` from Releases and drag AFKode to Applications. The build is unsigned/un-notarized for now: right-click → Open on first launch (or `xattr -dr com.apple.quarantine /Applications/AFKode.app`).
- **Linux**: download the `.AppImage` (self-updating) or the `.deb`/`.rpm` from Releases.

AFKode checks for updates on startup and installs them after you confirm (signed updater artifacts); restart to apply.

## Pending for public distribution

- **Code signing** (OV/EV certificate): without it, Windows SmartScreen warns on install.

## Limitations

- Works over games in **windowed or borderless** mode (like Discord/Overwolf without injection). In *exclusive fullscreen* the game covers the overlay.
- Hotkeys are defined in `src-tauri/src/lib.rs` (`TOGGLE_SHORTCUT`, `GHOST_SHORTCUT`, …). `Alt+Z` is typically taken by the NVIDIA overlay, which is why ghost mode uses `Alt+G`.

## What's next

The feature roadmap lives in [ROADMAP-FEATURES.md](ROADMAP-FEATURES.md) — 12 Warp-inspired features planned across v0.8–v1.1, each with a description, state-of-the-art references, an implementation plan, and a ready-to-paste `/goal` prompt for an AI coding agent:

- **v0.8 — Terminal IQ**: Command Blocks (OSC 133), Command Palette (`>` actions), AI Command Search (`#` → command via local Claude Code), Session Restore.
- **v0.9 — Trust & Approvals**: Diff preview before approving Edits, risk-graded approvals (🟢/🟡/🔴), per-session cost & token telemetry.
- **v1.0 — Fleet & Chat**: Chat View over agent transcripts, fleet mini-dashboard on the HUD, remote approvals from Telegram.
- **v1.1 — Gamer Distribution**: Discord Rich Presence + shareable session cards, edge-docked peek mode & per-game HUD profiles.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Product thesis: [ROADMAP.md](ROADMAP.md) · Feature roadmap: [ROADMAP-FEATURES.md](ROADMAP-FEATURES.md).

## License

[MIT](LICENSE)
