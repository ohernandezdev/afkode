import React from "react";
import { Modal, HelpList, Kbd } from "afkode-ds";

// HelpList lives inside the help Modal, which fills its nearest
// positioned ancestor with a blurred backdrop.
const stage = (height: number): React.CSSProperties => ({
  position: "relative",
  height,
  background: "rgba(23, 25, 32, 0.96)",
  border: "1px solid rgba(255, 255, 255, 0.07)",
  borderRadius: 12,
  overflow: "hidden",
});

/** Several shortcut entries with bold leads and inline key chips. */
export const Shortcuts = () => (
  <div style={stage(400)}>
    <Modal title="Shortcuts">
      <HelpList>
        <li>
          <b>Show / hide overlay</b> — press <Kbd>Alt Space</Kbd> anywhere.
          The terminal keeps running while hidden.
        </li>
        <li>
          <b>Search sessions</b> — <Kbd>Ctrl K</Kbd> opens the global session
          switcher; type to filter by name or folder.
        </li>
        <li>
          <b>Ghost mode</b> — <Kbd>Alt G</Kbd> makes the window click-through
          so you can read output while working underneath.
        </li>
      </HelpList>
    </Modal>
  </div>
);

/** A single longer prose entry — checks wrapping and line-height. */
export const SingleTip = () => (
  <div style={stage(240)}>
    <Modal title="Tips">
      <HelpList>
        <li>
          <b>Away banner</b> — when an agent has been waiting on you for more
          than a minute, AFKode raises a banner over every workspace so you
          can jump back with one click, even from another virtual desktop.
        </li>
      </HelpList>
    </Modal>
  </div>
);
