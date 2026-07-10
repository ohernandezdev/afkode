# AFKode Feature Roadmap — the Warp-inspired terminal for coders who game

> Companion to [ROADMAP.md](ROADMAP.md) (product thesis). This document is the **execution roadmap**: the next features to build, why, how, what the state of the art looks like, and a ready-to-paste `/goal` prompt to implement each one with an AI coding agent (Claude Code or similar).
>
> Scope note: [ROADMAP.md](ROADMAP.md) lists "competing with Warp as a general-purpose terminal" as a non-goal. This roadmap does **not** reverse that — it cherry-picks the Warp innovations that serve AFKode's actual category (ambient supervision of AI agents, gamer-first UX) and skips the ones that don't (tabs-and-panes arms race, cosmetic depth).

---

## How to use this document

Each feature has:

- **What** — a concrete description of the feature.
- **Why** — how it serves the coder/gamer supervising AI agents.
- **State of the art** — who does this today and how, so implementation can borrow proven designs.
- **Plan** — implementation steps grounded in this codebase (`src/main.ts`, `src/hud.ts`, `src/palette.ts`, `src-tauri/src/lib.rs`).
- **`/goal` prompt** — paste it into an AI coding agent to implement the feature end-to-end.

## Release plan

| Milestone | Theme | Features |
|---|---|---|
| **v0.8 — Terminal IQ** | Warp-grade terminal ergonomics | F1 Command Blocks · F2 Command Palette · F3 AI Command Search · F4 Session Restore |
| **v0.9 — Trust & Approvals** | Make approvals rich, safe, fast | F5 Diff Preview · F6 Risk-Graded Approvals · F7 Cost & Token Telemetry |
| **v1.0 — Fleet & Chat** | Supervise many agents, from anywhere | F8 Chat View · F9 Fleet Dashboard · F10 Remote Approvals |
| **v1.1 — Gamer Distribution** | Features that market themselves | F11 Discord Rich Presence + Share Cards · F12 Peek Mode & Per-Game HUD Profiles |

Dependency order matters: **F1 (blocks)** unlocks better copy/share and underpins F11's share cards; **F7 (stream-json)** is the data source for F8 (chat view) and enriches F9; **F6** builds directly on the existing hooks listener from v0.3.

---

## F1 — Command Blocks (Warp-style)

**What.** Group every command and its output into an atomic, navigable *block*: click a block to select it, `Ctrl+↑/↓` to jump between blocks, one-keystroke actions per block (copy command, copy output, copy both, re-run, collapse long output, bookmark). A thin gutter marks block boundaries and exit status (green ✓ / red ✗).

**Why.** This is Warp's signature innovation and the single biggest ergonomics gap between AFKode and a modern terminal. For the AFKode use case it's even more valuable: an agent session produces *long* interleaved output; blocks let you scan "what did the agent run and did it fail" in seconds after coming back from a match. It also feeds F11 (share a pretty block, not a screenshot).

**State of the art.**
- **Warp Blocks** — the reference implementation: block selection, per-block actions, sticky command header. https://docs.warp.dev/terminal/blocks
- **Shell integration escape codes (OSC 133)** — the underlying open standard (`A` prompt-start, `B` command-start, `C` output-start, `D;exit` command-end), emitted by shell hooks. Supported by WezTerm ("semantic zones"), Kitty (shell integration), iTerm2 (shell-integration marks), VS Code terminal (command decorations + `Ctrl+↑/↓` navigation), and Windows Terminal (experimental "marks").
- **xterm.js** exposes what's needed: `registerOscHandler(133, …)`, `registerMarker(row)`, and `registerDecoration({marker})` for gutter UI.

