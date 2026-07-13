---
category: Status
---

Top-center accent-bordered banner summarizing what happened while the user was away. `action` takes a trailing `InboxButton`. Positions absolutely — needs a positioned ancestor.

```tsx
<AwayBanner action={<InboxButton ok>Review</InboxButton>}>
  2 sessions finished while you were away
</AwayBanner>
```
