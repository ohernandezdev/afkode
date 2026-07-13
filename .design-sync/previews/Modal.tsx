import React from "react";
import { Modal, HelpList, SettingsRow, SetNote, Switch, Kbd } from "afkode-ds";

// .help-modal fills its nearest positioned ancestor with a blurred backdrop.
const stage = (height: number): React.CSSProperties => ({
  position: "relative",
  height,
  background: "rgba(23, 25, 32, 0.96)",
  border: "1px solid rgba(255, 255, 255, 0.07)",
  borderRadius: 12,
  overflow: "hidden",
});

/** The keyboard-shortcuts help modal — text-heavy list entries. */
export const HelpShortcuts = () => (
  <div style={stage(420)}>
    <Modal title="Shortcuts">
      <HelpList>
        <li>
          <b>Show / hide overlay</b> — press <Kbd>Alt Space</Kbd> anywhere. The
          terminal keeps running while hidden.
        </li>
        <li>
          <b>Ghost mode</b> — <Kbd>Alt G</Kbd> makes the window click-through so
          you can read output while working underneath.
        </li>
        <li>
          <b>Search sessions</b> — <Kbd>Ctrl K</Kbd> opens the global session
          switcher; type to filter by name or folder.
        </li>
        <li>
          <b>Find in terminal</b> — <Kbd>Ctrl F</Kbd> searches the active
          session's scrollback.
        </li>
      </HelpList>
    </Modal>
  </div>
);

/** The settings card: rows with switches and explanatory notes. */
export const Settings = () => (
  <div style={stage(360)}>
    <Modal title="Settings" variant="settings">
      <SettingsRow label="Notifications">
        <Switch defaultChecked />
      </SettingsRow>
      <SettingsRow label="Sound">
        <Switch />
      </SettingsRow>
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
