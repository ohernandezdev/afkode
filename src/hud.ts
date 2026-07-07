import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface HudState {
  state: "working" | "waiting" | "done" | "none";
  since: number;
  label: string;
  count: number;
  detail?: string;
  muted?: boolean;
}

const dot = document.getElementById("dot")!;
const label = document.getElementById("label")!;

let current: HudState = { state: "none", since: 0, label: "", count: 0 };

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function render() {
  dot.className = `dot ${current.state === "none" ? "" : current.state}`;
  replyBtn.classList.toggle("hidden", current.state !== "waiting");
  if (current.state === "none") {
    label.textContent = "AFKode";
    return;
  }
  const mute = current.muted ? "🔕 " : "";
  const elapsed = current.since ? ` · ${fmt(Date.now() - current.since)}` : "";
  const multi = current.count > 1 ? ` (${current.count})` : "";
  // When waiting, show what the agent wants to do (from Claude Code hooks).
  const detail = current.detail ? ` · ` : "";
  label.innerHTML = `${mute}<b></b>${elapsed}${multi}${detail}<i class="detail"></i>`;
  label.querySelector("b")!.textContent = current.label;
  if (current.detail) {
    const d = label.querySelector("i.detail") as HTMLElement;
    d.textContent =
      current.detail.length > 34 ? current.detail.slice(0, 34) + "…" : current.detail;
  }
}

listen<HudState>("hud-state", (e) => {
  current = e.payload;
  localizeTooltip();
  render();
});

// One local tick drives the elapsed timer (state arrives event-driven).
setInterval(render, 1000);

const openBtn = document.getElementById("open")!;
openBtn.addEventListener("click", () => invoke("show_overlay"));

// Quick reply: when an agent is waiting, jump straight into the palette
// (already targeted at the asking session by the main window).
const replyBtn = document.getElementById("reply")!;
replyBtn.addEventListener("click", () => invoke("show_palette"));

// Tooltip follows the main window's language (shared localStorage).
function localizeTooltip() {
  try {
    const lang = JSON.parse(localStorage.getItem("settings") ?? "{}").lang;
    openBtn.title = lang === "es" ? "Abrir overlay (Alt+X)" : "Open overlay (Alt+X)";
  } catch {
    /* keep default */
  }
}
localizeTooltip();
