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
import { CommandBlocks } from "./blocks";
import { WebKitDeadKeyAddon } from "./xtermDeadKeyAddon";
import { MODEL_EXTS } from "./modelExts";
import type { ModelPreview } from "./modelPreview";
import { startTour, type TourStep } from "./tour";

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
    panelRgb: "10, 10, 12",
    barRgb: "13, 14, 18",
    text: "#c9d1d9",
    dim: "#8b93a1",
    accent: "#d97757",
    accentSoft: "rgba(217,119,87,0.14)",
    term: {
      ...TERM_COMMON,
      foreground: "#aeb5bd",
      cursor: "#d97757",
      cursorAccent: "#0a0a0c",
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

// Candidates span all three OSes — document.fonts.check() keeps only the
// ones actually installed, so the extra macOS faces (SF Mono, Menlo,
// Monaco) are inert on Windows/Linux and vice versa.
const FONT_CANDIDATES = [
  "Cascadia Mono",
  "Cascadia Code",
  "Consolas",
  "SF Mono",
  "Menlo",
  "Monaco",
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
if (availableFonts.length === 0) {
  availableFonts.push(
    navigator.platform.toUpperCase().includes("MAC") ? "Menlo" : "Consolas",
  );
}

const FONT_SIZES = [11, 12, 13, 14, 15, 16, 18];

// ── i18n ──────────────────────────────────────────────────

type Lang = "es" | "en" | "fr" | "it";

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
    argsPlaceholder: "Flags extra para Claude Code (se aplican al lanzar)…",
    starting: "Iniciando",
    notifications: "Notificaciones",
    sound: "Sonido",
    notifWaiting: "está esperando tu respuesta",
    notifDone: "parece haber terminado",
    notifExit: "sesión finalizada",
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
    noBlockToCopy: "No hay ningún bloque terminado que copiar",
    askPlaceholder: "Describe el comando que necesitas…",
    askHint: "Enter pregunta · Esc cierra",
    askThinking: "Preguntando a Claude…",
    askResultHint: "Enter inserta (no ejecuta) · Ctrl+E explica · Esc cierra",
    askMissing: "Claude Code no está instalado — el asistente de configuración se abre al reiniciar AFKode, o instálalo con: npm install -g @anthropic-ai/claude-code",
    askInsert: "Insertar",
    askExplainBtn: "Explicar",
    aiSearchLabel: "Búsqueda IA de comandos (# / Ctrl+Espacio)",
    aiSearchNote: "En pestañas de shell, # en un prompt vacío pide un comando a tu Claude Code instalado. Nunca se ejecuta solo: siempre se inserta para que lo revises.",
    restoreLabel: "Restaurar sesión al abrir",
    restoreAlways: "Siempre",
    restoreAsk: "Preguntar",
    restoreNever: "Nunca",
    restoreNote: "Reabre tus pestañas (orden, nombres, colores y carpetas). Las pestañas de Claude ofrecen retomar la conversación anterior.",
    tourLabel: "Recorrido guiado",
    tourReplayBtn: "Ver el recorrido",
    tourSkip: "Saltar",
    tourNext: "Siguiente",
    tourDone: "Listo",
    tourStepOf: "Paso {i} de {n}",
    tourStep1Title: "Abre una nueva pestaña",
    tourStep1Body: "El botón + lanza Claude Code, OpenCode, Codex o PowerShell en la carpeta que elijas.",
    tourStep2Title: "Tu terminal",
    tourStep2Body: "ConPTY con render por GPU: colores completos y apps interactivas con impacto mínimo en tus FPS.",
    tourStep3Title: "Vista previa de archivos",
    tourStep3Body: "Al abrir un archivo se muestra aquí: código, imágenes e incluso modelos 3D (.glb, .gltf, .obj, .stl).",
    tourStep4Title: "Búsqueda global",
    tourStep4Body: "Pulsa Ctrl+K en cualquier momento para saltar a archivos, comandos o sesiones.",
    restoreBannerText: "¿Restaurar tu última sesión? ({n} pestañas)",
    restoreBtn: "Restaurar",
    resumeQuestion: "¿Retomar la conversación anterior?",
    resumeBtn: "Retomar",
    freshBtn: "Empezar de cero",
    pastedImageInstead: "Tu clipboard no tenía texto, así que pegué una imagen en su lugar",
    filePreviewError: "No se pudo abrir el archivo",
    filePreviewNotFoundBare:
      "No encontré este archivo en la carpeta de la sesión. Claude probablemente lo mencionó sin indicar su ruta completa.",
    filePreviewTriedIn: "se buscó en",
    copy: "Copiar",
    edit: "Editar",
    filePreviewSave: "Guardar",
    filePreviewCopied: "Copiado al portapapeles",
    filePreviewSaved: "Guardado",
    filePreviewSaveError: "No se pudo guardar el archivo",
    closeTabConfirm: "Hay un proceso en ejecución en esta pestaña. ¿Cerrarla de todas formas?",
    closeTabConfirmTitle: "Cerrar pestaña",
    closeTabConfirmOk: "Cerrar de todas formas",
    cancel: "Cancelar",
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
    argsPlaceholder: "Extra flags for Claude Code (applied on launch)…",
    starting: "Starting",
    notifications: "Notifications",
    sound: "Sound",
    notifWaiting: "is waiting for your input",
    notifDone: "seems to be done",
    notifExit: "session ended",
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
    noBlockToCopy: "No finished block to copy yet",
    askPlaceholder: "Describe the command you need…",
    askHint: "Enter asks · Esc closes",
    askThinking: "Asking Claude…",
    askResultHint: "Enter inserts (never runs) · Ctrl+E explains · Esc closes",
    askMissing: "Claude Code isn't installed — the setup wizard opens when you restart AFKode, or install it with: npm install -g @anthropic-ai/claude-code",
    askInsert: "Insert",
    askExplainBtn: "Explain",
    aiSearchLabel: "AI command search (# / Ctrl+Space)",
    aiSearchNote: "In shell tabs, # at an empty prompt asks your installed Claude Code for a command. It never runs by itself — it's inserted for you to review.",
    restoreLabel: "Restore session on launch",
    restoreAlways: "Always",
    restoreAsk: "Ask",
    restoreNever: "Never",
    restoreNote: "Reopens your tabs (order, names, colors and folders). Claude tabs offer to resume the previous conversation.",
    tourLabel: "Guided tour",
    tourReplayBtn: "Take the tour",
    tourSkip: "Skip",
    tourNext: "Next",
    tourDone: "Done",
    tourStepOf: "Step {i} of {n}",
    tourStep1Title: "Open a new tab",
    tourStep1Body: "The + button launches Claude Code, OpenCode, Codex, or PowerShell in a folder you pick.",
    tourStep2Title: "Your terminal",
    tourStep2Body: "ConPTY with GPU rendering: full colors and interactive apps with minimal impact on your FPS.",
    tourStep3Title: "File preview",
    tourStep3Body: "Open a file and it shows up here: code, images, and even 3D models (.glb, .gltf, .obj, .stl).",
    tourStep4Title: "Global search",
    tourStep4Body: "Press Ctrl+K anytime to jump to files, commands, or sessions.",
    restoreBannerText: "Restore your last session? ({n} tabs)",
    restoreBtn: "Restore",
    resumeQuestion: "Resume previous conversation?",
    resumeBtn: "Resume",
    freshBtn: "Start fresh",
    pastedImageInstead: "Your clipboard had no text, so an image got pasted instead",
    filePreviewError: "Couldn't open the file",
    filePreviewNotFoundBare:
      "Couldn't find this file in the session's folder. Claude likely mentioned it without its full path.",
    filePreviewTriedIn: "looked in",
    copy: "Copy",
    edit: "Edit",
    filePreviewSave: "Save",
    filePreviewCopied: "Copied to clipboard",
    filePreviewSaved: "Saved",
    filePreviewSaveError: "Couldn't save the file",
    closeTabConfirm: "This tab has a running process. Close it anyway?",
    closeTabConfirmTitle: "Close tab",
    closeTabConfirmOk: "Close anyway",
    cancel: "Cancel",
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
  fr: {
    tooltipNew: "Nouvel onglet",
    tooltipHelp: "Aide et raccourcis",
    tooltipSettings: "Paramètres",
    tooltipGhost: "Mode fantôme (Alt+G) : les clics passent au jeu",
    tooltipHide: "Masquer l'overlay (Alt+X)",
    tooltipMaximize: "Agrandir / restaurer",
    tooltipClose: "Réduire dans la zone de notification (quitter : menu de l'icône)",
    close: "Fermer",
    tooltipOpacity: "Opacité du fond",
    hintAltXOverlay: "overlay",
    hintAltXWindow: "afficher/masquer",
    hintGhost: "fantôme",
    hintPrompt: "prompt",
    hintApprove: "approuver",
    modeOverlay: "Overlay",
    modeWindow: "Fenêtre",
    tooltipModeBadge: "Cliquez pour basculer entre le mode overlay et fenêtre",
    ghostBadge: "👻 MODE FANTÔME — Alt+G pour désactiver",
    helpTitle: "Pourquoi utiliser AFKode ?",
    help1:
      "<b>Sans quitter le jeu.</b> L'overlay flotte au-dessus de votre jeu (mode fenêtré ou <i>borderless</i>). Appuyez sur <kbd>Alt</kbd>+<kbd>X</kbd> pour l'afficher ou le masquer instantanément, sans alt-tab.",
    help2:
      "<b>Claude travaille pendant que vous jouez.</b> Lancez une longue tâche à Claude Code, masquez l'overlay et continuez à jouer ; revenez avec <kbd>Alt</kbd>+<kbd>X</kbd> pour suivre la progression.",
    help3:
      "<b>Mode fantôme (<kbd>Alt</kbd>+<kbd>G</kbd>).</b> L'overlay reste visible comme un HUD semi-transparent et vos clics et touches passent au jeu.",
    help4:
      "<b>Onglets et votre dossier.</b> Le bouton <b>+</b> ouvre Claude Code, OpenCode, Codex ou PowerShell ; vous choisissez d'abord le dossier du projet via la boîte de dialogue native de Windows.",
    help5:
      "<b>Vrai terminal.</b> ConPTY + rendu GPU (WebGL) : couleurs complètes, applications interactives et performances de Windows Terminal avec un impact minimal sur vos FPS.",
    help6:
      "<b>À votre goût.</b> Thèmes, police et langue dans ⚙ ; faites glisser la barre supérieure pour le déplacer et réglez l'opacité avec le curseur de la barre inférieure.",
    settingsTitle: "Paramètres",
    theme: "Thème",
    opacity: "Opacité",
    font: "Police",
    fontSize: "Taille",
    language: "Langue",
    ended: "(terminée)",
    sessionEnded: "— session terminée — appuyez sur × pour fermer",
    spawnError: "Échec du démarrage de la session",
    pickFolder: "Choisissez le dossier du projet",
    emptyTitle: "Où voulez-vous travailler ?",
    noFolder: "Choisir un dossier… (par défaut : accueil)",
    argsPlaceholder: "Options supplémentaires pour Claude Code (appliquées au lancement)…",
    starting: "Démarrage",
    notifications: "Notifications",
    sound: "Son",
    notifWaiting: "attend votre réponse",
    notifDone: "semble avoir terminé",
    notifExit: "session terminée",
    hud: "Mini-HUD (pastille d'état)",
    autoLaunch: "Lancer Claude automatiquement au démarrage",
    hooksLabel: "Intégration avec Claude Code",
    hooksNote:
      "Lance Claude Code avec des hooks qui rapportent son état réel à AFKode : quel outil il exécute, quand il attend votre permission et quand un tour se termine. Le HUD, Alt+A et le résumé sont ainsi exacts au lieu d'estimés. Tout est local (127.0.0.1) ; s'applique aux nouvelles sessions.",
    trayToggle: "Afficher / Masquer",
    trayGhost: "Mode fantôme",
    trayPalette: "Palette de prompts",
    trayQuit: "Quitter AFKode",
    hudOpen: "Ouvrir l'overlay (Alt+X)",
    overlayModeLabel: "Mode overlay",
    overlayModeNote:
      "Activé : la fenêtre flotte toujours au-dessus de tout et n'apparaît pas dans la barre des tâches — pensé pour jouer. Désactivé : elle se comporte comme une fenêtre normale (barre des tâches, Alt+Tab) — mieux si vous ne jouez pas et voulez éviter qu'elle vous gêne avec d'autres applications en plein écran.",
    matchModeLabel: "Ne pas déranger en partie",
    matchModeNote:
      "Quand un jeu en plein écran a le focus, AFKode reste silencieux : ni toasts ni bips. Les éléments en attente s'accumulent dans l'inbox et vous recevez une seule notification à la levée du silence. Comme les lobbies sont aussi en plein écran, Alt+N bascule le silence manuellement (🔕 sur le mini-HUD) ; à la fermeture du jeu, le mode automatique revient.",
    searchPlaceholder: "Rechercher dans le terminal…  (Entrée suivant · Maj+Entrée précédent)",
    tooltipGlobalSearch: "Rechercher des sessions (Ctrl+K)",
    globalSearchPlaceholder: "Rechercher des sessions…",
    globalSearchEmpty: "Aucun résultat",
    linkOpening: "Ouverture du lien dans votre navigateur…",
    linkOpenFailed: "Impossible d'ouvrir le navigateur — lien copié, collez-le où vous voulez",
    noBlockToCopy: "Aucun bloc terminé à copier",
    askPlaceholder: "Décrivez la commande dont vous avez besoin…",
    askHint: "Entrée demande · Échap ferme",
    askThinking: "Je demande à Claude…",
    askResultHint: "Entrée insère (n'exécute jamais) · Ctrl+E explique · Échap ferme",
    askMissing: "Claude Code n'est pas installé — l'assistant de configuration s'ouvre au redémarrage d'AFKode, ou installez-le avec : npm install -g @anthropic-ai/claude-code",
    askInsert: "Insérer",
    askExplainBtn: "Expliquer",
    aiSearchLabel: "Recherche IA de commandes (# / Ctrl+Espace)",
    aiSearchNote: "Dans les onglets shell, # sur un prompt vide demande une commande à votre Claude Code installé. Elle n'est jamais exécutée seule : elle est insérée pour relecture.",
    restoreLabel: "Restaurer la session au lancement",
    restoreAlways: "Toujours",
    restoreAsk: "Demander",
    restoreNever: "Jamais",
    restoreNote: "Rouvre vos onglets (ordre, noms, couleurs et dossiers). Les onglets Claude proposent de reprendre la conversation précédente.",
    tourLabel: "Visite guidée",
    tourReplayBtn: "Revoir la visite",
    tourSkip: "Passer",
    tourNext: "Suivant",
    tourDone: "Terminé",
    tourStepOf: "Étape {i} sur {n}",
    tourStep1Title: "Ouvrez un nouvel onglet",
    tourStep1Body: "Le bouton + lance Claude Code, OpenCode, Codex ou PowerShell dans le dossier de votre choix.",
    tourStep2Title: "Votre terminal",
    tourStep2Body: "ConPTY avec rendu GPU : couleurs complètes et applications interactives, impact minimal sur vos FPS.",
    tourStep3Title: "Aperçu des fichiers",
    tourStep3Body: "Ouvrez un fichier et il s'affiche ici : code, images et même modèles 3D (.glb, .gltf, .obj, .stl).",
    tourStep4Title: "Recherche globale",
    tourStep4Body: "Appuyez sur Ctrl+K à tout moment pour accéder aux fichiers, commandes ou sessions.",
    restoreBannerText: "Restaurer votre dernière session ? ({n} onglets)",
    restoreBtn: "Restaurer",
    resumeQuestion: "Reprendre la conversation précédente ?",
    resumeBtn: "Reprendre",
    freshBtn: "Repartir de zéro",
    pastedImageInstead: "Votre presse-papiers ne contenait pas de texte, une image a donc été collée à la place",
    filePreviewError: "Impossible d'ouvrir le fichier",
    filePreviewNotFoundBare:
      "Fichier introuvable dans le dossier de la session. Claude l'a probablement mentionné sans indiquer son chemin complet.",
    filePreviewTriedIn: "recherché dans",
    copy: "Copier",
    edit: "Modifier",
    filePreviewSave: "Enregistrer",
    filePreviewCopied: "Copié dans le presse-papiers",
    filePreviewSaved: "Enregistré",
    filePreviewSaveError: "Impossible d'enregistrer le fichier",
    closeTabConfirm: "Un processus est en cours d'exécution dans cet onglet. Le fermer quand même ?",
    closeTabConfirmTitle: "Fermer l'onglet",
    closeTabConfirmOk: "Fermer quand même",
    cancel: "Annuler",
    inboxTitle: "Vos agents ont besoin de vous",
    inboxApprove: "Approuver",
    inboxOpen: "Aller",
    ttsLabel: "Annonces vocales (TTS)",
    ttsNote:
      "Style copilote : au lieu d'un bip, une voix annonce \"Claude Code attend votre réponse\" par-dessus l'audio du jeu. Windows ne la supprime pas en plein écran.",
    queuedSummary: "{n} élément(s) en attente de vos agents — Alt+X pour vérifier",
    hudWorking: "au travail",
    hudWaiting: "vous attend",
    hudDone: "terminé",
    updateReady:
      "AFKode {v} installé — appliqué au redémarrage de l'app (menu de la zone de notification → Quitter)",
    updateAvailable: "AFKode {v} est disponible",
    updateInstallBtn: "Mettre à jour et redémarrer",
    updateInstalling: "Téléchargement de la mise à jour… l'app redémarrera toute seule",
    updateFailed: "La mise à jour a échoué",
    awaySummary:
      "Pendant votre absence ({away} min) : {turns} tours terminés · {tools} outils · {files} fichiers · il vous a attendu {waits} fois ({waitMin} min)",
  },
  it: {
    tooltipNew: "Nuova scheda",
    tooltipHelp: "Aiuto e scorciatoie",
    tooltipSettings: "Impostazioni",
    tooltipGhost: "Modalità fantasma (Alt+G): i clic passano al gioco",
    tooltipHide: "Nascondi l'overlay (Alt+X)",
    tooltipMaximize: "Ingrandisci / ripristina",
    tooltipClose: "Nascondi nella barra di sistema (esci: menu dell'icona)",
    close: "Chiudi",
    tooltipOpacity: "Opacità dello sfondo",
    hintAltXOverlay: "overlay",
    hintAltXWindow: "mostra/nascondi",
    hintGhost: "fantasma",
    hintPrompt: "prompt",
    hintApprove: "approva",
    modeOverlay: "Overlay",
    modeWindow: "Finestra",
    tooltipModeBadge: "Clicca per passare dalla modalità overlay a finestra",
    ghostBadge: "👻 MODALITÀ FANTASMA — Alt+G per disattivare",
    helpTitle: "Perché usare AFKode?",
    help1:
      "<b>Senza uscire dal gioco.</b> L'overlay fluttua sopra il tuo gioco (in modalità finestra o <i>borderless</i>). Premi <kbd>Alt</kbd>+<kbd>X</kbd> per mostrarlo o nasconderlo all'istante, senza alt-tab.",
    help2:
      "<b>Claude lavora mentre giochi.</b> Avvia un compito lungo con Claude Code, nascondi l'overlay e continua a giocare; torna con <kbd>Alt</kbd>+<kbd>X</kbd> per controllare i progressi.",
    help3:
      "<b>Modalità fantasma (<kbd>Alt</kbd>+<kbd>G</kbd>).</b> L'overlay resta visibile come un HUD semitrasparente e i tuoi clic e tasti passano al gioco.",
    help4:
      "<b>Schede e la tua cartella.</b> Il pulsante <b>+</b> apre Claude Code, OpenCode, Codex o PowerShell; prima scegli la cartella del progetto con la finestra di dialogo nativa di Windows.",
    help5:
      "<b>Terminale vero.</b> ConPTY + rendering GPU (WebGL): colori completi, app interattive e prestazioni da Windows Terminal con impatto minimo sui tuoi FPS.",
    help6:
      "<b>Su misura per te.</b> Temi, font e lingua in ⚙; trascina la barra superiore per spostarlo e regola l'opacità con il cursore della barra inferiore.",
    settingsTitle: "Impostazioni",
    theme: "Tema",
    opacity: "Opacità",
    font: "Font",
    fontSize: "Dimensione",
    language: "Lingua",
    ended: "(terminata)",
    sessionEnded: "— sessione terminata — premi × per chiudere",
    spawnError: "Avvio della sessione non riuscito",
    pickFolder: "Scegli la cartella del progetto",
    emptyTitle: "Dove vuoi lavorare?",
    noFolder: "Scegli cartella… (predefinita: home)",
    argsPlaceholder: "Flag extra per Claude Code (applicati all'avvio)…",
    starting: "Avvio",
    notifications: "Notifiche",
    sound: "Suono",
    notifWaiting: "sta aspettando la tua risposta",
    notifDone: "sembra aver finito",
    notifExit: "sessione terminata",
    hud: "Mini-HUD (indicatore di stato)",
    autoLaunch: "Avvia Claude automaticamente all'apertura",
    hooksLabel: "Integrazione con Claude Code",
    hooksNote:
      "Avvia Claude Code con hook che riportano il suo stato reale ad AFKode: quale strumento esegue, quando aspetta il tuo permesso e quando finisce un turno. Così l'HUD, Alt+A e il riepilogo sono esatti invece che stimati. Tutto è locale (127.0.0.1); si applica alle nuove sessioni.",
    trayToggle: "Mostra / Nascondi",
    trayGhost: "Modalità fantasma",
    trayPalette: "Palette dei prompt",
    trayQuit: "Esci da AFKode",
    hudOpen: "Apri l'overlay (Alt+X)",
    overlayModeLabel: "Modalità overlay",
    overlayModeNote:
      "Attiva: la finestra fluttua sempre sopra tutto e non appare nella barra delle applicazioni — pensata per giocare. Disattiva: si comporta come una finestra normale (barra delle applicazioni, Alt+Tab) — meglio se non stai giocando e vuoi evitare che copra o venga coperta da altre app a schermo intero.",
    matchModeLabel: "Non disturbare in partita",
    matchModeNote:
      "Quando un gioco a schermo intero ha il focus, AFKode resta in silenzio: niente toast né bip. Gli elementi in sospeso si accumulano nell'inbox e ricevi un solo avviso quando il silenzio termina. Poiché anche le lobby sono a schermo intero, Alt+N attiva il silenzio manualmente (🔕 sul mini-HUD); alla chiusura del gioco torna la modalità automatica.",
    searchPlaceholder: "Cerca nel terminale…  (Invio successivo · Maiusc+Invio precedente)",
    tooltipGlobalSearch: "Cerca sessioni (Ctrl+K)",
    globalSearchPlaceholder: "Cerca sessioni…",
    globalSearchEmpty: "Nessun risultato",
    linkOpening: "Apertura del link nel browser…",
    linkOpenFailed: "Impossibile aprire il browser — link copiato, incollalo dove vuoi",
    noBlockToCopy: "Nessun blocco terminato da copiare",
    askPlaceholder: "Descrivi il comando di cui hai bisogno…",
    askHint: "Invio chiede · Esc chiude",
    askThinking: "Sto chiedendo a Claude…",
    askResultHint: "Invio inserisce (mai eseguito) · Ctrl+E spiega · Esc chiude",
    askMissing: "Claude Code non è installato — la procedura guidata si apre al riavvio di AFKode, oppure installalo con: npm install -g @anthropic-ai/claude-code",
    askInsert: "Inserisci",
    askExplainBtn: "Spiega",
    aiSearchLabel: "Ricerca comandi IA (# / Ctrl+Spazio)",
    aiSearchNote: "Nelle schede shell, # su un prompt vuoto chiede un comando al tuo Claude Code installato. Non viene mai eseguito da solo: viene inserito per la revisione.",
    restoreLabel: "Ripristina la sessione all'avvio",
    restoreAlways: "Sempre",
    restoreAsk: "Chiedi",
    restoreNever: "Mai",
    restoreNote: "Riapre le tue schede (ordine, nomi, colori e cartelle). Le schede Claude offrono di riprendere la conversazione precedente.",
    tourLabel: "Visita guidata",
    tourReplayBtn: "Rivedi la visita",
    tourSkip: "Salta",
    tourNext: "Avanti",
    tourDone: "Fine",
    tourStepOf: "Passo {i} di {n}",
    tourStep1Title: "Apri una nuova scheda",
    tourStep1Body: "Il pulsante + avvia Claude Code, OpenCode, Codex o PowerShell nella cartella che scegli.",
    tourStep2Title: "Il tuo terminale",
    tourStep2Body: "ConPTY con rendering GPU: colori completi e app interattive con impatto minimo sugli FPS.",
    tourStep3Title: "Anteprima file",
    tourStep3Body: "Apri un file e viene mostrato qui: codice, immagini e persino modelli 3D (.glb, .gltf, .obj, .stl).",
    tourStep4Title: "Ricerca globale",
    tourStep4Body: "Premi Ctrl+K in qualsiasi momento per saltare a file, comandi o sessioni.",
    restoreBannerText: "Ripristinare l'ultima sessione? ({n} schede)",
    restoreBtn: "Ripristina",
    resumeQuestion: "Riprendere la conversazione precedente?",
    resumeBtn: "Riprendi",
    freshBtn: "Ricomincia da zero",
    pastedImageInstead: "Gli appunti non contenevano testo, quindi è stata incollata un'immagine",
    filePreviewError: "Impossibile aprire il file",
    filePreviewNotFoundBare:
      "File non trovato nella cartella della sessione. Probabilmente Claude l'ha citato senza indicarne il percorso completo.",
    filePreviewTriedIn: "cercato in",
    copy: "Copia",
    edit: "Modifica",
    filePreviewSave: "Salva",
    filePreviewCopied: "Copiato negli appunti",
    filePreviewSaved: "Salvato",
    filePreviewSaveError: "Impossibile salvare il file",
    closeTabConfirm: "In questa scheda è in esecuzione un processo. Chiuderla comunque?",
    closeTabConfirmTitle: "Chiudi scheda",
    closeTabConfirmOk: "Chiudi comunque",
    cancel: "Annulla",
    inboxTitle: "I tuoi agenti hanno bisogno di te",
    inboxApprove: "Approva",
    inboxOpen: "Vai",
    ttsLabel: "Annunci vocali (TTS)",
    ttsNote:
      "Stile copilota: invece di un bip, una voce annuncia \"Claude Code sta aspettando la tua risposta\" sopra l'audio del gioco. Windows non la sopprime a schermo intero.",
    queuedSummary: "{n} elemento/i in sospeso dai tuoi agenti — Alt+X per controllare",
    hudWorking: "al lavoro",
    hudWaiting: "ti aspetta",
    hudDone: "fatto",
    updateReady:
      "AFKode {v} installato — si applica al riavvio dell'app (menu della barra di sistema → Esci)",
    updateAvailable: "AFKode {v} è disponibile",
    updateInstallBtn: "Aggiorna e riavvia",
    updateInstalling: "Download dell'aggiornamento… l'app si riavvierà da sola",
    updateFailed: "Aggiornamento non riuscito",
    awaySummary:
      "Mentre non c'eri ({away} min): {turns} turni completati · {tools} strumenti · {files} file · ti ha aspettato {waits} volte ({waitMin} min)",
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
  aiSearch: boolean;
  restore: "always" | "ask" | "never";
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
  aiSearch: true,
  restore: "ask",
};

function loadSettings(): Settings {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem("settings") ?? "{}") };
    if (!THEMES[s.theme]) s.theme = DEFAULTS.theme;
    if (!I18N[s.lang as Lang]) s.lang = DEFAULTS.lang;
    if (!["always", "ask", "never"].includes(s.restore)) s.restore = DEFAULTS.restore;
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}