**Plan.**
1. Emit OSC 133 from the shells AFKode spawns: inject a PowerShell prompt hook (via the existing session-spawn path in `src-tauri/src/lib.rs`) and document opt-in for bash/zsh profiles.
2. In `src/main.ts`, register an OSC 133 handler per terminal; on `A`/`B`/`C`/`D` create `IMarker`s and build a per-session `Block[]` model `{command, startMarker, endMarker, exitCode}`.
3. Render block gutters with `registerDecoration` (status color, hover toolbar: copy command / copy output / re-run).
4. Keyboard: `Ctrl+↑/↓` scroll-to-previous/next block; `Ctrl+Shift+C` on a selected block copies its output.
5. Fallback: sessions without shell integration (TUIs like Claude Code) behave exactly as today — blocks only activate when OSC 133 is seen.

**/goal prompt.**
```
/goal goal: Implement Warp-style command blocks in AFKode using OSC 133 shell integration
output: PowerShell prompt hook injected at session spawn emits OSC 133; xterm.js handler in src/main.ts builds a per-session block model with markers and decorations; gutter shows exit status; hover toolbar offers copy command/output and re-run; Ctrl+Up/Down navigates blocks
acceptance: Running 3 commands in a PowerShell tab produces 3 visually delimited blocks with correct exit-status colors; copy-output copies only that block's output; Claude Code TUI sessions are unaffected; feature degrades gracefully when OSC 133 is absent
limits: No changes to the hooks listener or HUD; PowerShell only for the injected hook (bash/zsh documented, not automated)
```

---

## F2 — Command Palette for app actions

**What.** Extend the existing `Alt+P` prompt palette (`src/palette.ts`) into a true command palette: type `>` to switch from "send prompt to agent" mode to "app action" mode — new tab (per CLI), switch theme, toggle ghost/DND/HUD, open settings, jump to session, kill session, copy last block. Fuzzy-matched, keyboard-only.

**Why.** AFKode already has ~15 actions scattered across tray menu, settings gear, and hotkeys. Gamers live on the keyboard; one muscle-memory surface (à la `Ctrl+Shift+P`) collapses the learning curve and makes every future feature discoverable for free.

**State of the art.**
- **Warp Command Palette** (`Ctrl+Shift+P`) — actions + settings + workflows in one fuzzy search. https://docs.warp.dev/terminal/command-palette
- **VS Code Command Palette** — the canonical design: `>` prefix for actions, plain text for files; recency-weighted fuzzy ranking.
- **Raycast / Spotlight** — the palette-as-OS pattern AFKode's palette window already mimics.

**Plan.**
1. Define an `Action` registry in `src/palette.ts`: `{id, title, keywords, run()}`; populate from existing handlers (theme switch, ghost mode, new tab, DND…) — most already exist as functions in `src/main.ts`; export them.
2. `>` prefix toggles palette mode; render matching actions with fuzzy scoring (simple subsequence scorer, no dependency).
3. Recency-weight results (persist last-used action ids in the existing settings store).
4. Keep `Alt+P` behavior identical when no `>` prefix — zero regression for the core loop.

**/goal prompt.**
```
/goal goal: Extend AFKode's Alt+P palette into a VS Code-style command palette with a '>' action mode
output: Action registry in src/palette.ts wired to existing functions in src/main.ts (new tab per CLI, theme switch, ghost/DND/HUD toggles, session jump/kill, settings); fuzzy matching with recency weighting persisted in settings
acceptance: Typing '>' lists at least 12 actions, fuzzy search narrows them, Enter executes, Esc returns to prompt mode; palette without '>' behaves exactly as before; all actions keyboard-reachable
limits: No new dependencies; do not redesign the palette window chrome
```

---

## F3 — AI Command Search (natural language → command)

**What.** In any shell tab, type `#` at an empty prompt (or press `Ctrl+Space`) to open an inline "ask" strip: describe what you want ("kill whatever is using port 3000"), get a shell command back, review it, press Enter to insert it at the prompt — never auto-executed.

**Why.** This is the Warp AI feature with the highest utility-to-effort ratio, and AFKode has an unfair advantage: users already have Claude Code installed and authenticated. AFKode can shell out to `claude -p` (non-interactive print mode) — no API key management, no billing surface, works offline-degraded.

