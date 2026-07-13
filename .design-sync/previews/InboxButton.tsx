import React from "react";
import { InboxButton } from "afkode-ds";

const panel: React.CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "center",
  background: "rgba(23,25,32,0.96)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 12,
  padding: 14,
};

/** The classic approve/dismiss pair from an inbox row: green ok + plain. */
export const ApproveDismiss = () => (
  <div style={panel}>
    <InboxButton ok>Approve</InboxButton>
    <InboxButton>Dismiss</InboxButton>
  </div>
);

/** Plain action variants as they appear on finished sessions and banners. */
export const PlainActions = () => (
  <div style={panel}>
    <InboxButton>Open</InboxButton>
    <InboxButton>View diff</InboxButton>
    <InboxButton>Restart</InboxButton>
  </div>
);
