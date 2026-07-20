# Handoff: macOS terminal UX verification

Code-side work for the macOS Option-key / oh-my-zsh terminal UX issue is
done and merged to `main` (commits `7d7a556`, `59fe401`, both in
v0.8.17). What's left requires a real Mac running the built app — this
was authored from a Windows machine with no macOS hardware access, so
none of it has been runtime-verified. That's the job for whoever picks
this up on macOS.

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
