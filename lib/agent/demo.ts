import * as agentStore from "../resources/agent";
import { buildTools, type ToolContext } from "./tools";
import type { RunUsage } from "../types";

/**
 * Demo planner — used when no ANTHROPIC_API_KEY is set.
 *
 * This is NOT a mock. It drives the exact same `BetaRunnableTool` objects the
 * live agent uses, so every call hits the real resource layer, writes to the
 * real database and emits the real event types. The only thing replaced is the
 * planner: which tools to call, in what order, is scripted rather than decided
 * by Claude.
 *
 * That distinction is what makes the project clonable. Anyone can run it,
 * click through a complete agent run, and see genuine state changes — then set
 * a key and have the identical UI driven by a model instead. The one honest
 * difference is surfaced in the UI as a "demo" badge rather than hidden.
 */

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Tool = ReturnType<typeof buildTools>[number];

interface Plan {
  thinking: string;
  steps: Array<{ tool: string; args: Record<string, unknown>; say?: string }>;
  closing: (results: Record<string, unknown>) => string;
}

export async function runDemo(
  businessId: string,
  runId: string,
  goal: string,
  ctx: ToolContext,
): Promise<void> {
  const tools = buildTools(ctx);
  const byName = new Map<string, Tool>(tools.map((t) => [t.name, t]));
  const plan = choosePlan(goal);

  await sleep(500);
  agentStore.appendEvent(runId, "thinking", { text: plan.thinking });

  const results: Record<string, unknown> = {};

  for (const step of plan.steps) {
    const tool = byName.get(step.tool);
    if (!tool) continue;

    if (step.say) {
      await sleep(450);
      agentStore.appendEvent(runId, "text", { text: step.say });
    }

    await sleep(650);

    // `.parse()` BEFORE `.run()` — this is not optional. The live tool runner
    // always parses raw model input through the Zod schema first, which is what
    // applies defaults like `tags: []`. Calling `.run()` directly skips that,
    // so any field relying on a default arrives `undefined` and the tool throws
    // on first access. Parsing here keeps demo mode on the identical code path.
    const args = tool.parse(resolvePlaceholders(step.args, results));

    // `tool` is a UNION of every tool type, so TypeScript requires `run`'s
    // argument to satisfy the INTERSECTION of all their input schemas — which
    // nothing can. The cast is sound because `parse` and `run` are taken from
    // the same tool object, so the value passed is by construction what that
    // tool's own schema produced.
    const invoke = tool.run as (a: unknown) => Promise<string | unknown[]> | string | unknown[];

    // `.run()` emits the tool_use / tool_result events itself via the traced
    // wrapper in tools.ts — the same path the live runner goes through.
    const raw = await invoke(args);
    try {
      results[step.tool] = JSON.parse(typeof raw === "string" ? raw : "{}");
    } catch {
      results[step.tool] = {};
    }
  }

  await sleep(500);
  agentStore.appendEvent(runId, "text", { text: plan.closing(results) });

  // Token counts are estimated from the actual text produced rather than
  // invented, so the cost panel shows a plausible, internally consistent figure
  // instead of a hard-coded one.
  const usage = estimateUsage(runId);
  agentStore.appendEvent(runId, "usage", {
    ...usage,
    costUsd: agentStore.costOf("claude-opus-5", usage),
    credits: agentStore.creditsOf(usage),
    estimated: true,
  });
  agentStore.appendEvent(runId, "status", { status: "done" });
  agentStore.finishRun(businessId, runId, { status: "done", stopReason: "end_turn", usage });
}

function estimateUsage(runId: string): Omit<RunUsage, "costUsd" | "credits"> {
  const events = agentStore.listEvents(runId);
  const produced = events
    .filter((e) => e.type === "text" || e.type === "thinking")
    .reduce((acc, e) => acc + String(e.payload.text ?? "").length, 0);
  const consumed = events.reduce((acc, e) => acc + JSON.stringify(e.payload).length, 0);

  // ~4 characters per token is the usual English approximation.
  const outputTokens = Math.round(produced / 4) + 200;
  const rawInput = Math.round(consumed / 4) + 3_200 * events.length;

  // Most of the prompt is the frozen system prefix, which would be a cache hit
  // on every turn after the first — so attribute the bulk to cache reads.
  return {
    inputTokens: Math.round(rawInput * 0.22),
    outputTokens,
    cacheReadTokens: Math.round(rawInput * 0.78),
    cacheWriteTokens: 2_400,
  };
}

/* ------------------------------------------------------------------ plans -- */

function choosePlan(goal: string): Plan {
  const g = goal.toLowerCase();
  const wantsPublish = /\b(publish|send it|send now|go live|blast)\b/.test(g);

  if (/\b(competitor|research|what.*shipped|monitor|market)\b/.test(g)) {
    return researchPlan();
  }
  if (/\b(segment|list|audience|add .*(to|who)|enrol|enroll|viewed|trial)\b/.test(g)) {
    return segmentPlan();
  }
  if (/\b(social|linkedin|post|tweet|thread)\b/.test(g)) {
    return socialPlan(goal, wantsPublish);
  }
  return emailPlan(goal, wantsPublish);
}

