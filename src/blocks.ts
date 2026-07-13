import type { IDecoration, IMarker, Terminal } from "@xterm/xterm";

// Warp-style command blocks over OSC 133 shell integration.
//
// The shells AFKode spawns emit OSC 133 sequences (injected in
// src-tauri/src/lib.rs): A = prompt start, B = input start, C = command
// output start (pre-exec), D;<exit> = command end. This module consumes
// only those sequences — never shell-specific state — and builds a
// per-session block model with a colored gutter, a hover toolbar, and
// keyboard navigation. Sessions that never emit OSC 133 (agent TUIs,
// plain cmd, ssh) never activate any of this.
//
// PowerShell has no pre-exec hook, so C never arrives there; the command
// text is then captured at D as the logical line typed after B, and
// "a command is running" can't be distinguished from "idle at prompt" —
// re-run is only hard-gated where C exists.

interface Block {
  /** Marker at the prompt row (A). */
  prompt: IMarker;
  /** Marker at the row where input begins (B) plus the column. */
  input?: IMarker;
  inputCol: number;
  /** Marker at the first output row (C). Absent under PowerShell. */
  output?: IMarker;
  /** Marker at the row the cursor was on when D arrived. */
  end?: IMarker;
  command: string;
  exitCode?: number;
  done: boolean;
  deco?: IDecoration;
  gutter?: HTMLElement;
}

export class CommandBlocks {
  private blocks: Block[] = [];
  private current: Block | null = null;
  private selected: Block | null = null;
  /** True between C and D — a command is verifiably producing output. */
  private running = false;
  private toolbar: HTMLElement | null = null;
  private toolbarFor: Block | null = null;
  private disposed = false;

  constructor(
    private term: Terminal,
    private pane: HTMLElement,
    private writeInput: (data: string) => void,
    private copyText: (text: string) => void,
  ) {
    term.parser.registerOscHandler(133, (data) => {
      this.handle(data);
      return true;
    });
  }

  /** Whether shell integration has been seen in this session. */
  active(): boolean {
    return this.blocks.length > 0 || this.current !== null;
  }

  dispose() {
    this.disposed = true;
    this.hideToolbar();
    for (const b of this.blocks) b.deco?.dispose();
    this.blocks = [];
    this.current = null;
    this.selected = null;
  }

  // ── OSC 133 state machine ─────────────────────────────────

  private handle(data: string) {
    if (this.disposed) return;
    const kind = data[0];
    switch (kind) {
      case "A": {
        // Prompt start. A block that saw B but never D (shell died
        // mid-command, Ctrl+C before exec) is finalized without status.
        const marker = this.term.registerMarker(0);
        if (!marker) return;
        this.running = false;
        this.current = { prompt: marker, inputCol: 0, command: "", done: false };
        break;
      }
      case "B": {
        const cur = this.current;
        if (!cur || cur.input) return;
        const marker = this.term.registerMarker(0);
        if (!marker) return;
        cur.input = marker;
        cur.inputCol = this.term.buffer.active.cursorX;
        marker.onDispose(() => this.drop(cur));
        this.blocks.push(cur);
        this.decorate(cur);
        break;
      }
      case "C": {
        const cur = this.current;
        if (!cur || !cur.input || cur.output) return;
        cur.output = this.term.registerMarker(0) ?? undefined;
        // Capture eagerly: the input rows can scroll out of the buffer
        // long before anyone hovers the block.
        cur.command = this.readCommand(cur);
        this.running = true;
        this.paint(cur);
        break;
      }
      case "D": {
        const cur = this.current;
        this.running = false;
        if (!cur || !cur.input || cur.done) return;
        const arg = data.split(";")[1];
        const code = arg === undefined || arg === "" ? undefined : Number(arg);
        cur.exitCode = Number.isFinite(code as number) ? (code as number) : undefined;
        cur.end = this.term.registerMarker(0) ?? undefined;
        if (!cur.command) cur.command = this.readCommand(cur);
        cur.done = true;
        // Enter on an empty prompt still runs a full B→D cycle in bash/zsh
        // (and PowerShell); nothing executed (no C) and nothing typed means
        // it isn't a block.
        if (!cur.command && !cur.output) {
          this.drop(cur);
          break;
        }
        this.paint(cur);
        break;
      }
    }
  }

  private drop(block: Block) {
    // Input marker scrolled past the scrollback limit: the block is gone.
    block.deco?.dispose();
    if (this.selected === block) this.selected = null;
    if (this.toolbarFor === block) this.hideToolbar();
    const i = this.blocks.indexOf(block);
    if (i >= 0) this.blocks.splice(i, 1);
  }

  // ── Buffer text extraction ────────────────────────────────

  private lineText(y: number, startCol = 0): string {
    const line = this.term.buffer.active.getLine(y);
    return line ? line.translateToString(true, startCol) : "";
  }

  /** The typed command: from B's position through wrapped continuations. */
  private readCommand(block: Block): string {
    if (!block.input || block.input.line < 0) return block.command;
    const buf = this.term.buffer.active;
    const stop = block.output && block.output.line >= 0 ? block.output.line : buf.baseY + buf.cursorY;
    let text = this.lineText(block.input.line, block.inputCol);
    for (let y = block.input.line + 1; y < stop; y++) {
      const line = buf.getLine(y);
      if (!line?.isWrapped) break;
      text += line.translateToString(true);
    }
    return text.trim();
  }

