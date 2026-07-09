import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  readText as clipRead,
  writeText as clipWrite,
} from "@tauri-apps/plugin-clipboard-manager";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js";
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
      foreground: "#aeb5bd",
      cursor: "#d97757",
      cursorAccent: "#171920",
      black: "#21252b", red: "#e06c75", green: "#98c379", yellow: "#e5c07b",
      blue: "#61afef", magenta: "#c678dd", cyan: "#56b6c2", white: "#abb2bf",
      brightBlack: "#363a44", brightRed: "#ec8589", brightGreen: "#a9d18e",
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
      foreground: "#c7c0b7",
      cursor: "#d97757",
      cursorAccent: "#24201c",
      black: "#2e2a25", red: "#e06c75", green: "#98c379", yellow: "#e5c07b",
      blue: "#61afef", magenta: "#c678dd", cyan: "#56b6c2", white: "#c4bcb2",
      brightBlack: "#443e37", brightRed: "#ec8589", brightGreen: "#a9d18e",
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
      foreground: "#d9d9d6",
      cursor: "#bd93f9",
      cursorAccent: "#282a36",
      black: "#21222c", red: "#ff5555", green: "#50fa7b", yellow: "#f1fa8c",
      blue: "#bd93f9", magenta: "#ff79c6", cyan: "#8be9fd", white: "#f8f8f2",
      brightBlack: "#424a68", brightRed: "#ff6e6e", brightGreen: "#69ff94",
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
      foreground: "#bfc5d0",
      cursor: "#88c0d0",
      cursorAccent: "#2e3440",
      black: "#3b4252", red: "#bf616a", green: "#a3be8c", yellow: "#ebcb8b",
      blue: "#81a1c1", magenta: "#b48ead", cyan: "#88c0d0", white: "#e5e9f0",
      brightBlack: "#3c4353", brightRed: "#d08770", brightGreen: "#b5cea0",
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
      foreground: "#a7b0d6",
      cursor: "#7aa2f7",
      cursorAccent: "#1a1b26",
      black: "#15161e", red: "#f7768e", green: "#9ece6a", yellow: "#e0af68",
      blue: "#7aa2f7", magenta: "#bb9af7", cyan: "#7dcfff", white: "#a9b1d6",
      brightBlack: "#2c2f44", brightRed: "#ff8fa3", brightGreen: "#b3dd85",
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
      foreground: "#cec09d",
      cursor: "#fe8019",
      cursorAccent: "#282828",
      black: "#282828", red: "#cc241d", green: "#98971a", yellow: "#d79921",
      blue: "#458588", magenta: "#b16286", cyan: "#689d6a", white: "#a89984",
      brightBlack: "#58514a", brightRed: "#fb4934", brightGreen: "#b8bb26",
      brightYellow: "#fabd2f", brightBlue: "#83a598", brightMagenta: "#d3869b",
      brightCyan: "#8ec07c", brightWhite: "#ebdbb2",
    },
  },
  solarized: {
    label: "Solarized Dark",
    panelRgb: "0, 43, 54",
    barRgb: "7, 54, 66",
    text: "#839496",
    dim: "#586e75",
    accent: "#268bd2",
    accentSoft: "rgba(38,139,210,0.16)",
    term: {
      ...TERM_COMMON,
      foreground: "#6f8488",
      cursor: "#268bd2",
      cursorAccent: "#002b36",
      black: "#073642", red: "#dc322f", green: "#859900", yellow: "#b58900",
      blue: "#268bd2", magenta: "#d33682", cyan: "#2aa198", white: "#eee8d5",
      brightBlack: "#002b36", brightRed: "#cb4b16", brightGreen: "#586e75",
      brightYellow: "#657b83", brightBlue: "#839496", brightMagenta: "#6c71c4",
      brightCyan: "#93a1a1", brightWhite: "#fdf6e3",
    },
  },
  github: {
    label: "GitHub Dark",
    panelRgb: "13, 17, 23",
    barRgb: "22, 27, 34",
    text: "#c9d1d9",
    dim: "#8b949e",
    accent: "#58a6ff",
    accentSoft: "rgba(88,166,255,0.16)",
    term: {
      ...TERM_COMMON,
      foreground: "#adb4bc",
      cursor: "#58a6ff",
      cursorAccent: "#0d1117",
      black: "#484f58", red: "#ff7b72", green: "#3fb950", yellow: "#d29922",
      blue: "#58a6ff", magenta: "#bc8cff", cyan: "#39c5cf", white: "#b1bac4",
      brightBlack: "#393e47", brightRed: "#ffa198", brightGreen: "#56d364",
      brightYellow: "#e3b341", brightBlue: "#79c0ff", brightMagenta: "#d2a8ff",
      brightCyan: "#56d4dd", brightWhite: "#f0f6fc",
    },
  },
  monokai: {
    label: "Monokai",
    panelRgb: "39, 40, 34",
    barRgb: "46, 47, 41",
    text: "#f8f8f2",
    dim: "#75715e",
    accent: "#f92672",
    accentSoft: "rgba(249,38,114,0.16)",
    term: {
      ...TERM_COMMON,
      foreground: "#d9d9d3",
      cursor: "#f92672",
      cursorAccent: "#272822",
      black: "#272822", red: "#f92672", green: "#a6e22e", yellow: "#f4bf75",
      blue: "#66d9ef", magenta: "#ae81ff", cyan: "#a1efe4", white: "#f8f8f2",
      brightBlack: "#4a493d", brightRed: "#f92672", brightGreen: "#a6e22e",
      brightYellow: "#f4bf75", brightBlue: "#66d9ef", brightMagenta: "#ae81ff",
      brightCyan: "#a1efe4", brightWhite: "#f9f8f5",
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
    tooltipMaximize: "Maximizar / restaurar",
    tooltipClose: "Ocultar a la bandeja (salir: menú del icono de la bandeja)",
    close: "Cerrar",
    tooltipOpacity: "Opacidad del fondo",
    hintAltXOverlay: "overlay",
    hintAltXWindow: "mostrar/ocultar",
    hintGhost: "fantasma",
    hintPrompt: "prompt",
    hintApprove: "aprobar",
    modeOverlay: "Overlay",
    modeWindow: "Ventana",
    tooltipModeBadge: "Click para cambiar entre modo overlay y ventana",
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
    opacity: "Opacidad",
    font: "Fuente",
    fontSize: "Tamaño",
    language: "Idioma",
    ended: "(terminada)",
    sessionEnded: "— sesión terminada — pulsa × para cerrar",
    spawnError: "Error al iniciar la sesión",
    pickFolder: "Elige la carpeta del proyecto",
    emptyTitle: "¿Dónde quieres trabajar?",
    noFolder: "Elegir carpeta… (por defecto: inicio)",
    wizTitle: "Configurar Claude Code",
    wizIntro:
      "AFKode necesita dos piezas para funcionar. Este asistente las instala por ti — cada paso abre una pestaña donde puedes ver el progreso.",
    wizStep1: "Node.js",
    wizStep1Note: "El motor que necesita Claude Code. Se instala con winget (instalador oficial de Windows).",
    wizStep2: "Claude Code",
    wizStep2Note: "El agente de IA de Anthropic. Se instala con npm.",
    wizStep3: "Todo listo",
    wizStep3Note:
      "Nota: si es tu primera vez, el propio Claude Code te pedirá iniciar sesión al abrirse (abre tu navegador y entra con tu cuenta) — eso lo gestiona Claude, no AFKode.",
    wizInstall: "Instalar",
    wizLaunch: "Abrir Claude Code",
    wizInstalling: "Instalando",
    wizInstallRunning: "Instalando… (el log de abajo se actualiza en vivo)",
    wizInstallOk: "✓ Instalado correctamente",
    wizInstallFailed: "✗ Falló la instalación — revisa el detalle arriba",
    wizInstallTimeout: "✗ Se colgó sin responder — puedes reintentar o instalarlo manualmente",
    argsPlaceholder: "Flags extra para Claude Code (se aplican al lanzar)…",
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
    overlayModeLabel: "Modo overlay",
    overlayModeNote:
      "Encendido: la ventana flota siempre encima de todo y no aparece en la barra de tareas — pensado para jugar. Apagado: se comporta como una ventana normal (barra de tareas, Alt+Tab) — mejor si no estás jugando y quieres evitar que te tape o te confunda con otras apps en pantalla completa.",
    matchModeLabel: "No molestar en partida",
    matchModeNote:
      "Cuando un juego en pantalla completa tiene el foco, AFKode guarda silencio: sin toasts ni beeps. Lo pendiente se acumula en el inbox y al levantar el silencio recibes un único aviso. Como los lobbies también son fullscreen, Alt+N alterna el silencio manualmente (🔕 en el mini-HUD); al cerrar el juego vuelve al modo automático.",
    searchPlaceholder: "Buscar en el terminal…  (Enter siguiente · Shift+Enter anterior)",
    tooltipGlobalSearch: "Buscar sesiones (Ctrl+K)",
    globalSearchPlaceholder: "Buscar sesiones…",
    globalSearchEmpty: "Sin resultados",
    linkOpening: "Abriendo enlace en tu navegador…",
    linkOpenFailed: "No pude abrir el navegador — copié el enlace, pégalo donde quieras",
    pastedImageInstead: "Tu clipboard no tenía texto, así que pegué una imagen en su lugar",
    filePreviewError: "No se pudo abrir el archivo",
    filePreviewNotFoundBare:
      "No encontré este archivo en la carpeta de la sesión. Claude probablemente lo mencionó sin indicar su ruta completa.",
    filePreviewTriedIn: "se buscó en",
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
    updateAvailable: "AFKode {v} disponible",
    updateInstallBtn: "Actualizar y reiniciar",
    updateInstalling: "Descargando la actualización… la app se reiniciará sola",
    updateFailed: "La actualización falló",
    awaySummary:
      "Mientras no mirabas ({away} min): {turns} turnos completados · {tools} herramientas · {files} archivos · te esperó {waits} veces ({waitMin} min)",
  },
  en: {
    tooltipNew: "New tab",
    tooltipHelp: "Help & shortcuts",
    tooltipSettings: "Settings",
    tooltipGhost: "Ghost mode (Alt+G): clicks pass through to the game",
    tooltipHide: "Hide overlay (Alt+X)",
    tooltipMaximize: "Maximize / restore",
    tooltipClose: "Hide to tray (quit via the tray icon menu)",
    close: "Close",
    tooltipOpacity: "Background opacity",
    hintAltXOverlay: "overlay",
    hintAltXWindow: "show/hide",
    hintGhost: "ghost",
    hintPrompt: "prompt",
    hintApprove: "approve",
    modeOverlay: "Overlay",
    modeWindow: "Window",
    tooltipModeBadge: "Click to switch between overlay and window mode",
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
    opacity: "Opacity",
    font: "Font",
    fontSize: "Size",
    language: "Language",
    ended: "(ended)",
    sessionEnded: "— session ended — press × to close",
    spawnError: "Failed to start session",
    pickFolder: "Choose project folder",
    emptyTitle: "Where do you want to work?",
    noFolder: "Choose folder… (default: home)",
    wizTitle: "Set up Claude Code",
    wizIntro:
      "AFKode needs two pieces to work. This wizard installs them for you — each step opens a tab where you can watch the progress.",
    wizStep1: "Node.js",
    wizStep1Note: "The engine Claude Code runs on. Installed via winget (official Windows installer).",
    wizStep2: "Claude Code",
    wizStep2Note: "Anthropic's AI coding agent. Installed via npm.",
    wizStep3: "All set",
    wizStep3Note:
      "Note: on first run Claude Code itself will ask you to sign in (your browser opens, log in with your account) — that part is handled by Claude, not AFKode.",
    wizInstall: "Install",
    wizLaunch: "Open Claude Code",
    wizInstalling: "Installing",
    wizInstallRunning: "Installing… (the log below updates live)",
    wizInstallOk: "✓ Installed successfully",
    wizInstallFailed: "✗ Install failed — check the log above",
    wizInstallTimeout: "✗ It hung with no response — you can retry or install it manually",
    argsPlaceholder: "Extra flags for Claude Code (applied on launch)…",
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
    overlayModeLabel: "Overlay mode",
    overlayModeNote:
      "On: the window always floats above everything and stays off the taskbar — built for playing. Off: it behaves like a normal window (taskbar, Alt+Tab) — better when you're not gaming and don't want it burying or getting buried by other fullscreen apps.",
    matchModeLabel: "Do not disturb in match",
    matchModeNote:
      "While a fullscreen game holds focus, AFKode stays silent: no toasts, no beeps. Pending items pile up in the inbox and you get a single ping when silence lifts. Since lobbies are fullscreen too, Alt+N toggles silence manually (🔕 on the mini-HUD); closing the game returns to auto.",
    searchPlaceholder: "Search the terminal…  (Enter next · Shift+Enter previous)",
    tooltipGlobalSearch: "Search sessions (Ctrl+K)",
    globalSearchPlaceholder: "Search sessions…",
    globalSearchEmpty: "No results",
    linkOpening: "Opening link in your browser…",
    linkOpenFailed: "Couldn't open your browser — copied the link, paste it anywhere",
    pastedImageInstead: "Your clipboard had no text, so an image got pasted instead",
    filePreviewError: "Couldn't open the file",
    filePreviewNotFoundBare:
      "Couldn't find this file in the session's folder. Claude likely mentioned it without its full path.",
    filePreviewTriedIn: "looked in",
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
    updateAvailable: "AFKode {v} is available",
    updateInstallBtn: "Update & restart",
    updateInstalling: "Downloading the update… the app will restart itself",
    updateFailed: "Update failed",
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
  overlayMode: boolean;
}

const DEFAULTS: Settings = {
  theme: "warp-dark",
  font: availableFonts[0],
  size: 13,
  lang: "en",
  notify: true,
  sound: true,
  hud: true,
  autoLaunch: false,
  hooks: true,
  matchMode: true,
  tts: false,
  overlayMode: true,
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
  color?: string;
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
const statusEl = $("#status-session");
const overlayEl = $("#overlay");
const ghostBadge = $("#ghost-badge");
const ghostBtn = $("#btn-ghost");

const emptyState = $("#empty-state");
const pickedFolderLabel = $("#picked-folder-label");
let pickedFolder: string | null = localStorage.getItem("last-folder");
// "+" shows the same rich empty-state (folder picker + launchers) instead
// of a plain dropdown, even when tabs already exist — this tracks that
// forced-open case so it can be dismissed without starting a session.
let forceEmptyState = false;

function updateEmptyState() {
  const show = sessions.size === 0 || forceEmptyState;
  emptyState.classList.toggle("hidden", !show);
  $("#empty-state-close").classList.toggle("hidden", sessions.size === 0);
}

function updatePickedFolderLabel() {
  pickedFolderLabel.textContent = pickedFolder ?? t("noFolder");
  renderRecents();
}

// ── Recent folders as one-click cards ─────────────────────

function recentFolders(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem("recent-folders") ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function addRecentFolder(path: string) {
  const list = [path, ...recentFolders().filter((p) => p !== path)].slice(0, 4);
  localStorage.setItem("recent-folders", JSON.stringify(list));
}

function renderRecents() {
  const container = $("#recent-cards");
  container.innerHTML = "";
  for (const path of recentFolders()) {
    const name = path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? path;
    const card = document.createElement("button");
    card.className = `recent-card${path === pickedFolder ? " selected" : ""}`;
    card.innerHTML = `<b></b><span></span>`;
    (card.querySelector("b") as HTMLElement).textContent = name;
    (card.querySelector("span") as HTMLElement).textContent = path;
    card.addEventListener("click", () => {
      pickedFolder = path;
      updatePickedFolderLabel();
    });
    container.appendChild(card);
  }
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
  updateGitStatus();
  const s = sessions.get(id);
  if (s) {
    requestAnimationFrame(() => {
      safeFit(s.term, s.fit, s.pane);
      // Don't steal focus from the tab-rename editor: a dblclick fires two
      // clicks (→ setActive) first, and this deferred focus would blur the
      // just-opened input, closing it before the user can type.
      if (!(document.activeElement as HTMLElement | null)?.classList.contains("tab-title-edit")) {
        s.term.focus();
      }
    });
  }
}

function closeSession(id: string) {
  const s = sessions.get(id);
  if (!s) return;
  sessions.delete(id);
  // Closing the wizard's install tab means its pty-exit will early-return
  // (session gone from the map) — resolve the wizard state here instead of
  // leaving it stuck on "Installing…" with its button disabled forever.
  if (id === wizActiveSessionId) {
    wizActiveSessionId = null;
    wizBusy = 0;
    wizLogStatus.textContent = t("wizInstallFailed");
    wizLogStatus.className = "wiz-log-status fail";
    wizardRefresh();
  }
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

// The DOM renderer lays out each row as real text, and fractional
// line-heights round per-row instead of per-terminal; over many rows that
// drift can push the last line past the pane's bottom edge. FitAddon can't
// see that at measurement time, so shrink by a row until it actually fits.
// A single correction only covers small drift (a window resize); a bigger
// jump (e.g. a large font-size change) can overflow by more than one row,
// so this actually loops rather than checking just once — each
// getBoundingClientRect() forces layout to reflect the resize that just
// happened, so the next check in the same loop sees accurate geometry.
function safeFit(term: Terminal, fit: FitAddon, pane: HTMLElement) {
  fit.fit();
  requestAnimationFrame(() => {
    const screen = pane.querySelector<HTMLElement>(".xterm-screen");
    if (!screen) return;
    // Capped well above any plausible overflow — guards against looping
    // forever if geometry ever fails to converge for an unexpected reason.
    for (let guard = 0; guard < 50; guard++) {
      if (screen.getBoundingClientRect().bottom <= pane.getBoundingClientRect().bottom + 0.5 || term.rows <= 1) {
        break;
      }
      term.resize(term.cols, term.rows - 1);
    }
  });
}

// Shared by both link paths: plain http(s) text matched by WebLinksAddon,
// and xterm's own built-in OSC 8 hyperlink handler (Terminal's linkHandler
// option below) — CLIs increasingly print clickable links via OSC 8 rather
// than plain text, and without linkHandler set, xterm's internal default
// activation calls window.open()/location.href, which doesn't reach the
// system browser the way Tauri's opener plugin does inside a WebView.
function openLinkUri(uri: string) {
  // The in-window toast is invisible if some other fullscreen app (not
  // a game — those already get the DND treatment) is covering the
  // overlay, which is exactly when someone can't tell whether the link
  // actually opened. A native OS toast punches through that.
  const notifyNative = (body: string) => {
    if (settings.notify && !(overlayVisible && document.hasFocus()) && notifPermission) {
      try {
        sendNotification({ title: "AFKode", body });
      } catch {
        /* notifications unavailable */
      }
    }
  };
  openUrl(uri)
    .then(() => {
      const msg = `${t("linkOpening")} ${uri}`;
      showLinkToast(msg);
      notifyNative(msg);
    })
    .catch(() => {
      // Swallowing this before just meant a failed open looked identical
      // to a working one — no default browser, a broken ShellExecute,
      // whatever. Fall back to the clipboard so the user still has
      // something to act on instead of a dead end.
      clipWrite(uri).catch(() => {});
      showLinkToast(t("linkOpenFailed"));
      notifyNative(t("linkOpenFailed"));
    });
}

async function newSession(cmd: string, baseTitle: string, cwd: string | null) {
  if (cwd) {
    localStorage.setItem("last-folder", cwd);
    addRecentFolder(cwd);
  }
  const folderName = cwd ? cwd.replace(/[\\/]+$/, "").split(/[\\/]/).pop() : null;
  const title = folderName ? `${baseTitle} · ${folderName}` : baseTitle;

  const id = `s${++counter}`;

  const pane = document.createElement("div");
  pane.className = "term-pane";
  terminalsEl.appendChild(pane);

  const tab = document.createElement("button");
  tab.className = "tab";
  tab.innerHTML = `<span class="tab-dot"></span><span class="tab-title"></span><span class="tab-x" title="×">×</span>`;
  const tabTitleEl = tab.querySelector(".tab-title") as HTMLElement;
  tabTitleEl.textContent = title;
  tab.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).classList.contains("tab-x")) closeSession(id);
    else setActive(id);
  });
  tab.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const s = sessions.get(id);
    if (s) openTabColorMenu(s, e.clientX, e.clientY);
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
    // Synthesized semibold smears at small sizes; render bold at normal
    // weight and let bright colors carry the emphasis.
    fontWeightBold: "400",
    drawBoldTextInBrightColors: true,
    minimumContrastRatio: 1,
    cursorBlink: true,
    cursorStyle: "bar",
    // Memory: 2k lines is plenty for supervision; agents redraw their TUI.
    scrollback: 2000,
    theme: themeDef.term,
    // Off by default in xterm.js; without it, a screen reader has no way
    // to read terminal output at all.
    screenReaderMode: true,
    // Without this, xterm's own built-in OSC 8 hyperlink handler (separate
    // from WebLinksAddon below, which only matches plain-text URLs) falls
    // back to window.open()/location.href on click — see openLinkUri.
    linkHandler: {
      activate: (_event, uri) => openLinkUri(uri),
    },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon((_event, uri) => openLinkUri(uri)));
  term.registerLinkProvider(fileLinkProvider(term, cwd));
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
  // Fit before the font face settles can undercount columns and wrap
  // output early.
  await document.fonts.ready;
  safeFit(term, fit, pane);

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
  // Clipboard goes through Rust (plugin): WebView2's navigator.clipboard
  // permission model can silently block reads/writes in always-on-top windows.
  term.onSelectionChange(() => {
    const sel = term.getSelection();
    if (sel) clipWrite(sel).catch(() => {});
  });
  // Paste text, or — if the clipboard holds an image — save it to a temp
  // PNG and hand its path to the agent.
  const pasteFromClipboard = async () => {
    try {
      const txt = await clipRead();
      if (txt) {
        // Trailing-only trim: copying a one-line code/token from a browser
        // often drags along a trailing newline, which pastes as an early
        // Enter mid-paste — corrupting exactly a login code, not just
        // submitting early. Leading whitespace is left alone since it can
        // be meaningful (pasted, indented code).
        term.paste(txt.replace(/\s+$/, ""));
        return;
      }
    } catch {
      /* clipboard is not text */
    }
    try {
      const path = await invoke<string>("clipboard_image_to_temp");
      if (path) {
        // No text on the clipboard, only image data (e.g. a screenshot
        // tool was used instead of copying text) — falling back to
        // pasting its temp path silently looks like AFKode just broke
        // when someone actually wanted to paste a URL/token.
        showLinkToast(t("pastedImageInstead"));
        invoke("write_pty", { id, data: `"${path}"` }).catch(() => {});
      }
    } catch {
      /* nothing usable in the clipboard */
    }
  };

  term.attachCustomKeyEventHandler((ev) => {
    if (ev.type !== "keydown") return true;
    if (ev.ctrlKey && !ev.shiftKey && ev.code === "KeyF") {
      ev.preventDefault();
      openSearch();
      return false;
    }
    // xterm.js sends plain CR for Enter regardless of Shift — it has no
    // built-in way to distinguish "insert a newline" from "submit". Send
    // the same ESC+CR sequence xterm already emits for Alt+Enter, which is
    // the convention readline/Ink-based CLIs (including Claude Code) treat
    // as a literal newline instead of submitting.
    if (ev.shiftKey && (ev.code === "Enter" || ev.code === "NumpadEnter")) {
      ev.preventDefault();
      invoke("write_pty", { id, data: "\x1b\r" }).catch(() => {});
      return false;
    }
    // Plain Ctrl+V would send ^V to the TUI instead of pasting — intercept.
    // Without preventDefault, the browser's own paste also fires on xterm's
    // hidden textarea, so the clipboard text lands twice.
    if (ev.ctrlKey && ev.code === "KeyV") {
      ev.preventDefault();
      pasteFromClipboard();
      return false;
    }
    if (ev.ctrlKey && ev.shiftKey && ev.code === "KeyC") {
      ev.preventDefault();
      const sel = term.getSelection();
      if (sel) clipWrite(sel).catch(() => {});
      return false;
    }
    // Without this, xterm sends the literal ^K (0x0B) byte to the shell —
    // in readline/PSReadLine that's "kill to end of line," silently
    // deleting whatever was typed, in addition to opening search.
    if (ev.ctrlKey && !ev.shiftKey && ev.code === "KeyK") {
      ev.preventDefault();
      openGlobalSearch();
      return false;
    }
    return true;
  });
  // A selection left over from an earlier drag (auto-copied on change, but
  // never cleared) would make a *later*, unrelated right-click copy again
  // instead of paste — clearing on every new left click/drag start means a
  // stale selection can never survive past the next normal interaction.
  // detail === 1 excludes the 2nd/3rd click of a double/triple-click:
  // xterm's own mousedown handler (registered earlier, in term.open())
  // runs first and does word/line select on those — clearing unconditionally
  // here would wipe out the selection it just made.
  pane.addEventListener("mousedown", (ev) => {
    if (ev.button === 0 && ev.detail === 1) term.clearSelection();
  });
  pane.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    const sel = term.getSelection();
    if (sel) {
      clipWrite(sel).catch(() => {});
      term.clearSelection();
    } else {
      pasteFromClipboard();
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
  wireTabRename(tabTitleEl, session);
  forceEmptyState = false;
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
    // Tab closed while the spawn was in flight: closeSession's kill_pty
    // predated the PTY registration and was a no-op — kill it now.
    if (!sessions.has(id)) {
      invoke("kill_pty", { id }).catch(() => {});
    }
  } catch (e) {
    dismissLoader(session);
    term.writeln(`\x1b[31m${t("spawnError")}: ${e}\x1b[0m`);
    session.alive = false;
    tab.classList.add("dead");
  }
  return id;
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

