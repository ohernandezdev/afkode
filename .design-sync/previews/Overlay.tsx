import React from "react";
import {
  Overlay,
  Titlebar,
  Tabs,
  Tab,
  Button,
  HeaderSearch,
  StatusBar,
  GitChip,
  ModeBadge,
  Kbd,
  Loader,
} from "afkode-ds";

const GearIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

/**
 * The full app frame: titlebar with session tabs and search, the terminal
 * area (a session is starting), and the git/mode status bar.
 */
export const AppFrame = () => (
  <Overlay style={{ width: 640, height: 420, maxWidth: "100%" }}>
    <Titlebar
      controls={
        <>
          <Button title="Settings">
            <GearIcon />
          </Button>
          <Button variant="close" title="Close">
            <CloseIcon />
          </Button>
        </>
      }
    >
      <Tabs>
        <Tab active state="working" closable>
          afkode
        </Tab>
        <Tab state="waiting">micuento</Tab>
      </Tabs>
      <Button variant="add" title="New session">
        +
      </Button>
      <HeaderSearch />
    </Titlebar>
    <div style={{ flex: 1, position: "relative" }}>
      <Loader text="Starting Claude Code" />
    </div>
    <StatusBar
      left="C:\Projects\afkode"
      right={
        <>
          <Kbd>Alt+`</Kbd> toggle
        </>
      }
    >
      <GitChip>main</GitChip>
      <GitChip kind="added">+12</GitChip>
      <ModeBadge active>overlay</ModeBadge>
    </StatusBar>
  </Overlay>
);
