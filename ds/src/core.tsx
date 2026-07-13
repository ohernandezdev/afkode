import React from "react";
import { cx } from "./icons";

/**
 * Root application panel — the deep-slate rounded surface every AFKode screen
 * lives inside. Compose Titlebar, a main area, and StatusBar as children.
 */
export interface OverlayProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Dims the whole panel like AFKode's ghost (click-through) mode. */
  ghost?: boolean;
}
export function Overlay({ ghost, className, ...rest }: OverlayProps) {
  return <div className={cx("overlay", ghost && "ghost", className)} {...rest} />;
}

/**
 * Icon button used across the titlebar, panels, and modals. Square, quiet by
 * default; hover reveals it. Put an inline SVG or a short glyph as children.
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** "close" turns red on hover (window close); "add" is the + new-tab button. */
  variant?: "default" | "close" | "add";
  /** Accent-tinted toggled-on state (e.g. the ghost-mode toggle). */
  active?: boolean;
}
export function Button({ variant = "default", active, className, ...rest }: ButtonProps) {
  return (
    <button
      className={cx(
        "btn",
        variant === "close" && "btn-close",
        variant === "add" && "btn-add",
        active && "ghost-on",
        className
      )}
      {...rest}
    />
  );
}

/**
 * Pill-shaped toggle chip for CLI flags and filters. Monospace label;
 * accent-bordered when on.
 */
export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Selected state — accent border and tint. */
  on?: boolean;
}
export function Chip({ on, className, ...rest }: ChipProps) {
  return <button className={cx("chip", on && "on", className)} {...rest} />;
}

/**
 * Keyboard-key cap, e.g. <Kbd>Ctrl K</Kbd>. Used inline in hints, buttons and
 * help entries.
 */
export interface KbdProps extends React.HTMLAttributes<HTMLElement> {}
export function Kbd(props: KbdProps) {
  return <kbd {...props} />;
}

/**
 * Small accent toggle switch (checkbox). Used in settings rows.
 */
export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {}
export function Switch({ className, ...rest }: SwitchProps) {
  return <input type="checkbox" className={cx("switch", className)} {...rest} />;
}
