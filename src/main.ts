import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";

// ── Themes ────────────────────────────────────────────────

interface ThemeDef {
  label: string;
  panelRgb: string;
  barRgb: string;
  text: string;
  dim: string;
  accent: string;
  accentSoft: string;
  term: ITheme;
}

const TERM_COMMON: Partial<ITheme> = {
  background: "rgba(0,0,0,0)",
  selectionBackground: "rgba(140,160,200,0.28)",
};

const THEMES: Record<string, ThemeDef> = {
  "warp-dark": {
    label: "Warp Dark",
    panelRgb: "23, 25, 32",
    barRgb: "29, 32, 41",
    text: "#c9d1d9",
    dim: "#8b93a1",
    accent: "#d97757",
    accentSoft: "rgba(217,119,87,0.14)",
    term: {
      ...TERM_COMMON,
      foreground: "#c9d1d9",
      cursor: "#d97757",
      cursorAccent: "#171920",
      black: "#21252b", red: "#e06c75", green: "#98c379", yellow: "#e5c07b",
      blue: "#61afef", magenta: "#c678dd", cyan: "#56b6c2", white: "#abb2bf",
      brightBlack: "#5c6370", brightRed: "#ec8589", brightGreen: "#a9d18e",
      brightYellow: "#edd09a", brightBlue: "#7cc0f5", brightMagenta: "#d492e8",
      brightCyan: "#72c8d4", brightWhite: "#e8ecf2",
    },
  },
  claude: {
    label: "Claude Warm",
    panelRgb: "36, 32, 28",
    barRgb: "44, 39, 34",
    text: "#e4dcd2",
    dim: "#a39a8e",
    accent: "#d97757",
    accentSoft: "rgba(217,119,87,0.16)",
    term: {
      ...TERM_COMMON,
      foreground: "#e4dcd2",
      cursor: "#d97757",
      cursorAccent: "#24201c",
      black: "#2e2a25", red: "#e06c75", green: "#98c379", yellow: "#e5c07b",
      blue: "#61afef", magenta: "#c678dd", cyan: "#56b6c2", white: "#c4bcb2",
      brightBlack: "#6b6359", brightRed: "#ec8589", brightGreen: "#a9d18e",
      brightYellow: "#edd09a", brightBlue: "#7cc0f5", brightMagenta: "#d492e8",
      brightCyan: "#72c8d4", brightWhite: "#f2ece4",
    },
  },
  dracula: {
    label: "Dracula",
    panelRgb: "40, 42, 54",
    barRgb: "48, 51, 66",
    text: "#f8f8f2",
    dim: "#9aa0b9",
    accent: "#bd93f9",
    accentSoft: "rgba(189,147,249,0.16)",
    term: {
      ...TERM_COMMON,
      foreground: "#f8f8f2",
      cursor: "#bd93f9",
      cursorAccent: "#282a36",
      black: "#21222c", red: "#ff5555", green: "#50fa7b", yellow: "#f1fa8c",
      blue: "#bd93f9", magenta: "#ff79c6", cyan: "#8be9fd", white: "#f8f8f2",
      brightBlack: "#6272a4", brightRed: "#ff6e6e", brightGreen: "#69ff94",
      brightYellow: "#ffffa5", brightBlue: "#d6acff", brightMagenta: "#ff92df",
      brightCyan: "#a4ffff", brightWhite: "#ffffff",
    },
  },
  nord: {
    label: "Nord",
    panelRgb: "46, 52, 64",
    barRgb: "54, 61, 76",
    text: "#d8dee9",
    dim: "#9aa5b8",
    accent: "#88c0d0",
    accentSoft: "rgba(136,192,208,0.16)",
    term: {
      ...TERM_COMMON,
      foreground: "#d8dee9",
      cursor: "#88c0d0",
      cursorAccent: "#2e3440",
      black: "#3b4252", red: "#bf616a", green: "#a3be8c", yellow: "#ebcb8b",
      blue: "#81a1c1", magenta: "#b48ead", cyan: "#88c0d0", white: "#e5e9f0",
      brightBlack: "#4c566a", brightRed: "#d08770", brightGreen: "#b5cea0",
      brightYellow: "#f0d8a8", brightBlue: "#94b4d4", brightMagenta: "#c5a3c0",
      brightCyan: "#8fbcbb", brightWhite: "#eceff4",
    },
  },
  "tokyo-night": {
    label: "Tokyo Night",
    panelRgb: "26, 27, 38",
    barRgb: "33, 34, 48",
    text: "#c0caf5",
    dim: "#8189af",
    accent: "#7aa2f7",
    accentSoft: "rgba(122,162,247,0.16)",
    term: {
      ...TERM_COMMON,
      foreground: "#c0caf5",
      cursor: "#7aa2f7",
      cursorAccent: "#1a1b26",
      black: "#15161e", red: "#f7768e", green: "#9ece6a", yellow: "#e0af68",
      blue: "#7aa2f7", magenta: "#bb9af7", cyan: "#7dcfff", white: "#a9b1d6",
      brightBlack: "#414868", brightRed: "#ff8fa3", brightGreen: "#b3dd85",
      brightYellow: "#edc487", brightBlue: "#94b8ff", brightMagenta: "#ccb2ff",
      brightCyan: "#98dcff", brightWhite: "#c9d3f8",
    },
  },
  gruvbox: {
    label: "Gruvbox Dark",
    panelRgb: "40, 40, 40",
    barRgb: "50, 48, 47",
    text: "#ebdbb2",
    dim: "#a89984",
    accent: "#fe8019",
    accentSoft: "rgba(254,128,25,0.15)",
    term: {
      ...TERM_COMMON,
      foreground: "#ebdbb2",
      cursor: "#fe8019",
      cursorAccent: "#282828",
      black: "#282828", red: "#cc241d", green: "#98971a", yellow: "#d79921",
      blue: "#458588", magenta: "#b16286", cyan: "#689d6a", white: "#a89984",
      brightBlack: "#928374", brightRed: "#fb4934", brightGreen: "#b8bb26",
      brightYellow: "#fabd2f", brightBlue: "#83a598", brightMagenta: "#d3869b",
      brightCyan: "#8ec07c", brightWhite: "#ebdbb2",
    },
  },
};

// ── Fonts ─────────────────────────────────────────────────

const FONT_CANDIDATES = [
  "Cascadia Mono",
  "Cascadia Code",
  "Consolas",
  "JetBrains Mono",
  "Fira Code",
  "Source Code Pro",
  "IBM Plex Mono",
  "Victor Mono",
  "Lucida Console",
  "Courier New",
];

const availableFonts = FONT_CANDIDATES.filter((f) => {
  try {
    return document.fonts.check(`13px "${f}"`);
  } catch {
    return false;
  }
});
if (availableFonts.length === 0) availableFonts.push("Consolas");

const FONT_SIZES = [11, 12, 13, 14, 15, 16, 18];

// ── i18n ──────────────────────────────────────────────────

type Lang = "es" | "en";

