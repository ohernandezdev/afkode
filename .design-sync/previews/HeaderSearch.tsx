import React from "react";
import { HeaderSearch } from "afkode-ds";

const panel: React.CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "center",
  background: "rgba(23,25,32,0.96)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 12,
  padding: 14,
};

/** Default trigger: magnifier, placeholder, Ctrl K cap. */
export const Default = () => (
  <div style={panel}>
    <HeaderSearch />
  </div>
);

/** macOS build — Cmd shortcut and a custom label. */
export const MacShortcut = () => (
  <div style={panel}>
    <HeaderSearch shortcut="⌘ K">Search sessions…</HeaderSearch>
  </div>
);