let settings = loadSettings();

// Translated strings hardcode Alt-based hotkeys (Alt+X, Alt+G, …); on
// macOS those keys are Option chords, so rewrite them for display (macKeys
// is defined in the Platform section below — evaluated lazily, at call
// time, so the ordering is fine).
const t = (key: string) => {
  const v = I18N[settings.lang][key] ?? key;
  return isMac() ? macKeys(v) : v;
};

function saveSettings() {
  localStorage.setItem("settings", JSON.stringify(settings));
}

// ── Platform ──────────────────────────────────────────────
// Static facts from the Rust side. The OS is also detectable synchronously
// from the webview (navigator.platform: "Win32" / "MacIntel" / "Linux …"),
// so keyboard handlers and hotkey labels are correct from the first frame
// instead of assuming Windows until the invoke resolves.
const navOs = navigator.platform.toUpperCase();
let platform: { os: string; ttsAvailable: boolean } = {
  os: navOs.includes("MAC") ? "macos" : navOs.includes("LINUX") ? "linux" : "windows",
  ttsAvailable: true,
};
const isMac = () => platform.os === "macos";
// Hotkey display: the Alt key is Option on macOS; render ⌥ there. Windows
// and Linux strings pass through untouched.
const macKeys = (s: string) =>
  s
    .replace(/Alt\+Tab/g, "⌘Tab")
    .replace(/Ctrl\+K/g, "⌘K")
    .replace(/<kbd>Alt<\/kbd>\+<kbd>/g, "<kbd>⌥")
    .replace(/Alt\+/g, "⌥");
