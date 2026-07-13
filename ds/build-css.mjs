// Generates dist/styles.css from the app's real stylesheet.
// The two node_modules @imports (xterm, highlight.js) style terminal internals
// that never appear in a design, and don't resolve outside the app build.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "src", "styles.css"), "utf8");
const out = src
  .split("\n")
  .filter(
    (l) =>
      !l.includes('@import "@xterm/xterm/css/xterm.css"') &&
      !l.includes('@import "highlight.js/')
  )
  .join("\n");
writeFileSync(join(here, "dist", "styles.css"), out);
console.log("dist/styles.css written (%d bytes)", out.length);
