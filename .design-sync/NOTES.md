# design-sync notes — afkode

- afkode is a Tauri **application** (vanilla TS + Vite), not a component library. The user explicitly chose to sync it anyway. The synced package is `ds/` — thin React wrappers authored for this sync that bind the app's real CSS classes; the design truth is `src/styles.css`, shipped verbatim.
- `ds/build-css.mjs` generates `ds/dist/styles.css` from `../src/styles.css`, stripping the two `node_modules` `@import`s (xterm, highlight.js) — they style terminal internals and don't resolve outside the app build. If `src/styles.css` changes, rebuild `ds/` before the converter.
- Wrapper markup mirrors `index.html` — when the app's markup for a pattern changes, update the matching wrapper in `ds/src/`.
- Fonts are OS-provided ("Segoe UI Variable Text", "Cascadia Mono", Consolas) — nothing to ship; expect font warnings to be triaged as system-font fallbacks.
- Several components position absolutely (`Loader`, `Inbox`, `SearchBar`, `EmptyState`, `AwayBanner`, `LinkToast`, `GhostBadge`, `FilePreviewPanel`, `Modal`) — previews wrap them in a `position: relative` sized container (the shared "stage" div pattern in previews/Inbox.tsx).
- Parent-selector-only styling: `Switch` (`.switch`) is styled only via `.set-row input.switch` → must sit inside `SettingsRow`; `LauncherButton` only via `.launchers button` → must sit inside `Launchers`. A bare instance renders browser-default.
- `.tabs` self-caps at `max-width: 55%` (titlebar assumption) — isolated strips need `style={{ maxWidth: "100%" }}`.
- `.overlay` is `height: 100vh` — previews size it inline (e.g. 640×420); `Loader`/`.empty-state` fill the nearest positioned ancestor.
- `PickFolder`/`RecentCard` long paths use `direction: rtl` ellipsis — constrain wrapper width to demonstrate truncation.
- `SearchBar` children REPLACE the default close button — include your own close Button when adding prev/next.
- FilePreviewPanel `mode="code"` has no hljs in previews (app injects it at runtime) — plain `<pre>` is faithful. The opacity slider is a bare native range input — native look is faithful.
- Animated states (waiting blink, busy pulse) can capture mid-fade and look dim on sheets — grade structure, not caught opacity.

## Known render warns
- (none — validate warns previously seen: [FONT_MISSING] Cascadia Mono resolved via ds/fonts/cascadia.css + extraFonts; two [RENDER_BLANK] floor cards fixed by authored previews.)

## Re-sync risks
- The `ds/` wrapper package is hand-authored against `src/styles.css` and `index.html` — if the app's classes or markup change, wrappers/previews go stale silently until a re-sync render check catches missing styling. Rebuild `ds/` (`cd ds && npm run build`) before every converter run; `ds/dist/styles.css` is generated from `src/styles.css` at build time.
- Cascadia Mono woff2s were fetched once from microsoft/cascadia-code v2407.24 (SIL OFL) and committed under `ds/fonts/` — nothing fetches at re-sync time.
- Preview grades assume the app stays dark-themed with the same token values; a theme overhaul warrants a full re-verify (`--force`-equivalent).
- Segoe UI Variable Text is an OS font, deliberately not shipped — non-Windows viewers fall back to system-ui (accepted).