const altHK = (key: string) => (isMac() ? `⌥${key}` : `Alt+${key}`);

function applyPlatform() {
  if (platform.os !== "windows") {
    // The plain-terminal tab runs the user's login shell, not PowerShell.
    const shellBtn = document.querySelector<HTMLButtonElement>('button[data-cmd=""]');
    if (shellBtn) {
      shellBtn.dataset.name = "Shell";
      if (shellBtn.lastChild) shellBtn.lastChild.textContent = "Shell";
    }
  }
  // No voice engine (Linux without spd-say): hide the toggle instead of
  // offering a switch that can't do anything.
  if (!platform.ttsAvailable) {
    settings.tts = false;
    document.querySelector("#row-tts")?.classList.add("hidden");
    document.querySelector("#note-tts")?.classList.add("hidden");
  }
}

// Apply the synchronous detection immediately (shell-tab label), then let
// the Rust side refine it (authoritative os + TTS availability).
applyPlatform();
invoke<{ os: string; ttsAvailable: boolean }>("platform_info")
  .then((p) => {
    platform = p;
    applyPlatform();
  })
  .catch(() => {});

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
  blocks: CommandBlocks;
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

// ── Session journal (F4) ──────────────────────────────────
//
// Crash-safe by construction: rewritten (debounced) on every tab open/
// close/rename/recolor rather than at exit, so a force-kill loses at most
// the last half-second of layout changes. Never includes scrollback.