const I18N: Record<Lang, Record<string, string>> = {
  es: {
    tooltipNew: "Nueva pestaña",
    tooltipHelp: "Ayuda y atajos",
    tooltipSettings: "Ajustes",
    tooltipGhost: "Modo fantasma (Alt+G): los clics pasan al juego",
    tooltipHide: "Ocultar overlay (Alt+X)",
    tooltipClose: "Ocultar a la bandeja (salir: menú del icono de la bandeja)",
    tooltipOpacity: "Opacidad del fondo",
    statusHint:
      "<kbd>Alt</kbd>+<kbd>X</kbd> overlay&ensp;·&ensp;<kbd>Alt</kbd>+<kbd>G</kbd> fantasma&ensp;·&ensp;<kbd>Alt</kbd>+<kbd>P</kbd> prompt&ensp;·&ensp;<kbd>Alt</kbd>+<kbd>A</kbd> aprobar",
    ghostBadge: "👻 MODO FANTASMA — Alt+G para desactivar",
    helpTitle: "¿Por qué usar AFKode?",
    help1:
      "<b>Sin salir del juego.</b> El overlay flota sobre tu juego (en modo ventana o <i>borderless</i>). Pulsa <kbd>Alt</kbd>+<kbd>X</kbd> para mostrarlo u ocultarlo al instante, sin alt-tab.",
    help2:
      "<b>Claude trabaja mientras juegas.</b> Lanza una tarea larga a Claude Code, oculta el overlay y sigue jugando; vuelve con <kbd>Alt</kbd>+<kbd>X</kbd> para revisar el progreso.",
    help3:
      "<b>Modo fantasma (<kbd>Alt</kbd>+<kbd>G</kbd>).</b> El overlay queda visible como un HUD semitransparente y tus clics y teclas pasan al juego.",
    help4:
      "<b>Pestañas y tu carpeta.</b> El botón <b>+</b> abre Claude Code, OpenCode, Codex o PowerShell; primero eliges la carpeta del proyecto con el diálogo nativo de Windows.",
    help5:
      "<b>Terminal real.</b> ConPTY + render por GPU (WebGL): colores completos, apps interactivas y rendimiento de Windows Terminal con impacto mínimo en tus FPS.",
    help6:
      "<b>A tu medida.</b> Temas, fuente e idioma en ⚙; arrastra la barra superior para moverlo y ajusta la opacidad con el control de la barra inferior.",
    settingsTitle: "Ajustes",
    theme: "Tema",
    font: "Fuente",
    fontSize: "Tamaño",
    language: "Idioma",
    ended: "(terminada)",
    sessionEnded: "— sesión terminada — pulsa × para cerrar",
    spawnError: "Error al iniciar la sesión",
    pickFolder: "Elige la carpeta del proyecto",
    emptyTitle: "¿Dónde quieres trabajar?",
    noFolder: "Elegir carpeta… (por defecto: inicio)",
    starting: "Iniciando",
    notifications: "Notificaciones",
    sound: "Sonido",
    notifWaiting: "está esperando tu respuesta",
    notifDone: "parece haber terminado",
    notifExit: "sesión finalizada",
    installHint: "no instalado — clic para instalarlo",
    installing: "Instalando",
    hud: "Mini-HUD (píldora de estado)",
    autoLaunch: "Auto-lanzar Claude al iniciar",
    hooksLabel: "Integración con Claude Code",
    hooksNote:
      "Lanza Claude Code con hooks que reportan su estado real a AFKode: qué herramienta ejecuta, cuándo espera tu permiso y cuándo termina un turno. Así el HUD, Alt+A y el resumen son exactos en vez de estimados. Todo es local (127.0.0.1); se aplica a sesiones nuevas.",
    trayToggle: "Mostrar / Ocultar",
    trayGhost: "Modo fantasma",
    trayPalette: "Paleta de prompts",
    trayQuit: "Salir de AFKode",
    hudOpen: "Abrir overlay (Alt+X)",
    matchModeLabel: "No molestar en partida",
    matchModeNote:
      "Cuando un juego en pantalla completa tiene el foco, AFKode guarda silencio: sin toasts ni beeps. Lo pendiente se acumula en el inbox y al levantar el silencio recibes un único aviso. Como los lobbies también son fullscreen, Alt+N alterna el silencio manualmente (🔕 en el mini-HUD); al cerrar el juego vuelve al modo automático.",
    searchPlaceholder: "Buscar en el terminal…  (Enter siguiente · Shift+Enter anterior)",
    inboxTitle: "Pendientes de tus agentes",
    inboxApprove: "Aprobar",
    inboxOpen: "Ir",
    ttsLabel: "Anuncios por voz (TTS)",
    ttsNote:
      "Estilo copiloto: en vez de un beep, una voz anuncia \"Claude Code está esperando tu respuesta\" por encima del audio del juego. Windows no lo suprime en pantalla completa.",
    queuedSummary: "{n} pendiente(s) de tus agentes — Alt+X para revisar",
    hudWorking: "trabajando",
    hudWaiting: "esperándote",
    hudDone: "listo",
    updateReady:
      "AFKode {v} instalado — se aplicará al reiniciar la app (menú de la bandeja → Salir)",
    awaySummary:
      "Mientras no mirabas ({away} min): {turns} turnos completados · {tools} herramientas · {files} archivos · te esperó {waits} veces ({waitMin} min)",
  },
  en: {
    tooltipNew: "New tab",
    tooltipHelp: "Help & shortcuts",
    tooltipSettings: "Settings",
    tooltipGhost: "Ghost mode (Alt+G): clicks pass through to the game",
    tooltipHide: "Hide overlay (Alt+X)",
    tooltipClose: "Hide to tray (quit via the tray icon menu)",
    tooltipOpacity: "Background opacity",
    statusHint:
      "<kbd>Alt</kbd>+<kbd>X</kbd> overlay&ensp;·&ensp;<kbd>Alt</kbd>+<kbd>G</kbd> ghost&ensp;·&ensp;<kbd>Alt</kbd>+<kbd>P</kbd> prompt&ensp;·&ensp;<kbd>Alt</kbd>+<kbd>A</kbd> approve",
    ghostBadge: "👻 GHOST MODE — Alt+G to disable",
    helpTitle: "Why use AFKode?",
    help1:
      "<b>Never leave your game.</b> The overlay floats above your game (windowed or <i>borderless</i>). Press <kbd>Alt</kbd>+<kbd>X</kbd> to toggle it instantly, no alt-tab.",
    help2:
      "<b>Claude works while you play.</b> Kick off a long Claude Code task, hide the overlay and keep playing; come back with <kbd>Alt</kbd>+<kbd>X</kbd> to check progress.",
    help3:
      "<b>Ghost mode (<kbd>Alt</kbd>+<kbd>G</kbd>).</b> The overlay stays visible as a translucent HUD while your clicks and keys go to the game.",
    help4:
      "<b>Tabs & your folder.</b> The <b>+</b> button opens Claude Code, OpenCode, Codex or PowerShell; you pick the project folder first via the native Windows dialog.",
    help5:
      "<b>Real terminal.</b> ConPTY + GPU rendering (WebGL): full colors, interactive apps, Windows Terminal performance with minimal FPS impact.",
    help6:
      "<b>Make it yours.</b> Themes, font and language in ⚙; drag the top bar to move it and adjust opacity with the bottom-bar slider.",
    settingsTitle: "Settings",
    theme: "Theme",
    font: "Font",
    fontSize: "Size",
    language: "Language",
    ended: "(ended)",
    sessionEnded: "— session ended — press × to close",
    spawnError: "Failed to start session",
    pickFolder: "Choose project folder",
    emptyTitle: "Where do you want to work?",
    noFolder: "Choose folder… (default: home)",
    starting: "Starting",
    notifications: "Notifications",
    sound: "Sound",
    notifWaiting: "is waiting for your input",
    notifDone: "seems to be done",
    notifExit: "session ended",
    installHint: "not installed — click to install it",
    installing: "Installing",
    hud: "Mini-HUD (status pill)",
    autoLaunch: "Auto-launch Claude on start",
    hooksLabel: "Claude Code integration",
    hooksNote:
      "Launches Claude Code with hooks that report its real state to AFKode: which tool it runs, when it waits for your permission, and when a turn ends. This makes the HUD, Alt+A and the summary exact instead of estimated. Everything is local (127.0.0.1); applies to new sessions.",
    trayToggle: "Show / Hide",
    trayGhost: "Ghost mode",
    trayPalette: "Prompt palette",
    trayQuit: "Quit AFKode",
    hudOpen: "Open overlay (Alt+X)",
    matchModeLabel: "Do not disturb in match",
    matchModeNote:
      "While a fullscreen game holds focus, AFKode stays silent: no toasts, no beeps. Pending items pile up in the inbox and you get a single ping when silence lifts. Since lobbies are fullscreen too, Alt+N toggles silence manually (🔕 on the mini-HUD); closing the game returns to auto.",
    searchPlaceholder: "Search the terminal…  (Enter next · Shift+Enter previous)",
    inboxTitle: "Your agents need you",
    inboxApprove: "Approve",
    inboxOpen: "Go",
    ttsLabel: "Voice announcements (TTS)",
    ttsNote:
      "Copilot style: instead of a beep, a voice announces \"Claude Code is waiting for your input\" over your game audio. Windows doesn't suppress it in fullscreen.",
    queuedSummary: "{n} item(s) pending from your agents — Alt+X to review",
    hudWorking: "working",
    hudWaiting: "waiting for you",
    hudDone: "done",
    updateReady:
      "AFKode {v} installed — applies when you restart the app (tray menu → Quit)",
    awaySummary:
      "While you were away ({away} min): {turns} turns completed · {tools} tools · {files} files · it waited for you {waits} times ({waitMin} min)",
  },
};

