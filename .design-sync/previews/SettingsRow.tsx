import React from "react";
import { Modal, SettingsRow, Switch } from "afkode-ds";

// SettingsRow lives inside the settings-variant Modal (narrow card).
const stage = (height: number): React.CSSProperties => ({
  position: "relative",
  height,
  background: "rgba(23, 25, 32, 0.96)",
  border: "1px solid rgba(255, 255, 255, 0.07)",
  borderRadius: 12,
  overflow: "hidden",
});

/** Toggle rows: label left, Switch right. */
export const Switches = () => (
  <div style={stage(300)}>
    <Modal title="Settings" variant="settings">
      <SettingsRow label="Notifications">
        <Switch defaultChecked />
      </SettingsRow>
      <SettingsRow label="Sound">
        <Switch />
      </SettingsRow>
      <SettingsRow label="Launch at login">
        <Switch defaultChecked />
      </SettingsRow>
    </Modal>
  </div>
);

/** Select controls, like the font and language pickers. */
export const Selects = () => (
  <div style={stage(280)}>
    <Modal title="Settings" variant="settings">
      <SettingsRow label="Font">
        <select defaultValue="Cascadia Mono">
          <option>Cascadia Mono</option>
          <option>Consolas</option>
          <option>JetBrains Mono</option>
        </select>
      </SettingsRow>
      <SettingsRow label="Language">
        <select defaultValue="English">
          <option>Español</option>
          <option>English</option>
        </select>
      </SettingsRow>
    </Modal>
  </div>
);

/** Range control, like the window-opacity slider. */
export const Slider = () => (
  <div style={stage(240)}>
    <Modal title="Settings" variant="settings">
      <SettingsRow label="Opacity">
        <input type="range" min={55} max={100} defaultValue={96} />
      </SettingsRow>
    </Modal>
  </div>
);