interface JournalEntry {
  cmd: string;
  cwd: string | null;
  title: string;
  color?: string;
}

let journalTimer = 0;

function writeJournal() {
  const list: JournalEntry[] = [...sessions.values()]
    .filter((s) => s.alive)
    .map((s) => ({ cmd: s.cmd, cwd: s.cwd, title: s.title, color: s.color }));
  localStorage.setItem("session-journal", JSON.stringify(list));
}

function scheduleJournal() {
  clearTimeout(journalTimer);
  journalTimer = window.setTimeout(writeJournal, 500);
}

function readJournal(): JournalEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem("session-journal") ?? "[]");
    return Array.isArray(v)
      ? v.filter((e) => e && typeof e.cmd === "string" && typeof e.title === "string")
      : [];
  } catch {
    return [];
  }
}

const $ = <T extends HTMLElement>(sel: string) =>
  document.querySelector(sel) as T;

const tabsEl = $("#tabs");
// The tab strip hides its scrollbar (Warp-style) and a plain vertical mouse
// wheel doesn't scroll a horizontally-overflowing flex row by default, so
// past 3-4 tabs there was no way to reach the new ones — redirect vertical
// wheel delta into horizontal scroll here.
tabsEl.addEventListener(
  "wheel",
  (e) => {
    if (e.deltaY === 0) return;
    tabsEl.scrollLeft += e.deltaY;
    e.preventDefault();
  },
  { passive: false },
);
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
  // Re-detect on every open so a CLI installed manually mid-session gets
  // its launcher button without restarting the app.
  if (show) refreshCliButtons();
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
  // The ask strip belongs to one session; don't leave it floating over
  // another tab where Insert would type into the wrong shell.
  if (askSession && askSession.id !== id) closeAskStrip();
  // Activating a session means the user is done with the "+" picker — if it
  // stayed forced-open it would keep covering the terminal with no way back.
  if (forceEmptyState) {
    forceEmptyState = false;
    updateEmptyState();
  }
  activeId = id;
  for (const s of sessions.values()) {
    s.pane.classList.toggle("active", s.id === id);
    s.tab.classList.toggle("active", s.id === id);
  }
  sessions.get(id)?.tab.scrollIntoView({ block: "nearest", inline: "nearest" });
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

// A live process (a running build, an unfinished agent turn) dies the
// moment the pty is killed with no chance to save state — closing that tab
// by a stray click is easy to do and hard to undo, so it's the one case
// that gets a confirmation. `alive` alone stays true for an idle shell's
// entire lifetime (it only flips at process exit), so the actual gate is
// sessionState() !== "done" — recent output or an unfinished agent turn —
// or the underlying process must already be alive to close it at all.
async function closeSession(id: string) {
  const s = sessions.get(id);
  if (!s) return;
  if (s.alive && sessionState(s) !== "done") {
    const proceed = await confirmDialog(
      t("closeTabConfirm"),
      t("closeTabConfirmTitle"),
      t("closeTabConfirmOk"),
    );
    if (!proceed || !sessions.has(id)) return;
  }
  if (askSession?.id === id) closeAskStrip();
  sessions.delete(id);
  if (s.alive) invoke("kill_pty", { id }).catch(() => {});
  s.blocks.dispose();
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
  scheduleJournal();
}