// ── Footer: git branch + diff stat ─────────────────────────

interface GitStatus {
  branch: string;
  added: number;
  removed: number;
  dirty: boolean;
}

const gitChipWrap = $("#git-chip-wrap");
const gitBranchName = $("#git-branch-name");
const gitAddedChip = $("#git-added-chip");
const gitRemovedChip = $("#git-removed-chip");
const gitDirtyChip = $("#git-dirty-chip");

// Guards against out-of-order responses: a slow git_status for the previous
// tab's repo must not overwrite the chips after a quick tab switch.
let gitStatusSeq = 0;

async function updateGitStatus() {
  const seq = ++gitStatusSeq;
  const s = activeId ? sessions.get(activeId) : null;
  if (!s?.cwd) {
    gitChipWrap.classList.add("hidden");
    return;
  }
  try {
    const g = await invoke<GitStatus | null>("git_status", { cwd: s.cwd });
    if (seq !== gitStatusSeq) return;
    if (!g) {
      gitChipWrap.classList.add("hidden");
      return;
    }
    gitChipWrap.classList.remove("hidden");
    gitBranchName.textContent = g.branch;
    gitAddedChip.classList.toggle("hidden", g.added === 0);
    gitAddedChip.textContent = `+${g.added}`;
    gitRemovedChip.classList.toggle("hidden", g.removed === 0);
    gitRemovedChip.textContent = `-${g.removed}`;
    gitDirtyChip.classList.toggle("hidden", !g.dirty);
  } catch {
    gitChipWrap.classList.add("hidden");
  }
}
updateGitStatus();
setInterval(() => {
  if (overlayVisible) updateGitStatus();
}, 5000);

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b(\[[0-9;?]*[a-zA-Z]|\][^\x07]*(\x07|\x1b\\)|[()][0-9A-B])/g;
const stripAnsi = (s: string) => s.replace(ANSI_RE, "");

