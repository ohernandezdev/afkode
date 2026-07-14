// Drive the freshly built afkode via WebView2 CDP: open a Claude tab,
// type a long paragraph, screenshot to check the last line is visible.
const { chromium } = require("playwright-core");
const path = require("path");

const OUT = __dirname;
const shot = (page, name) =>
  page.screenshot({ path: path.join(OUT, name) }).catch((e) => console.log("shot fail", name, e.message));

(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
  const pages = browser.contexts().flatMap((c) => c.pages());
  console.log("pages:", pages.map((p) => p.url()).join(" | "));
  const page = pages.find((p) => /index\.html|localhost:1420\/?$|^https?:\/\/tauri\.localhost\/?$/i.test(p.url()));
  if (!page) throw new Error("main page not found");

  await page.waitForTimeout(2000);
  await shot(page, "state1.png");

  // Dump basic UI state
  const state = await page.evaluate(() => ({
    tabs: [...document.querySelectorAll("#tabs .tab")].length,
    emptyVisible: !document.querySelector("#empty-state")?.classList.contains("hidden"),
    resumeBars: document.querySelectorAll(".resume-bar").length,
    cliButtons: [...document.querySelectorAll("button[data-cmd]")].map((b) => b.dataset.cmd),
    folder: document.querySelector("#picked-folder-label")?.textContent,
  }));
  console.log("state:", JSON.stringify(state));

  // If restored tabs show resume bars, ignore them — start a fresh claude tab.
  if (!state.emptyVisible) {
    await page.evaluate(() => document.querySelector("#btn-new-tab").click());
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button[data-cmd]")].find((b) => (b.dataset.cmd || "").startsWith("claude"));
    if (!btn) throw new Error("no claude launcher");
    btn.click();
  });

  // Wait for Claude Code to paint (loader disappears)
  // The loader appears on spawn; give it a moment to show, then wait until
  // it's gone. Fail loudly if it never disappears instead of typing blind.
  await page.waitForTimeout(2000);
  let started = false;
  for (let i = 0; i < 40; i++) {
    const loading = await page.evaluate(() => !!document.querySelector(".term-loader"));
    if (!loading) { started = true; break; }
    await page.waitForTimeout(1000);
  }
  if (!started) throw new Error("Claude Code never finished loading (.term-loader still visible after 40s)");
  await page.waitForTimeout(2000); // let the TUI paint its first frame
  await shot(page, "state2-claude-started.png");

  // Focus the terminal and type a long paragraph WITHOUT submitting.
  await page.evaluate(() => {
    const ta = document.querySelector(".term-pane.active textarea.xterm-helper-textarea");
    ta?.focus();
  });
  let para = "";
  for (let i = 1; i <= 22; i++) {
    para += `linea${String(i).padStart(2, "0")} aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj `;
  }
  para += "FINAL-DE-PARRAFO";
  await page.keyboard.type(para, { delay: 3 });
  await page.waitForTimeout(2500);
  await shot(page, "state3-typed.png");

  // Diagnostic: geometry of last visible content vs pane
  const geo = await page.evaluate(() => {
    const pane = document.querySelector(".term-pane.active");
    const screen = pane?.querySelector(".xterm-screen");
    const ta = pane?.querySelector("textarea.xterm-helper-textarea");
    const r = (el) => el && { top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom };
    return { pane: r(pane), screen: r(screen), textarea: r(ta) };
  });
  console.log("geometry:", JSON.stringify(geo));

  console.log("DONE");
  process.exit(0);
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
