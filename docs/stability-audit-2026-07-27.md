# Terminal stability audit — 2026-07-27

Scope: PTY spawn/resize/teardown (`src-tauri/src/lib.rs`), xterm.js fit/resize
logic, tab lifecycle, and input/keybinding handling in `src/main.ts` and
`src/xtermDeadKeyAddon.ts`. Four independent reviews were run, one per area.

No critical bugs were found. Below, bugs are ordered by severity; each entry
notes whether it was fixed in this PR or left for a follow-up.

## High

### H1. Killed/replaced PTY child processes were never reaped (zombie leak on macOS/Linux)
**File:** `src-tauri/src/lib.rs` — `kill_pty`, session replacement in `spawn_pty`
**Status:** Fixed

`portable_pty`'s `Child::kill()` on Unix sends `SIGHUP` but never calls
`waitpid`, and nothing else in the codebase reaped a child killed via
`kill_pty` or replaced by a reused tab id in `spawn_pty` (both paths removed
the `PtySession` from the map *before* the reader thread's own `wait()` could
run). Every tab close, and every reused-id respawn, left a defunct zombie
process in the OS process table for the life of the app. Heavy tab churn
(scripted/agent workflows opening and closing many sessions) could accumulate
enough zombies to threaten PID-table exhaustion.

Fix: added a `reap()` helper that calls `child.wait()` on a dedicated thread
(never inline — see H2 below for why), and call it from both `kill_pty` and
the `spawn_pty` id-reuse path.

### H2. Blocking PTY write ran directly on Tauri's shared async runtime
**File:** `src-tauri/src/lib.rs` — `write_pty`
**Status:** Fixed

`write_pty`'s `write_all` runs as part of an `async fn` command, which Tauri
schedules on its shared Tokio worker pool (a handful of threads, sized to
CPU cores). A stopped or hung child (Ctrl+Z, a wedged TUI, a huge paste into
an unresponsive process) can block that write indefinitely. A few tabs in
that state simultaneously can exhaust every worker thread, at which point
*unrelated* commands — spawning a new tab, resizing any terminal, git status —
stop being serviced and the whole app appears frozen, not just the one stuck
tab. `resize_pty` was assessed too: it's a single bounded ioctl/WinAPI call
with no dependency on the child reading anything, so it doesn't share this
risk and was left as-is.

Fix: wrapped `write_pty`'s lock+write in `tauri::async_runtime::spawn_blocking`,
matching the pattern already used by `ask_claude`.

### H3. `confirmDialog()`'s single shared promise slot could be silently overwritten
**File:** `src/main.ts` — `confirmDialog`, `confirmResolve`
**Status:** Fixed

The busy-tab-close confirmation dialog stored its pending resolver in one
module-level variable. The command palette runs in a separate Tauri window
and dispatches into the same session-closing code via IPC, unblocked by the
main window's modal overlay. Closing one busy tab, then closing a second busy
tab (via the palette, global search, or "jump to waiting") before confirming
the first, overwrote `confirmResolve`: the first `closeSession` call's
`await` was orphaned forever (that tab, and its PTY, never actually closed),
while the modal kept showing the *second* tab's confirmation text — a user
could click "OK" believing they were closing tab A while actually confirming
the close of tab B.

Fix: replaced the single resolver with a FIFO queue (`confirmQueue`); each
`confirmDialog()` call is queued, the modal shows the head of the queue, and
resolving advances to the next pending request instead of ever discarding
one.

## Medium

### M1. `kill_pty` didn't verify session identity before killing
**File:** `src-tauri/src/lib.rs` — `kill_pty`
**Status:** Found, not fixed (deferred)

Every other id-keyed teardown path in `lib.rs` compares a `gen` (generation)
stamp before acting, specifically to handle the same tab id being reused
(e.g. a webview reload racing a tab close). `kill_pty` has no such check — a
stale `kill_pty` call still in flight when a new session for the same id is
spawned would kill the *new* session instead of the intended stale one.

Not fixed here: a correct fix requires threading a `gen` value from the
frontend's session model through the `kill_pty` invoke call, which the
frontend doesn't currently track per-session. That's more than the
small/low-risk bar for this pass — tracked as a follow-up.

### M2. Claude Code's native-paste passthrough keys off a stale, launch-time command string
**File:** `src/main.ts` — Ctrl+V handler, `/^claude(\s|$)/.test(cmd)`
**Status:** Found, not fixed (deferred)

`cmd` is the exact string a tab was launched with and is never updated
afterward. Two edge cases follow: (1) a user opens a plain shell tab and
types `claude` themselves — an image-only clipboard still falls back to
AFKode's own temp-file substitution instead of forwarding `^V` to Claude
Code's real native image paste; (2) a tab launched via the dedicated "Claude
Code" button, where the user exits Claude Code to a subshell — an image-only
clipboard now sends a raw `^V` byte into a plain shell, which typically does
nothing, silently dropping the paste.