// "permission" and bare "tell claude what to do" used to be in here, but
// both are always on screen in Claude Code's normal idle UI — the footer
// permanently shows "bypass permissions on", and the empty-prompt
// placeholder literally reads "Try 'tell Claude what to do'" — so this
// matched constantly regardless of actual state whenever hooks aren't
// flowing and this text fallback is what's driving the waiting/done
// heuristic. "differently" narrows the phrase to the real decline option
// on the permission prompt ("No, and tell Claude what to do differently"),
// and dropping bare "allow"/"permission" removes two words that show up in
// completely ordinary conversation about permissions/security.
const WAITING_RE =
  /(\(y\/n\)|do you want|don't ask again|tell claude what to do differently|press enter|continuar|\x07)/i;
const SILENCE_WAITING_MS = 12_000;
const SILENCE_DONE_MS = 45_000;

// One shared context, lazily created: Chromium caps concurrent
// AudioContexts per page, so allocating a fresh one per beep (and never
// closing it) makes the sound silently die after a handful of plays.
let beepCtx: AudioContext | null = null;

function beep() {
  try {
    beepCtx ??= new AudioContext();
    const ctx = beepCtx;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
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
  const list = [...sessions.values()].filter(
    (s) => s.cmd.startsWith("claude") && s.alive,
  );
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
    // Claude Code does send this natively on Notification events — confirmed
    // by capturing a live payload (v2.1.205), which contradicted the original
    // assumption here. `afkode_notif_type` (recovered from the registration
    // matcher via URL query string — see write_hooks_settings) is kept as a
    // fallback in case a future/older version ever omits the native field.
    notification_type?: "permission_prompt" | "idle_prompt";
    afkode_notif_type?: "permission_prompt" | "idle_prompt";
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
    case "Notification": {
      // Two distinct registrations (see write_hooks_settings) — a real
      // permission prompt vs. a generic "still idle" nudge after ~60s of
      // silence with nothing actually blocking. Only the former is truly
      // waiting on you. (A `--dangerously-skip-permissions` session never
      // sends a permission_prompt Notification at all — confirmed live —
      // so there's no bypass case to special-case here.)
      const kind = p.notification_type ?? p.afkode_notif_type;
      if (kind === "permission_prompt") {
        startWait(s, p.message ?? "");
        notify(s, "notifWaiting");
      } else {
        endWait(s);
        s.hook.idle = true;
        notify(s, "notifDone");
      }
      break;
    }
    case "PreToolUse":
      // A tool actually starting means whatever gate was in front of it is
      // cleared. Defensive: also clears `waiting` if it was somehow left set
      // (e.g. a stale hook.claudeId match) so the state can't get stuck.
      endWait(s);
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
  if (e.payload.id === wizActiveSessionId) {
    wizLogEl.textContent = stripAnsi(s.tail);
    wizLogEl.scrollTop = wizLogEl.scrollHeight;
  }
});

listen<{ id: string; exit_code?: number }>("pty-exit", (e) => {
  const s = sessions.get(e.payload.id);
  if (!s) return;
  dismissLoader(s);
  s.alive = false;
  s.tab.classList.add("dead");
  s.term.writeln(`\r\n\x1b[90m${t("sessionEnded")}\x1b[0m`);
  updateStatus();
  if (s.cmd) {
    // Watching the tab end counts as having seen it — don't queue a
    // phantom "session ended" inbox row for the next overlay open.
    s.exitSeen = s.id === activeId && overlayVisible && document.hasFocus();
    notify(s, "notifExit");
  }
  refreshCliButtons();
  if (e.payload.id === wizActiveSessionId) {
    wizActiveSessionId = null;
    // winget/npm exit codes are noisy (e.g. winget can exit non-zero for
    // "already up to date, nothing to do") — check whether the tool is
    // actually there now instead of trusting the raw exit code.
    const tool = wizBusy === 1 ? "node" : "claude";
    // Reset busy only for the wizard's own session: an unrelated tab
    // exiting mid-install must not re-enable the Install button (a second
    // click would spawn a concurrent duplicate install). Refresh even when
    // the modal is hidden so reopening it never shows a stale busy step.
    wizBusy = 0;
    invoke<boolean[]>("detect_clis", { names: [tool] })
      .then(([found]) => {
        wizLogStatus.textContent = found ? t("wizInstallOk") : t("wizInstallFailed");
        wizLogStatus.className = `wiz-log-status ${found ? "ok" : "fail"}`;
      })
      .catch(() => {
        wizLogStatus.textContent = t("wizInstallFailed");
        wizLogStatus.className = "wiz-log-status fail";
      });
    wizardRefresh();
  }
});

// winget in particular has known hangs inside non-standard PTYs (it can
// sit forever after its last printed line instead of exiting) — bound how
// long the wizard waits instead of leaving "Instalando…" stuck forever.
// The bound is deliberately generous: npm/winget have perfectly normal
// silent phases (dependency resolution, extraction) well over 5 s, and
// killing a live install mid-flight is far worse than waiting a minute
// to declare a hang.
const WIZ_SILENCE_KILL_MS = 60_000;
setInterval(() => {
  if (!wizActiveSessionId) return;
  const s = sessions.get(wizActiveSessionId);
  if (!s?.alive) return;
  if (Date.now() - s.lastData > WIZ_SILENCE_KILL_MS) {
    invoke("kill_pty", { id: wizActiveSessionId }).catch(() => {});
    wizLogStatus.textContent = t("wizInstallTimeout");
    wizLogStatus.className = "wiz-log-status fail";
    wizActiveSessionId = null;
  }
}, 1000);

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
  // The banner is shared with the update flow — don't leave its button up.
  $("#away-action").classList.add("hidden");
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

// Update flow: the backend only *checks* on startup; downloading and
// installing (which terminates the process on Windows to run the installer)
// happens exclusively behind this button.
const awayAction = $<HTMLButtonElement>("#away-action");

listen<string>("update-available", (e) => {
  $("#away-text").textContent = t("updateAvailable").replace("{v}", e.payload);
  awayAction.textContent = t("updateInstallBtn");
  awayAction.classList.remove("hidden");
  $("#away-banner").classList.remove("hidden");
});

awayAction.addEventListener("click", async () => {
  awayAction.disabled = true;
  $("#away-text").textContent = t("updateInstalling");
  try {
    await invoke("install_update");
    // Windows never reaches this line (the installer restarts us).
    awayAction.classList.add("hidden");
  } catch (err) {
    $("#away-text").textContent = `${t("updateFailed")}: ${String(err).slice(0, 120)}`;
    awayAction.textContent = t("updateInstallBtn");
  } finally {
    awayAction.disabled = false;
  }
});

listen<string>("update-installed", (e) => {
  awayAction.classList.add("hidden");
  $("#away-text").textContent = t("updateReady").replace("{v}", e.payload);
  $("#away-banner").classList.remove("hidden");
});

function onOverlayShown() {
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
    safeFit(s.term, s.fit, s.pane);
    s.term.focus();
  }
}
listen("overlay-shown", onOverlayShown);

