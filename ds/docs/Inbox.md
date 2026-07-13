---
category: Panels
---

Floating inbox panel (top-right) listing agent sessions that need attention. Children are `InboxRow`s. Positions absolutely — needs a positioned ancestor.

```tsx
<Inbox title="Inbox — 2 sessions">
  <InboxRow state="waiting" title="afkode · claude" detail="Permission needed" actions={<InboxButton ok>Approve</InboxButton>} />
  <InboxRow state="done" title="micuento" detail="Finished" />
</Inbox>
```