// ── Settings ──────────────────────────────────────────────

interface Settings {
  theme: string;
  font: string;
  size: number;
  lang: Lang;
  notify: boolean;
  sound: boolean;
  hud: boolean;
  autoLaunch: boolean;
  hooks: boolean;
  matchMode: boolean;
  tts: boolean;
}

const DEFAULTS: Settings = {
  theme: "warp-dark",
  font: availableFonts[0],
  size: 13,
  lang: navigator.language.toLowerCase().startsWith("es") ? "es" : "en",
  notify: true,
  sound: true,
  hud: true,
  autoLaunch: false,
  hooks: true,
  matchMode: true,
  tts: false,
};

function loadSettings(): Settings {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem("settings") ?? "{}") };
    if (!THEMES[s.theme]) s.theme = DEFAULTS.theme;
    if (!I18N[s.lang as Lang]) s.lang = DEFAULTS.lang;
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}

let settings = loadSettings();

const t = (key: string) => I18N[settings.lang][key] ?? key;

function saveSettings() {
  localStorage.setItem("settings", JSON.stringify(settings));
}

// ── Session management ────────────────────────────────────

interface HookState {
  seen: boolean;
  waiting: boolean;
  idle: boolean;
  detail: string;
  claudeId?: string;
}

interface SessionStats {
  turns: number;
  tools: number;
  files: Set<string>;
  waits: number;
  waitMs: number;
  waitStart: number;
}

interface Session {
  id: string;
  title: string;
  cmd: string;
  cwd: string | null;
  term: Terminal;
  fit: FitAddon;
  search: SearchAddon;
  pane: HTMLElement;
  tab: HTMLElement;
  alive: boolean;
  loader?: HTMLElement;
  lastData: number;
  tail: string;
  notifiedWaiting: boolean;
  notifiedDone: boolean;
  hook: HookState;
  stats: SessionStats;
  doneSeen: boolean;
  exitSeen: boolean;
}

const sessions = new Map<string, Session>();
let activeId: string | null = null;
let counter = 0;

const $ = <T extends HTMLElement>(sel: string) =>
  document.querySelector(sel) as T;

const tabsEl = $("#tabs");
const terminalsEl = $("#terminals");
const addMenu = $("#add-menu");
const statusEl = $("#status-session");
const overlayEl = $("#overlay");
const ghostBadge = $("#ghost-badge");
const ghostBtn = $("#btn-ghost");

const emptyState = $("#empty-state");
const pickedFolderLabel = $("#picked-folder-label");
let pickedFolder: string | null = localStorage.getItem("last-folder");

function updateEmptyState() {
  emptyState.classList.toggle("hidden", sessions.size > 0);
}

function updatePickedFolderLabel() {
  pickedFolderLabel.textContent = pickedFolder ?? t("noFolder");
}

async function pickFolder(): Promise<string | null> {
  try {
    const picked = await openDialog({ directory: true, title: t("pickFolder") });
    return typeof picked === "string" ? picked : null;
  } catch {
    return null;
  }
}

function updateStatus() {
  const s = activeId ? sessions.get(activeId) : null;
  statusEl.textContent = s
    ? s.alive
      ? `● ${s.title}`
      : `○ ${s.title} ${t("ended")}`
    : "—";
}

function setActive(id: string) {
  activeId = id;
  for (const s of sessions.values()) {
    s.pane.classList.toggle("active", s.id === id);
    s.tab.classList.toggle("active", s.id === id);
  }
  const active = sessions.get(id);
  if (active) {
    active.doneSeen = true;
    active.exitSeen = true;
  }
  updateStatus();
  const s = sessions.get(id);
  if (s) {
    requestAnimationFrame(() => {
      s.fit.fit();
      s.term.focus();
    });
  }
}

function closeSession(id: string) {
  const s = sessions.get(id);
  if (!s) return;
  sessions.delete(id);
  if (s.alive) invoke("kill_pty", { id }).catch(() => {});
  s.term.dispose();
  s.pane.remove();
  s.tab.remove();
  if (activeId === id) {
    const next = [...sessions.keys()].pop();
    if (next) setActive(next);
    else {
      activeId = null;
      updateStatus();
    }
  }
  updateEmptyState();
}

