import React from "react";
import { Modal, SetNote, WizardStep, InboxButton } from "afkode-ds";

// WizardStep rows live in the setup-wizard Modal (settings-width card).
const stage = (height: number): React.CSSProperties => ({
  position: "relative",
  height,
  background: "rgba(23, 25, 32, 0.96)",
  border: "1px solid rgba(255, 255, 255, 0.07)",
  borderRadius: 12,
  overflow: "hidden",
});

/** Status sweep — pending, busy (pulsing accent), and ok in one wizard. */
export const StatusSweep = () => (
  <div style={stage(360)}>
    <Modal title="First-run setup" variant="settings">
      <SetNote>
        AFKode installs anything missing. You can close this and come back.
      </SetNote>
      <WizardStep
        status="ok"
        title="Terminal backend"
        note="PowerShell 7 detected"
      />
      <WizardStep
        status="busy"
        title="Claude Code CLI"
        note="Installing via npm — about 30 s"
        action={<InboxButton disabled>Installing…</InboxButton>}
      />
      <WizardStep
        status="pending"
        title="Launch first session"
        note="Pick a project folder and start an agent"
      />
    </Modal>
  </div>
);

/** Fresh wizard — every step pending with its install action. */
export const AllPending = () => (
  <div style={stage(340)}>
    <Modal title="First-run setup" variant="settings">
      <WizardStep
        status="pending"
        title="Terminal backend"
        note="Node-pty needs a local shell"
        action={<InboxButton ok>Install</InboxButton>}
      />
      <WizardStep
        status="pending"
        title="Claude Code CLI"
        note="npm install -g @anthropic-ai/claude-code"
        action={<InboxButton ok>Install</InboxButton>}
      />
      <WizardStep
        status="pending"
        title="Launch first session"
        note="Pick a project folder and start an agent"
        action={<InboxButton ok>Launch</InboxButton>}
      />
    </Modal>
  </div>
);
