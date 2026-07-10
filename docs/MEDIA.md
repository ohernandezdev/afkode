# Media capture guide

Assets for the README live in `docs/media/`. Current state and the shot list for
what's still missing. Keep captures at the default window size (1040×700), PNG for
stills, GIF/WebP under ~8 MB for GitHub rendering.

## Have

- `afkode-claude-session.png` — real session: AFKode supervising a Claude Code run
  (tabs, command blocks, git footer, hotkey hints). Used as the README hero image.

## Wanted (need a game running — capture on a real setup)

1. **Hero GIF** (`hero.gif`, ~15 s): game in borderless fullscreen → `Alt+X` overlay
   appears over it → agent working → `Alt+G` ghost mode (clicks reach the game) →
   `Alt+X` hide. This is the money shot; keep the game HUD visible around the edges.
   - Record with ScreenToGif (or `Win+Alt+R` then convert: `ffmpeg -i clip.mp4 -vf "fps=12,scale=960:-1" hero.gif`).
2. **HUD pill + approve** (`hud-approve.gif`, ~8 s): overlay hidden, pill flips to
   🟡 waiting, click ↩ (or `Alt+A`) → approved → 🟠 working.
3. **Prompt palette** (`palette.png`): `Alt+P` open with a `/command` or `@file`
   suggestion list visible and the target-session context line.
4. **Between-matches inbox** (`inbox.png`): overlay reopened with 2–3 queued items
   (waiting + done rows) after a DND stretch.
5. **Command blocks** (`blocks.png`): a shell tab with a few blocks — one failed
   (red gutter) — with the hover toolbar visible.
6. **Themes** (`themes.png`): settings open on the theme picker, or a 2×2 collage.

Before publishing any capture: check the terminal content for tokens, private
paths, or personal info — scrollback leaks are easy to miss.

Slot each new asset into `README.md` where the `<!-- TODO(media): ... -->` comment
sits (hero GIF replaces the comment under the badges).
