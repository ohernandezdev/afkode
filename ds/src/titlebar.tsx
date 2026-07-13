import React from "react";
import { cx, SearchIcon } from "./icons";

/**
 * Window titlebar: brand mark on the left, tabs in the middle, action buttons
 * (a `controls` cluster) on the right. Children render between the brand and
 * the right-side spacer — typically <Tabs> plus an add Button and HeaderSearch.
 */
export interface TitlebarProps extends React.HTMLAttributes<HTMLElement> {
  /** Brand wordmark; defaults to AFK<b>ODE</b>. */
  brand?: React.ReactNode;
  /** Right-aligned cluster of icon Buttons (help, settings, close…). */
  controls?: React.ReactNode;
}
export function Titlebar({ brand, controls, children, className, ...rest }: TitlebarProps) {
  return (
    <header className={cx("titlebar", className)} {...rest}>
      <div className="brand">
        <span className="brand-dot" />
        <span className="brand-name">
          {brand ?? (
            <>
              AFK<b>ODE</b>
            </>
          )}
        </span>
      </div>
      {children}
      <div className="spacer" />
      {controls && <div className="controls">{controls}</div>}
    </header>
  );
}

/** Horizontal tab strip (Warp-style soft blocks). Holds <Tab> children. */
export interface TabsProps extends React.HTMLAttributes<HTMLElement> {}
export function Tabs({ className, ...rest }: TabsProps) {
  return <nav className={cx("tabs", className)} {...rest} />;
}

/**
 * Session tab. The dot reflects the live agent state: working (accent),
 * waiting (amber, blinking), done (green), dead (grey).
 */
export interface TabProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Selected tab. */
  active?: boolean;
  /** Agent state shown by the dot. */
  state?: "working" | "waiting" | "done" | "dead";
  /** Show the × close affordance. */
  closable?: boolean;
}
export function Tab({ active, state = "done", closable, children, className, ...rest }: TabProps) {
  return (
    <button
      className={cx("tab", active && "active", state === "dead" && "dead", className)}
      {...rest}
    >
      <span className={`tab-dot st-${state}`} />
      {children}
      {closable && <span className="tab-x">×</span>}
    </button>
  );
}

/**
 * Titlebar search trigger — magnifier, placeholder text, and a keyboard
 * shortcut cap. Opens the global session search.
 */
export interface HeaderSearchProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Shortcut label shown in the kbd cap. */
  shortcut?: string;
}
export function HeaderSearch({ shortcut = "Ctrl K", children, className, ...rest }: HeaderSearchProps) {
  return (
    <button className={cx("header-search", className)} {...rest}>
      <SearchIcon />
      <span>{children ?? "Search sessions…"}</span>
      <kbd>{shortcut}</kbd>
    </button>
  );
}
