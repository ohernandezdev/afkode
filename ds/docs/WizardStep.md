---
category: Panels
---

Setup-wizard step row: status glyph (`pending` ○, `busy` pulsing accent ●, `ok` green ✓), bold `title` + dim `note`, trailing `action` button. Compose inside a settings-variant `Modal`.

```tsx
<WizardStep status="ok" title="Install Node.js" note="v22 detected" />
<WizardStep status="busy" title="Install Claude Code" note="npm i -g @anthropic-ai/claude-code" action={<InboxButton>Log</InboxButton>} />
```
