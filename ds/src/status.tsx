import React from "react";
import { cx, BranchIcon } from "./icons";

/**
 * Bottom status bar: session path on the left, git/mode chips in the middle,
 * a hint on the right.
 */
export interface StatusBarProps extends React.HTMLAttributes<HTMLElement> {
  /** Left-aligned session label (cwd, session name). */
  left?: React.ReactNode;
  /** Right-aligned hint (shortcut reminder). */
  right?: React.ReactNode;
}
export function StatusBar({ left, right, children, className, ...rest }: StatusBarProps) {
  return (
    <footer className={cx("statusbar", className)} {...rest}>
      <span className="status-left">{left}</span>
      <span className="status-mid">{children}</span>
      <span className="status-right">{right}</span>
    </footer>
  );
}

/**
 * Rounded status-bar chip for git state. "branch" shows the branch icon;
 * "added"/"removed" tint green/red for diff counts; "dirty" is the small
 * amber dot.
 */
export interface GitChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  kind?: "branch" | "added" | "removed" | "dirty";
}
export function GitChip({ kind = "branch", children, className, ...rest }: GitChipProps) {
  return (
    <span
      className={cx("git-chip", kind !== "branch" && kind, className)}
      {...rest}
    >
      {kind === "branch" && <BranchIcon />}
      {children}
    </span>
  );
}

/**
 * Status-bar mode toggle badge (e.g. the overlay/window mode indicator).
 * Accent-tinted when active.
 */
export interface ModeBadgeProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}
export function ModeBadge({ active, className, ...rest }: ModeBadgeProps) {
  return <button className={cx("mode-badge", active && "mode-active", className)} {...rest} />;
}

/**
 * Floating accent pill announcing ghost (click-through) mode. Positioned
 * absolutely near the top of the Overlay.
 */
export interface GhostBadgeProps extends React.HTMLAttributes<HTMLDivElement> {}
export function GhostBadge({ className, ...rest }: GhostBadgeProps) {
  return <div className={cx("ghost-badge", className)} {...rest} />;
}

/**
 * Bottom-center toast pill, used when a link is opened from the terminal.
 * Positioned absolutely inside the Overlay.
 */
export interface LinkToastProps extends React.HTMLAttributes<HTMLDivElement> {}
export function LinkToast({ className, ...rest }: LinkToastProps) {
  return <div className={cx("link-toast", className)} {...rest} />;
}

/**
 * Full-pane session loader: spinning accent ring with a pulsing core and an
 * animated "starting…" line. Fills its nearest positioned ancestor.
 */
export interface LoaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Loader caption, e.g. "Starting Claude Code". */
  text?: React.ReactNode;
}
export function Loader({ text = "Starting session", className, ...rest }: LoaderProps) {
  return (
    <div className={cx("term-loader", className)} {...rest}>
      <div className="loader-ring">
        <div className="loader-core" />
      </div>
      <div className="loader-text">
        {text}
        <span className="loader-dots">
          <i>.</i>
          <i>.</i>
          <i>.</i>
        </span>
      </div>
    </div>
  );
}

/**
 * Top-center banner summarizing what happened while the user was away.
 * Accent-bordered; optionally carries an action button and a close Button.
 */
export interface AwayBannerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional trailing action, e.g. an <InboxButton ok>. */
  action?: React.ReactNode;
}
export function AwayBanner({ action, children, className, ...rest }: AwayBannerProps) {
  return (
    <div className={cx("away-banner", className)} {...rest}>
      <span>{children}</span>
      {action}
    </div>
  );
}
