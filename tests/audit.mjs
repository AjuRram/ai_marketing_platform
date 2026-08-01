/**
 * Multi-viewport route audit.
 *
 * Loads every route at four widths and asserts three things:
 *
 *   1. The URL actually landed where it was asked to. Without this check an app
 *      that silently redirects every route to a login page reports a PERFECT
 *      PASS — the login page has no overflow and no console errors either. It
 *      is the single most important assertion in the file and the easiest to
 *      leave out.
 *   2. Zero horizontal overflow. `document.scrollWidth > clientWidth` is a
 *      programmatic definition of "the page scrolls sideways on a phone",
 *      which is otherwise only caught by eye and only sometimes.
 *   3. Zero console errors.
 *
 * On failure it names the widest offending element, because "something is
 * 138px too wide" is not actionable but "table.min-w-[620px] is 758px" is.
 */
import { chromium, devices } from "@playwright/test";

const BASE = process.env.PULSE_BASE_URL ?? "http://localhost:3200";

const ROUTES = [
  ["dashboard", "/dashboard"],
  ["agent", "/agent"],
  ["audience", "/audience"],
  ["audience-companies", "/audience?tab=companies"],
  ["audience-lists", "/audience?tab=lists"],
  ["content", "/content"],
  ["memory", "/memory"],
  ["flows", "/flows"],
  ["settings", "/settings"],
];

const VIEWPORTS = [
  ["desktop", { viewport: { width: 1440, height: 900 } }],
  ["laptop", { viewport: { width: 1180, height: 820 } }],
  ["tablet", { viewport: { width: 820, height: 1180 } }],
  ["mobile", { ...devices["iPhone 13"] }],
  // 360px is the narrowest common Android width and where layouts break first.
  ["narrow", { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true }],
];

/** Console noise that is not an app defect. */
const IGNORE = [/favicon/i, /Download the React DevTools/i, /ExperimentalWarning/i];

const browser = await chromium.launch();
const problems = [];
let checks = 0;

for (const [label, contextOptions] of VIEWPORTS) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORE.some((re) => re.test(text))) return;
    errors.push(text.slice(0, 200));
  });
  page.on("pageerror", (err) => errors.push(`PAGEERROR: ${String(err).slice(0, 200)}`));

  for (const [name, path] of ROUTES) {
    errors.length = 0;
    checks++;

    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(250);

    // ---- 1. did we land where we asked? ----
    const landedPath = new URL(page.url()).pathname;
    const wantedPath = new URL(BASE + path).pathname;
    if (landedPath !== wantedPath) {
      problems.push({
        label,
        name,
        kind: "REDIRECT",
        detail: `asked for ${wantedPath}, landed on ${landedPath}`,
      });
      console.log(`REDIRECT  ${label.padEnd(8)} ${name.padEnd(20)} -> ${landedPath}`);
      continue;
    }

    // ---- 2. horizontal overflow ----
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    const widest = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      let worst = null;
      for (const el of document.querySelectorAll("body *")) {
        const rect = el.getBoundingClientRect();
        if (rect.width > vw + 1 && (!worst || rect.width > worst.width)) {
          worst = {
            tag: el.tagName.toLowerCase(),
            cls: String(el.className || "").slice(0, 70),
            width: Math.round(rect.width),
          };
        }
      }
      return worst;
    });

    // ---- report ----
    const status = overflow > 1 ? "OVERFLOW" : errors.length ? "ERRORS" : "ok";
    if (status !== "ok") {
      problems.push({
        label,
        name,
        kind: status,
        detail: overflow > 1 ? `${overflow}px` : errors.slice(0, 3).join(" | "),
        widest,
      });
    }

    console.log(
      `${status === "ok" ? "ok      " : status.padEnd(8)} ${label.padEnd(8)} ${name.padEnd(20)}` +
        ` overflow=${String(overflow).padStart(4)}px errors=${errors.length}` +
        (widest ? `  widest=<${widest.tag} class="${widest.cls}"> @${widest.width}px` : ""),
    );
  }

  await context.close();
}

await browser.close();

console.log(`\n${"=".repeat(72)}`);
if (problems.length === 0) {
  console.log(`ALL CLEAN — ${checks} checks across ${VIEWPORTS.length} viewports`);
  process.exit(0);
}

console.log(`${problems.length} PROBLEM(S) of ${checks} checks\n`);
for (const p of problems) {
  console.log(`  [${p.kind}] ${p.label}/${p.name}: ${p.detail}`);
  if (p.widest) {
    console.log(`      widest: <${p.widest.tag} class="${p.widest.cls}"> = ${p.widest.width}px`);
  }
}
process.exit(1);