**State of the art.**
- **Warp AI command search** — `#` prefix converts natural language to a command inline. https://docs.warp.dev/features/warp-ai
- **GitHub Copilot CLI** (`gh copilot suggest`) — suggest + explain, confirmation-gated execution.
- **Amazon Q CLI (ex-Fig)** — inline NL-to-command translation in the composer.
- **Claude Code print mode** — `claude -p "<prompt>" --output-format text` as a local generation backend.

**Plan.**
1. Detect `#`-at-empty-prompt in the xterm `onData` path in `src/main.ts` (only when the cursor is at a fresh prompt in a plain shell tab — reuse block state from F1 if present, else heuristics).
2. Render a floating strip anchored above the prompt; on submit, spawn `claude -p` with a hard system prompt ("return exactly one PowerShell command, no prose") via a new Tauri command in `src-tauri/src/lib.rs`.
3. Show result with syntax highlight + an "explain" toggle (second `claude -p` call); Enter writes the command to the PTY input *without* a trailing newline.
4. Settings toggle + graceful error if `claude` is not installed (point to the existing setup wizard).

**/goal prompt.**
```
/goal goal: Add Warp-style '#' AI command search to AFKode shell tabs, backed by the user's installed Claude Code in print mode
output: Inline ask-strip UI in src/main.ts triggered by '#' at an empty prompt or Ctrl+Space; Tauri command in src-tauri/src/lib.rs that runs `claude -p` with a strict one-command system prompt; result inserted at the prompt without executing; explain toggle; settings on/off switch
acceptance: Asking "list the 5 largest files here" inserts a working PowerShell one-liner without executing it; commands are never auto-run; missing claude binary shows a helpful message linking the setup wizard; agent tabs (Claude Code TUI) never trigger the strip
limits: No API keys or network calls of our own — only the local claude CLI; no telemetry
```

---

## F4 — Session Restore

**What.** Reopen AFKode and get your workspace back: same tabs, same order, same folders, same tab names/colors, and for agent tabs an offer to resume (`claude --continue` in that folder). Optional "restore on crash" with a session journal.

**Why.** Already in the backlog; it's the highest-frequency papercut. A gamer's session is `2 projects × (Claude tab + shell tab)` — rebuilding that by hand every launch is 2 minutes of friction before the product delivers any value.

**State of the art.**
- **Warp session restoration** — restores windows/tabs/panes and working directories on relaunch.
- **tmux-resurrect / tmux-continuum** — the gold standard: persist layout + cwd + running program, restore on demand or automatically.
- **Windows Terminal** `firstWindowPreference: persistedWindowLayout`.
- **Claude Code** `--continue` / `--resume` flags make agent-session resumption first-class.

**Plan.**
1. Serialize on change (debounced) to the existing settings store: per tab `{kind: claude|opencode|codex|shell, cwd, title, colorTag, order}`.
2. On startup, if a previous layout exists, restore tabs; agent tabs spawn with a "Resume previous conversation?" bar → `claude --continue` vs fresh.
3. Crash safety: write the journal on every tab open/close/rename (already-debounced), not on exit only.
4. Settings toggle: restore always / ask / never.

**/goal prompt.**
```
/goal goal: Implement session restore in AFKode — tabs, folders, names, colors, and agent-session resumption
output: Debounced session journal persisted via the existing settings store; startup restore flow in src/main.ts; per-agent-tab resume bar that relaunches claude with --continue; settings toggle (always/ask/never)
acceptance: Quit with 4 mixed tabs and relaunch → identical tab bar (order, names, colors, folders); Claude tabs offer resume and --continue works; force-kill the app and relaunch → layout still restored; toggle set to never skips restore
limits: Do not persist terminal scrollback content; no changes to the updater or tray
```

---

## F5 — Diff Preview before approving an Edit

