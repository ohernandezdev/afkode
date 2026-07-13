import React from "react";
import { Modal, SettingsRow, SetNote, Switch } from "afkode-ds";

// SetNote is the dim explanatory paragraph inside the settings Modal.
const stage = (height: number): React.CSSProperties => ({
  position: "relative",
  height,
  background: "rgba(23, 25, 32, 0.96)",
  border: "1px solid rgba(255, 255, 255, 0.07)",
  borderRadius: 12,
  overflow: "hidden",
});

/** Note under a settings row, explaining what the toggle does. */
export const UnderRow = () => (
  <div style={stage(260)}>
    <Modal title="Settings" variant="settings">
      <SettingsRow label="Claude hooks">
        <Switch defaultChecked />
      </SettingsRow>
      <SetNote>
        Hooks let AFKode show live agent state on each tab — working, waiting
        for you, or done.
      </SetNote>
    </Modal>
  </div>
);

/** Standalone intro note at the top of a card, like the wizard intro. */
export const Intro = () => (
  <div style={stage(220)}>
    <Modal title="First-run setup" variant="settings">
      <SetNote>
        AFKode needs a terminal backend and at least one agent CLI. This
        wizard installs anything missing — it takes about a minute.
      </SetNote>
    </Modal>
  </div>
);
