import React from "react";
import { GhostBadge } from "afkode-ds";

// .ghost-badge positions absolutely near the top of the Overlay — needs a
// sized, positioned stage.
const stage: React.CSSProperties = {
  position: "relative",
  height: 200,
  background: "rgba(23, 25, 32, 0.96)",
  border: "1px solid rgba(255, 255, 255, 0.07)",
  borderRadius: 12,
  overflow: "hidden",
};

/** Accent pill announcing click-through mode. */
export const GhostOn = () => (
  <div style={stage}>
    <GhostBadge>Ghost mode — clicks pass through</GhostBadge>
  </div>
);

/** Shorter label variant with the release shortcut. */
export const WithShortcut = () => (
  <div style={stage}>
    <GhostBadge>Ghost mode · Alt+G to exit</GhostBadge>
  </div>
);