function onOverlayHidden() {
  overlayVisible = false;
  awayStart = Date.now();
  awayBase = totals();
}
listen("overlay-hidden", onOverlayHidden);

// The "−" button minimizes via the OS (no Rust event fires), and restoring
// from the taskbar likewise bypasses show_overlay — without these the HUD
// pill and the away summary silently never engage around a minimize.
window.addEventListener("focus", () => {
  if (!overlayVisible) onOverlayShown();
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
    if (s) safeFit(s.term, s.fit, s.pane);
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
    safeFit(s.term, s.fit, s.pane);
  }
}

function updateStatusHint() {
  const altX = settings.overlayMode ? t("hintAltXOverlay") : t("hintAltXWindow");
  // Click-through only makes sense floating over a game — drop it entirely
  // in window mode instead of hinting at a feature that's hidden anyway.
  const ghost = settings.overlayMode
    ? `<kbd>Alt</kbd>+<kbd>G</kbd> ${t("hintGhost")}&ensp;·&ensp;`
    : "";
  $("#status-hint").innerHTML =
    `<kbd>Alt</kbd>+<kbd>X</kbd> ${altX}&ensp;·&ensp;${ghost}` +
    `<kbd>Alt</kbd>+<kbd>P</kbd> ${t("hintPrompt")}&ensp;·&ensp;<kbd>Alt</kbd>+<kbd>A</kbd> ${t("hintApprove")}`;
}