async function newSession(cmd: string, baseTitle: string, cwd: string | null) {
  if (cwd) localStorage.setItem("last-folder", cwd);
  const folderName = cwd ? cwd.replace(/[\\/]+$/, "").split(/[\\/]/).pop() : null;
  const title = folderName ? `${baseTitle} · ${folderName}` : baseTitle;

  const id = `s${++counter}`;

  const pane = document.createElement("div");
  pane.className = "term-pane";
  terminalsEl.appendChild(pane);

  const tab = document.createElement("button");
  tab.className = "tab";
  tab.innerHTML = `<span class="tab-dot"></span><span class="tab-title"></span><span class="tab-x" title="×">×</span>`;
  (tab.querySelector(".tab-title") as HTMLElement).textContent = title;
  tab.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).classList.contains("tab-x")) closeSession(id);
    else setActive(id);
  });
  tabsEl.appendChild(tab);

  const themeDef = THEMES[settings.theme];
  const term = new Terminal({
    allowTransparency: true,
    fontFamily: `"${settings.font}", Consolas, monospace`,
    fontSize: settings.size,
    lineHeight: 1.25,
    letterSpacing: 0,
    fontWeight: "400",
    // Synthesized semibold smears at small sizes in the WebGL atlas; render
    // bold at normal weight and let bright colors carry the emphasis.
    fontWeightBold: "400",
    drawBoldTextInBrightColors: true,
    minimumContrastRatio: 1,
    cursorBlink: true,
    cursorStyle: "bar",
    // Memory: 2k lines is plenty for supervision; agents redraw their TUI.
    scrollback: 2000,
    theme: themeDef.term,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon());
  const search = new SearchAddon();
  try {
    term.loadAddon(search);
  } catch {
    /* search unavailable: Ctrl+F becomes a no-op */
  }
  try {
    // Correct emoji/CJK cell widths — agent TUIs use them heavily.
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = "11";
  } catch {
    /* addon/version mismatch: default width tables still work */
  }
  term.open(pane);
  try {
    term.loadAddon(new WebglAddon());
  } catch {
    /* WebGL unavailable: xterm falls back to DOM renderer */
  }
  fit.fit();

  // Loading animation until the CLI paints its first output (Claude Code's
  // initial spin-up leaves the pane black for several seconds).
  let loader: HTMLElement | undefined;
  if (cmd) {
    loader = document.createElement("div");
    loader.className = "term-loader";
    loader.innerHTML = `
      <div class="loader-ring"><span class="loader-core"></span></div>
      <div class="loader-text">${t("starting")} ${baseTitle}<span class="loader-dots"><i>.</i><i>.</i><i>.</i></span></div>`;
    pane.appendChild(loader);
  }

  // Clipboard UX: copy-on-select, Ctrl+Shift+C/V, right-click copy/paste.
  // Inside TUIs (Claude Code) the app captures the mouse; Shift+drag selects.
  term.onSelectionChange(() => {
    const sel = term.getSelection();
    if (sel) navigator.clipboard.writeText(sel).catch(() => {});
  });
  term.attachCustomKeyEventHandler((ev) => {
    if (ev.type === "keydown" && ev.ctrlKey && !ev.shiftKey && ev.code === "KeyF") {
      openSearch();
      return false;
    }
    if (ev.type !== "keydown" || !ev.ctrlKey || !ev.shiftKey) return true;
    if (ev.code === "KeyC") {
      const sel = term.getSelection();
      if (sel) navigator.clipboard.writeText(sel).catch(() => {});
      return false;
    }
    if (ev.code === "KeyV") {
      navigator.clipboard
        .readText()
        .then((txt) => txt && term.paste(txt))
        .catch(() => {});
      return false;
    }
    return true;
  });
  pane.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    const sel = term.getSelection();
    if (sel) {
      navigator.clipboard.writeText(sel).catch(() => {});
      term.clearSelection();
    } else {
      navigator.clipboard
        .readText()
        .then((txt) => txt && term.paste(txt))
        .catch(() => {});
    }
  });

  const session: Session = {
    id,
    title,
    cmd,
    cwd,
    term,
    fit,
    search,
    pane,
    tab,
    alive: true,
    loader,
    lastData: 0,
    tail: "",
    notifiedWaiting: false,
    notifiedDone: false,
    hook: { seen: false, waiting: false, idle: false, detail: "" },
    stats: { turns: 0, tools: 0, files: new Set(), waits: 0, waitMs: 0, waitStart: 0 },
    doneSeen: true,
    exitSeen: true,
  };
  sessions.set(id, session);
  updateEmptyState();
  setActive(id);

  term.onData((data) => invoke("write_pty", { id, data }).catch(() => {}));
  term.onResize(({ cols, rows }) =>
    invoke("resize_pty", { id, cols, rows }).catch(() => {}),
  );

  try {
    await invoke("spawn_pty", {
      id,
      cmd,
      cwd,
      hooks: settings.hooks,
      cols: term.cols,
      rows: term.rows,
    });
  } catch (e) {
    dismissLoader(session);
    term.writeln(`\x1b[31m${t("spawnError")}: ${e}\x1b[0m`);
    session.alive = false;
    tab.classList.add("dead");
  }
}

// ── Agent-aware notifications ─────────────────────────────
//
// Heuristic: an agent session that goes quiet is either waiting for input
// (its last output looks like a prompt / rang the bell) or finished. Only
// notify when the user isn't looking at the overlay.

let overlayVisible = true;
let notifPermission = false;

(async () => {
  try {
    notifPermission = await isPermissionGranted();
    if (!notifPermission) notifPermission = (await requestPermission()) === "granted";
  } catch {
    notifPermission = false;
  }
})();

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b(\[[0-9;?]*[a-zA-Z]|\][^\x07]*(\x07|\x1b\\)|[()][0-9A-B])/g;
const stripAnsi = (s: string) => s.replace(ANSI_RE, "");

const WAITING_RE =
  /(\(y\/n\)|do you want|don't ask again|tell claude what to do|allow|permission|press enter|continuar|\x07)/i;
const SILENCE_WAITING_MS = 12_000;
const SILENCE_DONE_MS = 45_000;

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.07, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    /* no audio device */
  }
}

// True while a fullscreen game holds the foreground (fed from Rust).
let gameMode = false;
// Manual override via Alt+N: lobbies are fullscreen too, so the user can
// flip silence by hand; cleared back to auto when the game closes.
let dndOverride: boolean | null = null;

function dndSilent(): boolean {
  return settings.matchMode && (dndOverride ?? gameMode);
}

// Sim-racing-copilot style voice announcements: heard over game audio and
// unaffected by Windows fullscreen toast suppression.
function speak(text: string) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = settings.lang === "es" ? "es-ES" : "en-US";
    u.rate = 1.05;
    u.volume = 1;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {
    /* no TTS engine */
  }
}

