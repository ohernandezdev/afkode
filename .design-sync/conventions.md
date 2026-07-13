# AFKode design system — how to build with it

AFKode is a **dark, Warp-style terminal overlay**. There is no theme provider and no utility-class framework — components are styled by plain CSS classes shipped in `styles.css`, tuned for a dark translucent panel.

## Surface first (nothing reads on white)

Every screen starts with `Overlay` — the deep-slate rounded panel all AFKode UI lives on. Give it an explicit size (the app uses `100vh`; in a design set width/height inline). Compose top-to-bottom: `Titlebar`, a main area with `style={{ flex: 1, position: "relative" }}`, then `StatusBar`.

Floating pieces (`Inbox`, `SearchBar`, `Modal`, `EmptyState`, `Loader`, `AwayBanner`, `LinkToast`, `GhostBadge`, `FilePreviewPanel`) position absolutely and fill/anchor to the **nearest positioned ancestor** — that main area div. Standalone sections you add yourself should sit on `background: "rgba(23,25,32,0.96)"` with `border: "1px solid var(--border)"` and `borderRadius: "var(--radius)"`.

## Styling idiom: component classes + CSS variables, inline styles for glue

Style your own layout glue with **inline styles using the tokens** — do not invent class names (there is no Tailwind here):

- `var(--accent)` #d97757 (brand orange) · `var(--accent-soft)` (14% tint for active/selected fills)
- `var(--text)` #c9d1d9 · `var(--text-dim)` #8b93a1
- `var(--border)` rgba(255,255,255,0.07) · `var(--radius)` 12px
- Panel surfaces: `rgba(var(--panel-rgb), var(--panel-alpha))`; bars: `rgba(var(--bar-rgb), var(--panel-alpha))`
- State colors used across dots/chips: green `#67c987`, amber `#e5c07b`, red `#e06c75`, grey `#5b616d`
- Type: "Segoe UI Variable Text" fallback system-ui at 13px base; monospace is "Cascadia Mono" (shipped in `fonts/`)

## Composition rules that bite

- `Switch` is styled **only inside `SettingsRow`**; `LauncherButton` **only inside `Launchers`** — bare instances render browser-default.
- `Tabs` caps itself at `max-width: 55%` (titlebar assumption) — pass `style={{ maxWidth: "100%" }}` when used outside a `Titlebar`.
- `Button` is an icon button (~30×27px): give it a 12–14px inline SVG or short glyph, never a text label. Text actions use `InboxButton`; pill toggles use `Chip`; keyboard hints use `Kbd`.
- Tab/inbox state dots carry meaning: working = accent, waiting = blinking amber, done = green, dead/exit = grey. Keep that mapping.

## Where the truth lives

Read `styles.css` (tokens in `:root`, every component class, all animations) and its imports `fonts/fonts.css` + `_ds_bundle.css` before styling anything custom. Each component's API is its `.d.ts`; usage and composition patterns are in its `.prompt.md`.

## Idiomatic frame

```tsx
import { Overlay, Titlebar, Tabs, Tab, Button, HeaderSearch, StatusBar, GitChip, ModeBadge, Kbd, Inbox, InboxRow, InboxButton } from "afkode-ds";

<Overlay style={{ width: 960, height: 600 }}>
  <Titlebar controls={<Button variant="close" aria-label="Close">✕</Button>}>
    <Tabs>
      <Tab active state="working" closable>afkode · claude</Tab>
      <Tab state="waiting" closable>micuento · claude</Tab>
    </Tabs>
    <Button variant="add">+</Button>
    <HeaderSearch shortcut="Ctrl K">Search sessions…</HeaderSearch>
  </Titlebar>
  <main style={{ flex: 1, position: "relative" }}>
    <Inbox title="Inbox — 1 session">
      <InboxRow state="waiting" title="afkode · claude" detail="Permission needed" actions={<InboxButton ok>Approve</InboxButton>} />
    </Inbox>
  </main>
  <StatusBar left="~/projects/afkode" right={<>hide <Kbd>Alt Space</Kbd></>}>
    <GitChip>main</GitChip>
    <GitChip kind="added">+42</GitChip>
    <ModeBadge active>overlay</ModeBadge>
  </StatusBar>
</Overlay>
```