function applyI18n() {
  document.documentElement.lang = settings.lang;
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n!);
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    const label = t(el.dataset.i18nTitle!);
    el.title = label;
    // Most of these are icon-only buttons (no visible text) — title alone
    // isn't reliably exposed to screen readers, aria-label is. Kept in
    // sync here too so a language switch updates both together.
    el.setAttribute("aria-label", label);
  });
  updateStatusHint();
  ghostBadge.textContent = t("ghostBadge");
  $("#help-title").textContent = t("helpTitle");
  $("#help-list").innerHTML = [1, 2, 3, 4, 5, 6]
    .map((i) => `<li>${t(`help${i}`)}</li>`)
    .join("");
  $("#empty-title").textContent = t("emptyTitle");
  $<HTMLInputElement>("#claude-args").placeholder = t("argsPlaceholder");
  $<HTMLInputElement>("#global-search-input").placeholder = t("globalSearchPlaceholder");
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

const selFont = $<HTMLSelectElement>("#sel-font");
const selSize = $<HTMLSelectElement>("#sel-size");
const selLang = $<HTMLSelectElement>("#sel-lang");

// Small conic-gradient swatch (panel bg · accent · a green · a blue) so each
// theme is recognizable at a glance instead of just a name in a plain list.
function themeSwatchStyle(k: string): string {
  const v = THEMES[k];
  const c = [`rgb(${v.panelRgb})`, v.accent, v.term.green ?? v.accent, v.term.blue ?? v.text];
  return `background: conic-gradient(${c[0]} 0% 25%, ${c[1]} 25% 50%, ${c[2]} 50% 75%, ${c[3]} 75% 100%);`;
}

const themePicker = $<HTMLElement>("#theme-picker");
const themePickerBtn = $<HTMLButtonElement>("#theme-picker-btn");
const themeSwatchCurrent = $<HTMLElement>("#theme-swatch-current");
const themePickerLabel = $<HTMLElement>("#theme-picker-label");
const themeMenu = $<HTMLElement>("#theme-menu");