function notify(session: Session, bodyKey: string) {
  if (!settings.notify) return;
  if (overlayVisible && document.hasFocus()) return;
  // In-match do-not-disturb: stay silent; items accumulate in the inbox
  // and a single summary fires when silence lifts.
  if (dndSilent()) return;
  if (settings.tts) speak(`${session.title.split("·")[0].trim()} ${t(bodyKey)}`);
  else if (settings.sound) beep();
  if (notifPermission) {
    try {
      sendNotification({
        title: "AFKode",
        body: `${session.title} ${t(bodyKey)} — Alt+X`,
      });
    } catch {
      /* notifications unavailable */
    }
  }
}

setInterval(() => {
  const now = Date.now();
  for (const s of sessions.values()) {
    // Only agent sessions (not plain PowerShell), only after first output.
    // Sessions with live hooks report real state; skip the text heuristics.
    if (!s.alive || !s.cmd || !s.lastData || s.hook.seen) continue;
    const silent = now - s.lastData;
    if (
      !s.notifiedWaiting &&
      silent > SILENCE_WAITING_MS &&
      WAITING_RE.test(stripAnsi(s.tail))
    ) {
      s.notifiedWaiting = true;
      notify(s, "notifWaiting");
    }
    if (!s.notifiedDone && silent > SILENCE_DONE_MS) {
      s.notifiedDone = true;
      if (!s.notifiedWaiting) notify(s, "notifDone");
    }
  }
}, 3000);

// ── Claude Code hooks: real agent state ───────────────────
//
// The Rust side runs a local listener; Claude Code sessions are spawned with
// injected hook settings that POST each event (tool use, permission request,
// turn end) here. When hooks are flowing, they replace the text heuristics.

function startWait(s: Session, detail: string) {
  if (!s.hook.waiting) {
    s.hook.waiting = true;
    s.stats.waits++;
    s.stats.waitStart = Date.now();
  }
  if (detail) s.hook.detail = detail;
}

function endWait(s: Session) {
  if (s.hook.waiting) {
    s.hook.waiting = false;
    s.stats.waitMs += Date.now() - s.stats.waitStart;
  }
  s.hook.detail = "";
}

function toolDetail(name: string, input: Record<string, unknown> | undefined): string {
  if (!input) return name;
  const arg =
    (input.command as string) ??
    (input.file_path as string) ??
    (input.pattern as string) ??
    "";
  return arg ? `${name}: ${arg}` : name;
}

function findHookSession(p: { session_id?: string; cwd?: string }): Session | undefined {
  const list = [...sessions.values()].filter((s) => s.cmd === "claude" && s.alive);
  const norm = (x: string) => x.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
  let s = list.find((x) => x.hook.claudeId && x.hook.claudeId === p.session_id);
  if (!s && p.cwd) {
    s = list.find((x) => !x.hook.claudeId && x.cwd && norm(x.cwd) === norm(p.cwd!));
  }
  if (!s && list.length === 1) s = list[0];
  if (s && p.session_id) s.hook.claudeId = p.session_id;
  return s;
}

listen<string>("agent-hook", (e) => {
  let p: {
    hook_event_name?: string;
    session_id?: string;
    cwd?: string;
    message?: string;
    tool_name?: string;
    tool_input?: Record<string, unknown>;
  };
  try {
    p = JSON.parse(e.payload);
  } catch {
    return;
  }
  const s = findHookSession(p);
  if (!s) return;
  s.hook.seen = true;
  switch (p.hook_event_name) {
    case "Notification":
      startWait(s, p.message ?? "");
      notify(s, "notifWaiting");
      break;
    case "PreToolUse":
      s.hook.idle = false;
      s.hook.detail = toolDetail(p.tool_name ?? "", p.tool_input);
      break;
    case "PostToolUse":
      endWait(s);
      s.hook.idle = false;
      s.stats.tools++;
      if (typeof p.tool_input?.file_path === "string") {
        s.stats.files.add(p.tool_input.file_path);
      }
      break;
    case "UserPromptSubmit":
      endWait(s);
      s.hook.idle = false;
      break;
    case "Stop":
      endWait(s);
      s.hook.idle = true;
      s.stats.turns++;
      s.doneSeen = false;
      notify(s, "notifDone");
      break;
  }
});

// ── Mini-HUD state feed ───────────────────────────────────
//
// Aggregated agent state, streamed to the hud window: waiting beats working
// beats done. The pill shows only while the overlay is hidden.

type AgentState = "working" | "waiting" | "done";

function sessionState(s: Session): AgentState {
  if (!s.alive) return "done";
  if (s.hook.seen) {
    // Real state from Claude Code hooks — no guessing.
    if (s.hook.waiting) return "waiting";
    if (s.hook.idle) return "done";
    return "working";
  }
  if (s.notifiedWaiting) return "waiting";
  if (Date.now() - s.lastData > SILENCE_DONE_MS) return "done";
  return "working";
}

let hudSince = 0;
let hudLast: AgentState | "none" = "none";
let lastHudPayload = "";

setInterval(() => {
  const agents = [...sessions.values()].filter((s) => s.cmd && s.lastData);
  const states = agents.map(sessionState);
  // Live state dots on the tabs themselves.
  for (const s of agents) {
    const dot = s.tab.querySelector(".tab-dot");
    if (dot) dot.className = `tab-dot st-${s.alive ? sessionState(s) : "dead"}`;
  }
  const state: AgentState | "none" = states.includes("waiting")
    ? "waiting"
    : states.includes("working")
      ? "working"
      : agents.length
        ? "done"
        : "none";
  if (state !== hudLast) {
    hudLast = state;
    hudSince = Date.now();
  }
  const show = settings.hud && agents.length > 0 && !overlayVisible;
  invoke("set_hud_visible", { visible: show }).catch(() => {});
  if (show) {
    const key =
      state === "waiting" ? "hudWaiting" : state === "done" ? "hudDone" : "hudWorking";
    // Rich context: what the waiting agent actually wants to do.
    const rep = agents.find((s) => sessionState(s) === state);
    const detail = state === "waiting" ? (rep?.hook.detail ?? "") : "";
    const payload = {
      state,
      since: hudSince,
      label: t(key),
      count: agents.length,
      detail: detail.slice(0, 60),
      muted: dndSilent(),
    };
    // Skip redundant IPC: the HUD ticks its own elapsed timer locally.
    const key2 = JSON.stringify(payload);
    if (key2 !== lastHudPayload) {
      lastHudPayload = key2;
      emit("hud-state", payload);
    }
  } else {
    lastHudPayload = "";
  }
}, 1000);

// ── Alt+A: approve the waiting agent without opening the overlay ──

function approveSession(s: Session) {
  const data = /\(y\/n\)/i.test(stripAnsi(s.tail)) ? "y\r" : "\r";
  invoke("write_pty", { id: s.id, data }).catch(() => {});
  endWait(s);
  s.notifiedWaiting = false;
  s.tail = "";
  if (settings.sound) beep();
}

