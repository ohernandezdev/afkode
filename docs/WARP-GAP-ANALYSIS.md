# Warp vs AFKode — feature-gap analysis & agent-grid design

> Audited 2026-07-13 against AFKode `main` (v0.8.6) by reading the source (`src/`, `src-tauri/`, `README.md`, `docs/ROADMAP-FEATURES.md`) and Warp's current public docs. Companion to [ROADMAP-FEATURES.md](ROADMAP-FEATURES.md).
>
> **Roadmap tension, stated up front:** [ROADMAP-FEATURES.md](ROADMAP-FEATURES.md) lists "split panes / pane arms race" as deliberately off-roadmap. This document does not reopen the *generic-terminal* pane race — it reframes the feature as an **agent grid**: seeing N agent sessions at once is fleet supervision (the F9 terrain, ROADMAP priority #5), not terminal cosmetics. The design in part 3 is scoped accordingly: agent supervision first, generic shell splitting as a byproduct.

---

## 1. AI-first priority ranking

Missing features ranked by one criterion: **how much does this improve supervising/commanding AI coding agents?** Pure-terminal features rank last by construction.

| # | Gap | AI-first justification |
|---|---|---|
| 1 | **Agent grid (split panes)** | Directly attacks the category problem ("supervising N agents with partial attention", ROADMAP priority #5). Watching 2–4 agents side by side without tab-flipping is spatial fleet supervision; it also makes F9's dashboard rows clickable into visible panes. Warp ships arbitrary pane splitting where each pane can host its own AI agent session. |
| 2 | **AI command search (NL → command)** | Already planned as F3, still unshipped. Highest utility-to-effort AI feature: AFKode can back it with the user's installed `claude -p` — no API keys. Warp calls this `#` command search. |
| 3 | **Command palette `>` action mode** | Planned as F2, unshipped. Keyboard-only discoverability for every agent action (approve, jump-to-waiting, new agent tab, future grid actions). Agent-facing because the actions it exposes are agent actions. |
| 4 | **Session restore** | Planned as F4, unshipped. Agent-facing via `claude --continue`: restoring the *conversation*, not just the tab, is something Warp's session restoration doesn't do for third-party agents. |
| 5 | **MCP support (as a client)** | Warp reuses the user's MCP servers for its agents. AFKode's angle is different — MCP as a *control channel* for deeper agent supervision is already named in [ROADMAP.md](ROADMAP.md) ("MCP for deeper control"). Valuable, but blocked on defining what AFKode would do with it beyond what hooks already deliver. |
| 6 | **Active AI (always-on suggestions)** | Low: overlaps #2, and always-on inline hints target people *typing* commands — AFKode's user is mostly *watching* agents type. Revisit only after F3 ships and gets usage. |
| 7 | **Agent Mode (a built-in agent)** | Deliberate non-goal, and correctly so: AFKode supervises the agents users already pay for; building a competing agent is the fastest way out of the category ([ROADMAP-FEATURES.md](ROADMAP-FEATURES.md) non-goals). Not recommended. |
| 8 | **Warp Drive workflows** | Parameterized saved commands are generic-terminal ergonomics; the roadmap defers them unless fleet users ask for parameterized re-runs. Agreed. |
| 9 | **Notebooks / shareable blocks** | Wrong venue: AFKode's sharing story is the F11 PNG session card for Discord, not permalinked runbooks. Keep off. |
| 10 | **SSH integration** | Pure-terminal, zero agent-supervision value. AFKode sessions can run `ssh` as a plain command; first-class SSH (remote-aware blocks, cwd tracking) is the pane-arms-race energy the roadmap avoids. |

---

## 2. Gap table

Status: ✅ has · 🟡 partial · ❌ missing. Every verdict is backed by the cited file(s).

| Warp feature | AFKode | Evidence |
|---|---|---|
| **Command blocks** (command+output units, exit status, per-block actions, navigation) | ✅ has | `src/blocks.ts` (OSC 133 `CommandBlocks` engine); README "Command blocks (Warp-style)" §; gutter/toolbar CSS at `src/styles.css:437+`; `Ctrl+↑/↓` and `Ctrl+Shift+C` in the README hotkey table. Injected at spawn for PowerShell/bash/zsh (`src-tauri/src/lib.rs` ZDOTDIR/`--rcfile` paths). |
| **Split panes / pane grid** | ❌ missing | Every session renders into an absolutely-positioned `.term-pane` with `visibility: hidden` unless `.active` (`src/styles.css:417-426`); `setActive()` enforces exactly one visible pane (`src/main.ts:898`). No split/grid code exists (`grep -i split\|pane` over `src/` returns only theming and the single-pane classes). |
| **Agent Mode** (built-in multi-step AI in the shell) | ❌ missing — *by design* | No agent runtime in the codebase; AFKode launches external CLIs (`CLI_NAMES = ["claude", "opencode", "codex"]`, `src/main.ts:2336`) and supervises them via injected Claude Code hooks (`src/main.ts:769` `HookState`, `src-tauri/src/lib.rs` listener). Declared non-goal in [ROADMAP-FEATURES.md](ROADMAP-FEATURES.md). |
| **Active AI** (always-on command suggestions/completions) | ❌ missing | No inline suggestion engine; the only completion surfaces are the prompt palette's history / `/command` / `@file` autocomplete (`src/palette.ts:33+` `Suggestion`), which target agent prompts, not shell commands. |
| **NL → command translation** (`#` command search) | ❌ missing | No `claude -p` invocation or ask-strip anywhere in `src/` or `src-tauri/`; planned as F3 in [ROADMAP-FEATURES.md](ROADMAP-FEATURES.md) with `/goal` prompt ready. |
| **Warp Drive workflows** (saved parameterized commands) | ❌ missing — deferred | No workflow store in the code; explicitly deferred in [ROADMAP-FEATURES.md](ROADMAP-FEATURES.md) "Deliberately not on this roadmap". |
| **Notebooks / shareable blocks** | ❌ missing — rejected | Same non-goals section; AFKode's sharing plan is the F11 PNG card instead. Block copy (command/output/both) exists via the block toolbar (`src/blocks.ts`). |
| **MCP support** | ❌ missing | Only occurrence is the literal `"/mcp"` string in the palette's Claude-command list (`src/palette.ts:19`) — that's autocomplete for Claude Code's own command, not MCP support in AFKode. |
| **Command palette** (app actions, fuzzy) | 🟡 partial | `Alt+P` palette exists for *prompts* with history/`/command`/`@file` completion (`src/palette.ts`); no `>` action mode or fuzzy action registry yet — planned as F2. Session *search* exists separately (`Ctrl+K`, README hotkey table). |
| **SSH integration** (first-class remote sessions) | ❌ missing | No SSH handling; `src/blocks.ts:11` explicitly treats `ssh` as a plain command that never activates block logic. |
| **Session restore** | ❌ missing | Persistence today is settings + `last-folder` + `recent-folders` in `localStorage` (`src/main.ts:826,848`; `CONTRIBUTING.md:49`); no tab-layout journal, no startup restore flow. Planned as F4. |
| **GPU rendering** | ✅ has | WebGL renderer per README "Real terminal (ConPTY/PTY): … GPU-rendered (WebGL)" (§ "A terminal built for this"); Warp uses a GPU-rendered Rust client — different stack, same class. |
| **Tabs, themes, scrollback search** | ✅ has | Tabs with rename/color/state dots (`src/main.ts:1021+`, `2430`, `2466`), 9 themes (`src/main.ts:46` `THEMES`), `Ctrl+F` search via `SearchAddon` (`src/main.ts:794`, `2059+`). |

**Where AFKode leads Warp** (for its category): real agent-state integration via Claude Code hooks instead of heuristics (`HookState`, `src/main.ts:769`; exact working/waiting/done in `sessionState()`, `src/main.ts:1637`); approve-from-anywhere `Alt+A` (`src/main.ts:1702-1725`); game-aware DND + between-matches inbox (`src/main.ts:1807+`); mini-HUD over games (`src/hud.ts`); away-summary with per-session stats (`src/main.ts:1888+`). Warp has no equivalent of any of these.

---

## 3. Agent-grid design (split panes for agent supervision)

### 3.1 Goal and shape

Show 2–4 sessions side by side inside the terminal area — typically several agent tabs at once ("my two Claude sessions and a shell"), with per-pane state, focus, and approve targeting that stay correct when more than one agent is visible.

### 3.2 Layout model

A **binary split tree**, global (one visible layout, not per-tab):

```ts
type LayoutNode =
  | { kind: "leaf"; sessionId: string }
  | { kind: "split"; dir: "row" | "col"; ratio: number; a: LayoutNode; b: LayoutNode };
let layout: LayoutNode | null = null; // null → today's single-pane behavior
```

- `dir: "row"` = side-by-side (vertical divider), `"col"` = stacked. `ratio` ∈ (0.1, 0.9), default 0.5.
- Splitting the focused leaf replaces it with a `split` whose `a` is the old leaf and `b` is the new session. Closing a leaf promotes its sibling — the tree never has single-child nodes.
- Even redistribution (Warp's double-click-divider parity): walk the subtree under the divider and reset ratios to equalize leaf areas.
- **Tab semantics:** the tab bar stays a flat session list. Sessions in the current layout get a small ▦ badge on their tab; clicking a gridded session's tab focuses its pane instead of hiding the others. Clicking a non-gridded tab exits to single-pane view of that session (layout is remembered per… nothing — one saved layout slot, restored by a "back to grid" palette action, keeps v1 simple). Multiple named layouts are out of scope.

### 3.3 Rendering (what changes in the DOM/CSS)

Today `#terminals` (`src/main.ts:818`) holds absolutely-stacked `.term-pane`s and `.active` toggles `visibility` (`src/styles.css:417-426`). The grid replaces *stacking* with *tiling* only when a layout exists:

- New `renderLayout()` builds nested flex containers inside `#terminals`: `split(row)` → `display:flex; flex-direction:row`, children sized by `flex-grow: ratio / (1-ratio)`, with a 5px `.pane-divider` between them (drag = adjust `ratio`; dblclick = redistribute).
- `.term-pane` gains a `.gridded` variant: `position: relative; visibility: visible; flex: 1 1 0` — existing single-pane CSS is untouched when `layout === null`, so **zero regression risk for the current UX**.
- Each gridded pane gets a slim header strip (title + state dot reusing the `st-working/waiting/done` classes from the tab dots, `src/main.ts:1660`) — needed because tab dots no longer identify *which visible pane* is waiting.

### 3.4 Resize handling

- `safeFit()` (`src/main.ts:954`) already takes `(term, fit, pane)` and clamps overflow per pane — it works unchanged for grid panes.
- Add one `ResizeObserver` per gridded pane calling a debounced `safeFit`; divider drags and window resizes then need no special-casing. Today's window-resize path must change from "fit the active pane" to "fit every *visible* pane".
- xterm.js note: each session already owns its own `Terminal`+`FitAddon` (`Session` interface, `src/main.ts:786`) — no shared-renderer work needed. WebGL contexts are per-terminal; browsers cap ~8–16 live contexts, so cap the grid at **4 visible panes** (also the supervision-sanity limit).

### 3.5 Keyboard shortcuts

Consistent with the existing in-app `Ctrl+…` table (README) and free of collisions (`Ctrl+F/K/V`, `Ctrl+Shift+C`, `Ctrl+↑/↓` are taken; on macOS these map to `⌘` per `macKeys`, `src/main.ts:731`):

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+D` | Split right: opens the launcher picker (empty-state buttons reused) in the new pane, cwd defaulting to the focused session's `cwd` |
| `Ctrl+Shift+E` | Split down (same picker) |
| `Ctrl+Shift+W` | Close focused pane (session keeps running, returns to a plain tab) |
| `Alt+←/→/↑/↓` (in-app only) | Move pane focus spatially |
| `Ctrl+Shift+Z` | Zoom: temporarily maximize the focused pane (toggle) |

All five also become palette actions once F2 lands.

### 3.6 Focus management

`activeId` (`src/main.ts:811`) remains the single source of truth = the **focused pane**. `setActive()` changes from "hide all others" to: if the session is in the layout, move the focus ring (`.term-pane.active` border) and `term.focus()`; else collapse to single-pane view. Click anywhere in a pane → `setActive(that session)`. `Ctrl+F` search, git footer (`updateGitStatus()`, `src/main.ts:1363`), and `Ctrl+K` all key off `activeId` and keep working with zero changes.

### 3.7 Multi-agent HUD, Alt+A, and state — what already works and what must change

- **HUD (`src/main.ts:1654` loop + `src/hud.ts`):** already fleet-aware — it iterates *all* sessions, aggregates worst-state-wins, and reports `count`. No change required for correctness. Improvement (S): when ≥2 agents wait, set `detail` to `"2 waiting"` instead of the first waiter's detail.
- **`Alt+A` (`approve-request` listener, `src/main.ts:1711`):** currently answers the *first* waiting session found — ambiguous with two waiting agents visible side by side. New rule: **focused pane if it's waiting → else oldest-waiting → else current fallback**. The per-pane header (3.3) turns waiting panes visibly amber, so the user can predict the target; a second `Alt+A` within 2s cycles to the next waiter.
- **Prompt palette (`paletteTarget()`, `src/main.ts:1729`):** same rule change — prefer the focused pane when it's waiting; the palette's context line already names the target session, which disambiguates.
- **Per-session state (`sessionState()`, `src/main.ts:1637`), stats, inbox, away-summary:** all keyed per `Session` — unaffected by visibility changes.

### 3.8 Change inventory & scope

| Change | Where | Scope |
|---|---|---|
| `LayoutNode` model + split/close/promote/redistribute ops | new `src/layout.ts` | **M** |
| `renderLayout()` + divider drag + `.gridded`/`.pane-divider` CSS | `src/layout.ts`, `src/styles.css` | **M** |
| `setActive()` rework (focus ring vs hide-others; collapse path) | `src/main.ts:898` | **M** — the riskiest edit; every UX path funnels through it |
| `newSession()` mount-into-pane variant + launcher-picker-in-pane | `src/main.ts:1007`, `updateEmptyState()` | **M** |
| `closeSession()` tree-promotion | `src/main.ts:925` | **S** |
| ResizeObserver per pane + fit-all-visible on window resize | `src/main.ts` (uses `safeFit` as-is) | **S** |
| Pane header strip (title + state dot) | `src/main.ts`, `src/styles.css` | **S** |
| Shortcuts + spatial focus movement | `src/main.ts` key handling | **S** |
| `Alt+A` / palette targeting rule (focused-waiting first) | `src/main.ts:1711,1729` | **S** |
| Tab-bar ▦ badges + click semantics | `src/main.ts` tab code | **S** |
| Session-restore interplay (persist layout in the F4 journal) | future — F4 | deferred |

Estimated total: one focused milestone (~M/L overall). Recommended sequencing: land **after F2 (palette actions)** so grid actions are discoverable on day one, and design the F4 session journal to include the layout tree from the start.