function emailPlan(goal: string, publish: boolean): Plan {
  const steps: Plan["steps"] = [
    {
      tool: "memory_search",
      args: { query: "brand voice email" },
      say: "Checking memory for the brand voice rules before I draft anything.",
    },
    { tool: "memory_read", args: { path: "/brand/voice.md" } },
    {
      tool: "list_audience_lists",
      args: {},
      say: "The voice notes rule out announcement phrasing, so I'll lead with what shipped. Finding the right list now.",
    },
    {
      tool: "draft_content",
      args: {
        kind: "email",
        title: titleFrom(goal),
        subject: subjectFrom(goal),
        preheader: "Two minutes, three things worth knowing",
        listSlug: "product-updates",
        body: [
          "Three things shipped since the last note.",
          "",
          "**Retry policies you can reason about.** You can now express a retry",
          "budget per job rather than per attempt, so a flapping dependency stops",
          "quietly eating your throughput.",
          "",
          "**A rewritten timeline.** Failure attribution now shows the schedule",
          "that produced a run, not just the run.",
          "",
          "**Temporal support.** Six lines, and every workflow shows up alongside",
          "your other jobs.",
          "",
          "If any of these change how you would set things up, the docs have the",
          "diffs.",
        ].join("\n"),
      },
      say: "Drafting against the product-updates list.",
    },
  ];

  if (publish) {
    steps.push({
      tool: "publish_content",
      args: { contentId: "__LAST_DRAFT__" },
      say: "The draft is ready. Publishing needs your approval since it sends immediately.",
    });
  } else {
    steps.push({
      tool: "schedule_content",
      args: { contentId: "__LAST_DRAFT__", when: nextTuesday9am() },
      say: "Scheduling it for the next Tuesday 9am slot, matching the cadence in the Q3 notes.",
    });
  }

  return {
    thinking:
      "The goal is an email. Before writing anything a human will read I should pull the brand voice from memory — the notes there ban announcement phrasing and set a reading level. Then I need the correct list slug, because inventing one will fail. Draft, then place it.",
    steps,
    closing: (r) => {
      const drafted = r.draft_content as { title?: string } | undefined;
      const scheduled = r.schedule_content as { scheduledAt?: number } | undefined;
      const published = r.publish_content as { published?: boolean } | undefined;

      if (published?.published) {
        return `Sent "${drafted?.title ?? "the email"}". Delivery stats are on the content page and will fill in as opens land.`;
      }
      if (published && !published.published) {
        return `Held "${drafted?.title ?? "the email"}" as a draft — you declined the send. It is unchanged and ready whenever you want it out.`;
      }
      if (scheduled?.scheduledAt) {
        const when = new Date(scheduled.scheduledAt).toUTCString().replace(":00 GMT", " UTC");
        return `Scheduled "${drafted?.title ?? "the email"}" for ${when}, to the product-updates list. It follows the voice rules in /brand/voice.md — no announcement opener, concrete changes only. Nothing else needs doing unless you want the subject line changed.`;
      }
      return `Drafted "${drafted?.title ?? "the email"}". It is sitting in Content as a draft.`;
    },
  };
}

function socialPlan(goal: string, publish: boolean): Plan {
  const steps: Plan["steps"] = [
    { tool: "memory_search", args: { query: "brand voice positioning" }, say: "Pulling the voice and positioning notes." },
    { tool: "memory_read", args: { path: "/brand/positioning.md" } },
    {
      tool: "draft_content",
      args: {
        kind: "social",
        title: titleFrom(goal),
        network: "linkedin",
        body: [
          "Most retry bugs are not retry bugs.",
          "",
          "They are idempotency bugs wearing a costume. The retry just makes the",
          "underlying problem visible by running the same work twice.",
          "",
          "We instrument about 42M background jobs a day. The pattern shows up",
          "constantly: a job times out, gets retried, and the second run collides",
          "with side effects the first one already committed.",
          "",
          "The fix is almost never a longer timeout.",
        ].join("\n"),
      },
      say: "Drafting a LinkedIn post — the Q3 notes say single-image and text posts outperform carousels 3x here.",
    },
  ];

  if (publish) {
    steps.push({
      tool: "publish_content",
      args: { contentId: "__LAST_DRAFT__" },
      say: "Ready to post. This one needs your approval.",
    });
  }

  return {
    thinking:
      "A social post still needs the voice and positioning context — the positioning note has the proof points (42M jobs/day) that make a post like this credible rather than generic.",
    steps,
    closing: (r) => {
      const drafted = r.draft_content as { title?: string } | undefined;
      const published = r.publish_content as { published?: boolean } | undefined;
      if (published?.published) return `Posted "${drafted?.title ?? "the post"}" to LinkedIn.`;
      if (published) return `Left "${drafted?.title ?? "the post"}" as a draft — you declined the post.`;
      return `Drafted "${drafted?.title ?? "the post"}" for LinkedIn. It uses the 42M jobs/day proof point from positioning. Say the word and I'll schedule or post it.`;
    },
  };
}

