---
category: Actions
---

Square, quiet icon button used across the titlebar, panels, and modals — put a 12–14px inline SVG (or a short glyph) as children. `variant="close"` turns red on hover for window close; `variant="add"` is the + new-tab button; `active` gives the accent-tinted toggled-on state.

```tsx
<Button aria-label="Settings"><GearSvg /></Button>
<Button variant="close" aria-label="Close"><XSvg /></Button>
<Button variant="add">+</Button>
```
