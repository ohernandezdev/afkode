import React from "react";
import {
  EmptyState,
  PickFolder,
  Recents,
  RecentCard,
  Launchers,
  LauncherButton,
  Chip,
} from "afkode-ds";

// EmptyState positions absolutely (inset: 0) — it needs a positioned stage
// with a fixed height, styled like the app panel it normally covers.
const stage: React.CSSProperties = {
  position: "relative",
  height: 420,
  background: "rgba(23, 25, 32, 0.96)",
  borderRadius: 12,
  overflow: "hidden",
};

/**
 * The full new-session screen: brand dot + title, folder picker, recent
 * projects (one selected), agent launchers (Codex missing), and CLI flag chips.
 */
export const NewSessionScreen = () => (
  <div style={stage}>
    <EmptyState title="Start a session">
      <PickFolder>C:\Projects\afkode</PickFolder>
      <Recents>
        <RecentCard name="afkode" path="C:\Projects\afkode" selected />
        <RecentCard name="micuento" path="C:\Projects\micuento" />
        <RecentCard name="ganado-api" path="C:\Projects\clients\ganado-api" />
      </Recents>
      <Launchers>
        <LauncherButton agent="claude">Claude Code</LauncherButton>
        <LauncherButton agent="oc">OpenCode</LauncherButton>
        <LauncherButton agent="cx" missing>
          Codex
        </LauncherButton>
        <LauncherButton agent="ps">PowerShell</LauncherButton>
      </Launchers>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 6,
          maxWidth: "92%",
        }}
      >
        <Chip on>--dangerously-skip-permissions</Chip>
        <Chip>--resume</Chip>
        <Chip>--model opus</Chip>
      </div>
    </EmptyState>
  </div>
);
