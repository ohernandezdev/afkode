import type { ITerminalAddon, Terminal } from "@xterm/xterm";

/**
 * Works around a WKWebView-only xterm.js bug (macOS Tauri, never Chromium):
 * https://github.com/xtermjs/xterm.js/issues/5894
 *
 * On a dead-key layout (Spanish, Portuguese, US-International, ABNT2, …),
 * typing a dead key followed by a non-combining char — e.g. the acute
 * accent key then `l` — reaches WebKit as:
 *   1. compositionend(data="´") → xterm's own CompositionHelper emits "´".
 *      Correct.
 *   2. A synthetic keypress for the *next* physical key, but with
 *      `charCode` set to the dead char instead of the key actually
 *      pressed. xterm's `_keyPress` reads `charCode` first and emits "´"
 *      again — a duplicate.
 *   3. A keydown for that same key reporting `event.key === "´l"`
 *      (length 2). xterm's keyboard service requires `key.length === 1`,
 *      so it's dropped, and the "l" is lost entirely.
 * Net effect: the dead-key char doubles and the next key vanishes —
 * visible as random duplicated/garbled text while typing, worst on
 * Spanish keyboards since almost every vowel can be preceded by ´.
 * Chromium hosts (Electron) never see this shape of event, so it doesn't
 * reproduce there.
 *
 * Detection has to key off an actual `Dead`/`AltGraph` keydown during the
 * composition, not the committed character — several layouts type
 * `~`/`^`/`` ` `` directly without ever entering a dead-key state, so
 * pattern-matching the committed char is unsound (see jerch's comment on
 * the issue above).
 *
 * Remove this addon once xterm.js fixes the upstream issue natively.
 */
export class WebKitDeadKeyAddon implements ITerminalAddon {
  private deadKeyDownSeen = false;
  private commit: string | null = null;
  private wasDead = false;
  private textarea: HTMLTextAreaElement | null = null;
  private readonly emit: (data: string) => void;

  constructor(emit: (data: string) => void) {
    this.emit = emit;
  }

  activate(term: Terminal): void {
    this.textarea = term.textarea ?? null;
    this.textarea?.addEventListener("keydown", this.onKeyDown, true);
    this.textarea?.addEventListener("compositionstart", this.onCompositionStart, true);
    this.textarea?.addEventListener("compositionend", this.onCompositionEnd, true);
  }

  dispose(): void {
    this.textarea?.removeEventListener("keydown", this.onKeyDown, true);
    this.textarea?.removeEventListener("compositionstart", this.onCompositionStart, true);
    this.textarea?.removeEventListener("compositionend", this.onCompositionEnd, true);
    this.textarea = null;
    this.deadKeyDownSeen = false;
    this.commit = null;
    this.wasDead = false;
  }

  /** Returns true if the event was handled — caller must suppress xterm's own handling. */
  handle(e: KeyboardEvent): boolean {
    if (
      e.type === "keypress" &&
      this.wasDead &&
      this.commit !== null &&
      e.charCode === this.commit.charCodeAt(0)
    ) {
      this.commit = null;
      this.wasDead = false;
      return true;
    }
    if (
      e.type === "keydown" &&
      this.wasDead &&
      this.commit !== null &&
      e.key.length === 2 &&
      e.key[0] === this.commit
    ) {
      this.emit(e.key.slice(1));
      return true;
    }
    return false;
  }

  private onKeyDown = (e: Event): void => {
    // Recorded in its own listener (not in handle()) so a dead-key keydown
    // is never missed regardless of when/whether attachCustomKeyEventHandler
    // calls into this addon. On WebKit it fires after compositionstart but
    // before compositionend, so the flag is ready in time.
    const ke = e as KeyboardEvent;
    if (ke.key === "Dead" || ke.key === "AltGraph") {
      this.deadKeyDownSeen = true;
    }
  };

  private onCompositionStart = (): void => {
    this.commit = null;
    this.wasDead = false;
    this.deadKeyDownSeen = false;
  };

  private onCompositionEnd = (e: Event): void => {
    const data = (e as CompositionEvent).data;
    this.commit = data || null;
    this.wasDead = this.deadKeyDownSeen;
    this.deadKeyDownSeen = false;
  };
}