// The DOM renderer lays out each row as real text, and fractional
// line-heights round per-row instead of per-terminal; over many rows that
// drift can push the last line past the pane's bottom edge. FitAddon can't
// see that at measurement time, so shrink by a row until it actually fits.
// The same per-cell rounding can push the last column past the right edge
// (narrower drift since it's one probe measurement instead of a per-row
// sum, but the failure mode — a clipped character — is just as visible).
// A single correction only covers small drift (a window resize); a bigger
// jump (e.g. a large font-size change) can overflow by more than one row
// or column, so this actually loops rather than checking just once — each
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
      const screenRect = screen.getBoundingClientRect();
      const paneRect = pane.getBoundingClientRect();
      const overflowsBottom = screenRect.bottom > paneRect.bottom + 0.5 && term.rows > 1;
      const overflowsRight = screenRect.right > paneRect.right + 0.5 && term.cols > 1;
      if (!overflowsBottom && !overflowsRight) break;
      term.resize(
        overflowsRight ? term.cols - 1 : term.cols,
        overflowsBottom ? term.rows - 1 : term.rows,
      );
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

interface NewSessionOpts {
  /** Restore: baseTitle is the saved (possibly renamed) title — use as-is. */
  exactTitle?: boolean;
  /** Restore: saved tab color tag. */
  color?: string;
  /** Restore, agent tabs: ask Resume (`--continue`) vs fresh before spawning. */
  offerResume?: boolean;
}

