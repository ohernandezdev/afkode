import React from "react";
import { Chip } from "afkode-ds";

const panel: React.CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "center",
  flexWrap: "wrap",
  background: "rgba(23,25,32,0.96)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 12,
  padding: 14,
};

/** Off/on pair — the same flag chip in both selected states. */
export const OnOffPair = () => (
  <div style={panel}>
    <Chip>--resume</Chip>
    <Chip on>--resume</Chip>
  </div>
);

/** Launcher flag row as on the new-session screen: a mix of picked and idle flags. */
export const FlagRow = () => (
  <div style={panel}>
    <Chip on>--resume</Chip>
    <Chip on>--model opus</Chip>
    <Chip>--dangerously-skip-permissions</Chip>
    <Chip>--verbose</Chip>
  </div>
);
