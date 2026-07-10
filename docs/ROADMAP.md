# AFKode Roadmap

> This file is the **product thesis and priority order**. The concrete execution roadmap — next features, plans, state-of-the-art references, and `/goal` prompts to implement each with an AI coding agent — lives in [ROADMAP-FEATURES.md](ROADMAP-FEATURES.md).

## Thesis

A pretty floating terminal is copyable in a weekend. AFKode's real category — one that doesn't have an owner yet — is the **ambient supervision layer for AI coding agents**. Gaming is the Trojan horse, not the end market: it's simply the first place where the pain of "my agent works for 30 minutes but wastes half of it waiting for my approval" is obvious. In two years, everyone supervising agents while doing something else is the market.

The pitch: *AI agents work autonomously for 30-minute stretches but lose half that time waiting on human approvals. AFKode is the ambient supervision layer — starting where the pain is most obvious (gamers who code) and growing toward every human who supervises agents while doing something else.*

## Priorities, in order

### 1. Understand the agent for real — the technical moat ✅ (v0.3)
Replace text heuristics with real protocol integration: **Claude Code hooks** (`PreToolUse`, `PostToolUse`, `Notification`, `Stop`, `UserPromptSubmit` → local HTTP listener, settings injected via `claude --settings`). We now *know* — not guess — when the agent wants to run a tool, which file it touches, and when a turn finishes. Next steps: `--output-format stream-json` for cost/token data, MCP for deeper control, adapters for OpenCode/Codex protocols.

### 2. Rich approvals, not blind ones ✅ partially (v0.3)
`Alt+A` used to be "yes, blindly". With hooks, the HUD pill now shows *what* the agent wants (`Bash: npm test`) while it waits. Next: Approve/Reject buttons on the pill itself, per-tool risk highlighting (destructive commands in red), and "always allow this tool" shortcuts. Trust is what makes people let agents run longer — that's the product's core loop.

### 3. The "while you were away" summary ✅ v1 (v0.3)
Coming back after 40 minutes shows: turns completed, tools run, files touched, how many times — and for how long — the agent sat waiting for you. That last number is gold: it quantifies the exact problem AFKode removes. Next: cost per session (via stream-json), test status detection, richer per-session breakdown.

### 3.5 Gamer-first UX (v0.4 in progress)
Features born from putting ourselves in the actual user's seat (Valorant open, Claude on two projects):
- ✅ **"Don't interrupt my ranked match"** — fullscreen-game detection → automatic do-not-disturb: no toasts/beeps mid-match, one aggregated ping when you're back in the lobby.
- ✅ **Between-matches inbox** — everything your agents need (approvals, finished turns, dead sessions) in one triage list when you open the overlay: Approve / Go per row, in under a minute.
- ✅ Live state dots on tabs (working / waiting / done).
- ✅ **Quick-reply from the pill** — ↩ button appears when an agent waits; opens the palette pre-targeted at the asking session, with a context line showing who gets the reply and what it asked.
- ✅ **Voice announcements (TTS)** — optional copilot-style voice ("Claude Code is waiting for your input") over game audio; immune to Windows fullscreen toast suppression.
- ✅ Manual DND override (`Alt+N`) with 🔕 indicator — lobbies are fullscreen too.
- ✅ Terminal table stakes (v0.6): `Ctrl+F` scrollback search, Unicode 11 widths, file drag & drop.
- ✅ Memory saver (v0.5.1): host working-set trim + WebView2 low-memory target while hidden.
- Backlog: edge-docked "peek" mode (Discord-chat style), gamer-style daily summary with streaks, Discord Rich Presence ("🤖 shipping code while ranking"), per-game HUD position profiles, per-title match detection (game APIs), session restore (reopen tabs/folders), inline images (`@xterm/addon-image`), and **diff preview before approving an Edit** (PreToolUse already carries the payload — render it).

### 3.6 Non-technical onboarding (v0.7)
Making AFKode usable as an AI-first terminal for designers/juniors, without diluting the gamer core:
- ✅ **First-run setup wizard** — detects and installs Node.js (winget) and Claude Code (npm) with guided steps and live progress; PATH augmentation means no app restart between steps.
- ✅ **Recent folders as one-click cards** on the empty state.
- ✅ **Clipboard image paste** — Ctrl+V with a screenshot saves a temp PNG and hands its path to the agent.
- Backlog: prompt starter chips, plain-language risk labels on approvals (read/run/delete classification), optional Chat View over stream-json (terminal as "advanced view"), light theme, Ctrl+wheel zoom.

### 4. Multi-surface: the same state on your phone
The HUD pill is already a state feed. Push it to a mobile companion or just Discord/Telegram: approve a permission from the couch. At that point AFKode stops being "a gamer app" and becomes **the remote control for your agents**.

### 5. Fleet, not session
The near future is 3–5 agents in parallel (worktrees make it trivial). The HUD evolves into a mini-dashboard: which agent is blocked, which finished, what needs attention first. Nobody has solved the UX of "supervise N agents with partial attention" — that's exactly our terrain.

### 6. Community as distribution
Crosshair/FPS overlays go viral on Discord and Reddit. Our hook is better: "my AI fixed the bug while I was ranking up" clips. A "share session summary" button (a pretty stats image) is free marketing embedded in the product.

## Explicit non-goals

- **More themes/fonts/split panes** — cosmetic depth dilutes the pitch.
- **Competing with Warp / Windows Terminal** as a general-purpose terminal — that war is lost and it's not the point.
- **DX11/DX12 injection for exclusive fullscreen** — huge effort, anticheat risk, and borderless is already the industry default.
