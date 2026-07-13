import React from "react";
import { LinkToast } from "afkode-ds";

// .link-toast sits absolutely at bottom-center of the Overlay — needs a
// sized, positioned stage (height >= 120 so the bottom offset is visible).
const stage: React.CSSProperties = {
  position: "relative",
  height: 200,
  background: "rgba(23, 25, 32, 0.96)",
  border: "1px solid rgba(255, 255, 255, 0.07)",
  borderRadius: 12,
  overflow: "hidden",
};

/** Toast confirming a link opened from the terminal. */
export const LinkOpened = () => (
  <div style={stage}>
    <LinkToast>Opened https://github.com/omar/afkode/pull/42</LinkToast>
  </div>
);

/** Long URL gets ellipsized inside the pill. */
export const LongUrl = () => (
  <div style={stage}>
    <LinkToast>
      Opened https://vercel.com/omar/afkode/deployments/dpl_9f8e7d6c5b4a3-preview-main-2026-07-11
    </LinkToast>
  </div>
);
