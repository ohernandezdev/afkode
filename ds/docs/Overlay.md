---
category: Layout
---

Root application panel — the translucent deep-slate rounded surface every AFKode screen lives inside. Every design should start here: compose a `Titlebar` on top, a dark main area (`position: relative` so floating panels can anchor), and a `StatusBar` at the bottom. `ghost` dims the whole panel like AFKode's click-through mode.

```tsx
<Overlay style={{ height: 600 }}>
  <Titlebar controls={…}>…</Titlebar>
  <main style={{ flex: 1, position: "relative" }}>…</main>
  <StatusBar left="~/projects/afkode" right={<Kbd>Alt Space</Kbd>} />
</Overlay>
```