listen("approve-request", () => {
  const agents = [...sessions.values()].filter((x) => x.cmd && x.alive);
  const waiting = agents.find(
    (x) =>
      x.hook.waiting ||
      x.notifiedWaiting ||
      (WAITING_RE.test(stripAnsi(x.tail)) && Date.now() - x.lastData > 1500),
  );
  // Fallback to the active/first agent: Enter on Claude Code's permission
  // menu selects the highlighted "Yes", and an empty Enter is harmless.
  const active = activeId ? sessions.get(activeId) : null;
  const s =
    waiting ?? (active && active.cmd && active.alive ? active : agents[0]);
  if (s) approveSession(s);
});

// ── Alt+P: prompt palette → waiting or active agent ───────

function paletteTarget(): Session | undefined {
  const agents = [...sessions.values()].filter((x) => x.cmd && x.alive);
  // The session that is asking a question gets the reply.
  const waiting = agents.find((x) => sessionState(x) === "waiting");
  if (waiting) return waiting;
  const active = activeId ? sessions.get(activeId) : null;
  return active && active.cmd && active.alive ? active : agents[0];
}

listen("palette-shown", () => {
  const s = paletteTarget();
  emit("palette-context", {
    title: s ? s.title : "",
    detail: s?.hook.waiting ? s.hook.detail.slice(0, 70) : "",
    cwd: s?.cwd ?? null,
  });
});

listen<string>("palette-submit", (e) => {
  const target = paletteTarget();
  if (!target) {
    invoke("show_overlay").catch(() => {});
    return;
  }
  invoke("write_pty", { id: target.id, data: e.payload + "\r" }).catch(() => {});
  endWait(target);
});

// ── PTY event routing ─────────────────────────────────────

function dismissLoader(s: Session) {
  if (!s.loader) return;
  const el = s.loader;
  s.loader = undefined;
  el.classList.add("out");
  setTimeout(() => el.remove(), 250);
}

listen<{ id: string; data: string }>("pty-output", (e) => {
  const s = sessions.get(e.payload.id);
  if (!s) return;
  dismissLoader(s);
  s.term.write(e.payload.data);
  s.lastData = Date.now();
  s.tail = (s.tail + e.payload.data).slice(-4000);
  s.notifiedWaiting = false;
  s.notifiedDone = false;
});

listen<{ id: string }>("pty-exit", (e) => {
  const s = sessions.get(e.payload.id);
  if (!s) return;
  dismissLoader(s);
  s.alive = false;
  s.tab.classList.add("dead");
  s.term.writeln(`\r\n\x1b[90m${t("sessionEnded")}\x1b[0m`);
  updateStatus();
  if (s.cmd) {
    s.exitSeen = false;
    notify(s, "notifExit");
  }
  refreshCliButtons();
});

listen<boolean>("ghost-mode", (e) => {
  const on = e.payload;
  overlayEl.classList.toggle("ghost", on);
  ghostBadge.classList.toggle("hidden", !on);
  ghostBtn.classList.toggle("ghost-on", on);
});

// ── Inbox: everything your agents need from you ───────────
//
// Derived on demand from session state — no event log to keep in sync.
// Shown when the overlay opens; each row can be approved or jumped to.

interface InboxItem {
  session: Session;
  kind: "waiting" | "done" | "exit";
  detail: string;
}

function inboxItems(): InboxItem[] {
  const items: InboxItem[] = [];
  for (const s of sessions.values()) {
    if (!s.cmd) continue;
    if (!s.alive) {
      if (!s.exitSeen) items.push({ session: s, kind: "exit", detail: "" });
      continue;
    }
    if (sessionState(s) === "waiting") {
      items.push({ session: s, kind: "waiting", detail: s.hook.detail });
    } else if (s.hook.idle && !s.doneSeen) {
      items.push({ session: s, kind: "done", detail: "" });
    }
  }
  // Waiting first: that's what blocks the agent.
  return items.sort((a, b) => (a.kind === "waiting" ? -1 : 0) - (b.kind === "waiting" ? -1 : 0));
}

const inboxEl = $("#inbox");
const inboxList = $("#inbox-list");

function renderInbox() {
  const items = inboxItems();
  if (!items.length) {
    inboxEl.classList.add("hidden");
    return;
  }
  $("#inbox-title").textContent = t("inboxTitle");
  inboxList.innerHTML = "";
  for (const it of items.slice(0, 8)) {
    const row = document.createElement("div");
    row.className = "inbox-row";
    const kindText = t(
      it.kind === "waiting" ? "hudWaiting" : it.kind === "done" ? "hudDone" : "notifExit",
    );
    row.innerHTML = `
      <span class="dot ${it.kind}"></span>
      <div class="inbox-info">
        <b></b>
        <span class="inbox-detail"></span>
      </div>
      <div class="inbox-acts"></div>`;
    (row.querySelector("b") as HTMLElement).textContent = it.session.title;
    (row.querySelector(".inbox-detail") as HTMLElement).textContent = it.detail
      ? `${kindText} · ${it.detail.slice(0, 48)}`
      : kindText;
    const acts = row.querySelector(".inbox-acts") as HTMLElement;
    if (it.kind === "waiting") {
      const ok = document.createElement("button");
      ok.textContent = `✓ ${t("inboxApprove")}`;
      ok.className = "inbox-btn ok";
      ok.addEventListener("click", () => {
        approveSession(it.session);
        it.session.doneSeen = true;
        renderInbox();
      });
      acts.appendChild(ok);
    }
    const go = document.createElement("button");
    go.textContent = t("inboxOpen");
    go.className = "inbox-btn";
    go.addEventListener("click", () => {
      it.session.doneSeen = true;
      it.session.exitSeen = true;
      setActive(it.session.id);
      renderInbox();
    });
    acts.appendChild(go);
    inboxList.appendChild(row);
  }
  inboxEl.classList.remove("hidden");
}

// ── "While you were away" summary ─────────────────────────

interface Totals {
  turns: number;
  tools: number;
  files: number;
  waits: number;
  waitMs: number;
}

function totals(): Totals {
  const out: Totals = { turns: 0, tools: 0, files: 0, waits: 0, waitMs: 0 };
  for (const s of sessions.values()) {
    out.turns += s.stats.turns;
    out.tools += s.stats.tools;
    out.files += s.stats.files.size;
    out.waits += s.stats.waits;
    out.waitMs += s.stats.waitMs;
    // Include a wait still in progress.
    if (s.hook.waiting) out.waitMs += Date.now() - s.stats.waitStart;
  }
  return out;
}

let awayStart = 0;
let awayBase: Totals = totals();
let awayBannerTimer = 0;

const AWAY_MIN_MS = 120_000;

