import React from "react";
import { Tabs, Tab } from "afkode-ds";

// .tabs caps itself at max-width: 55% of its parent, so the panel is wide
// enough for a full strip to stay readable.
const panel: React.CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "center",
  background: "rgba(23,25,32,0.96)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 12,
  padding: 14,
  width: 620,
};

/** Full titlebar strip: active working session plus waiting, done and dead tabs. */
export const SessionStrip = () => (
  <div style={panel}>
    <Tabs style={{ maxWidth: "100%" }}>
      <Tab active state="working" closable>
        afkode · claude
      </Tab>
      <Tab state="waiting">micuento · claude</Tab>
      <Tab state="done">ganado-api · codex</Tab>
      <Tab state="dead">docs · claude</Tab>
    </Tabs>
  </div>
);

/** Two-session strip, quiet moment — both agents finished. */
export const TwoDone = () => (
  <div style={panel}>
    <Tabs style={{ maxWidth: "100%" }}>
      <Tab active state="done" closable>
        afkode · claude
      </Tab>
      <Tab state="done">release-notes · claude</Tab>
    </Tabs>
  </div>
);
