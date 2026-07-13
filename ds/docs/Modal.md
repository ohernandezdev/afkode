---
category: Panels
---

Centered modal with dimmed blurred backdrop and a rounded card — AFKode's help, settings, wizard, and global-search surfaces. `variant="settings"` narrows the card; `variant="search"` is the compact palette card. Fills its nearest positioned ancestor.

```tsx
<Modal title="Shortcuts" onClose={…}>
  <HelpList>
    <li><b>Ghost mode</b> — <Kbd>Alt G</Kbd> …</li>
  </HelpList>
</Modal>
```