function researchPlan(): Plan {
  return {
    thinking:
      "This is a research task. I should check what we already have on file before going wide — extending an existing note is more useful than writing a second one that contradicts it.",
    steps: [
      { tool: "memory_list", args: { prefix: "/competitors", deep: false }, say: "Seeing what competitor notes already exist." },
      { tool: "memory_read", args: { path: "/competitors/datadog.md" } },
      {
        tool: "memory_write",
        args: {
          path: "/competitors/datadog.md",
          title: "Competitor — Datadog",
          tags: ["competitor", "research"],
          content: [
            "# Datadog",
            "",
            "## Where they win",
            "Already deployed. One vendor. Strong APM and log correlation.",
            "",
            "## Where they lose",
            "Jobs are second-class — no first-class schedule object, so a missed run",
            "is invisible unless someone wrote a custom monitor. Pricing is per-host",
            "and surprises teams with bursty workers.",
            "",
            "## Update — this quarter",
            "Shipped a scheduled-monitor beta. It narrows the gap on missed-run",
            "detection but is still monitor-per-schedule configuration rather than a",
            "schedule object, so it does not attribute a failure to the schedule that",
            "caused it. Our wedge holds; the setup-time argument is now the stronger",
            "one and the detection argument is weaker.",
            "",
            "## How we talk about them",
            "Never disparage. Position as complementary: keep Datadog for requests,",
            "add us for the work that happens between them.",
          ].join("\n"),
        },
        say: "Their scheduled-monitor beta is the one change that matters. Updating the note rather than starting a new one.",
      },
    ],
    closing: () =>
      "Updated /competitors/datadog.md. The headline change is a scheduled-monitor beta — it narrows our gap on missed-run detection, but it is still configuration-per-schedule rather than a real schedule object, so failure attribution is unchanged. Practical effect: lead with setup time in competitive conversations, not detection.",
  };
}

function segmentPlan(): Plan {
  return {
    thinking:
      "This is a targeting task. Behaviour beats guessing, so I'll build the segment from an actual event rather than from traits, then check the list exists before writing to it.",
    steps: [
      { tool: "query_events", args: { event: "pricing_viewed", sinceDays: 7 }, say: "Finding everyone who viewed pricing in the last 7 days." },
      { tool: "list_audience_lists", args: {} },
      {
        tool: "add_to_list",
        args: { listSlug: "enterprise-leads", emails: "__FROM_EVENTS__" },
        say: "Adding them to Enterprise leads.",
      },
    ],
    closing: (r) => {
      const added = r.add_to_list as { added?: number; alreadyMember?: number } | undefined;
      const q = r.query_events as { uniquePeople?: number } | undefined;
      return `Added ${added?.added ?? 0} people to Enterprise leads. ${added?.alreadyMember ?? 0} of the ${q?.uniquePeople ?? 0} who viewed pricing were already on it, so the list grew by ${added?.added ?? 0}.`;
    },
  };
}

/* ------------------------------------------------------------- arg wiring -- */

/**
 * Two placeholder tokens let a scripted step depend on an earlier step's real
 * output — `__LAST_DRAFT__` for the id of the draft just created, and
 * `__FROM_EVENTS__` for the emails a query returned. Without them the demo
 * would have to hard-code ids that do not exist in a freshly seeded database.
 */
export function resolvePlaceholders(
  args: Record<string, unknown>,
  results: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...args };
  if (out.contentId === "__LAST_DRAFT__") {
    const drafted = results.draft_content as { contentId?: string } | undefined;
    out.contentId = drafted?.contentId ?? "";
  }
  if (out.emails === "__FROM_EVENTS__") {
    const q = results.query_events as { emails?: string[] } | undefined;
    out.emails = (q?.emails ?? []).slice(0, 25);
  }
  return out;
}

function titleFrom(goal: string): string {
  const cleaned = goal.replace(/^(draft|write|create|make|schedule|send)\s+/i, "").trim();
  const short = cleaned.length > 60 ? `${cleaned.slice(0, 57)}…` : cleaned;
  return short.charAt(0).toUpperCase() + short.slice(1);
}

function subjectFrom(goal: string): string {
  if (/changelog|digest|update/i.test(goal)) return "What shipped this month";
  if (/trial/i.test(goal)) return "Three days left on your trial";
  if (/launch/i.test(goal)) return "It's live";
  return titleFrom(goal);
}

function nextTuesday9am(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 9, 0, 0));
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (d.getUTCDay() !== 2);
  return d.toISOString();
}
