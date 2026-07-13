import React from "react";
import { Launchers, LauncherButton } from "afkode-ds";

const panel: React.CSSProperties = {
  background: "rgba(23, 25, 32, 0.96)",
  border: "1px solid rgba(255, 255, 255, 0.07)",
  borderRadius: 12,
  padding: 16,
  display: "flex",
  justifyContent: "center",
};

/** All four agent launchers; Codex is not installed (dimmed with ↓ hint). */
export const AllAgents = () => (
  <div style={panel}>
    <Launchers>
      <LauncherButton agent="claude">Claude Code</LauncherButton>
      <LauncherButton agent="oc">OpenCode</LauncherButton>
      <LauncherButton agent="cx" missing>
        Codex
      </LauncherButton>
      <LauncherButton agent="ps">PowerShell</LauncherButton>
    </Launchers>
  </div>
);
