---
category: Navigation
---

Window titlebar: brand mark left, children in the middle (typically `Tabs` + an add `Button` + `HeaderSearch`), and a right-aligned `controls` cluster of icon Buttons. 40px tall on the bar surface.

```tsx
<Titlebar controls={<><Button><GearSvg/></Button><Button variant="close"><XSvg/></Button></>}>
  <Tabs>…</Tabs>
  <Button variant="add">+</Button>
  <HeaderSearch shortcut="Ctrl K">Search sessions…</HeaderSearch>
</Titlebar>
```
