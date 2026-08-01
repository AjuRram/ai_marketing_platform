import { all, one, run, tx } from "./client";
import { id, generateApiKey, slugify } from "../ids";

/**
 * Demo data, applied automatically the first time the app boots against an
 * empty database. There is no `npm run seed` step to forget — clone, install,
 * `npm run dev`, and the product is populated.
 *
 * Everything is generated from a FIXED SEED via mulberry32 rather than
 * `Math.random()`. Two reasons: screenshots stay byte-identical between runs
 * so the README images never drift, and a bug that only reproduces on one
 * particular dataset stays reproducible.
 */

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(0x9e3779b9);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Fixed epoch so relative dates in screenshots are stable. */
const NOW = Date.UTC(2026, 7, 1, 9, 30, 0);

export const DEMO_EMAIL = "ops@lumen.dev";

export function isSeeded(): boolean {
  const row = one<{ n: number }>("SELECT COUNT(*) AS n FROM businesses");
  return (row?.n ?? 0) > 0;
}

export function ensureSeeded(): void {
  if (isSeeded()) return;
  tx(seed);
}

function seed(): void {
  const bizId = id("business");

  run(
    `INSERT INTO businesses (id, name, slug, plan, credits_used, credits_limit, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    bizId,
    "Lumen",
    "lumen",
    "team",
    1_284,
    5_000,
    NOW - 214 * DAY,
  );

  run(
    `INSERT INTO users (id, business_id, email, name, role, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id("user"),
    bizId,
    DEMO_EMAIL,
    "Arjun Ramachandran",
    "owner",
    NOW - 214 * DAY,
  );

  seedApiKeys(bizId);
  const companyIds = seedCompanies(bizId);
  const peopleIds = seedPeople(bizId, companyIds);
  const listIds = seedLists(bizId, peopleIds);
  seedEvents(bizId, peopleIds);
  seedMemories(bizId);
  seedContent(bizId, listIds);
  seedFlows(bizId);
  seedAgentHistory(bizId);
}

/* -------------------------------------------------------------- api keys -- */

function seedApiKeys(bizId: string): void {
  const specs: Array<{ name: string; kind: "pk" | "sk"; scopes: string[] }> = [
    { name: "Website tracking", kind: "pk", scopes: ["events:write", "people:identify"] },
    { name: "Server integration", kind: "sk", scopes: ["*"] },
  ];
  for (const spec of specs) {
    const key = generateApiKey(spec.kind);
    run(
      `INSERT INTO api_keys (id, business_id, name, kind, display, hash, scopes, last_used_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id("key"),
      bizId,
      spec.name,
      spec.kind,
      key.display,
      key.hash,
      JSON.stringify(spec.scopes),
      NOW - int(1, 40) * HOUR,
      NOW - 180 * DAY,
    );
  }
}

/* ------------------------------------------------------------- companies -- */

const COMPANIES = [
  ["vercel.com", "Vercel", "Developer tools", 420],
  ["linear.app", "Linear", "Project management", 180],
  ["supabase.com", "Supabase", "Developer tools", 260],
  ["railway.app", "Railway", "Infrastructure", 95],
  ["planetscale.com", "PlanetScale", "Databases", 140],
  ["clerk.com", "Clerk", "Authentication", 110],
  ["resend.com", "Resend", "Email infrastructure", 60],
  ["neon.tech", "Neon", "Databases", 130],
  ["sentry.io", "Sentry", "Observability", 480],
  ["retool.com", "Retool", "Internal tools", 350],
  ["upstash.com", "Upstash", "Infrastructure", 45],
  ["cal.com", "Cal.com", "Scheduling", 70],
] as const;

function seedCompanies(bizId: string): string[] {
  const ids: string[] = [];
  for (const [domain, name, industry, headcount] of COMPANIES) {
    const cid = id("company");
    ids.push(cid);
    run(
      `INSERT INTO companies (id, business_id, domain, name, traits, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      cid,
      bizId,
      domain,
      name,
      JSON.stringify({ industry, headcount, tier: headcount > 200 ? "enterprise" : "growth" }),
      NOW - int(30, 200) * DAY,
      NOW - int(1, 20) * DAY,
    );
  }
  return ids;
}

/* ---------------------------------------------------------------- people -- */

const FIRST = [
  "Maya", "Devon", "Priya", "Tomas", "Ines", "Kai", "Rina", "Elliot", "Noor", "Sasha",
  "Jonas", "Amara", "Luca", "Freya", "Omar", "Hana", "Nils", "Zara", "Theo", "Mira",
  "Ravi", "Lena", "Yusuf", "Cleo", "Anton", "Isla", "Marco", "Nadia", "Felix", "Ada",
];
const LAST = [
  "Okafor", "Reyes", "Lindqvist", "Haddad", "Moreau", "Nakamura", "Bauer", "Silva",
  "Kowalski", "Ferrari", "Petrov", "Andersen", "Costa", "Novak", "Dubois", "Weber",
];
const ROLES = [
  "Head of Growth", "Founder", "CTO", "Product Marketing Manager", "Developer Advocate",
  "VP Engineering", "Content Lead", "Demand Gen Manager", "Staff Engineer", "COO",
];
const SOURCES = ["organic", "docs", "changelog", "referral", "conference", "newsletter"];

function seedPeople(bizId: string, companyIds: string[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < 46; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const companyIdx = int(0, companyIds.length - 1);
    const domain = COMPANIES[companyIdx]![0];
    const email = `${first.toLowerCase()}.${last.toLowerCase()}@${domain}`;
    if (seen.has(email)) continue;
    seen.add(email);

    const pid = id("person");
    ids.push(pid);
    const createdAt = NOW - int(2, 180) * DAY;

    run(
      `INSERT INTO people (id, business_id, email, name, company_id, traits, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      pid,
      bizId,
      email,
      `${first} ${last}`,
      companyIds[companyIdx]!,
      JSON.stringify({
        role: pick(ROLES),
        source: pick(SOURCES),
        plan: pick(["free", "free", "pro", "trial"]),
        lifecycle: pick(["subscriber", "lead", "lead", "customer"]),
      }),
      createdAt,
      createdAt + int(0, 20) * DAY,
    );
  }
  return ids;
}

/* ----------------------------------------------------------------- lists -- */

const LISTS = [
  ["All subscribers", "Everyone who has opted in to hear from us.", 1.0],
  ["Product updates", "Wants release notes and changelog digests.", 0.62],
  ["Trial users", "Started a trial in the last 30 days.", 0.28],
  ["Enterprise leads", "Companies above 200 headcount, sales-assisted.", 0.2],
] as const;

function seedLists(bizId: string, peopleIds: string[]): string[] {
  const ids: string[] = [];
  for (const [name, description, share] of LISTS) {
    const lid = id("list");
    ids.push(lid);
    run(
      `INSERT INTO lists (id, business_id, slug, name, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      lid,
      bizId,
      slugify(name),
      name,
      description,
      NOW - int(60, 180) * DAY,
    );

    for (const pid of peopleIds) {
      if (rnd() > share) continue;
      run(
        `INSERT OR IGNORE INTO list_members (list_id, person_id, added_at) VALUES (?, ?, ?)`,
        lid,
        pid,
        NOW - int(1, 90) * DAY,
      );
    }
  }
  return ids;
}

/* ---------------------------------------------------------------- events -- */

const EVENT_NAMES = [
  "page_view", "page_view", "page_view", "page_view",
  "docs_viewed", "docs_viewed",
  "signup_started", "trial_started", "email_opened", "email_clicked",
  "pricing_viewed", "changelog_viewed", "invite_sent",
];

const PATHS = ["/", "/pricing", "/docs/quickstart", "/changelog", "/blog", "/docs/api"];

function seedEvents(bizId: string, peopleIds: string[]): void {
  for (let i = 0; i < 900; i++) {
    const name = pick(EVENT_NAMES);
    // Weight recent days more heavily so the activity chart trends upward.
    const daysAgo = Math.floor(Math.pow(rnd(), 1.7) * 30);
    run(
      `INSERT INTO events (id, business_id, person_id, name, props, ts) VALUES (?, ?, ?, ?, ?, ?)`,
      id("event"),
      bizId,
      rnd() > 0.18 ? pick(peopleIds) : null,
      name,
      JSON.stringify(name === "page_view" ? { path: pick(PATHS) } : { source: pick(SOURCES) }),
      NOW - daysAgo * DAY - int(0, 23) * HOUR,
    );
  }
}

/* -------------------------------------------------------------- memories -- */

const MEMORIES: Array<[path: string, title: string, tags: string[], pinned: boolean, body: string]> = [
  [
    "/brand/voice.md",
    "Brand voice",
    ["brand", "writing"],
    true,
    `# Voice

Plain, technical, unhurried. We write the way a senior engineer explains
something to a peer who is busy — direct, specific, no throat-clearing.

## Rules
- Lead with the outcome. The first sentence answers "what happened".
- Concrete numbers over adjectives. "cut p95 from 840ms to 120ms", not "much faster".
- Second person. "You can…" not "Users can…".
- No exclamation marks. No emoji in email subjects.
- Contractions are fine. Corporate throat-clearing is not.

## Banned phrases
"revolutionary", "game-changing", "seamless", "leverage" (as a verb),
"in today's fast-paced world", "we're excited to announce".

Prefer "we shipped" over "we're excited to announce".

## Reading level
Grade 9. Sentences under 25 words. One idea per paragraph.`,
  ],
  [
    "/brand/positioning.md",
    "Positioning",
    ["brand", "strategy"],
    true,
    `# Positioning

**Category**: observability for background jobs.

**One-liner**: Lumen shows you why the job that was supposed to run at 3am
didn't.

## The wedge
Existing APM tools are built around request/response. They treat a cron job or
a queue worker as an anonymous blob of time. We index by *job*, not by trace,
so a failure is attributable to the schedule that caused it.

## Proof points
- p95 alert latency 12s vs 4m for the incumbent
- Drop-in for BullMQ, Sidekiq, Celery, Temporal — 6 lines of setup
- 1,400 teams, 42M jobs/day

## Who we lose to and why
- **Datadog**: already deployed, budget already spent. Beat them on setup time.
- **Homegrown Grafana**: free. Beat them on the maintenance burden.`,
  ],
  [
    "/personas/platform-lead.md",
    "Persona — Platform Lead",
    ["persona"],
    false,
    `# Platform Lead

Runs infra for a 30–150 engineer company. Owns the on-call rotation.

## Pains
- Gets paged for job failures with no context on which schedule broke.
- Cannot answer "did last night's billing run finish?" without SSHing.
- Has three half-built Grafana dashboards nobody trusts.

## Triggers
A postmortem where the root cause was a silently failing cron.
A new hire asking "how do we know jobs ran?" and getting no good answer.

## Objections
- "We already pay for Datadog." → Show the jobs view side by side.
- "Another agent to deploy." → It's a library, not a daemon.

## What lands
Screenshots of a real failure timeline. Setup diffs. Latency numbers.`,
  ],
  [
    "/personas/founder.md",
    "Persona — Technical founder",
    ["persona"],
    false,
    `# Technical founder

5–25 people, no dedicated platform team. Writes code most days.

## Pains
Everything is on them. A silent job failure is discovered by a customer.

## Triggers
First time a payment reconciliation job fails quietly.

## What lands
Time-to-value. "6 lines and you're done." Free tier that isn't crippled.`,
  ],
  [
    "/competitors/datadog.md",
    "Competitor — Datadog",
    ["competitor", "research"],
    false,
    `# Datadog

## Where they win
Already deployed. One vendor. Strong APM and log correlation.

## Where they lose
Jobs are second-class — no first-class schedule object, so a missed run is
invisible unless someone wrote a custom monitor. Pricing is per-host and
surprises teams with bursty workers.

## How we talk about them
Never disparage. Position as complementary: "keep Datadog for requests, add
Lumen for the work that happens between them."`,
  ],
  [
    "/campaigns/2026-q3-notes.md",
    "Q3 2026 — running notes",
    ["campaign"],
    false,
    `# Q3 2026

## What worked
- Changelog digest: 41% open, 9.2% click. Best performer this quarter.
- "Why your cron is lying to you" post — 18k reads, 340 signups.

## What didn't
- Webinar invite: 11% open. Audience does not want live events.
- LinkedIn carousels: low reach. Single-image posts do 3x better.

## Decision
Stop producing webinars. Double the changelog cadence to fortnightly.`,
  ],
];

function seedMemories(bizId: string): void {
  const dirs = new Set<string>();
  for (const [path] of MEMORIES) {
    const dir = path.slice(0, path.lastIndexOf("/")) || "/";
    if (dir !== "/") dirs.add(dir);
  }

  for (const dir of [...dirs].sort()) {
    run(
      `INSERT INTO memories (id, business_id, path, title, content, tags, pinned, is_dir, created_at, updated_at)
       VALUES (?, ?, ?, ?, '', '[]', 0, 1, ?, ?)`,
      id("memory"),
      bizId,
      dir,
      dir.slice(1),
      NOW - 200 * DAY,
      NOW - 200 * DAY,
    );
  }

  for (const [path, title, tags, pinned, body] of MEMORIES) {
    run(
      `INSERT INTO memories (id, business_id, path, title, content, tags, pinned, is_dir, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      id("memory"),
      bizId,
      path,
      title,
      body,
      JSON.stringify(tags),
      pinned ? 1 : 0,
      NOW - int(40, 200) * DAY,
      NOW - int(1, 30) * DAY,
    );
  }
}

/* --------------------------------------------------------------- content -- */

function seedContent(bizId: string, listIds: string[]): void {
  const items: Array<{
    kind: "email" | "social" | "blog";
    status: "draft" | "scheduled" | "published";
    title: string;
    body: string;
    meta: Record<string, unknown>;
    by: "human" | "agent";
    offsetDays: number;
  }> = [
    {
      kind: "blog", status: "published", offsetDays: -22, by: "human",
      title: "Why your cron is lying to you",
      body: "A job that exits 0 has not necessarily done its work. Here is how we\ninstrument the difference between 'ran' and 'succeeded'…",
      meta: { excerpt: "Exit code 0 is not success.", tags: ["engineering", "observability"], impressions: 18_400 },
    },
    {
      kind: "email", status: "published", offsetDays: -14, by: "agent",
      title: "Changelog digest — July",
      body: "Three things shipped this month that are worth two minutes of your time…",
      meta: { subject: "What shipped in July", preheader: "Retries, a faster jobs view, and Temporal support", sent: 1_240, opened: 508, clicked: 114 },
    },
    {
      kind: "social", status: "published", offsetDays: -11, by: "agent",
      title: "Temporal support is live",
      body: "Temporal support shipped today. Six lines, and every workflow shows up in your jobs view with real failure attribution.",
      meta: { network: "linkedin", impressions: 4_120 },
    },
    {
      kind: "email", status: "published", offsetDays: -7, by: "human",
      title: "Your trial ends in 3 days",
      body: "You have 3 days left. Here is what teams usually set up before day 14…",
      meta: { subject: "3 days left on your trial", sent: 86, opened: 51, clicked: 22 },
    },
    {
      kind: "blog", status: "scheduled", offsetDays: 3, by: "agent",
      title: "The anatomy of a silent job failure",
      body: "Five ways a background job fails without telling anyone, and what each one\nlooks like in your metrics…",
      meta: { excerpt: "Five failure modes, and how each one hides.", tags: ["engineering"] },
    },
    {
      kind: "email", status: "scheduled", offsetDays: 1, by: "agent",
      title: "Changelog digest — August",
      body: "Retry policies you can actually reason about, plus a rewritten timeline view…",
      meta: { subject: "What shipped in August", preheader: "Retry policies and a rewritten timeline" },
    },
    {
      kind: "social", status: "scheduled", offsetDays: 2, by: "agent",
      title: "Retry policies thread",
      body: "Most retry bugs are not retry bugs. They are idempotency bugs wearing a costume. A thread on what we learned instrumenting 42M jobs a day.",
      meta: { network: "x" },
    },
    {
      kind: "email", status: "draft", offsetDays: 0, by: "agent",
      title: "Enterprise outreach — platform leads",
      body: "You are running background jobs at a scale where a silent failure costs\nreal money. Here is the 6-line setup…",
      meta: { subject: "The job that did not run last night" },
    },
    {
      kind: "blog", status: "draft", offsetDays: 0, by: "agent",
      title: "Benchmarking alert latency across 4 tools",
      body: "We measured time-to-page for an identical failing job across four setups…",
      meta: { excerpt: "12s vs 4m, measured.", tags: ["benchmarks"] },
    },
    {
      kind: "social", status: "draft", offsetDays: 0, by: "human",
      title: "Postmortem culture post",
      body: "The best postmortems we have read all share one property: they name the missing signal, not the person.",
      meta: { network: "linkedin" },
    },
  ];

  for (const item of items) {
    const at = NOW + item.offsetDays * DAY;
    run(
      `INSERT INTO content (id, business_id, kind, status, title, slug, body, channel_meta,
                            list_id, created_by, scheduled_at, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id("content"),
      bizId,
      item.kind,
      item.status,
      item.title,
      item.kind === "blog" ? slugify(item.title) : null,
      item.body,
      JSON.stringify(item.meta),
      item.kind === "email" ? pick(listIds) : null,
      item.by,
      item.status === "scheduled" ? at : null,
      item.status === "published" ? at : null,
      at - int(1, 5) * DAY,
      at - int(0, 1) * DAY,
    );
  }
}

/* ----------------------------------------------------------------- flows -- */

function seedFlows(bizId: string): void {
  const flows = [
    {
      name: "Trial onboarding",
      description: "Five-day sequence for anyone who starts a trial.",
      trigger: { type: "event", event: "trial_started" },
      steps: [
        { type: "send_email", subject: "You're in — here's the 6-line setup", body: "Welcome. Paste this into your worker…" },
        { type: "wait", hours: 48 },
        { type: "send_email", subject: "The three checks most teams add first", body: "Once jobs are reporting, these are the alerts worth having…" },
        { type: "wait", hours: 72 },
        { type: "add_to_list", listSlug: "product-updates" },
      ],
    },
    {
      name: "Enterprise lead routing",
      description: "Tag and route anyone from a company above 200 headcount.",
      trigger: { type: "event", event: "pricing_viewed" },
      steps: [
        { type: "condition", trait: "lifecycle", equals: "lead" },
        { type: "tag", key: "priority", value: "high" },
        { type: "add_to_list", listSlug: "enterprise-leads" },
      ],
    },
    {
      name: "Fortnightly changelog digest",
      description: "Drafts and sends the changelog digest every other Tuesday.",
      trigger: { type: "schedule", cron: "0 9 */14 * 2" },
      steps: [
        { type: "send_email", subject: "What shipped", body: "Auto-assembled from the changelog." },
      ],
    },
  ];

  for (const f of flows) {
    run(
      `INSERT INTO flows (id, business_id, name, description, trigger, steps, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      id("flow"),
      bizId,
      f.name,
      f.description,
      JSON.stringify(f.trigger),
      JSON.stringify(f.steps),
      NOW - int(30, 120) * DAY,
      NOW - int(1, 20) * DAY,
    );
  }
}

/* --------------------------------------------------------- agent history -- */

function seedAgentHistory(bizId: string): void {
  const runs = [
    {
      goal: "Draft the August changelog digest and schedule it for Tuesday 9am",
      status: "done" as const,
      daysAgo: 2,
      input: 34_820, output: 4_610, cacheRead: 28_400, cacheWrite: 6_100,
      steps: [
        ["thinking", { text: "I need the brand voice and what shipped recently before drafting anything." }],
        ["tool_use", { name: "memory_search", input: { query: "brand voice changelog" } }],
        ["tool_result", { name: "memory_search", ok: true, summary: "2 memories: /brand/voice.md, /campaigns/2026-q3-notes.md" }],
        ["tool_use", { name: "memory_read", input: { path: "/brand/voice.md" } }],
        ["tool_result", { name: "memory_read", ok: true, summary: "Voice: plain, technical, no exclamation marks, banned phrases list" }],
        ["text", { text: "Q3 notes say the changelog digest is the best performer at 41% open, so I'll keep the format and stay inside the voice rules." }],
        ["tool_use", { name: "draft_email", input: { title: "Changelog digest — August", subject: "What shipped in August" } }],
        ["tool_result", { name: "draft_email", ok: true, summary: "Created draft cnt_… (email)" }],
        ["tool_use", { name: "schedule_content", input: { when: "2026-08-04T09:00:00Z" } }],
        ["tool_result", { name: "schedule_content", ok: true, summary: "Scheduled for Aug 4, 09:00 UTC" }],
        ["text", { text: "Scheduled the August digest for Tuesday 4 August at 09:00 UTC, matching the fortnightly cadence Q3 notes recommended." }],
      ],
    },
    {
      goal: "Research what Datadog shipped for background jobs this quarter and write it to memory",
      status: "done" as const,
      daysAgo: 6,
      input: 51_200, output: 7_340, cacheRead: 41_000, cacheWrite: 9_800,
      steps: [
        ["thinking", { text: "Check what we already have on Datadog so I extend the note rather than duplicating it." }],
        ["tool_use", { name: "memory_read", input: { path: "/competitors/datadog.md" } }],
        ["tool_result", { name: "memory_read", ok: true, summary: "Existing note, last updated 40 days ago" }],
        ["tool_use", { name: "web_search", input: { query: "Datadog background jobs monitoring release 2026" } }],
        ["tool_result", { name: "web_search", ok: true, summary: "6 results" }],
        ["tool_use", { name: "memory_write", input: { path: "/competitors/datadog.md" } }],
        ["tool_result", { name: "memory_write", ok: true, summary: "Updated /competitors/datadog.md" }],
        ["text", { text: "Updated the Datadog note. The headline change is a scheduled-monitor beta, which narrows our gap on missed-run detection but still has no first-class schedule object." }],
      ],
    },
    {
      goal: "Add everyone who viewed pricing in the last 7 days to the enterprise leads list",
      status: "done" as const,
      daysAgo: 9,
      input: 12_400, output: 1_820, cacheRead: 9_600, cacheWrite: 2_100,
      steps: [
        ["tool_use", { name: "query_events", input: { name: "pricing_viewed", days: 7 } }],
        ["tool_result", { name: "query_events", ok: true, summary: "31 events from 19 people" }],
        ["tool_use", { name: "add_to_list", input: { listSlug: "enterprise-leads", count: 19 } }],
        ["tool_result", { name: "add_to_list", ok: true, summary: "Added 12 people (7 already members)" }],
        ["text", { text: "Added 12 new people to Enterprise leads. Seven of the nineteen were already on it." }],
      ],
    },
  ];

  for (const r of runs) {
    const runId = id("agentRun");
    const created = NOW - r.daysAgo * DAY;
    const costUsd = (r.input * 5) / 1e6 + (r.output * 25) / 1e6;
    const credits = Math.ceil((r.output + r.input / 10) / 100);

    run(
      `INSERT INTO agent_runs (id, business_id, goal, status, mode, model, effort, stop_reason,
                               input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                               cost_usd, credits, created_at, finished_at)
       VALUES (?, ?, ?, ?, 'live', ?, 'high', 'end_turn', ?, ?, ?, ?, ?, ?, ?, ?)`,
      runId,
      bizId,
      r.goal,
      r.status,
      "claude-opus-5",
      r.input,
      r.output,
      r.cacheRead,
      r.cacheWrite,
      costUsd,
      credits,
      created,
      created + int(40, 180) * 1000,
    );

    let seq = 0;
    run(
      `INSERT INTO agent_events (id, run_id, seq, type, payload, ts) VALUES (?, ?, ?, 'status', ?, ?)`,
      id("agentEvent"), runId, seq++, JSON.stringify({ status: "running" }), created,
    );
    for (const [type, payload] of r.steps as Array<[string, unknown]>) {
      run(
        `INSERT INTO agent_events (id, run_id, seq, type, payload, ts) VALUES (?, ?, ?, ?, ?, ?)`,
        id("agentEvent"), runId, seq, type, JSON.stringify(payload), created + seq * 4200,
      );
      seq++;
    }
    run(
      `INSERT INTO agent_events (id, run_id, seq, type, payload, ts) VALUES (?, ?, ?, 'status', ?, ?)`,
      id("agentEvent"), runId, seq, JSON.stringify({ status: "done" }), created + seq * 4200,
    );
  }
}
