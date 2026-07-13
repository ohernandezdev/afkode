---
category: Empty state
---

New-session empty state filling the terminal area: big brand dot, a title, then composed `PickFolder`, `Recents`, `Launchers`, and a `Chip` flag row. Positions absolutely — needs a positioned ancestor.

```tsx
<EmptyState title="Start a session">
  <PickFolder>C:\\Projects\\afkode</PickFolder>
  <Recents>…</Recents>
  <Launchers>…</Launchers>
</EmptyState>
```