function showAwaySummary(d: Totals, awayMs: number) {
  const text = t("awaySummary")
    .replace("{away}", String(Math.max(1, Math.round(awayMs / 60000))))
    .replace("{turns}", String(d.turns))
    .replace("{tools}", String(d.tools))
    .replace("{files}", String(d.files))
    .replace("{waits}", String(d.waits))
    .replace("{waitMin}", String(Math.round(d.waitMs / 60000)));
  $("#away-text").textContent = text;
  $("#away-banner").classList.remove("hidden");
  clearTimeout(awayBannerTimer);
  awayBannerTimer = window.setTimeout(
    () => $("#away-banner").classList.add("hidden"),
    45_000,
  );
}

let prevSilent = false;

// Silence lifted (match ended or Alt+N): one aggregated ping for the queue.
function dndChanged() {
  const nowSilent = dndSilent();
  if (prevSilent && !nowSilent && !overlayVisible) {
    const n = inboxItems().length;
    if (n > 0 && settings.notify) {
      if (settings.tts) speak(t("queuedSummary").replace("{n}", String(n)));
      else if (settings.sound) beep();
      if (notifPermission) {
        try {
          sendNotification({
            title: "AFKode",
            body: t("queuedSummary").replace("{n}", String(n)),
          });
        } catch {
          /* notifications unavailable */
        }
      }
    }
  }
  prevSilent = nowSilent;
}

listen<boolean>("game-mode", (e) => {
  gameMode = e.payload;
  // Game closed or lost fullscreen: manual override returns to auto.
  if (!gameMode) dndOverride = null;
  dndChanged();
});

listen("dnd-toggle", () => {
  dndOverride = !dndSilent();
  dndChanged();
});

listen<string>("update-installed", (e) => {
  $("#away-text").textContent = t("updateReady").replace("{v}", e.payload);
  $("#away-banner").classList.remove("hidden");
});

listen("overlay-shown", () => {
  overlayVisible = true;
  renderInbox();
  if (awayStart && Date.now() - awayStart > AWAY_MIN_MS) {
    const now = totals();
    const d: Totals = {
      turns: now.turns - awayBase.turns,
      tools: now.tools - awayBase.tools,
      files: now.files - awayBase.files,
      waits: now.waits - awayBase.waits,
      waitMs: now.waitMs - awayBase.waitMs,
    };
    if (d.turns || d.tools || d.waits) showAwaySummary(d, Date.now() - awayStart);
  }
  awayStart = 0;
  const s = activeId && sessions.get(activeId);
  if (s) {
    s.fit.fit();
    s.term.focus();
  }
});

listen("overlay-hidden", () => {
  overlayVisible = false;
  awayStart = Date.now();
  awayBase = totals();
});

// ── Search in scrollback (Ctrl+F) ─────────────────────────

const searchBar = $("#search-bar");
const searchInput = $<HTMLInputElement>("#search-input");

function openSearch() {
  searchBar.classList.remove("hidden");
  searchInput.placeholder = t("searchPlaceholder");
  searchInput.focus();
  searchInput.select();
}

function closeSearch() {
  searchBar.classList.add("hidden");
  const s = activeId && sessions.get(activeId);
  if (s) {
    s.search.clearDecorations();
    s.term.focus();
  }
}

searchInput.addEventListener("input", () => {
  const s = activeId && sessions.get(activeId);
  if (s && searchInput.value) {
    s.search.findNext(searchInput.value, { incremental: true });
  }
});

searchInput.addEventListener("keydown", (e) => {
  const s = activeId && sessions.get(activeId);
  if (!s) return;
  if (e.key === "Enter" && e.shiftKey) {
    s.search.findPrevious(searchInput.value);
  } else if (e.key === "Enter") {
    s.search.findNext(searchInput.value);
  } else if (e.key === "Escape") {
    closeSearch();
  }
});

$("#search-close").addEventListener("click", closeSearch);

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && !e.shiftKey && e.code === "KeyF") {
    e.preventDefault();
    openSearch();
  }
});

// ── Drag & drop: file paths go straight to the active PTY ──

getCurrentWebview().onDragDropEvent((e) => {
  if (e.payload.type !== "drop") return;
  const s = activeId ? sessions.get(activeId) : null;
  if (!s || !s.alive || !e.payload.paths.length) return;
  const text = e.payload.paths
    .map((p) => (/\s/.test(p) ? `"${p}"` : p))
    .join(" ");
  invoke("write_pty", { id: s.id, data: text }).catch(() => {});
  s.term.focus();
});

// ── Resize handling ───────────────────────────────────────

let resizeRaf = 0;
new ResizeObserver(() => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => {
    const s = activeId && sessions.get(activeId);
    if (s) s.fit.fit();
  });
}).observe(terminalsEl);

// ── Apply settings (theme / font / language) ──────────────

function applyTheme() {
  const d = THEMES[settings.theme];
  const root = document.documentElement.style;
  root.setProperty("--panel-rgb", d.panelRgb);
  root.setProperty("--bar-rgb", d.barRgb);
  root.setProperty("--text", d.text);
  root.setProperty("--text-dim", d.dim);
  root.setProperty("--accent", d.accent);
  root.setProperty("--accent-soft", d.accentSoft);
  for (const s of sessions.values()) {
    s.term.options.theme = d.term;
  }
}

function applyFont() {
  for (const s of sessions.values()) {
    s.term.options.fontFamily = `"${settings.font}", Consolas, monospace`;
    s.term.options.fontSize = settings.size;
    s.fit.fit();
  }
}

function applyI18n() {
  document.documentElement.lang = settings.lang;
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n!);
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle!);
  });
  $("#status-hint").innerHTML = t("statusHint");
  ghostBadge.textContent = t("ghostBadge");
  $("#help-title").textContent = t("helpTitle");
  $("#help-list").innerHTML = [1, 2, 3, 4, 5, 6]
    .map((i) => `<li>${t(`help${i}`)}</li>`)
    .join("");
  $("#empty-title").textContent = t("emptyTitle");
  updatePickedFolderLabel();
  updateStatus();
  invoke("set_tray_labels", {
    toggle: t("trayToggle"),
    ghost: t("trayGhost"),
    palette: t("trayPalette"),
    quit: t("trayQuit"),
  }).catch(() => {});
}

// ── Settings UI ───────────────────────────────────────────

const selTheme = $<HTMLSelectElement>("#sel-theme");
const selFont = $<HTMLSelectElement>("#sel-font");
const selSize = $<HTMLSelectElement>("#sel-size");
const selLang = $<HTMLSelectElement>("#sel-lang");

selTheme.innerHTML = Object.entries(THEMES)
  .map(([k, v]) => `<option value="${k}">${v.label}</option>`)
  .join("");
selFont.innerHTML = availableFonts
  .map((f) => `<option value="${f}">${f}</option>`)
  .join("");
selSize.innerHTML = FONT_SIZES.map((n) => `<option value="${n}">${n}px</option>`).join("");

selTheme.value = settings.theme;
selFont.value = availableFonts.includes(settings.font)
  ? settings.font
  : availableFonts[0];
selSize.value = String(settings.size);
selLang.value = settings.lang;

