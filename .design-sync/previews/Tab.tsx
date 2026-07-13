import React from "react";
import { Tabs, Tab } from "afkode-ds";

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

/** State-dot sweep: working (accent), waiting (amber), done (green), dead (grey). */
export const StateSweep = () => (
  <div style={panel}>
    <Tabs style={{ maxWidth: "100%" }}>
      <Tab state="working">afkode · claude</Tab>
      <Tab state="waiting">micuento · claude</Tab>
      <Tab state="done">ganado-api · codex</Tab>
      <Tab state="dead">docs · claude</Tab>
    </Tabs>
  </div>
);

/** Selected tab with the × close affordance, next to an idle sibling. */
export const ActiveClosable = () => (
  <div style={panel}>
    <Tabs style={{ maxWidth: "100%" }}>
      <Tab active state="working" closable>
        afkode · claude
      </Tab>
      <Tab state="done">micuento · claude</Tab>
    </Tabs>
  </div>
);