**What.** When an agent asks permission for `Edit`/`Write`, the approval surface (HUD pill expansion, inbox row, or overlay banner) renders the actual diff — side-by-side or unified, syntax-highlighted — before you press `Alt+A`.

**Why.** The `PreToolUse` hook already carries the payload (old_string/new_string/file_path) — AFKode is sitting on the data. "Approve blind or alt-tab to read" is the exact trust bottleneck the thesis says the product exists to remove. No competing supervision tool renders hook-payload diffs today; this is a differentiator, not a catch-up.

**State of the art.**
- **Claude Code hooks `PreToolUse`** — delivers `tool_input` JSON including full Edit payloads. https://docs.claude.com/en/docs/claude-code/hooks
- **GitHub PR review UI / VS Code diff editor** — the visual grammar users already know (red/green, word-level highlights).
- **diff2html** and **highlight.js** (already a dependency) — rendering primitives; word-level diffing via a small LCS pass, no heavy dependency needed.

**Plan.**
1. In the hooks listener (Rust side, `src-tauri/src/lib.rs`), forward the full `tool_input` for `Edit|Write|MultiEdit` to the frontend event instead of just the tool name.
2. Build a `renderDiff(old, new, path)` component: unified view, line + word-level highlights, using `highlight.js` for language coloring (already bundled) and DOMPurify (already bundled) for safety.
3. Surface it in three places: expanded HUD pill (compact, first N lines + "open overlay"), between-matches inbox row (collapsible), and an overlay banner on the session.
4. `Alt+A` unchanged; add `Alt+Shift+A` = reject (sends `n`/Esc per prompt type, mirroring the existing approve logic).

**/goal prompt.**
```
/goal goal: Render a syntax-highlighted diff preview on AFKode's approval surfaces using the PreToolUse hook payload
output: Rust hooks listener forwards full tool_input for Edit/Write/MultiEdit; renderDiff component (unified view, word-level highlights, highlight.js + DOMPurify) shown in the HUD pill expansion, inbox rows, and an overlay banner; Alt+Shift+A reject hotkey
acceptance: When Claude Code requests an Edit, the pill shows the real diff of the pending change before approval; multi-edit payloads render as stacked hunks; non-edit tools keep the current compact display; reject hotkey answers the prompt correctly
limits: No new npm dependencies; do not modify Claude Code hook injection beyond payload forwarding
```

---

## F6 — Risk-Graded Approvals

**What.** Classify every pending tool call into plain-language risk tiers — 🟢 read (Read/Grep/Glob), 🟡 run (Bash non-destructive, tests, installs), 🔴 destructive (`rm`/`del`/`git push --force`/`DROP`/writes outside the project folder) — and color the pill/inbox accordingly. Add "always allow this tool for this session" as a one-key action on 🟢/🟡 items.