selTheme.addEventListener("change", () => {
  settings.theme = selTheme.value;
  saveSettings();
  applyTheme();
});
selFont.addEventListener("change", () => {
  settings.font = selFont.value;
  saveSettings();
  applyFont();
});
selSize.addEventListener("change", () => {
  settings.size = Number(selSize.value);
  saveSettings();
  applyFont();
});
selLang.addEventListener("change", () => {
  settings.lang = selLang.value as Lang;
  saveSettings();
  applyI18n();
});

function wireSwitch(
  sel: string,
  key: "notify" | "sound" | "hud" | "autoLaunch" | "hooks" | "matchMode" | "tts",
) {
  const el = $<HTMLInputElement>(sel);
  el.checked = settings[key];
  el.addEventListener("change", () => {
    settings[key] = el.checked;
    saveSettings();
  });
}
wireSwitch("#chk-notify", "notify");
wireSwitch("#chk-sound", "sound");
wireSwitch("#chk-hud", "hud");
wireSwitch("#chk-autolaunch", "autoLaunch");
wireSwitch("#chk-hooks", "hooks");
wireSwitch("#chk-matchmode", "matchMode");
const chkTts = $<HTMLInputElement>("#chk-tts");
chkTts.checked = settings.tts;
chkTts.addEventListener("change", () => {
  settings.tts = chkTts.checked;
  saveSettings();
  if (settings.tts) speak(settings.lang === "es" ? "Voz activada" : "Voice enabled");
});

// ── CLI detection & one-click install ─────────────────────

const CLI_INSTALL: Record<string, string> = {
  claude: "npm install -g @anthropic-ai/claude-code",
  opencode: "npm install -g opencode-ai",
  codex: "npm install -g @openai/codex",
};

const cliAvailable: Record<string, boolean> = {};

function cliButtons(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>("button[data-cmd]")];
}

async function refreshCliButtons() {
  const names = Object.keys(CLI_INSTALL);
  try {
    const found = await invoke<boolean[]>("detect_clis", { names });
    names.forEach((n, i) => (cliAvailable[n] = found[i]));
  } catch {
    return; // backend without detect_clis: leave buttons as-is
  }
  for (const b of cliButtons()) {
    const cmd = b.dataset.cmd ?? "";
    if (!cmd) continue;
    const ok = cliAvailable[cmd] ?? true;
    b.classList.toggle("missing", !ok);
    b.title = ok ? "" : `${b.dataset.name}: ${t("installHint")}`;
  }
}

function launchCli(cmd: string, name: string, cwd: string | null) {
  if (cmd && cliAvailable[cmd] === false) {
    // Missing CLI: open a tab that installs it; buttons refresh on exit.
    newSession(CLI_INSTALL[cmd], `${t("installing")} ${name}…`, null);
    return;
  }
  newSession(cmd, name, cwd);
}

// ── Toolbar ───────────────────────────────────────────────

$("#btn-new-tab").addEventListener("click", (e) => {
  e.stopPropagation();
  addMenu.classList.toggle("hidden");
});

addMenu.querySelectorAll("button").forEach((b) =>
  b.addEventListener("click", async () => {
    addMenu.classList.add("hidden");
    // New tab via "+": native folder picker first, session starts there.
    const cwd = await pickFolder();
    if (cwd) {
      pickedFolder = cwd;
      updatePickedFolderLabel();
    }
    launchCli(b.dataset.cmd ?? "", b.dataset.name ?? "Terminal", cwd);
  }),
);

// Empty-state launcher: pick the folder once, then launch any CLI in it.
$("#btn-pick-folder").addEventListener("click", async () => {
  const cwd = await pickFolder();
  if (cwd) {
    pickedFolder = cwd;
    updatePickedFolderLabel();
  }
});

emptyState.querySelectorAll(".launchers button").forEach((b) =>
  (b as HTMLButtonElement).addEventListener("click", () => {
    const el = b as HTMLButtonElement;
    launchCli(el.dataset.cmd ?? "", el.dataset.name ?? "Terminal", pickedFolder);
  }),
);

document.addEventListener("click", () => addMenu.classList.add("hidden"));

$("#btn-ghost").addEventListener("click", () =>
  invoke("set_ghost_mode", { enabled: !overlayEl.classList.contains("ghost") }),
);
$("#btn-hide").addEventListener("click", () => invoke("hide_overlay"));
// × hides to the tray (Discord-style); quitting is in the tray menu.
$("#btn-close").addEventListener("click", () => invoke("hide_overlay"));

// ── Background opacity ────────────────────────────────────

const opacitySlider = $<HTMLInputElement>("#opacity-slider");
const savedAlpha = localStorage.getItem("panel-alpha");
if (savedAlpha) {
  opacitySlider.value = savedAlpha;
  document.documentElement.style.setProperty(
    "--panel-alpha",
    String(Number(savedAlpha) / 100),
  );
}
opacitySlider.addEventListener("input", () => {
  document.documentElement.style.setProperty(
    "--panel-alpha",
    String(Number(opacitySlider.value) / 100),
  );
  localStorage.setItem("panel-alpha", opacitySlider.value);
});

// ── Modals ────────────────────────────────────────────────

function wireModal(modalSel: string, openSel: string, closeSel: string) {
  const modal = $(modalSel);
  $(openSel).addEventListener("click", (e) => {
    e.stopPropagation();
    modal.classList.remove("hidden");
  });
  $(closeSel).addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });
  return modal;
}

const helpModal = wireModal("#help-modal", "#btn-help", "#btn-help-close");
wireModal("#settings-modal", "#btn-settings", "#btn-settings-close");

$("#away-close").addEventListener("click", () =>
  $("#away-banner").classList.add("hidden"),
);
$("#inbox-close").addEventListener("click", () => inboxEl.classList.add("hidden"));

// Dev HMR page reloads would orphan PTY sessions: kill them on unload.
window.addEventListener("beforeunload", () => {
  for (const id of sessions.keys()) invoke("kill_pty", { id }).catch(() => {});
});

// Errors must never be invisible: surface unexpected failures in the banner
// instead of dying as silent promise rejections.
function surfaceError(msg: string) {
  $("#away-text").textContent = `⚠ ${msg}`;
  $("#away-banner").classList.remove("hidden");
}
window.addEventListener("unhandledrejection", (e) =>
  surfaceError(String(e.reason).slice(0, 300)),
);
window.addEventListener("error", (e) => surfaceError(String(e.message).slice(0, 300)));

// ── Boot ──────────────────────────────────────────────────

applyTheme();
applyI18n();
updateEmptyState();
refreshCliButtons().then(() => {
  // Auto-launch: warm up Claude Code in the last folder while the user
  // is still tabbing into their game.
  if (settings.autoLaunch && sessions.size === 0 && cliAvailable["claude"] !== false) {
    launchCli("claude", "Claude Code", pickedFolder);
  }
});

// First run: show the help card once so the user discovers the features.
if (!localStorage.getItem("help-seen")) {
  helpModal.classList.remove("hidden");
  localStorage.setItem("help-seen", "1");
}
