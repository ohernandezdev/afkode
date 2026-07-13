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

/** Default card: project name over its dimmed path. */
export const Default = () => (
  <div style={panel}>
    <Recents>
      <RecentCard name="micuento" path="C:\Projects\micuento" />
    </Recents>
  </div>
);

/** Selected card — accent border and tint. */
export const Selected = () => (
  <div style={panel}>
    <Recents>
      <RecentCard name="afkode" path="C:\Projects\afkode" selected />
    </Recents>
  </div>
);

/** Long name and path both get ellipsized inside the max-width card. */
export const LongContent = () => (
  <div style={panel}>
    <Recents>
      <RecentCard
        name="ingestion-pipeline-workers"
        path="C:\Projects\clients\ganado-api\services\ingestion-pipeline"
      />
    </Recents>
  </div>
);
