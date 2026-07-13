import React from "react";
import { Switch, SettingsRow } from "afkode-ds";

// .switch is only styled under .set-row, so each cell hosts the Switch in a
// SettingsRow, like the app's settings modal.
const panel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  background: "rgba(23,25,32,0.96)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 12,
  padding: 14,
  width: 300,
};

/** Checked switch in a settings row. */
export const Checked = () => (
  <div style={panel}>
    <SettingsRow label="Launch at login">
      <Switch defaultChecked />
    </SettingsRow>
  </div>
);

/** Unchecked switch in a settings row. */
export const Unchecked = () => (
  <div style={panel}>
    <SettingsRow label="Ghost mode on blur">
      <Switch />
    </SettingsRow>
  </div>
);

/** A short settings group mixing both states. */
export const SettingsGroup = () => (
  <div style={panel}>
    <SettingsRow label="Notify when a session waits">
      <Switch defaultChecked />
    </SettingsRow>
    <SettingsRow label="Always on top">
      <Switch />
    </SettingsRow>
  </div>
);
