import React from "react";
import { Launchers, LauncherButton } from "afkode-ds";

// LauncherButton styling comes from the .launchers parent — always wrap.
const panel: React.CSSProperties = {
  background: "rgba(23, 25, 32, 0.96)",
  border: "1px solid rgba(255, 255, 255, 0.07)",
  borderRadius: 12,
  padding: 16,
  display: "flex",
  justifyContent: "center",
};

/** Each agent identity dot: claude (accent), oc (green), cx (grey), ps (blue). */
export const AgentDots = () => (
  <div style={panel}>
    <Launchers>
      <LauncherButton agent="claude">Claude Code</LauncherButton>
      <LauncherButton agent="oc">OpenCode</LauncherButton>
      <LauncherButton agent="cx">Codex</LauncherButton>
      <LauncherButton agent="ps">PowerShell</LauncherButton>
    </Launchers>
  </div>
);

/** Missing agent: dimmed, amber dot, trailing download hint. */
export const Missing = () => (
  <div style={panel}>
    <Launchers>
      <LauncherButton agent="cx" missing>
        Codex
      </LauncherButton>
    </Launchers>
  </div>
);