  /** Everything the command printed, trailing blank lines trimmed. */
  private readOutput(block: Block): string {
    if (!block.input || block.input.line < 0) return "";
    let start: number;
    if (block.output && block.output.line >= 0) {
      start = block.output.line;
    } else {
      // No C (PowerShell): output begins after the command's wrapped rows.
      const buf = this.term.buffer.active;
      start = block.input.line + 1;
      while (start < buf.length && buf.getLine(start)?.isWrapped) start++;
    }
    const end = block.end && block.end.line >= 0 ? block.end.line : start - 1;
    const lines: string[] = [];
    for (let y = start; y <= end; y++) lines.push(this.lineText(y));
    while (lines.length && lines[lines.length - 1] === "") lines.pop();
    return lines.join("\n");
  }

  // ── Gutter decoration + toolbar ───────────────────────────

  private statusClass(block: Block): string {
    if (!block.done) return "run";
    return block.exitCode === 0 || block.exitCode === undefined ? "ok" : "err";
  }

  private decorate(block: Block) {
    if (!block.input) return;
    const deco = this.term.registerDecoration({ marker: block.input });
    if (!deco) return;
    block.deco = deco;
    deco.onRender((el) => {
      // onRender fires on every repaint; build the DOM once.
      if (block.gutter && el.contains(block.gutter)) return;
      el.classList.add("block-row");
      const gutter = document.createElement("span");
      gutter.className = `block-gutter ${this.statusClass(block)}`;
      gutter.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.select(block);
      });
      gutter.addEventListener("mouseenter", () => this.showToolbar(block, el));
      gutter.addEventListener("mouseleave", (ev) => {
        const to = ev.relatedTarget as Node | null;
        if (!this.toolbar || !to || !this.toolbar.contains(to)) this.hideToolbar();
      });
      el.appendChild(gutter);
      block.gutter = gutter;
      this.paint(block);
    });
    deco.onDispose(() => {
      if (block.gutter) block.gutter = undefined;
    });
  }

  private paint(block: Block) {
    if (!block.gutter) return;
    block.gutter.className = `block-gutter ${this.statusClass(block)}${
      this.selected === block ? " selected" : ""
    }`;
  }

  private select(block: Block) {
    const prev = this.selected;
    this.selected = this.selected === block ? null : block;
    if (prev) this.paint(prev);
    this.paint(block);
  }

  private hideToolbar() {
    this.toolbar?.remove();
    this.toolbar = null;
    this.toolbarFor = null;
  }

  private showToolbar(block: Block, anchor: HTMLElement) {
    if (this.toolbarFor === block) return;
    this.hideToolbar();
    const bar = document.createElement("div");
    bar.className = "block-toolbar";
    const btn = (label: string, title: string, run: () => void) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.title = title;
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        run();
        this.hideToolbar();
      });
      bar.appendChild(b);
    };
    btn("⌘", "Copy command", () => this.copyText(block.command || this.readCommand(block)));
    btn("⎘", "Copy output", () => this.copyText(this.readOutput(block)));
    btn("⧉", "Copy command + output", () =>
      this.copyText(
        `${block.command || this.readCommand(block)}\n${this.readOutput(block)}`,
      ),
    );
    btn("↻", "Re-run", () => this.rerun(block));
    bar.addEventListener("mouseleave", () => this.hideToolbar());
    // Anchor to the decoration's row inside the pane.
    const paneBox = this.pane.getBoundingClientRect();
    const rowBox = anchor.getBoundingClientRect();
    bar.style.top = `${rowBox.top - paneBox.top}px`;
    this.pane.appendChild(bar);
    this.toolbar = bar;
    this.toolbarFor = block;
  }

  private rerun(block: Block) {
    const cmd = block.command || this.readCommand(block);
    // Only when the prompt is idle: after the last D and before the next C.
    // Where C never arrives (PowerShell) this is best-effort by design.
    if (!cmd || this.running) return;
    this.writeInput(cmd + "\r");
  }

  // ── Keyboard surface (wired from main.ts) ─────────────────

  /**
   * Ctrl/Cmd+Up/Down: jump to the previous/next block's command line.
   * Returns false when there was nothing to do (caller lets xterm have
   * the key). No wraparound at either end, per spec.
   */
  navigate(dir: -1 | 1): boolean {
    const live = this.blocks.filter((b) => b.input && b.input.line >= 0);
    if (!live.length) return false;
    const buf = this.term.buffer.active;
    const anchorLine =
      this.selected?.input && this.selected.input.line >= 0
        ? this.selected.input.line
        : buf.viewportY;
    let target: Block | undefined;
    if (dir < 0) {
      for (let i = live.length - 1; i >= 0; i--) {
        if (live[i].input!.line < anchorLine) {
          target = live[i];
          break;
        }
      }
    } else {
      target = live.find((b) => b.input!.line > anchorLine);
    }
    if (!target) return true; // at the edge: consume the key, move nothing
    if (this.selected !== target) this.select(target);
    this.term.scrollToLine(target.input!.line);
    return true;
  }

  /** Ctrl+Shift+C with a block selected and no text selection. */
  copySelectedOutput(): boolean {
    if (!this.selected) return false;
    this.copyText(this.readOutput(this.selected));
    return true;
  }

  /** Palette action: copy the most recent finished block's output. */
  copyLastOutput(): boolean {
    const live = this.blocks.filter((b) => b.done && b.input && b.input.line >= 0);
    const last = live[live.length - 1];
    if (!last) return false;
    this.copyText(this.readOutput(last));
    return true;
  }
}
