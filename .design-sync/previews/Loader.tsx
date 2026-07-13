import React from "react";
import { Loader } from "afkode-ds";

// .term-loader fills its nearest positioned ancestor — give it a sized stage.
const stage: React.CSSProperties = {
  position: "relative",
  height: 200,
  background: "rgba(23, 25, 32, 0.96)",
  border: "1px solid rgba(255, 255, 255, 0.07)",
  borderRadius: 12,
  overflow: "hidden",
};

/** Spinning accent ring with pulsing core while a session boots. */
export const StartingClaudeCode = () => (
  <div style={stage}>
    <Loader text="Starting Claude Code" />
  </div>
);
