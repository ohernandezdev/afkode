---
name: qa-visual
description: Use when you need to launch, run, drive, or visually verify AFKode itself — reproducing UI/terminal bugs (scroll, rendering, last line hidden, layout), taking screenshots of the real app, typing into a live Claude Code tab, or acting as QA after a change to src/ or src-tauri/.
---

# QA visual de AFKode (build + CDP + screenshots)

## Overview

AFKode es Tauri 2 + WebView2. El release no trae devtools, pero WebView2
acepta depuración remota vía variable de entorno al lanzar. Con
`playwright-core` conectado por CDP se puede manejar la UI real, escribir
en un tab de Claude Code de verdad y capturar pantalla para verificar
visualmente.

**Principio: una prueba visual = lanzar la app real, manejarla, y LEER el
screenshot.** Un frame en blanco es un fallo de lanzamiento, no un pass.

## Preflight (obligatorio, en orden)

1. **¿Estoy corriendo dentro de AFKode?** Si el ancestro del proceso es
   `afkode.exe`, matar la app mata esta sesión. Verifica:
   ```powershell
   $p = Get-CimInstance Win32_Process -Filter "ProcessId = $PID"
   while ($p) { $p.Name; $p = Get-CimInstance Win32_Process -Filter "ProcessId = $($p.ParentProcessId)" -ErrorAction SilentlyContinue }
   ```
   Si aparece `afkode.exe` en la cadena: NO cierres la app; pide al usuario
   correr la prueba desde otra terminal.
2. **Instancia corriendo:** `tauri-plugin-single-instance` hace que un
   segundo lanzamiento solo enfoque la primera. Hay que cerrar la que corre:
   `(Get-Process afkode).CloseMainWindow()`, espera 3s, y si sigue viva
   `Stop-Process -Force`. El session restore reofrece los tabs al reabrir,
   no se pierde nada.

## Build

```powershell
npm run tauri build -- --no-bundle   # solo el exe, sin instaladores (~2-3 min)
# exe: src-tauri\target\release\afkode.exe
```

Para cambios solo de frontend igual hace falta el build completo: el exe
embebe `dist/`.

## Lanzar con CDP

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9333'
Start-Process 'C:\Projects\afkode\src-tauri\target\release\afkode.exe'
# verificar: Invoke-WebRequest http://127.0.0.1:9333/json/version
```

La variable solo aplica a procesos lanzados desde esa shell.

## Driver

Usa/adapta [drive.js](drive.js) (probado). Setup una vez por scratchpad:
`npm init -y; npm i playwright-core`, y ejecuta `node drive.js` **desde el
scratchpad** para que `require("playwright-core")` resuelva.

**Solo inspección (instancia ya corriendo):** salta el bloque que abre tab
(`#btn-new-tab` + launcher) — clickearlo muta la sesión viva del usuario.
Conecta, screenshot, geometría, y nada más.

Claves:

| Qué | Cómo |
|---|---|
| Conectar | `chromium.connectOverCDP("http://127.0.0.1:9333")` |
| Página principal | url `http://tauri.localhost/` (hud/palette son otras páginas) |
| Estado UI | `#tabs .tab`, `#empty-state` (oculto = hay sesión activa), `.resume-bar` |
| Abrir tab | `#btn-new-tab` fuerza el picker; launchers = `button[data-cmd]` (`claude`, `""` = shell) |
| Esperar a Claude Code | poll hasta que `.term-loader` desaparezca (~10-30 s) |
| Escribir en el terminal | focus a `.term-pane.active textarea.xterm-helper-textarea`, luego `page.keyboard.type(text, {delay: 3})` |
| No enviar el prompt | simplemente no mandes Enter |
| Verificar | `page.screenshot()` y **leer la imagen** con la herramienta Read |
| Geometría | comparar rects de `.term-pane.active`, `.xterm-screen` y el textarea (posición del cursor) |
| Título de tab | `textContent` incluye el glifo `×` del botón cerrar — no hagas match exacto |

**Invariantes de geometría (pass/fail):** `.xterm-screen` contenido en el
pane; `screen.bottom ≤ pane.bottom + 0.5` (si no, hay filas recortadas —
el bug clásico de "última línea invisible"); el textarea (celda del cursor)
dentro del rect del screen.

## Cleanup

- Mata la instancia de prueba (`Stop-Process`) o déjala si el usuario va a
  seguir usándola — pero avisa que tiene el puerto de debugging abierto.
- Si cerraste la app instalada del usuario (`AppData\Local\AFKode\afkode.exe`),
  reláncala o avisa explícitamente qué quedó corriendo.

## Common mistakes

| Error | Realidad |
|---|---|
| Lanzar segunda instancia para probar | single-instance la reduce a un focus de la primera; cierra la vieja primero |
| Buscar devtools en el release | no está compilado; usa `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` |
| Matar afkode sin chequear ancestría | si esta sesión corre dentro de afkode, te suicidas |
| `page.keyboard.type` sin enfocar el xterm | el texto va a ninguna parte; enfoca el `textarea.xterm-helper-textarea` del pane activo |
| Declarar éxito sin leer el screenshot | el screenshot es la evidencia; hay que mirarlo |
| Probar justo tras `spawn` | Claude Code tarda; espera a que `.term-loader` desaparezca |
