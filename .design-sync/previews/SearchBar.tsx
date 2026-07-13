import React from "react";
import { SearchBar, Button } from "afkode-ds";

// .search-bar positions absolutely (top-right of the terminal area) —
// give it a sized, positioned stage like the app's terminal pane.
const stage: React.CSSProperties = {
  position: "relative",
  height: 120,
  background: "rgba(23, 25, 32, 0.96)",
  border: "1px solid rgba(255, 255, 255, 0.07)",
  borderRadius: 12,
  overflow: "hidden",
};

/** Empty terminal search with placeholder and default close button. */
export const Empty = () => (
  <div style={stage}>
    <SearchBar placeholder="Find in terminal (Ctrl F)" />
  </div>
);

/** Active query with prev / next / close trailing buttons. */
export const WithQuery = () => (
  <div style={stage}>
    <SearchBar defaultValue="npm publish">
      <Button aria-label="previous match">↑</Button>
      <Button aria-label="next match">↓</Button>
      <Button aria-label="close">✕</Button>
    </SearchBar>
  </div>
);
