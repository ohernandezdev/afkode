---
category: Status
---

Rounded status-bar chip for git state. `kind="branch"` (default) shows the branch icon; `added`/`removed` tint green/red for diff counts; `dirty` is the small amber dot.

```tsx
<GitChip>main</GitChip>
<GitChip kind="added">+42</GitChip>
<GitChip kind="dirty">●</GitChip>
```
