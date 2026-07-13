import React from "react";
import { Recents, RecentCard } from "afkode-ds";

const panel: React.CSSProperties = {
  background: "rgba(23, 25, 32, 0.96)",
  border: "1px solid rgba(255, 255, 255, 0.07)",
  borderRadius: 12,
  padding: 16,
  display: "flex",
  justifyContent: "center",
};

/** Wrapping row of recent-project cards, one selected. */
export const RecentProjects = () => (
  <div style={panel}>
    <Recents>
      <RecentCard name="afkode" path="C:\Projects\afkode" selected />
      <RecentCard name="micuento" path="C:\Projects\micuento" />
      <RecentCard name="ganado-api" path="C:\Projects\clients\ganado-api" />
    </Recents>
  </div>
);
