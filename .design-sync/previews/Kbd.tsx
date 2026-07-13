import React from "react";
import { Kbd } from "afkode-ds";

const panel: React.CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "center",
  background: "rgba(23,25,32,0.96)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 12,
  padding: 14,
  color: "#9aa3b2",
  fontSize: 12,
};

/** Key caps inline in a status-bar style hint sentence. */
export const InlineHint = () => (
  <div style={panel}>
    <span>
      Press <Kbd>Ctrl K</Kbd> to search sessions · <Kbd>Ctrl T</Kbd> new tab
    </span>
  </div>
);

/** A chorded shortcut rendered as separate caps. */
export const ChordHint = () => (
  <div style={panel}>
    <span>
      Toggle ghost mode with <Kbd>Ctrl</Kbd> <Kbd>Shift</Kbd> <Kbd>G</Kbd>
    </span>
  </div>
);
