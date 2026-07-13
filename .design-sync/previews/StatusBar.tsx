import React from "react";
import { StatusBar, GitChip, ModeBadge, Kbd } from "afkode-ds";

// StatusBar is a flex row on the bar surface — wrap in a dark panel, no stage.
const panel: React.CSSProperties = {
  background: "rgba(23, 25, 32, 0.96)",
  border: "1px solid rgba(255, 255, 255, 0.07)",
  borderRadius: 12,
  overflow: "hidden",
};

/** Full composition: cwd on the left, git chips + mode badge, shortcut hint. */
export const FullComposition = () => (
  <div style={panel}>
    <StatusBar
      left="~/projects/afkode"
      right={
        <>
          <Kbd>Alt+`</Kbd> toggle
        </>
      }
    >
      <GitChip>main</GitChip>
      <GitChip kind="added">+42</GitChip>
      <GitChip kind="removed">−7</GitChip>
      <GitChip kind="dirty">●</GitChip>
      <ModeBadge active>overlay</ModeBadge>
    </StatusBar>
  </div>
);

/** Clean repo: just the branch chip and an inactive mode badge. */
export const CleanRepo = () => (
  <div style={panel}>
    <StatusBar
      left="~/projects/micuento"
      right={
        <>
          <Kbd>Ctrl+Shift+P</Kbd> commands
        </>
      }
    >
      <GitChip>main</GitChip>
      <ModeBadge>window</ModeBadge>
    </StatusBar>
  </div>
);

/** Long path on the left gets ellipsized; middle chips stay visible. */
export const LongPath = () => (
  <div style={panel}>
    <StatusBar
      left="~/projects/clients/ganado-api/services/ingestion-pipeline/workers"
      right={
        <>
          <Kbd>F1</Kbd> help
        </>
      }
    >
      <GitChip>feature/etl-retry</GitChip>
      <GitChip kind="added">+128</GitChip>
      <GitChip kind="removed">−36</GitChip>
      <ModeBadge active>overlay</ModeBadge>
    </StatusBar>
  </div>
);