function renderThemeMenu() {
  themeMenu.innerHTML = Object.entries(THEMES)
    .map(
      ([k, v]) =>
        `<button class="theme-menu-item${k === settings.theme ? " active" : ""}" data-key="${k}">
          <span class="theme-swatch" style="${themeSwatchStyle(k)}"></span>
          <span>${v.label}</span>
        </button>`,
    )
    .join("");
}

function setThemePickerLabel() {
  themeSwatchCurrent.setAttribute("style", themeSwatchStyle(settings.theme));
  themePickerLabel.textContent = THEMES[settings.theme].label;
}

renderThemeMenu();
setThemePickerLabel();

themePickerBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  themeMenu.classList.toggle("hidden");
});
themeMenu.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".theme-menu-item");
  if (!btn?.dataset.key) return;
  settings.theme = btn.dataset.key;
  saveSettings();
  applyTheme();
  setThemePickerLabel();
  renderThemeMenu();
  themeMenu.classList.add("hidden");
});
document.addEventListener("click", (e) => {
  if (!themePicker.contains(e.target as Node)) themeMenu.classList.add("hidden");
});

selFont.innerHTML = availableFonts
  .map((f) => `<option value="${f}">${f}</option>`)
  .join("");
selSize.innerHTML = FONT_SIZES.map((n) => `<option value="${n}">${n}px</option>`).join("");

selFont.value = availableFonts.includes(settings.font)
  ? settings.font
  : availableFonts[0];
selSize.value = String(settings.size);
selLang.value = settings.lang;

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

const chkOverlayMode = $<HTMLInputElement>("#chk-overlaymode");
chkOverlayMode.checked = settings.overlayMode;
invoke("set_window_mode", { overlay: settings.overlayMode }).catch(() => {});

function setOverlayMode(overlay: boolean) {
  settings.overlayMode = overlay;
  saveSettings();
  chkOverlayMode.checked = overlay;
  invoke("set_window_mode", { overlay }).catch(() => {});
  applyWindowModeUI(overlay);
}
chkOverlayMode.addEventListener("change", () => setOverlayMode(chkOverlayMode.checked));

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

// ── Claude launch flags (--resume, --dangerously-skip-permissions, …) ──

const argsInput = $<HTMLInputElement>("#claude-args");
argsInput.value = localStorage.getItem("claude-args") ?? "";

function syncArgChips() {
  document.querySelectorAll<HTMLButtonElement>(".chip[data-flag]").forEach((c) => {
    c.classList.toggle("on", argsInput.value.includes(c.dataset.flag!));
  });
}
syncArgChips();

argsInput.addEventListener("input", () => {
  localStorage.setItem("claude-args", argsInput.value);
  syncArgChips();
});

document.querySelectorAll<HTMLButtonElement>(".chip[data-flag]").forEach((c) =>
  c.addEventListener("click", () => {
    const flag = c.dataset.flag!;
    argsInput.value = argsInput.value.includes(flag)
      ? argsInput.value.replace(flag, "").replace(/\s+/g, " ").trim()
      : `${argsInput.value} ${flag}`.trim();
    localStorage.setItem("claude-args", argsInput.value);
    syncArgChips();
  }),
);

function claudeCmd(): string {
  const extra = (localStorage.getItem("claude-args") ?? "").trim();
  return extra ? `claude ${extra}` : "claude";
}

function launchCli(cmd: string, name: string, cwd: string | null) {
  if (cmd === "claude") cmd = claudeCmd();
  if (cmd.startsWith("claude") && cliAvailable["claude"] === false) {
    // Missing Claude: the guided wizard handles Node + install + login.
    openWizard();
    return;
  }
  if (cmd && cliAvailable[cmd] === false) {
    // Missing CLI: open a tab that installs it; buttons refresh on exit.
    newSession(CLI_INSTALL[cmd], `${t("installing")} ${name}…`, null);
    return;
  }
  newSession(cmd, name, cwd);
}

// ── First-run setup wizard ────────────────────────────────

// --source winget: on machines with multiple configured sources (msstore
// also ships a matching "Node.js (LTS)" package), winget refuses to guess
// and just prints the ambiguity instead of installing.
const NODE_INSTALL_CMD =
  "winget install -e --id OpenJS.NodeJS.LTS --source winget --accept-source-agreements --accept-package-agreements";

const wizardModal = $("#wizard-modal");
let wizBusy = 0; // step currently installing (0 = none)
const wizLogWrap = $("#wiz-log-wrap");
const wizLogEl = $("#wiz-log");
const wizLogStatus = $("#wiz-log-status");
let wizActiveSessionId: string | null = null;

function openWizard() {
  // No live install session ⇒ nothing can legitimately be busy; clears a
  // stale flag if the modal was closed mid-install in an earlier state.
  if (!wizActiveSessionId) wizBusy = 0;
  wizardModal.classList.remove("hidden");
  wizardRefresh();
}

async function wizardRefresh() {
  let nodeOk = false;
  let claudeOk = false;
  try {
    const found = await invoke<boolean[]>("detect_clis", { names: ["node", "claude"] });
    nodeOk = found[0];
    claudeOk = found[1];
    cliAvailable["claude"] = claudeOk;
  } catch {
    return;
  }
  const states: [boolean, boolean, boolean] = [nodeOk, claudeOk, claudeOk];
  for (let i = 1; i <= 3; i++) {
    const ico = $(`#wiz-ico-${i}`);
    const btn = $<HTMLButtonElement>(`#wiz-btn-${i}`);
    const done = i < 3 ? states[i - 1] : false;
    const busy = wizBusy === i;
    ico.textContent = done ? "✓" : busy ? "●" : "○";
    ico.className = `wiz-ico${done ? " ok" : busy ? " busy" : ""}`;
    const enabled =
      !busy &&
      ((i === 1 && !nodeOk) ||
        (i === 2 && nodeOk && !claudeOk) ||
        (i === 3 && claudeOk));
    btn.disabled = !enabled;
    if (i === 3 && claudeOk) ico.textContent = "→";
  }
}

function wizardRunStep(step: number, cmd: string, title: string) {
  wizBusy = step;
  wizardRefresh();
  wizLogWrap.classList.remove("hidden");
  wizLogEl.textContent = "";
  wizLogStatus.textContent = t("wizInstallRunning");
  wizLogStatus.className = "wiz-log-status running";
  // newSession is async and doesn't assign the session id until it awaits
  // spawn_pty — a fast command (e.g. "already installed, nothing to do")
  // can fire its pty-exit event before that promise resolves, so the exit
  // handler below would race a wizActiveSessionId that's still null and
  // miss it entirely. newSession assigns ids as `s${++counter}`, so the id
  // it's about to use can be predicted synchronously, before anything else
  // can happen.
  wizActiveSessionId = `s${counter + 1}`;
  newSession(cmd, `${t("wizInstalling")} ${title}…`, null);
}

$("#wiz-btn-1").addEventListener("click", () =>
  wizardRunStep(1, NODE_INSTALL_CMD, "Node.js"),
);
$("#wiz-btn-2").addEventListener("click", () =>
  wizardRunStep(2, CLI_INSTALL.claude, "Claude Code"),
);
$("#wiz-btn-3").addEventListener("click", () => {
  wizardModal.classList.add("hidden");
  localStorage.setItem("wizard-done", "1");
  newSession("claude", "Claude Code", pickedFolder);
});
$("#wiz-close").addEventListener("click", () => {
  wizardModal.classList.add("hidden");
  localStorage.setItem("wizard-done", "1");
});

// ── Toolbar ───────────────────────────────────────────────

