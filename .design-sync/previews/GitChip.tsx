import React from "react";
import { GitChip } from "afkode-ds";

const panel: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "14px 16px",
  background: "rgba(23, 25, 32, 0.96)",
  border: "1px solid rgba(255, 255, 255, 0.07)",
  borderRadius: 12,
};

/** All four kinds in a row: branch, added, removed, dirty dot. */
export const AllKinds = () => (
  <div style={panel}>
    <GitChip>main</GitChip>
    <GitChip kind="added">+42</GitChip>
    <GitChip kind="removed">−7</GitChip>
    <GitChip kind="dirty">●</GitChip>
  </div>
);

/** Branch chip with a longer feature-branch name. */
export const FeatureBranch = () => (
  <div style={panel}>
    <GitChip>feature/status-bar-redesign</GitChip>
    <GitChip kind="added">+310</GitChip>
    <GitChip kind="removed">−158</GitChip>
  </div>
);
