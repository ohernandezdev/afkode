import React from "react";
import { cx, CloseIcon, SearchIcon } from "./icons";
import { Button } from "./core";

/**
 * Floating inbox panel listing agent sessions that need attention.
 * Positioned top-right inside the Overlay. Children are <InboxRow>s.
 */
export interface InboxProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  onClose?: () => void;
}
export function Inbox({ title = "Inbox", onClose, children, className, ...rest }: InboxProps) {
  return (
    <div className={cx("inbox", className)} {...rest}>
      <div className="inbox-head">
        <h3>{title}</h3>
        <Button onClick={onClose} aria-label="close">
          <CloseIcon />
        </Button>
      </div>
      <div>{children}</div>
    </div>
  );
}

/**
 * One inbox entry: state dot (waiting = blinking amber, done = green,
 * exit = grey), session title + detail, trailing actions.
 */
export interface InboxRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  state?: "waiting" | "done" | "exit";
  /** Session name (bold line). */
  title?: React.ReactNode;
  /** Second line — last message or status detail. */
  detail?: React.ReactNode;
  /** Trailing <InboxButton>s. */
  actions?: React.ReactNode;
}
export function InboxRow({ state = "waiting", title, detail, actions, className, ...rest }: InboxRowProps) {
  return (
    <div className={cx("inbox-row", className)} {...rest}>
      <span className={cx("dot", state)} />
      <div className="inbox-info">
        <b>{title}</b>
        <span className="inbox-detail">{detail}</span>
      </div>
      {actions && <div className="inbox-acts">{actions}</div>}
    </div>
  );
}

/** Small bordered action button used in inbox rows, banners, and wizard steps. */
export interface InboxButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Green confirm styling. */
  ok?: boolean;
}
export function InboxButton({ ok, className, ...rest }: InboxButtonProps) {
  return <button className={cx("inbox-btn", ok && "ok", className)} {...rest} />;
}

/**
 * Floating terminal search bar (top-right of the terminal area). Compose
 * trailing icon Buttons (prev/next/close) as children after the input.
 */
export interface SearchBarProps extends React.HTMLAttributes<HTMLDivElement> {
  placeholder?: string;
  defaultValue?: string;
}
export function SearchBar({ placeholder = "Search", defaultValue, children, className, ...rest }: SearchBarProps) {
  return (
    <div className={cx("search-bar", className)} {...rest}>
      <SearchIcon size={13} opacity={0.6} />
      <input placeholder={placeholder} defaultValue={defaultValue} autoComplete="off" spellCheck={false} />
      {children ?? (
        <Button aria-label="close">
          <CloseIcon />
        </Button>
      )}
    </div>
  );
}

/**
 * Centered modal with a dimmed, blurred backdrop and a rounded card. AFKode
 * uses it for help, settings, the setup wizard, and global search.
 */
export interface ModalProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  onClose?: () => void;
  /** "settings" narrows the card; "search" is the compact search palette card. */
  variant?: "default" | "settings" | "search";
}
export function Modal({ title, onClose, variant = "default", children, className, ...rest }: ModalProps) {
  return (
    <div className={cx("help-modal", className)} {...rest}>
      <div
        className={cx(
          "help-card",
          variant === "settings" && "settings-card",
          variant === "search" && "search-card"
        )}
      >
        {title != null && (
          <div className="help-head">
            <h2>{title}</h2>
            <Button onClick={onClose} aria-label="close">
              <CloseIcon size={14} />
            </Button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/** Stacked list of help entries inside a Modal. Children are <li> items. */
export interface HelpListProps extends React.HTMLAttributes<HTMLUListElement> {}
export function HelpList({ className, ...rest }: HelpListProps) {
  return <ul className={cx("help-list", className)} {...rest} />;
}

/** Settings row: label on the left, a control (Switch, select, slider) on the right. */
export interface SettingsRowProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
}
export function SettingsRow({ label, children, className, ...rest }: SettingsRowProps) {
  return (
    <div className={cx("set-row", className)} {...rest}>
      <label>{label}</label>
      {children}
    </div>
  );
}

/** Dim explanatory note under a settings row. */
export interface SetNoteProps extends React.HTMLAttributes<HTMLParagraphElement> {}
export function SetNote({ className, ...rest }: SetNoteProps) {
  return <p className={cx("set-note", className)} {...rest} />;
}

/**
 * Setup-wizard step row: status glyph, step title + note, trailing action
 * button. Status "busy" pulses accent, "ok" is green.
 */
export interface WizardStepProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  status?: "pending" | "busy" | "ok";
  title?: React.ReactNode;
  note?: React.ReactNode;
  action?: React.ReactNode;
}
export function WizardStep({ status = "pending", title, note, action, className, ...rest }: WizardStepProps) {
  const glyph = status === "ok" ? "✓" : status === "busy" ? "●" : "○";
  return (
    <div className={cx("wiz-step", className)} {...rest}>
      <span className={cx("wiz-ico", status !== "pending" && (status === "ok" ? "ok" : "busy"))}>{glyph}</span>
      <div className="wiz-info">
        <b>{title}</b>
        <span className="wiz-note">{note}</span>
      </div>
      {action}
    </div>
  );
}

/**
 * Slide-in file preview sidebar (right edge). Body mode picks the rendering
 * treatment: "md" for rendered markdown, "code" for highlighted source,
 * "plain" for monospace text.
 */
export interface FilePreviewPanelProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Slid in when true. */
  open?: boolean;
  /** Filename shown in the monospace header. */
  title?: React.ReactNode;
  mode?: "md" | "code" | "plain" | "img";
  onClose?: () => void;
}
export function FilePreviewPanel({ open, title, mode = "md", onClose, children, className, ...rest }: FilePreviewPanelProps) {
  return (
    <div className={cx("file-preview-panel", open && "open", className)} {...rest}>
      <div className="file-preview-head">
        <span className="file-preview-title">{title}</span>
        <Button onClick={onClose} aria-label="close">
          <CloseIcon size={14} />
        </Button>
      </div>
      <div className={cx("file-preview-body", mode)}>{children}</div>
    </div>
  );
}
