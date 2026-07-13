import React from "react";
import { ModeBadge } from "afkode-ds";

const panel: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "14px 16px",
  background: "rgba(23, 25, 32, 0.96)",
  border: "1px solid rgba(255, 255, 255, 0.07)",
  borderRadius: 12,
};

/** Active (accent-tinted) next to inactive. */
export const ActiveAndInactive = () => (
  <div style={panel}>
    <ModeBadge active>overlay</ModeBadge>
    <ModeBadge>window</ModeBadge>
  </div>
);

/** Mode toggle group as it appears in the status bar. */
export const ToggleGroup = () => (
  <div style={panel}>
    <ModeBadge>overlay</ModeBadge>
    <ModeBadge active>window</ModeBadge>
    <ModeBadge>ghost</ModeBadge>
  </div>
);
