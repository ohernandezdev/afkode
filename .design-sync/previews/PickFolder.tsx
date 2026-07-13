import React from "react";
import { PickFolder } from "afkode-ds";

const panel: React.CSSProperties = {
  background: "rgba(23, 25, 32, 0.96)",
  border: "1px solid rgba(255, 255, 255, 0.07)",
  borderRadius: 12,
  padding: 16,
  display: "flex",
  justifyContent: "center",
};

/** Default folder picker showing the selected working directory. */
export const SelectedFolder = () => (
  <div style={panel}>
    <PickFolder>C:\Projects\afkode</PickFolder>
  </div>
);

/** A long path — the RTL span keeps the tail (project name) visible. */
export const LongPath = () => (
  <div style={{ ...panel, maxWidth: 360 }}>
    <PickFolder>C:\Projects\clients\ganado-api\services\ingestion-pipeline</PickFolder>
  </div>
);
