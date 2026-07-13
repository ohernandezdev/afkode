import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

const input = document.getElementById("prompt") as HTMLInputElement;
const sugsEl = document.getElementById("sugs")!;

// Claude Code built-in slash commands (curated).
const SLASH_COMMANDS = [
  "/clear",
  "/compact",
  "/config",
  "/context",
  "/cost",
  "/doctor",
  "/exit",
  "/help",
  "/init",
  "/mcp",
  "/memory",
  "/model",
  "/permissions",
  "/resume",
  "/review",
  "/status",
  "/todos",
  "/vim",
];

const BASE_HEIGHT = 96;
const ROW_HEIGHT = 30;

interface Suggestion {
  label: string;
  insert: string;
  kind: "cmd" | "file" | "hist" | "action";
  actionId?: string;
}

// ── '>' action mode (VS Code-style command palette) ───────
//
// The palette runs in its own window; actions execute in the main window,
// which listens for "palette-action" and maps ids to its existing handlers.
// Titles stay English (dev-facing, à la VS Code); keywords carry the
// localized synonyms so fuzzy search still hits in every UI language.

interface Action {
  id: string;
  title: string;
  keywords: string;
}

const ACTIONS: Action[] = [
  { id: "new-claude", title: "New tab: Claude Code", keywords: "nueva pestaña onglet scheda launch agent" },
  { id: "new-opencode", title: "New tab: OpenCode", keywords: "nueva pestaña onglet scheda launch agent" },
  { id: "new-codex", title: "New tab: Codex", keywords: "nueva pestaña onglet scheda launch agent" },
  { id: "new-shell", title: "New tab: Shell", keywords: "nueva pestaña terminal powershell" },
  { id: "new-picker", title: "New tab: choose folder…", keywords: "nueva pestaña carpeta folder dossier cartella" },
  { id: "next-theme", title: "Switch theme", keywords: "tema thème cycle cambiar colores colors" },
  { id: "toggle-ghost", title: "Toggle ghost mode", keywords: "fantasma click-through transparente" },
  { id: "toggle-dnd", title: "Toggle do-not-disturb", keywords: "dnd silencio no molestar ne pas déranger" },
  { id: "toggle-hud", title: "Toggle mini-HUD", keywords: "pill píldora estado state" },
  { id: "toggle-window-mode", title: "Toggle overlay / window mode", keywords: "ventana fenêtre finestra modo overlay" },
  { id: "open-settings", title: "Open settings", keywords: "ajustes configuración préférences impostazioni" },
  { id: "open-help", title: "Open help", keywords: "ayuda aide aiuto hotkeys atajos shortcuts" },
  { id: "session-search", title: "Search sessions", keywords: "buscar sesiones chercher jump ctrl+k" },
  { id: "jump-waiting", title: "Jump to waiting agent", keywords: "ir esperando aprobar approve attente" },
  { id: "close-session", title: "Close active session", keywords: "cerrar pestaña fermer chiudi kill" },
  { id: "copy-last-block", title: "Copy last block output", keywords: "copiar bloque salida copier sortie output" },
];

// Recently-used action ids, most recent first (palette-owned key, same
// pattern as "prompt-history" below).
let actionRecency: string[] = [];
try {
  const v = JSON.parse(localStorage.getItem("action-recency") ?? "[]");
  actionRecency = Array.isArray(v) ? v : [];
} catch {
  actionRecency = [];
}

function pushActionRecency(id: string) {
  actionRecency = [id, ...actionRecency.filter((a) => a !== id)].slice(0, 20);
  localStorage.setItem("action-recency", JSON.stringify(actionRecency));
}

// Subsequence fuzzy scorer: every query char must appear in order; runs of
// consecutive matches and word-start hits score higher. -1 = no match.
function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  let qi = 0;
  let streak = 0;
  let score = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      streak++;
      score += streak;
      if (ti === 0 || t[ti - 1] === " " || t[ti - 1] === ":") score += 3;
      qi++;
    } else {
      streak = 0;
    }
  }
  return qi === q.length ? score : -1;
}

