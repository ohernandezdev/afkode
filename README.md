# AFKode

**Your AI codes while you play.** An in-game overlay to supervise AI coding agents (Claude Code, OpenCode, Codex) — or any terminal — without leaving your game.

Built with **Tauri 2** (Rust + WebView2) and **xterm.js with the WebGL renderer** — instant startup, minimal RAM, and near-zero FPS impact. The installer is ~2 MB.

## Global hotkeys

| Hotkey | Action |
|---|---|
| `Alt + X` | Show / hide the overlay |
| `Alt + G` | Ghost mode: translucent overlay, clicks pass through to the game |
| `Alt + P` / `Ctrl + Alt + P` | Prompt palette: type a task, it goes to the active agent |
| `Alt + A` | Approve: answer "yes" to the agent waiting for permission, without opening the overlay |
| `Alt + N` | Toggle do-not-disturb manually (lobbies are fullscreen too); auto-resets when the game closes |

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
- **Search** (`Ctrl+F`), **Unicode 11** cell widths, and **drag & drop** of files/folders (path pasted into the active session).
- **Memory saver**: hiding the overlay trims the host working set (~6 MB) and puts WebView2 in low-memory mode — lightest exactly while you play.
- **Folder picker**: sessions start in a project folder chosen via the native Windows dialog.
- **CLI detection**: launchers detect which agents are installed; missing ones install with one click (`npm install -g …` in a tab).
- **Tabs**: multiple parallel sessions (Claude Code, OpenCode, Codex, PowerShell).
- **Real terminal (ConPTY)**: truecolor, interactive apps, GPU-rendered. Copy-on-select, `Ctrl+Shift+C/V`, right-click copy/paste (inside TUIs, select with `Shift+drag`).
- **Customization**: 6 themes (Warp Dark, Claude Warm, Dracula, Nord, Tokyo Night, Gruvbox), font family/size, English/Spanish UI, background opacity slider.
- **Window memory**: position and size are restored across sessions.

## Development

```powershell
npm install
npm run tauri dev
```

## Production build

```powershell
npm run tauri build
```

Installers land in `src-tauri/target/release/bundle/` (NSIS `.exe` and MSI).

## Install

Grab the latest installer from [Releases](https://github.com/ohernandezdev/afkode/releases). AFKode checks for updates on startup and installs them in the background (signed updater artifacts); restart to apply.

## Pending for public distribution

- **Code signing** (OV/EV certificate): without it, Windows SmartScreen warns on install.

## Limitations

- Works over games in **windowed or borderless** mode (like Discord/Overwolf without injection). In *exclusive fullscreen* the game covers the overlay.
- Hotkeys are defined in `src-tauri/src/lib.rs` (`TOGGLE_SHORTCUT`, `GHOST_SHORTCUT`, …). `Alt+Z` is typically taken by the NVIDIA overlay, which is why ghost mode uses `Alt+G`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Roadmap and product thesis: [ROADMAP.md](ROADMAP.md).

## License

[MIT](LICENSE)
