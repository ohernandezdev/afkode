import React from "react";
import { cx, FolderIcon } from "./icons";

/**
 * New-session empty state filling the terminal area: big brand dot, a title,
 * then composed <PickFolder>, <Recents>, <Launchers>, and a flag <Chip> row.
 */
export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
}
export function EmptyState({ title, children, className, ...rest }: EmptyStateProps) {
  return (
    <div className={cx("empty-state", className)} {...rest}>
      <div className="empty-logo">
        <span className="brand-dot big" />
      </div>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

/** Wide folder-picker button showing the currently selected working directory. */
export interface PickFolderProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}
export function PickFolder({ children, className, ...rest }: PickFolderProps) {
  return (
    <button className={cx("pick-folder", className)} {...rest}>
      <FolderIcon />
      <span>{children}</span>
    </button>
  );
}

/** Wrapping row of <RecentCard>s. */
export interface RecentsProps extends React.HTMLAttributes<HTMLDivElement> {}
export function Recents({ className, ...rest }: RecentsProps) {
  return <div className={cx("recents", className)} {...rest} />;
}

/** Recent-project card: project name over its dimmed path. */
export interface RecentCardProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "name"> {
  name?: React.ReactNode;
  path?: React.ReactNode;
  /** Accent-bordered selected state. */
  selected?: boolean;
}
export function RecentCard({ name, path, selected, className, ...rest }: RecentCardProps) {
  return (
    <button className={cx("recent-card", selected && "selected", className)} {...rest}>
      <b>{name}</b>
      <span>{path}</span>
    </button>
  );
}

/** Centered row of <LauncherButton>s — the styling requires this wrapper. */
export interface LaunchersProps extends React.HTMLAttributes<HTMLDivElement> {}
export function Launchers({ className, ...rest }: LaunchersProps) {
  return <div className={cx("launchers", className)} {...rest} />;
}

/**
 * Agent launcher button with its identity dot: claude (accent), oc (green),
 * cx (light grey), ps (blue). `missing` dims it and marks it installable.
 */
export interface LauncherButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Which agent dot to show. */
  agent?: "claude" | "ps" | "oc" | "cx";
  /** Not installed — dimmed with a download hint. */
  missing?: boolean;
}
export function LauncherButton({ agent = "claude", missing, children, className, ...rest }: LauncherButtonProps) {
  return (
    <button className={cx(missing && "missing", className)} {...rest}>
      <span className={`mi dot-${agent}`} />
      {children}
    </button>
  );
}