function actionSugs(query: string): Suggestion[] {
  const scored = ACTIONS.map((a) => {
    const best = Math.max(fuzzyScore(query, a.title) * 2, fuzzyScore(query, a.keywords));
    const ri = actionRecency.indexOf(a.id);
    const recency = ri >= 0 ? (20 - ri) / 4 : 0;
    return { a, score: best < 0 ? -1 : best + recency };
  })
    .filter((s) => s.score >= 0)
    .sort((x, y) => y.score - x.score);
  return scored.map<Suggestion>((s) => ({
    label: s.a.title,
    insert: ">" + s.a.title,
    kind: "action",
    actionId: s.a.id,
  }));
}

function runAction(id: string) {
  pushActionRecency(id);
  emit("palette-action", id);
  input.value = "";
  clearSugs();
  invoke("hide_palette");
}

let cwd: string | null = null;
let history: string[] = [];
try {
  const v = JSON.parse(localStorage.getItem("prompt-history") ?? "[]");
  history = Array.isArray(v) ? v : [];
} catch {
  history = [];
}

let sugs: Suggestion[] = [];
let sel = -1;
let debounceTimer = 0;

function uiLang(): string {
  try {
    return JSON.parse(localStorage.getItem("settings") ?? "{}").lang ?? "en";
  } catch {
    return "en";
  }
}

function placeholder(): string {
  const map: Record<string, string> = {
    es: "Escribe un prompt…  ( / comandos · @ archivos · > acciones · Tab completa )",
    en: "Type a prompt…  ( / commands · @ files · > actions · Tab completes )",
    fr: "Écrivez un prompt…  ( / commandes · @ fichiers · > actions · Tab complète )",
    it: "Scrivi un prompt…  ( / comandi · @ file · > azioni · Tab completa )",
  };
  return map[uiLang()] ?? map.en;
}

function resize() {
  const h = BASE_HEIGHT + (sugs.length ? sugs.length * ROW_HEIGHT + 10 : 0);
  getCurrentWindow()
    .setSize(new LogicalSize(600, h))
    .catch(() => {});
}

function renderSugs() {
  sugsEl.innerHTML = "";
  sugsEl.classList.toggle("visible", sugs.length > 0);
  sugs.forEach((s, i) => {
    const row = document.createElement("div");
    row.className = `sug${i === sel ? " sel" : ""}`;
    const icon =
      s.kind === "cmd" ? "⌘" : s.kind === "file" ? "📁" : s.kind === "action" ? "⚡" : "↺";
    row.innerHTML = `<span class="sug-ico"></span><span class="sug-text"></span>`;
    (row.querySelector(".sug-ico") as HTMLElement).textContent = icon;
    (row.querySelector(".sug-text") as HTMLElement).textContent = s.label;
    row.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      accept(i);
    });
    sugsEl.appendChild(row);
  });
  resize();
}

// Sequence guard: a slow list_dir reply from an earlier keystroke must not
// overwrite the suggestions computed for the current input.
let sugSeq = 0;