// "+" shows the same folder-picker + launchers as the first-run empty
// state instead of a plain dropdown, even with tabs already open.
$("#btn-new-tab").addEventListener("click", (e) => {
  e.stopPropagation();
  forceEmptyState = true;
  updateEmptyState();
});
$("#empty-state-close").addEventListener("click", () => {
  forceEmptyState = false;
  updateEmptyState();
});

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

// ── Tab rename + custom color ──────────────────────────────

function wireTabRename(titleEl: HTMLElement, session: Session) {
  titleEl.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    const input = document.createElement("input");
    input.className = "tab-title-edit";
    input.value = session.title;
    titleEl.replaceWith(input);
    input.focus();
    input.select();
    const commit = (save: boolean) => {
      const next = document.createElement("span");
      next.className = "tab-title";
      if (save) session.title = input.value.trim() || session.title;
      next.textContent = session.title;
      input.replaceWith(next);
      wireTabRename(next, session);
      updateStatus();
    };
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") commit(true);
      else if (ev.key === "Escape") commit(false);
    });
    input.addEventListener("blur", () => commit(true));
  });
}

const TAB_COLORS = [
  "#d97757", "#e06c75", "#e5c07b", "#98c379",
  "#61afef", "#c678dd", "#56b6c2", "#abb2bf",
];
const tabColorMenu = $("#tab-color-menu");
tabColorMenu.innerHTML =
  TAB_COLORS.map((c) => `<button class="tab-swatch" data-color="${c}" style="background:${c}"></button>`).join("") +
  `<button class="tab-swatch reset" data-color="" title="×">×</button>`;
let colorMenuTarget: Session | null = null;

function applyTabColor(session: Session) {
  session.tab.style.borderLeftColor = session.color ?? "transparent";
}

function openTabColorMenu(session: Session, x: number, y: number) {
  colorMenuTarget = session;
  tabColorMenu.style.left = `${x}px`;
  tabColorMenu.style.top = `${y}px`;
  tabColorMenu.classList.remove("hidden");
}

tabColorMenu.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".tab-swatch");
  if (!btn || !colorMenuTarget) return;
  colorMenuTarget.color = btn.dataset.color || undefined;
  applyTabColor(colorMenuTarget);
  tabColorMenu.classList.add("hidden");
});
document.addEventListener("click", (e) => {
  if (!tabColorMenu.contains(e.target as Node)) tabColorMenu.classList.add("hidden");
});

$("#btn-ghost").addEventListener("click", () =>
  invoke("set_ghost_mode", { enabled: !overlayEl.classList.contains("ghost") }),
);
// In overlay mode there's no taskbar icon, so × / minimize just hide the
// window (reachable again via the tray or Alt+X). In window mode there IS
// a taskbar icon, so minimize should actually minimize like any other app.
// A real OS minimize, not hide_overlay — hide_overlay clears WS_VISIBLE,
// which drops the taskbar entry entirely (unlike a true minimize, which
// keeps it, just iconified). The "−" icon promises a minimize; it should
// behave like one in both modes, and the taskbar icon should never vanish.
$("#btn-hide").addEventListener("click", () => {
  getCurrentWindow().minimize().catch(() => {});
  onOverlayHidden();
});
// × always hides to the tray (Discord-style), in both modes — it's the one
// guaranteed way back via Alt+X/tray if minimize ever gets the window into
// a stuck state. Quitting is in the tray menu either way.
$("#btn-close").addEventListener("click", () => invoke("hide_overlay"));

const btnMaximize = $("#btn-maximize");
btnMaximize.addEventListener("click", () => {
  getCurrentWindow().toggleMaximize().catch(() => {});
});

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

// Transparency only makes sense floating over a game; a normal window
// should just be a normal, opaque window. Maximize stays available in both
// modes — no reason to withhold it just because it's overlaying a game.
const modeBadge = $("#mode-badge");

function applyWindowModeUI(overlay: boolean) {
  opacitySlider.disabled = !overlay;
  if (overlay) {
    const alpha = localStorage.getItem("panel-alpha") ?? "96";
    opacitySlider.value = alpha;
    document.documentElement.style.setProperty("--panel-alpha", String(Number(alpha) / 100));
  } else {
    document.documentElement.style.setProperty("--panel-alpha", "1");
  }
  // Click-through only means something floating over a game — pointless
  // (and confusing to escape) as a normal taskbar window.
  ghostBtn.classList.toggle("hidden", !overlay);
  if (!overlay && overlayEl.classList.contains("ghost")) {
    invoke("set_ghost_mode", { enabled: false }).catch(() => {});
  }
  modeBadge.textContent = overlay ? t("modeOverlay") : t("modeWindow");
  modeBadge.classList.toggle("mode-active", overlay);
  updateStatusHint();
}
modeBadge.addEventListener("click", () => setOverlayMode(!settings.overlayMode));
applyWindowModeUI(settings.overlayMode);

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

// ── Global search (Ctrl+K): jump between open sessions ─────

function escapeHtml(s: string): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return s.replace(/[&<>"']/g, (c) => map[c]);
}

const globalSearchModal = $("#global-search-modal");
const globalSearchInput = $<HTMLInputElement>("#global-search-input");
const globalSearchResults = $("#global-search-results");
let searchSelIndex = 0;

function globalSearchItems() {
  return [...globalSearchResults.querySelectorAll<HTMLButtonElement>(".global-search-item")];
}

function renderGlobalSearchResults(query: string) {
  const q = query.trim().toLowerCase();
  const list = [...sessions.values()].filter(
    (s) => !q || s.title.toLowerCase().includes(q) || (s.cwd ?? "").toLowerCase().includes(q),
  );
  searchSelIndex = 0;
  if (!list.length) {
    globalSearchResults.innerHTML = `<div class="global-search-empty">${t("globalSearchEmpty")}</div>`;
    return;
  }
  globalSearchResults.innerHTML = list
    .map(
      (s, i) => `<button class="global-search-item${i === 0 ? " sel" : ""}" data-id="${s.id}">
        <span class="tab-dot${s.alive ? "" : " dead"}"></span>
        <span class="gsi-title">${escapeHtml(s.title)}</span>
        <span class="gsi-cwd">${escapeHtml(s.cwd ?? "")}</span>
      </button>`,
    )
    .join("");
}

function openGlobalSearch() {
  globalSearchModal.classList.remove("hidden");
  globalSearchInput.value = "";
  renderGlobalSearchResults("");
  globalSearchInput.focus();
}
function closeGlobalSearch() {
  globalSearchModal.classList.add("hidden");
}
function selectGlobalSearchItem(id: string) {
  setActive(id);
  closeGlobalSearch();
}

globalSearchInput.addEventListener("input", () => renderGlobalSearchResults(globalSearchInput.value));
globalSearchResults.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".global-search-item");
  if (btn?.dataset.id) selectGlobalSearchItem(btn.dataset.id);
});
globalSearchInput.addEventListener("keydown", (e) => {
  const items = globalSearchItems();
  if (e.key === "Escape") {
    closeGlobalSearch();
  } else if (e.key === "Enter") {
    const id = items[searchSelIndex]?.dataset.id;
    if (id) selectGlobalSearchItem(id);
  } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!items.length) return;
    items[searchSelIndex]?.classList.remove("sel");
    searchSelIndex = (searchSelIndex + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[searchSelIndex]?.classList.add("sel");
    items[searchSelIndex]?.scrollIntoView({ block: "nearest" });
  }
});
$("#btn-global-search").addEventListener("click", (e) => {
  e.stopPropagation();
  openGlobalSearch();
});
globalSearchModal.addEventListener("click", (e) => {
  if (e.target === globalSearchModal) closeGlobalSearch();
});
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && !e.shiftKey && e.code === "KeyK") {
    e.preventDefault();
    openGlobalSearch();
  }
});