Not fixed here: there's no live "is Claude Code the current foreground
process" signal in this codebase (no OSC 133/shell-integration hook for
this), so a robust fix is a real feature addition, not a small correction.
Flagged for follow-up rather than papering over with a heuristic likely to
misfire in its own new ways.

## Low

### L1. `WebKitDeadKeyAddon` loaded unconditionally on every platform, despite being a WebKit-only workaround
**File:** `src/main.ts`, `src/xtermDeadKeyAddon.ts`
**Status:** Fixed

The addon's own writeup documents it as a WKWebView-only workaround
(confirmed: it pattern-matches malformed event shapes specific to WebKit).
It was instantiated and loaded for every session regardless of platform,
relying on an unenforced assumption that Chromium (Windows' WebView2) never
produces the matching event shape. Gated `term.loadAddon(deadKey)` behind
`platform.os !== "windows"`, so it's provably inert there instead of
depending on that assumption holding forever.

### L2. Ctrl+F / Ctrl+K handled by both a per-terminal and a document-level listener
**File:** `src/main.ts`
**Status:** Fixed

`term.attachCustomKeyEventHandler`'s `preventDefault()` doesn't stop the
same native keydown from bubbling to a second, independent `document`-level
handler that re-runs the identical check. Both `openSearch()`/
`openGlobalSearch()` are currently idempotent so this wasn't user-visible,
but it was fragile — any future change making either function non-idempotent
would double-fire on every terminal-focused Ctrl+F/Ctrl+K. Added
`ev.stopPropagation()` alongside the existing `preventDefault()` in both
per-terminal handlers.

### L3. `safeFit`'s corrective shrink stops working once a terminal is exactly 1 row/col
**File:** `src/main.ts` — `safeFit`
**Status:** Found, not fixed (deferred)

The overflow guard (`term.rows > 1` / `term.cols > 1`, needed to avoid
shrinking to 0) also disables correction once already at that floor. In an
extremely narrow/short window with a large font, a sub-pixel clip at that
floor is never corrected and persists for the life of that window size.
Low-severity, low-frequency edge case; the correct fix (falling back to font
metrics rather than further shrinking) is more than a small/low-risk change.

### L4. Corrective resize loop can send multiple uncoalesced `resize_pty` IPC calls per frame
**File:** `src/main.ts` — `safeFit` / `term.onResize`
**Status:** Found, not fixed (deferred)

`safeFit`'s guarded loop calls `term.resize()` once per pixel of overflow, and
each call synchronously fires `term.onResize`, which is wired directly to a
fire-and-forget `resize_pty` invoke. A large font-size jump can therefore
send several redundant PTY resizes in quick succession instead of one final
one. Cosmetic/perf-only (no dropped output or crash), not fixed in this pass
to avoid restructuring the resize-event wiring under time pressure.

### L5. No WebGL context-loss recovery for the terminal renderer
**File:** `src/main.ts`
**Status:** Found, not fixed (deferred)

Each tab gets its own `WebglAddon`/WebGL context; browsers cap concurrent
contexts (commonly ~8–16). Opening enough tabs, or a driver-level context
reset, can silently lose the oldest context with no listener to reload it or
fall back to the DOM renderer — that pane goes blank/frozen. Real fix (a
`webglcontextlost`/`webglcontextrestored` handler that reloads the addon or
falls back) is a small feature, not a one-line correction; deferred.

## Checked, no bug found

- PTY writer-Arc-outside-the-map-lock pattern, UTF-8 chunk-boundary
  splitting, Windows Job Object cleanup, and the reader thread's `gen` guard
  are all sound.
- No unwrap()/indexing panics reachable from user-controlled input.
- `FitAddon.proposeDimensions()` clamps to a `2×1` floor — cols/rows can
  never reach 0/negative.
- `fit()` on a hidden (background) tab measures correctly: panes use
  `visibility: hidden`, not `display: none`, so layout geometry stays valid.
- The single global `ResizeObserver` already coalesces bursts via
  `requestAnimationFrame`; no missing debounce.
- Tab close (`closeSession`) correctly kills the PTY, disposes the terminal,
  removes DOM nodes, and re-picks the active tab, including "close last tab."
  The spawn-vs-close race is explicitly handled with a post-spawn
  `sessions.has(id)` check.
- Git-status and ask-strip async replies are guarded by per-request sequence
  counters, so a stale reply after a fast tab switch is dropped correctly.
- No tab-scoped keydown/resize listener leaks: all are attached to the pane
  or terminal textarea and torn down by `closeSession`.
- The Option+Arrow macOS word-jump handler and the dead-key addon can't
  collide — they match mutually exclusive key shapes.
- The `claude`-prefix regex itself can't misfire on an unrelated command —
  only four fixed launcher strings ever populate `cmd` (see M2 for its real,
  separate defect: staleness, not the regex).