async function updateSugs() {
  const seq = ++sugSeq;
  const v = input.value;
  const out: Suggestion[] = [];

  if (v.startsWith(">")) {
    // Action mode: the whole list on a bare ">", fuzzy-narrowed as you type.
    sugs = actionSugs(v.slice(1).trim());
    sel = sugs.length ? 0 : -1;
    renderSugs();
    return;
  }

  if (v.startsWith("/") && !v.includes(" ")) {
    out.push(
      ...SLASH_COMMANDS.filter((c) => c.startsWith(v.toLowerCase()))
        .slice(0, 6)
        .map<Suggestion>((c) => ({ label: c, insert: c, kind: "cmd" })),
    );
  } else {
    // `@path/fragment` at the end of the input → filesystem completion
    // against the target session's working directory.
    const m = v.match(/@([\w\-./\\]*)$/);
    if (m && cwd) {
      try {
        const entries = await invoke<{ name: string; dir: boolean }[]>("list_dir", {
          base: cwd,
          prefix: m[1],
        });
        const head = v.slice(0, v.length - m[1].length);
        out.push(
          ...entries.map<Suggestion>((e) => ({
            label: (e.dir ? "📁 " : "📄 ") + e.name,
            insert: head + e.name + (e.dir ? "/" : ""),
            kind: "file",
          })),
        );
      } catch {
        /* directory unavailable */
      }
    }
    if (v.trim().length >= 2) {
      const q = v.toLowerCase();
      out.push(
        ...history
          .filter((h) => h.toLowerCase().includes(q) && h !== v)
          .slice(0, 4)
          .map<Suggestion>((h) => ({ label: h, insert: h, kind: "hist" })),
      );
    }
  }

  if (seq !== sugSeq) return;
  sugs = out.slice(0, 8);
  sel = sugs.length ? 0 : -1;
  renderSugs();
}

function accept(i: number) {
  if (i < 0 || i >= sugs.length) return;
  input.value = sugs[i].insert;
  input.focus();
  updateSugs();
}

function clearSugs() {
  sugs = [];
  sel = -1;
  renderSugs();
}

function pushHistory(text: string) {
  history = [text, ...history.filter((h) => h !== text)].slice(0, 50);
  localStorage.setItem("prompt-history", JSON.stringify(history));
}

function submit() {
  const text = input.value.trim();
  if (!text) return;
  pushHistory(text);
  emit("palette-submit", text);
  input.value = "";
  clearSugs();
  invoke("hide_palette");
}

listen("palette-shown", () => {
  input.placeholder = placeholder();
  input.value = "";
  clearSugs();
  input.focus();
});

// Who will receive the prompt (sent by the main window).
const ctx = document.getElementById("ctx")!;
const ctxTitle = document.getElementById("ctx-title")!;
const ctxDetail = document.getElementById("ctx-detail")!;
listen<{ title: string; detail: string; cwd: string | null }>(
  "palette-context",
  (e) => {
    const { title, detail } = e.payload;
    cwd = e.payload.cwd;
    ctx.classList.toggle("visible", !!title);
    ctxTitle.textContent = title ? `→ ${title}` : "";
    ctxDetail.textContent = detail ? ` — ${detail}` : "";
  },
);

window.addEventListener("focus", () => input.focus());

input.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(updateSugs, 120);
});

input.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" && sugs.length) {
    e.preventDefault();
    sel = (sel + 1) % sugs.length;
    renderSugs();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (sugs.length) {
      sel = (sel - 1 + sugs.length) % sugs.length;
      renderSugs();
    } else if (!input.value && history.length) {
      // Shell-style recall on an empty input.
      input.value = history[0];
      updateSugs();
    }
  } else if (e.key === "Tab") {
    e.preventDefault();
    accept(sel);
  } else if (e.key === "Enter") {
    // Action mode: Enter executes the highlighted action — '>' text is an
    // instruction to the app, never a prompt for the agent.
    if (input.value.startsWith(">")) {
      const s = sel >= 0 ? sugs[sel] : sugs[0];
      if (s?.actionId) runAction(s.actionId);
      return;
    }
    // Enter accepts a highlighted slash command, otherwise submits.
    if (sel >= 0 && sugs[sel].kind === "cmd" && input.value !== sugs[sel].insert) {
      accept(sel);
    } else {
      submit();
    }
  } else if (e.key === "Escape") {
    // Action mode: Esc returns to prompt mode instead of hiding.
    if (input.value.startsWith(">")) {
      input.value = "";
      clearSugs();
      return;
    }
    if (sugs.length) {
      clearSugs();
    } else {
      input.value = "";
      invoke("hide_palette");
    }
  }
});