async function newSession(
  cmd: string,
  baseTitle: string,
  cwd: string | null,
  opts?: NewSessionOpts,
) {
  if (cwd) {
    localStorage.setItem("last-folder", cwd);
    addRecentFolder(cwd);
  }
  const folderName = cwd ? cwd.replace(/[\\/]+$/, "").split(/[\\/]/).pop() : null;
  const title = opts?.exactTitle
    ? baseTitle
    : folderName
      ? `${baseTitle} · ${folderName}`
      : baseTitle;

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
  tab.scrollIntoView({ block: "nearest", inline: "nearest" });

  const themeDef = THEMES[settings.theme];
  const term = new Terminal({
    // Needed to reach `term.textarea` below (autocorrect fix) — xterm.js
    // gates that accessor behind the proposed-API flag at runtime.
    allowProposedApi: true,
    allowTransparency: true,
    fontFamily: `"${settings.font}", Consolas, Menlo, monospace`,
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
  // OSC 133 command blocks (see blocks.ts) — inert until the shell emits
  // the first sequence, so agent TUIs and non-integrated shells see zero
  // behavior change.
  const blocks = new CommandBlocks(
    term,
    pane,
    (data) => invoke("write_pty", { id, data }).catch(() => {}),
    (text) => clipWrite(text).catch(() => {}),
  );
  term.open(pane);
  // xterm.js's hidden input textarea turns off spellcheck/autocapitalize but
  // not `autocorrect` — a WebKit-only attribute. On macOS that leaves Safari's
  // predictive-text corrector live on the proxy input, which can silently
  // re-insert/duplicate the word or phrase just typed a few words in. Windows/
  // Linux ignore the attribute, so this is a no-op there.
  term.textarea?.setAttribute("autocorrect", "off");
  // Separate WebKit feature from autocorrect (Safari/WebKit 18+, macOS
  // Sequoia): inline predictive "writing suggestions". Confirmed via a
  // debug write_pty log that this is the actual duplicate-lines cause —
  // the whole line typed so far gets silently re-emitted as one onData
  // chunk mid-typing, which the shell echoes as a duplicate. `autocorrect`
  // alone doesn't cover it; only WebKit honors this attribute.
  term.textarea?.setAttribute("writingsuggestions", "false");
  // Works around https://github.com/xtermjs/xterm.js/issues/5894 — on macOS
  // WKWebView, dead-key layouts (Spanish included) can duplicate the dead
  // char and drop the following key. See xtermDeadKeyAddon.ts for the full
  // writeup. `handle()` is wired into attachCustomKeyEventHandler below.
  const deadKey = new WebKitDeadKeyAddon((data) => invoke("write_pty", { id, data }).catch(() => {}));
  term.loadAddon(deadKey);
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
  // initial spin-up leaves the pane black for several seconds). Created at
  // spawn time, not tab time — a restored tab shows the resume bar first.
  let loader: HTMLElement | undefined;
  const showLoader = () => {
    if (!cmd) return;
    loader = document.createElement("div");
    loader.className = "term-loader";
    loader.innerHTML = `
      <div class="loader-ring"><span class="loader-core"></span></div>
      <div class="loader-text">${t("starting")} ${baseTitle}<span class="loader-dots"><i>.</i><i>.</i><i>.</i></span></div>`;
    pane.appendChild(loader);
  };

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
    if (deadKey.handle(ev)) return false;
    if (ev.type !== "keydown") return true;
    // AI command search (F3) — shell tabs only, so agent TUIs never see it.
    // '#' only fires at a verifiably idle, empty prompt (OSC 133 state);
    // Ctrl+Space works regardless, as the explicit opt-in gesture.
    if (!cmd && settings.aiSearch) {
      const hash =
        ev.key === "#" && !ev.ctrlKey && !ev.metaKey && !ev.altKey && blocks.atEmptyPrompt();
      const chord =
        ev.code === "Space" && ev.ctrlKey && !ev.metaKey && !ev.shiftKey && !ev.altKey;
      if (hash || chord) {
        ev.preventDefault();
        const s = sessions.get(id);
        if (s) openAskStrip(s);
        return false;
      }
    }
    // App-level chords ride Ctrl on Windows/Linux but Cmd on macOS, where
    // Ctrl+F/K/V are readline editing keys the shell must keep receiving.
    const mod = isMac() ? ev.metaKey && !ev.ctrlKey : ev.ctrlKey;
    if (mod && !ev.shiftKey && ev.code === "KeyF") {
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
    // Plain Ctrl+V (Cmd+V on macOS) would send ^V to the TUI instead of
    // pasting — intercept. Without preventDefault, the browser's own paste
    // also fires on xterm's hidden textarea, so the clipboard text lands
    // twice.
    if (mod && ev.code === "KeyV") {
      ev.preventDefault();
      pasteFromClipboard();
      return false;
    }
    if (mod && ev.shiftKey && ev.code === "KeyC") {
      ev.preventDefault();
      const sel = term.getSelection();
      if (sel) clipWrite(sel).catch(() => {});
      // No text selection but a block is selected: copy its output.
      else blocks.copySelectedOutput();
      return false;
    }
    // macOS-native copy: Cmd+C with a selection copies it (Ctrl+C keeps
    // meaning SIGINT, exactly like Terminal.app). Without a selection the
    // chord falls through and does nothing.
    if (isMac() && ev.metaKey && !ev.ctrlKey && !ev.shiftKey && !ev.altKey && ev.code === "KeyC") {
      const sel = term.getSelection();
      if (sel) {
        ev.preventDefault();
        clipWrite(sel).catch(() => {});
        return false;
      }
      return true;
    }
    // Block navigation — Cmd on macOS, Ctrl elsewhere. Only consumed once
    // OSC 133 has been seen, so TUIs keep their own Ctrl+arrow bindings.
    const blockMod = platform.os === "macos" ? ev.metaKey && !ev.ctrlKey : ev.ctrlKey && !ev.metaKey;
    if (blockMod && !ev.shiftKey && !ev.altKey && (ev.code === "ArrowUp" || ev.code === "ArrowDown")) {
      if (blocks.active() && blocks.navigate(ev.code === "ArrowUp" ? -1 : 1)) {
        ev.preventDefault();
        return false;
      }
      return true;
    }
    // Without this, xterm sends the literal ^K (0x0B) byte to the shell —
    // in readline/PSReadLine that's "kill to end of line," silently
    // deleting whatever was typed, in addition to opening search. On macOS
    // this rides Cmd+K instead and Ctrl+K stays a shell editing key.
    if (mod && !ev.shiftKey && ev.code === "KeyK") {
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
    blocks,
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
  if (opts?.color) {
    session.color = opts.color;
    applyTabColor(session);
  }
  forceEmptyState = false;
  updateEmptyState();
  setActive(id);
  scheduleJournal();

  term.onData((data) => invoke("write_pty", { id, data }).catch(() => {}));
  term.onResize(({ cols, rows }) =>
    invoke("resize_pty", { id, cols, rows }).catch(() => {}),
  );

  const doSpawn = async (finalCmd: string) => {
    showLoader();
    session.loader = loader;
    try {
      await invoke("spawn_pty", {
        id,
        cmd: finalCmd,
        cwd,
        hooks: settings.hooks,
        cols: term.cols,
        rows: term.rows,
      });
      // Tab closed while the spawn was in flight: closeSession's kill_pty
      // predated the PTY registration and was a no-op — kill it now.
      if (!sessions.has(id)) {
        invoke("kill_pty", { id }).catch(() => {});
      } else {
        // safeFit's corrective shrink (FitAddon overcounts rows by ~1: the
        // pane's border-box padding is invisible to it) fires resize_pty on
        // a rAF that usually lands while this spawn is still in flight —
        // "session not found", silently dropped. The PTY then runs one row
        // taller than the visible grid, so a TUI's bottom line (the last
        // line of a long prompt in Claude Code) is drawn off-screen until
        // a window resize happens to heal it. Re-sync now that the PTY
        // exists.
        invoke("resize_pty", { id, cols: term.cols, rows: term.rows }).catch(() => {});
      }
    } catch (e) {
      dismissLoader(session);
      term.writeln(`\x1b[31m${t("spawnError")}: ${e}\x1b[0m`);
      session.alive = false;
      tab.classList.add("dead");
    }
  };

  if (opts?.offerResume) {
    // Restored agent tab: the conversation can only be resumed by launch
    // flag, so ask before spawning anything.
    const bar = document.createElement("div");
    bar.className = "resume-bar";
    const q = document.createElement("span");
    q.textContent = t("resumeQuestion");
    const resumeBtn = document.createElement("button");
    resumeBtn.className = "ask-btn ok";
    resumeBtn.textContent = t("resumeBtn");
    const freshBtn = document.createElement("button");
    freshBtn.className = "ask-btn";
    freshBtn.textContent = t("freshBtn");
    bar.append(q, resumeBtn, freshBtn);
    const choose = (finalCmd: string) => {
      bar.remove();
      doSpawn(finalCmd);
    };
    resumeBtn.addEventListener("click", () =>
      choose(/--continue|--resume/.test(cmd) ? cmd : `${cmd} --continue`),
    );
    freshBtn.addEventListener("click", () => choose(cmd));
    pane.appendChild(bar);
  } else {
    await doSpawn(cmd);
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
  if (platform.os !== "windows") {
    // WKWebView/WebKitGTK speechSynthesis is unreliable or missing; the
    // Rust side shells out to `say` (macOS) / `spd-say` (Linux) instead.
    invoke("speak_text", { text }).catch(() => {});
    return;
  }
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang =
      ({ es: "es-ES", en: "en-US", fr: "fr-FR", it: "it-IT" } as const)[settings.lang] ??
      "en-US";
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
        body: `${session.title} ${t(bodyKey)} — ${altHK("X")}`,
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
  // The banner is shared with the update flow — don't leave its button up.
  $("#away-action").classList.add("hidden");
  $("#away-banner").classList.remove("hidden");
  clearTimeout(awayBannerTimer);
  awayBannerTimer = window.setTimeout(() => {
    $("#away-banner").classList.add("hidden");
    // Bring back the one-shot update prompt this summary displaced.
    showUpdateBanner();
  }, 45_000);
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

// The banner is shared with the away summary, and update-available fires
// only once per run — remember the pending version so the prompt can be
// re-shown after a summary overwrites it (or its 45s hide timer fires).
let pendingUpdate: string | null = null;

function showUpdateBanner() {
  if (!pendingUpdate) return;
  $("#away-text").textContent = t("updateAvailable").replace("{v}", pendingUpdate);
  awayAction.textContent = t("updateInstallBtn");
  awayAction.classList.remove("hidden");
  // A stale away-summary hide timer must not take this banner down.
  clearTimeout(awayBannerTimer);
  $("#away-banner").classList.remove("hidden");
}

listen<string>("update-available", (e) => {
  pendingUpdate = e.payload;
  showUpdateBanner();
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
  pendingUpdate = null;
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
  const mod = isMac() ? e.metaKey && !e.ctrlKey : e.ctrlKey;
  if (mod && !e.shiftKey && e.code === "KeyF") {
    e.preventDefault();
    openSearch();
  } else if (e.key === "Escape" && forceEmptyState && sessions.size > 0) {
    // Dismiss the forced "+" picker and return to the active session.
    forceEmptyState = false;
    updateEmptyState();
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
    s.term.options.fontFamily = `"${settings.font}", Consolas, Menlo, monospace`;
    s.term.options.fontSize = settings.size;
    safeFit(s.term, s.fit, s.pane);
  }
}

function updateStatusHint() {
  const altX = settings.overlayMode ? t("hintAltXOverlay") : t("hintAltXWindow");
  // ⌥ chords on macOS; Alt+key pairs elsewhere.
  const kbd = (key: string) =>
    isMac() ? `<kbd>⌥${key}</kbd>` : `<kbd>Alt</kbd>+<kbd>${key}</kbd>`;
  // Click-through only makes sense floating over a game — drop it entirely
  // in window mode instead of hinting at a feature that's hidden anyway.
  const ghost = settings.overlayMode
    ? `${kbd("G")} ${t("hintGhost")}&ensp;·&ensp;`
    : "";
  $("#status-hint").innerHTML =
    `${kbd("X")} ${altX}&ensp;·&ensp;${ghost}` +
    `${kbd("P")} ${t("hintPrompt")}&ensp;·&ensp;${kbd("A")} ${t("hintApprove")}`;
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
  // The mode badge is otherwise only re-rendered when the mode toggles, so a
  // language switch would leave it in the previous language.
  $("#mode-badge").textContent = settings.overlayMode ? t("modeOverlay") : t("modeWindow");
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
  key: "notify" | "sound" | "hud" | "autoLaunch" | "hooks" | "matchMode" | "tts" | "aiSearch",
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
wireSwitch("#chk-aisearch", "aiSearch");

// ── Onboarding tour ───────────────────────────────────────

function buildTourSteps(): TourStep[] {
  const previewModal = $("#file-preview-modal");
  const wasOpen = previewModal.classList.contains("open");
  return [
    {
      selector: "#btn-new-tab",
      title: t("tourStep1Title"),
      body: t("tourStep1Body"),
    },
    {
      selector: "#terminals",
      title: t("tourStep2Title"),
      body: t("tourStep2Body"),
    },
    {
      selector: "#file-preview-modal",
      title: t("tourStep3Title"),
      body: t("tourStep3Body"),
      onEnter: () => previewModal.classList.add("open"),
      onLeave: () => {
        if (!wasOpen) previewModal.classList.remove("open");
      },
    },
    {
      selector: "#btn-global-search",
      title: t("tourStep4Title"),
      body: t("tourStep4Body"),
    },
  ];
}

function tourLabels() {
  return {
    skip: t("tourSkip"),
    next: t("tourNext"),
    done: t("tourDone"),
    stepOf: (i: number, n: number) => t("tourStepOf").replace("{i}", String(i)).replace("{n}", String(n)),
  };
}

function replayTour() {
  $("#settings-modal").classList.add("hidden");
  startTour(buildTourSteps(), tourLabels(), () => {});
}

$<HTMLButtonElement>("#btn-replay-tour").addEventListener("click", replayTour);

const selRestore = $<HTMLSelectElement>("#sel-restore");
selRestore.value = settings.restore;
selRestore.addEventListener("change", () => {
  settings.restore = selRestore.value as Settings["restore"];
  saveSettings();
});

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
  if (settings.tts)
    speak(
      ({ es: "Voz activada", en: "Voice enabled", fr: "Voix activée", it: "Voce attivata" } as const)[
        settings.lang
      ] ?? "Voice enabled",
    );
});

// ── CLI detection ─────────────────────────────────────────

const CLI_NAMES = ["claude", "opencode", "codex"];

const cliAvailable: Record<string, boolean> = {};

function cliButtons(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>("button[data-cmd]")];
}

// Launchers only offer CLIs that are actually on the system: undetected
// ones are hidden, not shown greyed-out with an install affordance.
async function refreshCliButtons() {
  try {
    const found = await invoke<boolean[]>("detect_clis", { names: CLI_NAMES });
    CLI_NAMES.forEach((n, i) => (cliAvailable[n] = found[i]));
  } catch {
    return; // backend without detect_clis: leave buttons as-is
  }
  for (const b of cliButtons()) {
    const cmd = b.dataset.cmd ?? "";
    if (!cmd) continue;
    b.classList.toggle("hidden", cliAvailable[cmd] === false);
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
  newSession(cmd, name, cwd);
}

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
      scheduleJournal();
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
  scheduleJournal();
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

// A promise-based confirm dialog styled like the app's own modals, instead
// of the OS-native message box `@tauri-apps/plugin-dialog`'s ask() renders
// (light background, system buttons) — jarring against the dark UI here.
const confirmModal = $("#confirm-modal");
const confirmTitleEl = $("#confirm-title");
const confirmMessageEl = $("#confirm-message");
const confirmCancelBtn = $("#confirm-cancel");
const confirmOkBtn = $("#confirm-ok");
let confirmResolve: ((v: boolean) => void) | null = null;

function resolveConfirm(v: boolean) {
  if (!confirmResolve) return;
  confirmModal.classList.add("hidden");
  const resolve = confirmResolve;
  confirmResolve = null;
  resolve(v);
}
confirmCancelBtn.addEventListener("click", () => resolveConfirm(false));
confirmOkBtn.addEventListener("click", () => resolveConfirm(true));
confirmModal.addEventListener("click", (e) => {
  if (e.target === confirmModal) resolveConfirm(false);
});
document.addEventListener("keydown", (e) => {
  if (!confirmResolve) return;
  if (e.key === "Escape") {
    e.preventDefault();
    resolveConfirm(false);
  } else if (e.key === "Enter") {
    e.preventDefault();
    resolveConfirm(true);
  }
});

function confirmDialog(message: string, title: string, okLabel: string): Promise<boolean> {
  confirmTitleEl.textContent = title;
  confirmMessageEl.textContent = message;
  confirmCancelBtn.textContent = t("cancel");
  confirmOkBtn.textContent = okLabel;
  confirmModal.classList.remove("hidden");
  confirmCancelBtn.focus();
  return new Promise((resolve) => {
    confirmResolve = resolve;
  });
}

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
  const mod = isMac() ? e.metaKey && !e.ctrlKey : e.ctrlKey;
  if (mod && !e.shiftKey && e.code === "KeyK") {
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
const FILE_EXTS =
  "mdx?|txt|log|json|ya?ml|csv|toml|env|cfg|ini|sh|ps1|diff|patch|tsx?|jsx?|mjs|cjs|py|rs|go|rb|php|c|cc|cpp|h|hpp|java|kt|swift|cs|sql|xml|html?|css|scss|less|vue|svelte|graphql|lua|dockerfile|" +
  IMAGE_EXTS.join("|") +
  "|" +
  MODEL_EXTS.join("|");
// Windows dirs like "Omar Hernandez" or "Program Files" contain spaces, so an
// absolute path (drive letter / ~ / leading slash) allows spaces within its
// segments — bounded with a lazy quantifier so it stops at the first plausible
// extension instead of swallowing the rest of the line. Bare/relative-looking
// fragments (no unambiguous absolute prefix) stay space-free to avoid turning
// ordinary prose ("see the readme in the config.json area") into a fake link.
const FILE_LINK_RE = new RegExp(
  String.raw`(?<!\/\/)(?:(?:[A-Za-z]:[\\/]|~[\\/]|\/)[^\r\n"'|]+?\.(?:${FILE_EXTS})\b|\.{1,2}[\\/][\w.-]+(?:[\\/][\w.-]+)*\.(?:${FILE_EXTS})\b|[\w.-]+(?:[\\/][\w.-]+)*\.(?:${FILE_EXTS})\b)`,
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

// Tracks the live Three.js scene/renderer for the currently open model
// preview (if any) so it can be torn down before the next preview replaces
// the canvas — otherwise each open/close cycle leaks a WebGL context.
let currentModelPreview: ModelPreview | null = null;
function disposeModelPreview() {
  currentModelPreview?.dispose();
  currentModelPreview = null;
}

$("#file-preview-close").addEventListener("click", () => {
  filePreviewModal.classList.remove("open");
  disposeModelPreview();
});

const filePreviewEditBtn = $("#file-preview-edit");

$("#file-preview-copy").addEventListener("click", async () => {
  const text = previewEditing
    ? (filePreviewBody.querySelector("textarea") as HTMLTextAreaElement | null)?.value
    : previewText;
  if (text == null) return;
  await navigator.clipboard.writeText(text);
  showLinkToast(t("filePreviewCopied"));
});

filePreviewEditBtn.addEventListener("click", async () => {
  if (previewText == null) return;
  if (!previewEditing) {
    const textarea = document.createElement("textarea");
    textarea.className = "file-preview-edit-area";
    textarea.value = previewText;
    textarea.spellcheck = false;
    filePreviewBody.className = "file-preview-body plain";
    filePreviewBody.replaceChildren(textarea);
    textarea.focus();
    setPreviewEditing(true);
    return;
  }
  const textarea = filePreviewBody.querySelector("textarea") as HTMLTextAreaElement | null;
  const edited = textarea?.value ?? previewText;
  if (!previewPath) return;
  try {
    await invoke("write_text_file", { path: previewPath, contents: edited });
    previewText = edited;
    setPreviewEditing(false);
    showLinkToast(t("filePreviewSaved"));
    if (MARKDOWN_EXT_RE.test(previewPath)) {
      filePreviewBody.className = "file-preview-body md";
      filePreviewBody.innerHTML = DOMPurify.sanitize(await marked.parse(edited));
    } else {
      const lang = langForPath(previewPath);
      if (lang && hljs.getLanguage(lang)) {
        filePreviewBody.className = "file-preview-body code";
        const html = hljs.highlight(edited, { language: lang }).value;
        filePreviewBody.innerHTML = `<pre><code class="hljs">${DOMPurify.sanitize(html)}</code></pre>`;
      } else {
        filePreviewBody.className = "file-preview-body plain";
        filePreviewBody.textContent = edited;
      }
    }
  } catch (err) {
    showLinkToast(`${t("filePreviewSaveError")}: ${err}`);
  }
});

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
    disposeModelPreview();
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

// Preview state kept alongside the panel so the copy/edit buttons (which
// fire after the async render below has finished) know what they're
// operating on without re-fetching or re-parsing the DOM.
let previewPath: string | null = null;
let previewText: string | null = null; // raw file contents; null for images/errors
let previewEditing = false;

function setPreviewEditing(editing: boolean) {
  previewEditing = editing;
  filePreviewEditBtn.title = t(editing ? "filePreviewSave" : "edit");
  filePreviewEditBtn.classList.toggle("active", editing);
}

async function openFilePreview(raw: string, cwd: string | null) {
  // POSIX absolute paths start with "/" — only meaningful off Windows,
  // where a leading "/" in agent output is instead likely a relative
  // separator artifact and the drive-letter/UNC/~ checks do the work.
  const win = platform.os === "windows";
  const isAbsolute =
    /^[A-Za-z]:[\\/]/.test(raw) ||
    raw.startsWith("\\\\") ||
    raw.startsWith("~") ||
    (!win && raw.startsWith("/"));
  const path = isAbsolute
    ? raw
    : win
      ? `${cwd ?? "."}\\${raw}`.replace(/\//g, "\\")
      : `${cwd ?? "."}/${raw}`;
  disposeModelPreview();
  previewPath = path;
  previewText = null;
  setPreviewEditing(false);
  filePreviewEditBtn.classList.remove("hidden");
  filePreviewTitle.textContent = raw;
  filePreviewBody.className = "file-preview-body plain";
  filePreviewBody.textContent = "…";
  filePreviewModal.classList.add("open");
  ignoreNextOutsideClick = true;
  setTimeout(() => (ignoreNextOutsideClick = false), 0);
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1].toLowerCase();
  if (ext && IMAGE_EXTS.includes(ext)) {
    filePreviewEditBtn.classList.add("hidden");
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
  if (ext && MODEL_EXTS.includes(ext)) {
    filePreviewEditBtn.classList.add("hidden");
    filePreviewBody.className = "file-preview-body model";
    filePreviewBody.replaceChildren();
    const canvas = document.createElement("canvas");
    filePreviewBody.appendChild(canvas);
    try {
      const { renderModelPreview } = await import("./modelPreview");
      currentModelPreview = await renderModelPreview(canvas, path, ext);
    } catch (err) {
      filePreviewBody.className = "file-preview-body plain";
      filePreviewBody.textContent = `${t("filePreviewError")}: ${path}\n${err}`;
    }
    return;
  }
  try {
    const text = await invoke<string>("read_text_file", { path });
    previewText = text;
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
    filePreviewEditBtn.classList.add("hidden");
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

// ── AI command search (F3): '#' / Ctrl+Space in shell tabs ─
//
// Natural language → one shell command via the user's installed Claude
// Code in print mode (`claude -p`, invoked in Rust). The result is only
// ever *inserted* at the prompt — no trailing newline, never executed.

const askStrip = $("#ask-strip");
const askInput = $<HTMLInputElement>("#ask-input");
const askCmdEl = $("#ask-cmd");
const askExplainEl = $("#ask-explain");
const askStatusEl = $("#ask-status");
const askInsertBtn = $<HTMLButtonElement>("#ask-insert");
const askExplainBtn = $<HTMLButtonElement>("#ask-explain-btn");

let askSession: Session | null = null;
let askCommand = "";
let askLastQuery = "";
// Sequence guard: closing the strip or asking again must orphan any reply
// still in flight (claude -p can take seconds).
let askSeq = 0;

function openAskStrip(s: Session) {
  askSession = s;
  askCommand = "";
  askLastQuery = "";
  askInput.value = "";
  askInput.placeholder = t("askPlaceholder");
  askCmdEl.classList.add("hidden");
  askExplainEl.classList.add("hidden");
  askInsertBtn.classList.add("hidden");
  askExplainBtn.classList.add("hidden");
  askStatusEl.textContent = t("askHint");
  askStrip.classList.remove("hidden");
  askInput.focus();
}

function closeAskStrip() {
  askSeq++;
  askStrip.classList.add("hidden");
  askSession?.term.focus();
  askSession = null;
}

function shellLang(): string {
  return platform.os === "windows" ? "powershell" : "bash";
}

// claude -p tends to wrap code in fences despite instructions; unwrap.
function stripFences(s: string): string {
  return s
    .replace(/^```[a-z]*\s*\n?/i, "")
    .replace(/\n?```\s*$/, "")
    .trim();
}

async function runAsk() {
  const q = askInput.value.trim();
  if (!q || !askSession) return;
  const seq = ++askSeq;
  askLastQuery = q;
  askStatusEl.textContent = t("askThinking");
  askCmdEl.classList.add("hidden");
  askExplainEl.classList.add("hidden");
  askInsertBtn.classList.add("hidden");
  askExplainBtn.classList.add("hidden");
  const target =
    platform.os === "windows" ? "ONE PowerShell command for Windows" : "ONE POSIX shell command";
  const prompt =
    `You translate a request into exactly ${target}. ` +
    `Reply with the command only — no prose, no code fences, no explanation.\n\nRequest: ${q}`;
  try {
    const res = await invoke<string>("ask_claude", { prompt, cwd: askSession.cwd });
    if (seq !== askSeq) return;
    askCommand = stripFences(res);
    const lang = shellLang();
    askCmdEl.innerHTML = hljs.getLanguage(lang)
      ? DOMPurify.sanitize(hljs.highlight(askCommand, { language: lang }).value)
      : "";
    if (!askCmdEl.innerHTML) askCmdEl.textContent = askCommand;
    askCmdEl.classList.remove("hidden");
    askInsertBtn.classList.remove("hidden");
    askExplainBtn.classList.remove("hidden");
    askStatusEl.textContent = t("askResultHint");
  } catch (err) {
    if (seq !== askSeq) return;
    // A spawn failure means the binary wasn't found — point at the wizard.
    const missing = cliAvailable["claude"] === false || /^spawn:/.test(String(err));
    askStatusEl.textContent = missing ? `⚠ ${t("askMissing")}` : `⚠ ${String(err).slice(0, 200)}`;
  }
}

function askInsert() {
  if (!askCommand || !askSession) return;
  invoke("write_pty", { id: askSession.id, data: askCommand }).catch(() => {});
  closeAskStrip();
}

async function askExplain() {
  if (!askCommand || !askSession) return;
  if (!askExplainEl.classList.contains("hidden")) {
    askExplainEl.classList.add("hidden");
    return;
  }
  const seq = askSeq;
  askExplainEl.textContent = "…";
  askExplainEl.classList.remove("hidden");
  try {
    const res = await invoke<string>("ask_claude", {
      prompt: `Explain briefly (2-3 sentences, plain text, same language as this UI locale: ${settings.lang}) what this ${shellLang()} command does:\n${askCommand}`,
      cwd: askSession.cwd,
    });
    if (seq !== askSeq) return;
    askExplainEl.textContent = res;
  } catch (err) {
    if (seq !== askSeq) return;
    askExplainEl.textContent = `⚠ ${String(err).slice(0, 200)}`;
  }
}

askInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    // Same question with a result on screen → insert; anything else → ask.
    if (askCommand && askInput.value.trim() === askLastQuery) askInsert();
    else runAsk();
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeAskStrip();
  } else if (e.key.toLowerCase() === "e" && e.ctrlKey) {
    e.preventDefault();
    askExplain();
  }
});
askInsertBtn.addEventListener("click", askInsert);
askExplainBtn.addEventListener("click", () => askExplain());
$("#ask-close").addEventListener("click", closeAskStrip);

// ── Palette '>' actions ────────────────────────────────────
//
// The palette window owns the action list and fuzzy search (palette.ts);
// each id maps here onto a handler the app already has. Anything that
// needs the user to see the result brings the overlay up first.

const PALETTE_ACTIONS: Record<string, () => void> = {
  "new-claude": () => {
    invoke("show_overlay").catch(() => {});
    launchCli("claude", "Claude Code", pickedFolder);
  },
  "new-opencode": () => {
    invoke("show_overlay").catch(() => {});
    launchCli("opencode", "OpenCode", pickedFolder);
  },
  "new-codex": () => {
    invoke("show_overlay").catch(() => {});
    launchCli("codex", "Codex", pickedFolder);
  },
  "new-shell": () => {
    invoke("show_overlay").catch(() => {});
    launchCli("", platform.os === "windows" ? "PowerShell" : "Shell", pickedFolder);
  },
  "new-picker": () => {
    invoke("show_overlay").catch(() => {});
    forceEmptyState = true;
    updateEmptyState();
  },
  "next-theme": () => {
    const keys = Object.keys(THEMES);
    settings.theme = keys[(keys.indexOf(settings.theme) + 1) % keys.length];
    saveSettings();
    applyTheme();
    setThemePickerLabel();
    renderThemeMenu();
  },
  "toggle-ghost": () => {
    invoke("set_ghost_mode", { enabled: !overlayEl.classList.contains("ghost") }).catch(() => {});
  },
  "toggle-dnd": () => {
    dndOverride = !dndSilent();
    dndChanged();
  },
  "toggle-hud": () => {
    settings.hud = !settings.hud;
    saveSettings();
    $<HTMLInputElement>("#chk-hud").checked = settings.hud;
  },
  "toggle-window-mode": () => setOverlayMode(!settings.overlayMode),
  "open-settings": () => {
    invoke("show_overlay").catch(() => {});
    $("#settings-modal").classList.remove("hidden");
  },
  "open-help": () => {
    invoke("show_overlay").catch(() => {});
    helpModal.classList.remove("hidden");
  },
  "session-search": () => {
    invoke("show_overlay").catch(() => {});
    openGlobalSearch();
  },
  "jump-waiting": () => {
    const waiting = [...sessions.values()].find(
      (s) => s.cmd && s.alive && sessionState(s) === "waiting",
    );
    invoke("show_overlay").catch(() => {});
    if (waiting) setActive(waiting.id);
  },
  "close-session": () => {
    if (activeId) closeSession(activeId);
  },
  "copy-last-block": () => {
    const s = activeId ? sessions.get(activeId) : null;
    if (s && !s.blocks.copyLastOutput()) showLinkToast(t("noBlockToCopy"));
  },
};

listen<string>("palette-action", (e) => {
  PALETTE_ACTIONS[e.payload]?.();
});

// ── Session restore (F4) ──────────────────────────────────

let restorePending = false;
// sessions.set happens after newSession's first await, so sessions.size may
// still read 0 when the auto-launch check runs — this flag closes that race.
let restoredLayout = false;

function restoreAll(entries: JournalEntry[]) {
  restorePending = false;
  restoredLayout = entries.length > 0;
  $("#restore-banner").classList.add("hidden");
  for (const e of entries) {
    // Only Claude Code has a resumable-conversation launch flag today.
    const offerResume = /^claude(\s|$)/.test(e.cmd);
    newSession(e.cmd, e.title, e.cwd, { exactTitle: true, color: e.color, offerResume });
  }
}

function maybeRestore() {
  const journal = readJournal();
  if (settings.restore === "never" || !journal.length) return;
  if (settings.restore === "always") {
    restoreAll(journal);
    return;
  }
  restorePending = true;
  $("#restore-text").textContent = t("restoreBannerText").replace(
    "{n}",
    String(journal.length),
  );
  const yes = $<HTMLButtonElement>("#restore-yes");
  yes.textContent = t("restoreBtn");
  yes.onclick = () => restoreAll(journal);
  $("#restore-close").onclick = () => {
    restorePending = false;
    $("#restore-banner").classList.add("hidden");
  };
  $("#restore-banner").classList.remove("hidden");
}

// ── Boot ──────────────────────────────────────────────────

applyTheme();
applyI18n();
updateEmptyState();
maybeRestore();
refreshCliButtons().then(() => {
  // Auto-launch: warm up Claude Code in the last folder while the user
  // is still tabbing into their game. A restored (or restorable) layout
  // takes precedence — auto-launching next to it would duplicate tabs.
  if (
    settings.autoLaunch &&
    sessions.size === 0 &&
    !restorePending &&
    !restoredLayout &&
    cliAvailable["claude"] !== false
  ) {
    launchCli("claude", "Claude Code", pickedFolder);
  }
});

// First run: walk the user through the core UI once. The static help
// card (still reachable any time via the help button) stays available
// as reference material afterward.
if (!localStorage.getItem("tour-seen")) {
  localStorage.setItem("tour-seen", "1");
  startTour(buildTourSteps(), tourLabels(), () => {});
}
