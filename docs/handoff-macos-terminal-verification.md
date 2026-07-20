# Handoff: macOS terminal UX verification

Code-side work for the macOS Option-key / oh-my-zsh terminal UX issue is
done and merged to `main` (commits `7d7a556`, `59fe401`, both in
v0.8.17). What's left requires a real Mac running the built app — this
was authored from a Windows machine with no macOS hardware access, so
none of it has been runtime-verified. That's the job for whoever picks
this up on macOS.

## Verification results (2026-07-20, real macOS 15.7.7 hardware)

All 5 checks below run against the actual `npm run tauri dev` build
(confirmed via a temporary `write_pty` debug print showing the exact
bytes reaching the PTY — watch out for a stale globally-installed
`/Applications/AFKode.app` shadowing the dev build under the same
process/window name, which is what happened here on the first pass).

1. ✅ Option+Left/Right word-jump — bytes `[27, 98]` / `[27, 98]`
   (`ESC b` ×2) reached the PTY, cursor landed exactly between "one"
   and "two" in `cat one two three`.
2. ❌→✅ **Found and fixed a real regression, not caused by this fix.**
   `src-tauri/src/lib.rs` registers `alt+n` as an OS-level global
   shortcut (DND toggle). Global shortcuts are captured before the
   webview ever sees the keystroke, so Option+N — the standard macOS
   tilde dead-key for ñ/ã/õ on Spanish, Portuguese, US-International and
   ABNT2 layouts — never reached `xtermDeadKeyAddon`, breaking accent
   composition system-wide (not just inside AFKode) whenever the app is
   running. Fixed in `50a653c` by moving the shortcut to `alt+shift+n`.
   Confirmed after the fix: `cañ` composes correctly.
3. ✅ Option+Shift+Arrow reaches the PTY untouched — bytes
   `[27,91,49,59,52,68]` (`ESC[1;4D`, xterm's standard Shift+Alt+Left
   encoding), not swallowed by any global shortcut.
4. ✅ Fresh terminal tab shows the real oh-my-zsh setup (nvm banner,
   live directory/file completions) — not the bare default prompt.
5. ✅ Cmd+C copies the actual selection (verified via the system
   clipboard); Cmd+Up/Down block navigation doesn't leak any bytes to
   the PTY (confirmed via the same debug instrumentation).

Also ran `cargo test` on real macOS hardware (not just the
`macos-latest` CI runner): 10/10 passing, including
`zsh_zdotdir_bootstrap_sources_user_zshrc`.

One correction to the shortcut audit below: "none overlap arrow-key or
Option+Shift chords" was true as stated, but incomplete — it didn't
check overlap against plain-letter dead-key composition, which is where
`alt+n` actually collided.

## What changed

- `src/main.ts` (`attachCustomKeyEventHandler`, right after the
  dead-key check): plain Option+Left / Option+Right now emit `\x1bb` /
  `\x1bf` directly to the PTY — the sequences readline's default emacs
  keymap binds to `backward-word` / `forward-word`.
- **Do not** set xterm.js's `macOptionIsMeta: true` as a shortcut fix.
  It was tried and reverted (`7d7a556` → `59fe401`): it turns *every*
  Option-modified key into an ESC-prefixed byte, which breaks the
  Option-key dead-key accent composition (ñ, á, ü, ...) that
  `src/xtermDeadKeyAddon.ts` exists specifically to support — a
  regression for Spanish/Portuguese/US-International keyboard layouts.
  Any future fix here must stay scoped to specific key combos, not a
  blanket Option-as-Meta flip.
- `src-tauri/src/lib.rs`: audited the six global shortcuts
  (`alt+x/g/a/p/n`, `ctrl+alt+p`) — none overlap arrow-key or
  Option+Shift chords, so nothing there was changed.
- `src-tauri/src/lib.rs` test module: added
  `zsh_zdotdir_bootstrap_sources_user_zshrc`, which runs the real
  ZDOTDIR-indirection bootstrap through an actual `zsh` binary and
  confirmed passing on the `macos-latest` GitHub Actions runner. That
  proves the bootstrap's *sourcing logic* is correct, but it's a
  synthetic `.zshrc` in an isolated process — not a real user's
  oh-my-zsh install inside the actual running Tauri app.

## What still needs a real macOS run

Build and run the app (`npm run tauri dev`, or install the CI
artifact), then check:

1. Open a terminal tab, type `hola mundo`, press Option+Left twice —
   cursor should land between "hola" and "mundo".
2. Press Option+N (or another accent dead-key combo for your layout) —
   should still compose `ñ` normally, not send a raw Meta byte. This is
   the regression the scoped fix is supposed to avoid; check it
   explicitly, don't assume.
3. Whatever combo Claude Code CLI uses for its own in-terminal word
   navigation (assumed Option+Shift+Arrow) should reach the shell/CLI
   unmodified — not get swallowed by afkode's global `alt+x/g/a/p/n`
   shortcuts.
4. Open a fresh terminal tab — your real oh-my-zsh prompt/theme and
   aliases should appear, not the bare default zsh prompt.
5. Regression-check the existing Cmd-based shortcuts at
   `main.ts:1468-1536` (Cmd+C copy, Cmd+Up/Down block navigation) —
   still working after the new Option+Arrow branch was added earlier
   in the same handler.

If any of these fail, the fix is scoped tightly enough (single
`ev.code === "ArrowLeft" || ev.code === "ArrowRight"` check, `isMac()`
gated) that it should be safe to adjust without redoing the earlier
`macOptionIsMeta` mistake.
