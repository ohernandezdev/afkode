# Contributing to AFKode

Thanks for your interest in contributing! This document explains how the project is organized and the conventions we follow.

## Project structure

```
├── index.html            # Main overlay window (markup)
├── hud.html              # Mini-HUD pill window
├── palette.html          # Prompt palette window (Alt+P)
├── src/
│   ├── main.ts           # Overlay logic: sessions, tabs, themes, i18n, notifications
│   ├── hud.ts            # HUD rendering (receives "hud-state" events)
│   ├── palette.ts        # Palette input (emits "palette-submit")
│   └── styles.css        # Overlay styles (design tokens as CSS variables)
├── src-tauri/
│   ├── src/lib.rs        # Rust backend: PTY (ConPTY), global hotkeys, tray, windows
│   ├── tauri.conf.json   # Windows, bundling, WebView2 flags
│   └── capabilities/     # IPC permissions per window
└── vite.config.ts        # Multi-entry build (main / hud / palette)
```

**Architecture in one paragraph:** the Rust side owns PTYs (`portable-pty` over ConPTY), global shortcuts, the tray, and window visibility. It streams terminal output to the frontend as `pty-output` events (UTF-8 safe chunking) and receives input via `write_pty`. The main window owns all product logic — sessions, agent-state heuristics, notifications — and feeds the HUD/palette windows through Tauri's global event bus (`emit`/`listen`). HUD and palette are intentionally dumb views.

## Development setup

Prerequisites: Node ≥ 20, Rust stable, Windows 10/11 (the PTY layer is Windows-only for now).

```powershell
npm install
npm run tauri dev      # dev app with HMR
npx tsc --noEmit       # typecheck frontend
cargo check            # typecheck backend (run inside src-tauri/)
npm run tauri build    # production installers
```

If `cargo` fails with `CRYPT_E_NO_REVOCATION_CHECK` on your network, the repo's `.cargo/config.toml` already sets `check-revoke = false`.

## Code conventions

### General
- **Everything in English**: code, comments, commit messages, docs. User-facing strings go through i18n (see below) — never hardcode them in markup or logic.
- Keep comments for *why*, not *what*. Match the existing comment density.

### TypeScript (frontend)
- Strict mode is on; `npx tsc --noEmit` must pass with zero errors.
- No frameworks — this is vanilla TS + DOM on purpose (startup time and bundle size are product features). Don't introduce React/Vue/etc.
- State lives in module-level maps/objects in `main.ts`. If it grows painful, discuss before adding a state library.
- Persisted user state goes to `localStorage` (`settings`, `panel-alpha`, `last-folder`). Extend the `Settings` interface + `DEFAULTS` rather than adding loose keys.

### Rust (backend)
- `cargo fmt` before committing; `cargo clippy` clean is expected for new code.
- Tauri commands stay thin: validate, delegate, return `Result<_, String>`. Product logic belongs to the frontend unless it needs OS APIs.
- Anything that can fail at startup (hotkey registration, tray) must be **non-fatal**: log and continue. A conflicting hotkey from another overlay must never prevent AFKode from starting.

### i18n
- Every user-facing string needs a key in **both** `es` and `en` dictionaries in `src/main.ts` (`I18N`).
- Static HTML uses `data-i18n` (textContent) / `data-i18n-title` (tooltip) attributes.
- The HUD and palette windows read the language from `localStorage` — keep them dependency-free.

### UX principles (the product's non-negotiables)
1. **Never steal the game's focus** unless the user asked for it (hotkey/click).
2. **Silence is a feature**: notifications only fire when the overlay is hidden or unfocused.
3. **Every feature must be reachable without leaving the game**: if it needs the mouse and the full overlay, question it.
4. Agent-state detection is heuristic (ANSI-stripped tail + silence windows in `main.ts`). If you touch `WAITING_RE` or the silence thresholds, test against real Claude Code permission prompts before submitting.

## Commits and PRs

- **Conventional Commits**: `feat:`, `fix:`, `docs:`, `refactor:`, `perf:`, `chore:`. Scope is optional but welcome (`feat(hud): …`).
- One logical change per PR. Screenshots or a short clip for anything visual.
- PR checklist:
  - [ ] `npx tsc --noEmit` passes
  - [ ] `cargo check` passes (and `cargo fmt` ran)
  - [ ] New strings exist in both `es` and `en`
  - [ ] Tested with a real agent session (Claude Code or another CLI)
  - [ ] Hotkeys still register when another overlay (NVIDIA/Discord) is running
- Version bumps happen in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `package.json` together — maintainers handle them on release.

## Reporting bugs

Include: Windows version, GPU, the game and its display mode (windowed / borderless / exclusive fullscreen), which agent CLI and version, and what the terminal showed. For notification/approval issues, paste the exact prompt text the agent displayed — the detection is pattern-based and that's the fastest way to fix it.

## Ideas / roadmap

Open an issue first for anything sizable. Current directions we care about: configurable hotkeys, a "what happened while you played" summary, per-session HUD detail, multi-monitor polish, and Linux/macOS PTY support.
