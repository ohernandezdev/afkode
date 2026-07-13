import React from "react";
import { Inbox, InboxRow, InboxButton } from "afkode-ds";

// InboxRow only makes sense inside the Inbox panel, which positions
// absolutely (top-right of the terminal area) — reuse the sized stage.
const stage: React.CSSProperties = {
  position: "relative",
  height: 200,
  background: "rgba(23, 25, 32, 0.96)",
  border: "1px solid rgba(255, 255, 255, 0.07)",
  borderRadius: 12,
  overflow: "hidden",
};

/** Waiting state: blinking amber dot, approve/deny action pair. */
export const Waiting = () => (
  <div style={stage}>
    <Inbox title="Inbox — 1 session">
      <InboxRow
        state="waiting"
        title="afkode · claude"
        detail="Permission needed: edit src/main.rs?"
        actions={
          <>
            <InboxButton ok>Approve</InboxButton>
            <InboxButton>Deny</InboxButton>
          </>
        }
      />
    </Inbox>
  </div>
);

/** Done state: green dot, single open action. */
export const Done = () => (
  <div style={stage}>
    <Inbox title="Inbox — 1 session">
      <InboxRow
        state="done"
        title="micuento · claude"
        detail="Finished: README.md updated, 4 tests added"
        actions={<InboxButton>Open</InboxButton>}
      />
    </Inbox>
  </div>
);

/** Exit state: grey dot, no trailing actions. */
export const Exited = () => (
  <div style={stage}>
    <Inbox title="Inbox — 1 session">
      <InboxRow
        state="exit"
        title="ganado-api · codex"
        detail="Session exited (code 0)"
      />
    </Inbox>
  </div>
);
