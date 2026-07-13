import React from "react";
import { AwayBanner, InboxButton } from "afkode-ds";

// .away-banner positions absolutely at top-center of the Overlay — needs a
// sized, positioned stage.
const stage: React.CSSProperties = {
  position: "relative",
  height: 200,
  background: "rgba(23, 25, 32, 0.96)",
  border: "1px solid rgba(255, 255, 255, 0.07)",
  borderRadius: 12,
  overflow: "hidden",
};

/** Summary of what happened while away, with a review action. */
export const WithAction = () => (
  <div style={stage}>
    <AwayBanner action={<InboxButton ok>Review</InboxButton>}>
      While you were away: 2 sessions finished, 1 needs approval
    </AwayBanner>
  </div>
);

/** Plain informational banner, no trailing action. */
export const InfoOnly = () => (
  <div style={stage}>
    <AwayBanner>afkode · claude finished: 12 files changed, tests green</AwayBanner>
  </div>
);