**Why.** Trust is the core loop (ROADMAP priority #2). A gamer mid-lobby has 20 seconds: tier colors let them safely batch-approve the green stuff and reserve attention for red. Plain-language labels ("wants to delete files") also serve the v0.7 non-technical onboarding track.

**State of the art.**
- **Claude Code permission modes & `/permissions` allowlists** — per-tool and per-command-prefix rules (`Bash(npm test:*)`), the vocabulary AFKode should mirror. https://docs.claude.com/en/docs/claude-code/iam
- **Warp Agent Mode command allowlisting/denylisting** — user-managed allow/deny patterns for AI-proposed commands.
- **OS permission UX** (Android/iOS prompts) — the tiered, plain-language grammar non-technical users already understand.

**Plan.**
1. Pure-TS classifier `classifyRisk(toolName, toolInput): {tier, label}` — rule table for known tools + a command-string scanner for Bash (destructive patterns, path-outside-cwd detection). Ship unit-testable and conservative (unknown ⇒ 🟡, matches-destructive ⇒ 🔴).
2. Thread tier through pill, inbox, and toasts (color + label like "wants to run: npm test").
3. "Always allow" writes a session-scoped allowlist consulted before notifying; surfaced in ⚙ with a clear-all.
4. DND aggregation orders the between-matches inbox red-first.

**/goal prompt.**
```
/goal goal: Add plain-language, color-coded risk tiers to AFKode approvals with session-scoped always-allow rules
output: classifyRisk() rule engine with unit tests; tier colors and labels on the HUD pill, between-matches inbox (sorted red-first), and toasts; one-key always-allow for green/yellow persisted per session and manageable in settings
acceptance: Read-only tools show green with a "wants to read files" label; rm -rf and git push --force show red; unknown tools default to yellow; always-allow suppresses future prompts for that tool in that session only; classifier has tests covering at least 15 command patterns
limits: Never auto-approve red-tier items regardless of allowlists; no ML/network calls — rules only
```

---

## F7 — Cost & Token Telemetry per session

**What.** Track tokens, cost, and model per agent session by consuming Claude Code's structured output/transcript data; show a per-tab cost badge, a session total in the git-footer area, and cost lines in the "while you were away" summary ("Claude spent $0.84 across 6 turns").

**Why.** Already named in ROADMAP priorities #1/#3 as the next step. Cost is the number that makes the away-summary feel like a report, not a toy — and it's the metric that matters once users run fleets (F9).

**State of the art.**
- **Claude Code `--output-format stream-json`** — per-message `usage` blocks (input/output/cache tokens) and a final result event with `total_cost_usd`. https://docs.claude.com/en/docs/claude-code/sdk
- **ccusage** (community) — proves the alternative path: parse `~/.claude/projects/**/*.jsonl` transcripts for usage offline.
- **Claude Code `/cost` + statusline** — in-product precedent for surfacing cost.

**Plan.**
1. Prefer the transcript route (no change to how sessions run): the hooks already give `session_id`; a Rust watcher tails the matching `~/.claude/projects/<hash>/<session_id>.jsonl` and emits usage events.
2. Aggregate in `src/main.ts` per session: tokens in/out, cache read/write, cost (price table per model, updatable constant).
3. UI: small `$0.12` badge on the tab (hover = breakdown), footer total, away-summary line, inbox context.
4. Fallback gracefully when transcripts are missing (OpenCode/Codex) — hide the badge, don't guess.

**/goal prompt.**
```
/goal goal: Add per-session token and cost telemetry to AFKode by tailing Claude Code transcript JSONL files matched via hook session_id
output: Rust transcript watcher emitting usage events; per-session aggregation with a model price table; cost badge on tabs with hover breakdown, footer session total, and cost lines in the while-you-were-away summary
acceptance: A Claude Code session shows a live-updating cost badge within one turn of activity; hover shows input/output/cache tokens; away summary reports per-session and total cost; non-Claude sessions show no badge and no errors
limits: Do not switch sessions to stream-json mode or alter how the CLI is launched; price table is a hardcoded constant with a code comment, no network fetch
```

---

## F8 — Chat View (terminal as "advanced view")

**What.** An optional per-session toggle that renders the agent conversation as a chat: user prompts, assistant text as markdown (marked + DOMPurify + highlight.js — all already bundled), tool calls as collapsible cards with status, approvals inline. The raw terminal stays one toggle away.

**Why.** Backlogged under v0.7 onboarding. It's the bridge that makes AFKode usable by designers/juniors — and even experts prefer reading markdown answers over ANSI-wrapped text. Warp bet its whole product on this direction (Agent Mode as the primary surface); AFKode can offer it without abandoning the terminal.

**State of the art.**
- **Warp Agent Mode / AI panes** — conversational agent surface with tool-call cards next to a real terminal.
- **Claude Code VS Code extension** — chat UI over the same CLI engine, with inline diffs and approvals.
- **Claude Code stream-json** — event stream (assistant/user/tool messages) that maps 1:1 to chat bubbles.
- **Happy Coder / Conductor / Crystal** — third-party Claude Code frontends validating the "chat over CLI" pattern.

**Plan.**
1. Data source: same transcript tail as F7 (one watcher, two consumers) — parse message events into a session timeline model.
2. New view module `src/chatview.ts`: virtualized message list, markdown rendering with the existing marked/DOMPurify/highlight.js pipeline, tool-call cards (name, target file, status icon, expandable output), approval prompts inline (wired to the same approve/reject actions as F5/F6).
3. Toggle button in the tab header: Terminal ⇄ Chat; state per tab, persisted.
4. Palette input (`Alt+P` and the in-view composer) sends to the PTY exactly as today — the terminal remains the source of truth; chat is a projection.

**/goal prompt.**
```
/goal goal: Build an optional Chat View for AFKode agent tabs, projected from Claude Code transcript events, with the terminal as fallback view
output: src/chatview.ts with a virtualized timeline (markdown via existing marked/DOMPurify/highlight.js), collapsible tool-call cards, inline approval prompts reusing existing approve logic; per-tab Terminal/Chat toggle persisted in settings
acceptance: Toggling a Claude tab to Chat shows the conversation with rendered markdown and tool cards updating live; sending a prompt from the chat composer reaches the CLI; toggling back to Terminal shows the untouched xterm session; shell tabs never show the toggle
limits: Chat is read-projection only — no separate SDK session, no divergence from the PTY as source of truth; no new dependencies
```

---

## F9 — Fleet Dashboard

**What.** When ≥2 agent sessions exist, the HUD pill can expand into a mini-dashboard: one row per agent (project name, state dot, current tool/last action, waiting-time, cost from F7), sorted needs-attention-first, with per-row Approve / Reject / Jump. The same list powers a full-overlay "Fleet" panel.

**Why.** ROADMAP priority #5, verbatim: "Nobody has solved the UX of supervising N agents with partial attention — that's exactly our terrain." Worktrees make 3–5 parallel agents normal; the single-pill state model already aggregates poorly at N>1.

**State of the art.**
- **Conductor (conductor.build)** and **Crystal** — Mac-first multi-Claude-in-worktrees dashboards; validate demand, desktop-app-shaped.
- **claude-squad / Vibe Kanban** — terminal/board-style multi-agent managers.
- **VS Code agent sessions view** — editor-integrated list of parallel agent runs.
- **CI dashboards (GitHub Actions)** — the triage grammar: status column, duration, needs-attention filter.

**Plan.**
1. Generalize the existing per-session state (working/waiting/done + since-when) into a `FleetModel` in `src/main.ts` consumed by HUD, inbox, and the new panel — single source of truth.
2. HUD (`src/hud.ts`): pill shows aggregate ("2 waiting · 1 working"); click expands the row list; row actions reuse approve/reject/jump handlers.
3. Overlay Fleet panel (`Ctrl+K`-adjacent or palette action): same model, more room — shows last tool, waiting duration, session cost.
4. Sort: 🔴 waiting-destructive > waiting > done > working; tie-break by wait duration.

**/goal prompt.**
```
/goal goal: Turn AFKode's HUD into a fleet mini-dashboard for supervising multiple agent sessions at once
output: Shared FleetModel driving HUD, inbox, and a new overlay Fleet panel; expandable pill listing one row per agent with state, current/last tool, waiting time, cost badge, and per-row Approve/Reject/Jump; needs-attention-first sorting
acceptance: With 3 Claude sessions (one waiting, one working, one done) the pill aggregate reads correctly and expanding shows 3 sorted rows; approving from a row answers the right session without opening the overlay; single-session behavior is unchanged
limits: No process management (no spawning/killing agents from the dashboard beyond existing tab close); no worktree automation in this iteration
```

---

## F10 — Remote Approvals (phone / Discord)

**What.** A relay channel that pushes agent events (waiting-for-approval, turn done, session died) to a Discord DM or Telegram bot, and accepts replies: tap ✅/❌ reactions or reply text → routed back as approve/reject/prompt to the right session. Overlay optional; couch mandatory.

**Why.** ROADMAP priority #4: "approve a permission from the couch — AFKode stops being a gamer app and becomes the remote control for your agents." It's also the retention feature: the product keeps working when you're not at the PC.

**State of the art.**
- **Happy Coder (happy.engineering)** — open-source mobile client for Claude Code with E2E-encrypted relay; the closest prior art and proof of demand.
- **Discord/Telegram bot APIs** — free push + reaction-buttons; Telegram inline keyboards map perfectly to Approve/Reject.
- **claude-code-telegram bridges** (multiple OSS projects) — validate the pattern; all are per-repo hacks rather than a supervision product.
- **ntfy.sh / Pushover** — simpler push-only fallback tier.

**Plan.**
1. Start push-only (safe, small): settings accept a webhook/bot token; the existing notification pipeline (Rust) gains a "remote sink" that mirrors what toasts/TTS already announce, respecting DND aggregation.
2. Phase two, commands: a long-poll (Telegram `getUpdates`) task in Rust maps chat replies with an id (`#3 approve`) or inline-keyboard callbacks to the existing approve/reject/prompt actions.
3. Security defaults: token stored in settings file, single authorized chat-id pinned on first contact, red-tier (F6) approvals require an explicit `confirm` word, feature off by default.
4. Reuse risk labels (F6) and cost (F7) in the message body — the remote message is a mini away-summary.

**/goal prompt.**
```
/goal goal: Add remote approvals to AFKode via a Telegram bot bridge — push agent events, accept approve/reject/prompt replies
output: Rust-side remote sink mirroring the notification pipeline (DND-aware) to a configured bot; long-poll command loop mapping inline-keyboard callbacks and numbered replies to existing approve/reject/prompt actions; settings UI for token + pinned chat id; off by default
acceptance: With the bot configured, a waiting Claude session produces a Telegram message with Approve/Reject buttons within seconds; tapping Approve answers the correct session; messages from any other chat id are ignored; red-tier approvals require typing confirm; disabling the feature stops the poll loop
limits: Telegram only in this iteration (webhook-push for Discord may reuse the sink but no Discord command handling); no third-party relay servers — direct Bot API calls only; never send terminal scrollback content, only event summaries
```

---

## F11 — Discord Rich Presence + Shareable Session Cards

**What.** Two halves: (a) Discord Rich Presence — your Discord status shows "🤖 2 agents shipping code · 47 min AFK" while you play; (b) a "share summary" button that renders the away-summary (turns, files, cost, waiting-time saved) as a themed PNG card ready to drop into Discord/Twitter.

**Why.** ROADMAP priority #6, community as distribution: "my AI fixed the bug while I was ranking up" is the growth clip. Rich Presence is passive viral surface area in every Discord server the user is in; the share card is the same story, deliberately told.

**State of the art.**
- **Discord Rich Presence (IPC/local RPC)** — used by VS Code (vscode-discord-rich-presence), JetBrains plugins, and games; connects to the local Discord client's IPC socket/named pipe, no bot needed. Rust crates: `discord-rich-presence`.
- **GitHub "achievement"/wrapped-style share cards, Spotify Wrapped, ccusage badges** — the visual grammar of stat-brag cards.
- **Warp's block sharing** (permalink to a block) — the developer-sharing precedent; AFKode's version is image-first because Discord is the venue.

**Plan.**
1. Rust: integrate a Discord RPC crate in `src-tauri`; update presence from the FleetModel (agent count, aggregate state, AFK timer). Privacy: off by default, project names excluded unless opted in.
2. Share card: render the existing away-summary data to an offscreen, theme-styled DOM node; rasterize via the WebView (canvas) to PNG; save + copy to clipboard (clipboard-manager plugin already bundled).
3. Card design: AFKode logo, session stats, theme colors, subtle game-y frame — one template, no editor.
4. Buttons: "Share" on the away-summary modal and in the Fleet panel.

**/goal prompt.**
```
/goal goal: Add Discord Rich Presence and a shareable PNG session-summary card to AFKode
output: Rust Discord RPC integration updating presence from agent fleet state (off by default, privacy-safe labels); Share button on the away-summary that renders a themed stats card to PNG, saves it, and copies it to the clipboard
acceptance: With Discord running and the toggle on, presence shows agent count and AFK duration and clears on app exit; Share produces a readable branded PNG matching the active theme containing turns, files touched, waiting time, and cost; with Discord closed nothing errors
limits: Local Discord IPC only — no bot, no Discord server, no upload of the card anywhere; one card template
```

---

## F12 — Peek Mode & Per-Game HUD Profiles

**What.** (a) Peek mode: an edge-docked slim strip (Discord-chat style) that slides in over the game edge showing the last few agent events as a ticker — between full overlay and tiny pill. (b) Per-game profiles: AFKode remembers HUD position, peek edge, opacity, and DND preference *per detected game executable* and applies them automatically.

**Why.** Both are backlog items under gamer-first UX. Every game claims different screen real estate (MOBA minimap ≠ FPS killfeed); one global HUD position guarantees it's wrong somewhere. Peek mode fills the awareness gap for games where even the pill is too little and the overlay too much.

**State of the art.**
- **Discord in-game overlay** — the docked-chat pattern users already know; per-game overlay enable/disable list is exactly the profile model.
- **Overwolf / Steam overlay / NVIDIA App** — per-title overlay configs and positioning as standard practice.
- **AFKode's own fullscreen detection** (DND) — the detection primitive already exists in `src-tauri/src/lib.rs`; profiles are a persistence layer on top of it.

**Plan.**
1. Extend the existing fullscreen-detection code to also report the foreground process executable name → `gameId`.
2. Profile store in settings: `profiles[gameId] = {hudPos, peekEdge, opacity, dnd}`; apply on game-focus change; "Save for this game" action in ⚙ and the palette (F2).
3. Peek mode: a third window state (alongside overlay/hidden) — thin, click-through by default, anchored to a chosen edge; renders the last N FleetModel events as fading ticker rows; `Alt+G`-style hotkey cycles hidden → peek → overlay.
4. Respect DND: in-match, peek shows only the aggregate counter, no per-event rows.

**/goal prompt.**
```
/goal goal: Add edge-docked peek mode and per-game HUD profiles to AFKode
output: Foreground-game identification extending the existing fullscreen detection; settings-backed profile store applying HUD position, peek edge, opacity, and DND per game executable; new peek window state (slim click-through event ticker) cycled via hotkey hidden→peek→overlay
acceptance: Setting a custom HUD position while Game A is focused and saving the profile restores it automatically next time Game A gains focus, while Game B keeps defaults; peek strip shows recent agent events, passes clicks through, and collapses to a counter while DND is active
limits: Executable-name matching only (no game API integrations this iteration); no changes to exclusive-fullscreen behavior
```

---

## Deliberately not on this roadmap

Kept from [ROADMAP.md](ROADMAP.md) non-goals, restated against Warp's feature set:

- **Split panes / pane arms race** — Warp, WezTerm, and tmux own this; it dilutes the supervision pitch.
- **Warp Drive-style cloud sync & team spaces** — requires accounts/backend; AFKode stays local-first until fleet + remote prove retention.
- **A built-in AI agent of our own (Warp Agent Mode's model routing)** — AFKode supervises the agents users already pay for; competing with Claude Code is the fastest way to lose the category.
- **Exclusive-fullscreen injection** — anticheat risk, borderless is the norm.
- **Notebooks / runbooks (Warp Workflows as docs)** — good feature, wrong category; revisit only if fleet users ask for parameterized re-runs.