// ── Link toast + file preview ──────────────────────────────
//
// WebLinksAddon's default click handling gives no feedback in an always-
// on-top overlay: a browser opening behind the window is invisible. Two
// separate link providers cover the two cases users actually click on:
// http(s) URLs (hand off to the OS browser + toast) and local file-looking
// paths (read in-app and show a preview instead of doing nothing).

const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg"];
const FILE_LINK_RE = new RegExp(
  String.raw`(?<!\/\/)(?:[A-Za-z]:[\\/]|\.{1,2}[\\/]|~[\\/])?[\w.-]+(?:[\\/][\w.-]+)*\.(?:mdx?|txt|log|json|ya?ml|csv|toml|env|cfg|ini|sh|ps1|diff|patch|tsx?|jsx?|mjs|cjs|py|rs|go|rb|php|c|cc|cpp|h|hpp|java|kt|swift|cs|sql|xml|html?|css|scss|less|vue|svelte|graphql|lua|dockerfile|${IMAGE_EXTS.join("|")})\b`,
  "i",
);

// WebLinksAddon rejects any match that doesn't round-trip through `new
// URL()`, which throws for a plain file path — it's built strictly for
// http(s) links even when given a custom regex. A hand-rolled link
// provider skips that filter.
function fileLinkProvider(term: Terminal, cwd: string | null) {
  return {
    provideLinks(y: number, cb: (links: import("@xterm/xterm").ILink[] | undefined) => void) {
      const line = term.buffer.active.getLine(y - 1);
      const text = line?.translateToString(true) ?? "";
      const re = new RegExp(FILE_LINK_RE.source, "gi");
      const links: import("@xterm/xterm").ILink[] = [];
      // translateToString emits ONE string char per wide (emoji/CJK) char
      // while it occupies TWO buffer cells — so on lines with wide chars
      // before the path (agent TUIs love emoji bullets) a raw string index
      // lands one cell short per wide char. Map index → column explicitly.
      const colOf: number[] = [];
      if (line) {
        let strIdx = 0;
        for (let i = 0; i < line.length; i++) {
          const cell = line.getCell(i);
          if (!cell || cell.getWidth() === 0) continue; // wide-char spacer cell
          const chars = cell.getChars() || " ";
          for (let k = 0; k < chars.length; k++) colOf[strIdx++] = i;
        }
        colOf[strIdx] = line.length; // one-past-end sentinel
      }
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        const full = m[0];
        const start = m.index;
        // Not a file link if it's the tail of a URL in the same token
        // (https://foo.com/guide.md would otherwise match from "oo.com/…").
        const tokenStart = text.lastIndexOf(" ", start) + 1;
        if (text.slice(tokenStart, start).includes("://")) continue;
        const startCol = colOf[start] ?? start;
        const endCol = colOf[start + full.length] ?? start + full.length;
        links.push({
          range: { start: { x: startCol + 1, y }, end: { x: endCol + 1, y } },
          text: full,
          activate: () => openFilePreview(full, cwd),
        });
      }
      cb(links.length ? links : undefined);
    },
  };
}

let linkToastTimer = 0;
function showLinkToast(text: string) {
  const el = $("#link-toast");
  el.textContent = text;
  el.classList.remove("hidden");
  clearTimeout(linkToastTimer);
  linkToastTimer = window.setTimeout(() => el.classList.add("hidden"), 3000);
}

const filePreviewModal = $("#file-preview-modal");
const filePreviewTitle = $("#file-preview-title");
const filePreviewBody = $("#file-preview-body");
$("#file-preview-close").addEventListener("click", () =>
  filePreviewModal.classList.remove("open"),
);

// The click that opens the panel (a link inside the terminal) is still
// bubbling up to document when it opens, so a plain outside-click listener
// would immediately close what it just opened. Skip exactly that one click.
let ignoreNextOutsideClick = false;
document.addEventListener("click", (e) => {
  if (ignoreNextOutsideClick) return;
  if (
    filePreviewModal.classList.contains("open") &&
    !filePreviewModal.contains(e.target as Node)
  ) {
    filePreviewModal.classList.remove("open");
  }
});

const MARKDOWN_EXT_RE = /\.(?:md|markdown)$/i;

const LANG_BY_EXT: Record<string, string> = {
  ts: "typescript", tsx: "typescript",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  py: "python", rs: "rust", go: "go", rb: "ruby", php: "php",
  c: "c", h: "c", cc: "cpp", cpp: "cpp", hpp: "cpp",
  java: "java", kt: "kotlin", swift: "swift", cs: "csharp",
  sql: "sql", xml: "xml", html: "xml", htm: "xml",
  css: "css", scss: "scss", less: "less",
  graphql: "graphql", lua: "lua", dockerfile: "dockerfile",
  sh: "bash", ps1: "powershell",
  json: "json", yaml: "yaml", yml: "yaml",
  toml: "ini", ini: "ini", cfg: "ini", env: "ini",
  diff: "diff", patch: "diff",
};

function langForPath(path: string): string | null {
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1].toLowerCase();
  return ext ? LANG_BY_EXT[ext] ?? null : null;
}

async function openFilePreview(raw: string, cwd: string | null) {
  const isAbsolute =
    /^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith("\\\\") || raw.startsWith("~");
  const path = isAbsolute
    ? raw
    : `${cwd ?? "."}\\${raw}`.replace(/\//g, "\\");
  filePreviewTitle.textContent = raw;
  filePreviewBody.className = "file-preview-body plain";
  filePreviewBody.textContent = "…";
  filePreviewModal.classList.add("open");
  ignoreNextOutsideClick = true;
  setTimeout(() => (ignoreNextOutsideClick = false), 0);
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1].toLowerCase();
  if (ext && IMAGE_EXTS.includes(ext)) {
    try {
      const dataUrl = await invoke<string>("read_image_data_url", { path });
      filePreviewBody.className = "file-preview-body img";
      filePreviewBody.replaceChildren();
      const img = document.createElement("img");
      img.src = dataUrl;
      img.alt = raw;
      filePreviewBody.appendChild(img);
    } catch (err) {
      filePreviewBody.textContent = `${t("filePreviewError")}: ${path}\n${err}`;
    }
    return;
  }
  try {
    const text = await invoke<string>("read_text_file", { path });
    if (MARKDOWN_EXT_RE.test(path)) {
      filePreviewBody.className = "file-preview-body md";
      filePreviewBody.innerHTML = DOMPurify.sanitize(await marked.parse(text));
    } else {
      const lang = langForPath(path);
      if (lang && hljs.getLanguage(lang)) {
        filePreviewBody.className = "file-preview-body code";
        const html = hljs.highlight(text, { language: lang }).value;
        filePreviewBody.innerHTML = `<pre><code class="hljs">${DOMPurify.sanitize(html)}</code></pre>`;
      } else {
        filePreviewBody.className = "file-preview-body plain";
        filePreviewBody.textContent = text;
      }
    }
  } catch (err) {
    filePreviewBody.className = "file-preview-body plain";
    // A bare name with no path separators (e.g. from a bullet list) was
    // guessed relative to the session folder — say so instead of just
    // surfacing a raw "file not found", since the real folder is unknown.
    const bareName = !isAbsolute && !/[\\/]/.test(raw);
    filePreviewBody.textContent = bareName
      ? `${t("filePreviewNotFoundBare")}\n\n"${raw}" — ${t("filePreviewTriedIn")} ${path}`
      : `${t("filePreviewError")}: ${path}\n${err}`;
  }
}

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
  // First run without Claude installed: open the guided setup.
  if (cliAvailable["claude"] === false && !localStorage.getItem("wizard-done")) {
    openWizard();
    return;
  }
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
