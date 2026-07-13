---
category: Status
---

Bottom status bar: session path in `left`, `GitChip`s and `ModeBadge` as children in the middle, a hint in `right`. 25px tall on the bar surface.

```tsx
<StatusBar left="~/projects/afkode" right={<>hide <Kbd>Alt Space</Kbd></>}>
  <GitChip>main</GitChip>
  <GitChip kind="added">+42</GitChip>
  <GitChip kind="removed">−7</GitChip>
  <ModeBadge active>overlay</ModeBadge>
</StatusBar>
```
