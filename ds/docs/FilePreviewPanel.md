---
category: Panels
---

Slide-in file preview sidebar docked to the right edge (`open` slides it in). `mode` picks body treatment: `md` rendered markdown, `code` highlighted source, `plain` monospace. Positions absolutely — needs a positioned ancestor.

```tsx
<FilePreviewPanel open title="README.md" mode="md">
  <h1>AFKode</h1>
  <p>Terminal overlay for agents…</p>
</FilePreviewPanel>
```
