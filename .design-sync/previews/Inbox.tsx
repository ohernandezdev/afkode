import React from "react";
import { Inbox, InboxRow, InboxButton } from "afkode-ds";

// .inbox positions absolutely (top-right of the terminal area) — give it a
// sized, positioned stage like the app's terminal pane.
const stage: React.CSSProperties = {
  position: "relative",
  height: 240,
  background: "rgba(23, 25, 32, 0.96)",
  border: "1px solid rgba(255, 255, 255, 0.07)",
  borderRadius: 12,
  overflow: "hidden",
};

/** Sessions needing attention: blinking waiting row, finished row, dead session. */
export const NeedsAttention = () => (
  <div style={stage}>
    <Inbox title="Inbox — 3 sessions">
      <InboxRow
        state="waiting"
        title="afkode · claude"
        detail="Permission needed: run `npm publish`?"
        actions={
          <>
            <InboxButton ok>Approve</InboxButton>
            <InboxButton>View</InboxButton>
          </>
        }
      />
      <InboxRow
        state="done"
        title="micuento · claude"
        detail="Finished: 12 files changed, tests green"
        actions={<InboxButton>Open</InboxButton>}
      />
      <InboxRow
        state="exit"
        title="ganado-api · codex"
        detail="Session exited (code 0)"
      />
    </Inbox>
  </div>
);

/** A single waiting entry with its approve/deny pair. */
export const WaitingRow = () => (
  <div style={stage}>
    <Inbox title="Inbox — 1 session">
      <InboxRow
        state="waiting"
        title="afkode · claude"
        detail="Waiting for your reply: choose a migration strategy"
        actions={
          <>
            <InboxButton ok>Reply</InboxButton>
            <InboxButton>Dismiss</InboxButton>
          </>
        }
      />
    </Inbox>
  </div>
);
