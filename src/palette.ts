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
  kind: "cmd" | "file" | "hist";
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
    es: "Escribe un prompt…  ( / comandos · @ archivos · Tab completa )",
    en: "Type a prompt…  ( / commands · @ files · Tab completes )",
    fr: "Écrivez un prompt…  ( / commandes · @ fichiers · Tab complète )",
    it: "Scrivi un prompt…  ( / comandi · @ file · Tab completa )",
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
    const icon = s.kind === "cmd" ? "⌘" : s.kind === "file" ? "📁" : "↺";
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
    // Enter accepts a highlighted slash command, otherwise submits.
    if (sel >= 0 && sugs[sel].kind === "cmd" && input.value !== sugs[sel].insert) {
      accept(sel);
    } else {
      submit();
    }
  } else if (e.key === "Escape") {
    if (sugs.length) {
      clearSugs();
    } else {
      input.value = "";
      invoke("hide_palette");
    }
  }
});
