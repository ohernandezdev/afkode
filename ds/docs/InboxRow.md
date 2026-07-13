---
category: Panels
---

One inbox entry: state dot (`waiting` = blinking amber, `done` = green, `exit` = grey), bold `title` + dim `detail`, trailing `actions` (InboxButtons). Compose inside `Inbox`.

```tsx
<InboxRow state="waiting" title="afkode · claude" detail="Waiting for your reply" actions={<InboxButton ok>Reply</InboxButton>} />
```
