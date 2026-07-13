import React from "react";
import { FilePreviewPanel } from "afkode-ds";

// .file-preview-panel slides in from the right edge of its positioned
// ancestor — stage it like the terminal pane. `open` must be true.
const stage: React.CSSProperties = {
  position: "relative",
  height: 340,
  background: "rgba(23, 25, 32, 0.96)",
  border: "1px solid rgba(255, 255, 255, 0.07)",
  borderRadius: 12,
  overflow: "hidden",
};

/** Rendered-markdown mode with headings, lists, and inline code. */
export const Markdown = () => (
  <div style={stage}>
    <FilePreviewPanel open title="README.md" mode="md">
      <h1>AFKode</h1>
      <p>
        A Warp-style overlay terminal for running <code>claude</code> and
        other agent CLIs without leaving your current app.
      </p>
      <h2>Quick start</h2>
      <ul>
        <li>
          Install with <code>npm install -g afkode</code>
        </li>
        <li>
          Press <code>Alt Space</code> to toggle the overlay
        </li>
        <li>Pick a project folder and launch an agent</li>
      </ul>
    </FilePreviewPanel>
  </div>
);

/** Code mode — monospace source (no auto-highlighting in previews). */
export const Code = () => (
  <div style={stage}>
    <FilePreviewPanel open title="src/main.rs" mode="code">
      <pre>{`fn main() {
    let overlay = Overlay::new();
    overlay.register_hotkey("Alt+Space");
    overlay.run();
}`}</pre>
    </FilePreviewPanel>
  </div>
);

/** Plain mode — pre-wrapped monospace text, e.g. a log file. */
export const Plain = () => (
  <div style={stage}>
    <FilePreviewPanel open title="install.log" mode="plain">
      {`[12:04:01] checking terminal backend... ok
[12:04:02] npm install -g @anthropic-ai/claude-code
[12:04:31] added 212 packages in 29s
[12:04:31] done`}
    </FilePreviewPanel>
  </div>
);
