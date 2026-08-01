/**
 * Captures the screenshots embedded in the README.
 *
 * Run against a production build (`npm run build && npm run start`) so the
 * images show real output rather than dev-mode overlays. Deterministic seed
 * data means these are byte-stable between runs, so re-running does not
 * generate spurious diffs.
 */
import { chromium, devices } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.PULSE_BASE_URL ?? "http://localhost:3200";
const OUT = "docs/screenshots";
fs.mkdirSync(OUT, { recursive: true });

/**
 * `colorScheme` is pinned EXPLICITLY on every context.
 *
 * The theme bootstrap in <head> honours `prefers-color-scheme`, so leaving it
 * to Playwright's default made the captures depend on the host machine's OS
 * setting — the first run produced a mix of light and dark shots from the same
 * context. Pinning it makes the image set deterministic and lets the light
 * theme be captured deliberately rather than by accident.
 */
const DESKTOP = {
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
};
const DESKTOP_LIGHT = { ...DESKTOP, colorScheme: "light" };
const MOBILE = { ...devices["iPhone 13"], deviceScaleFactor: 2, colorScheme: "dark" };

const browser = await chromium.launch();
const shots = [];

async function shoot(context, name, path, options = {}) {
  const page = await context.newPage();
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(options.wait ?? 600);
  if (options.before) await options.before(page);
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file, fullPage: options.fullPage ?? false });
  await page.close();
  const kb = Math.round(fs.statSync(file).size / 1024);
  shots.push({ name, kb });
  console.log(`  ${name.padEnd(28)} ${String(kb).padStart(4)} kB`);
  return file;
}

/* ------------------------------------------------------------- start a run -- */
// A fresh run gives the agent console something live to show. It is captured
// mid-flight for the streaming shot and again once finished.
const startRes = await fetch(`${BASE}/api/agent/run`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    goal: "Research what Datadog shipped for background jobs and update our competitor notes",
  }),
});
const { runId } = await startRes.json();
console.log(`\nseeded run ${runId}\n`);

console.log("desktop:");
const desktop = await browser.newContext(DESKTOP);

// Catch the run while tools are still executing.
await shoot(desktop, "agent-streaming", `/agent/${runId}`, { wait: 2_200 });

await shoot(desktop, "dashboard", "/dashboard");
await shoot(desktop, "agent", "/agent");
await shoot(desktop, "audience", "/audience");
await shoot(desktop, "content", "/content");
await shoot(desktop, "memory", "/memory");
await shoot(desktop, "flows", "/flows");
await shoot(desktop, "settings", "/settings");

// Wait for the seeded run to finish, then capture the completed timeline with
// its cost panel.
await new Promise((r) => setTimeout(r, 6_000));
await shoot(desktop, "agent-run-complete", `/agent/${runId}`, { fullPage: true });

/* ------------------------------------------------------------ approval gate -- */
const approvalRes = await fetch(`${BASE}/api/agent/run`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ goal: "Draft the launch announcement email and publish it now" }),
});
const { runId: approvalRunId } = await approvalRes.json();
await new Promise((r) => setTimeout(r, 7_000));
await shoot(desktop, "agent-approval", `/agent/${approvalRunId}`, { wait: 800 });

/* -------------------------------------------------------------- light theme -- */
// A light context needs no DOM poking — the bootstrap script reads the media
// query and applies the theme before first paint, exactly as a real user's
// browser would.
console.log("\nlight theme:");
const light = await browser.newContext(DESKTOP_LIGHT);
await shoot(light, "dashboard-light", "/dashboard");
await shoot(light, "memory-light", "/memory");
await shoot(light, "content-light", "/content");

await desktop.close();
await light.close();

/* ------------------------------------------------------------------ mobile -- */
console.log("\nmobile:");
const mobile = await browser.newContext(MOBILE);
await shoot(mobile, "mobile-dashboard", "/dashboard");
await shoot(mobile, "mobile-agent", `/agent/${runId}`);
await shoot(mobile, "mobile-content", "/content");
await shoot(mobile, "mobile-audience", "/audience");
await shoot(mobile, "mobile-memory", "/memory");
await mobile.close();

await browser.close();

const total = fs
  .readdirSync(OUT)
  .filter((f) => f.endsWith(".png"))
  .reduce((acc, f) => acc + fs.statSync(`${OUT}/${f}`).size, 0);

console.log(`\n${fs.readdirSync(OUT).filter((f) => f.endsWith(".png")).length} screenshots, ${Math.round(total / 1024)} kB total -> ${OUT}/`);
