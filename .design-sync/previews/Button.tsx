import React from "react";
import { Button } from "afkode-ds";

// AFKode UI is dark — cells sit on the app's panel surface.
const panel: React.CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "center",
  background: "rgba(23, 25, 32, 0.96)",
  border: "1px solid rgba(255, 255, 255, 0.07)",
  borderRadius: 12,
  padding: 14,
};

const HelpIcon = () => (
  <svg viewBox="0 0 24 24" width={14} height={14}>
    <path
      fill="currentColor"
      d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm.9 15.5h-1.9v-1.9h1.9v1.9Zm1.7-6.1-.9.9c-.6.6-.8 1.1-.8 2.2h-1.8v-.5c0-1.1.4-1.8 1-2.4l1.1-1.1a1.7 1.7 0 0 0 .5-1.2 1.7 1.7 0 1 0-3.4 0H8.5a3.5 3.5 0 1 1 7 0c0 .8-.3 1.5-.9 2.1Z"
    />
  </svg>
);
const GearIcon = () => (
  <svg viewBox="0 0 24 24" width={14} height={14}>
    <path
      fill="currentColor"
      d="m19.4 13 .1-1-.1-1 2-1.6-1.9-3.3-2.4 1a7.7 7.7 0 0 0-1.7-1l-.4-2.6h-3.8l-.4 2.6a7.7 7.7 0 0 0-1.7 1l-2.4-1L4.8 9.4l2 1.6-.1 1 .1 1-2 1.6 1.9 3.3 2.4-1c.5.4 1.1.7 1.7 1l.4 2.6h3.8l.4-2.6c.6-.3 1.2-.6 1.7-1l2.4 1 1.9-3.3-2-1.6ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"
    />
  </svg>
);
const GhostIcon = () => (
  <svg viewBox="0 0 24 24" width={14} height={14}>
    <path
      fill="currentColor"
      d="M12 2a8 8 0 0 0-8 8v11l3-2 2.5 2 2.5-2 2.5 2 2.5-2 3 2V10a8 8 0 0 0-8-8Zm-3 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"
    />
  </svg>
);
const XIcon = () => (
  <svg viewBox="0 0 24 24" width={14} height={14}>
    <path
      fill="currentColor"
      d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6 10.6 12 5 6.4z"
    />
  </svg>
);

/** The titlebar control cluster: quiet icon buttons, red-on-hover close. */
export const ControlCluster = () => (
  <div style={panel}>
    <Button aria-label="Help">
      <HelpIcon />
    </Button>
    <Button aria-label="Settings">
      <GearIcon />
    </Button>
    <Button aria-label="Ghost mode">
      <GhostIcon />
    </Button>
    <Button variant="close" aria-label="Close window">
      <XIcon />
    </Button>
  </div>
);

/** Toggled-on state — accent tint (the ghost-mode toggle while active). */
export const ActiveToggle = () => (
  <div style={panel}>
    <Button active aria-label="Ghost mode on">
      <GhostIcon />
    </Button>
    <Button aria-label="Ghost mode off">
      <GhostIcon />
    </Button>
  </div>
);

/** The + new-tab button next to the tab strip. */
export const AddTab = () => (
  <div style={panel}>
    <Button variant="add" aria-label="New session">
      +
    </Button>
  </div>
);
