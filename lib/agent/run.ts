import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, dynamicContext } from "./prompt";
import { buildTools, type ToolContext } from "./tools";
import { runDemo } from "./demo";
import * as agentStore from "../resources/agent";
import { pinnedContext } from "../resources/memory";
import { one } from "../db/client";
import type { AgentRun, RunUsage } from "../types";

/**
 * Agent execution.
 *
 * A run executes in the BACKGROUND, detached from the HTTP request that started
 * it, and streams by writing every event to `agent_events` as it happens. The
 * SSE endpoint is a separate reader over that table.
 *
 * Doing it this way rather than streaming directly out of the request buys
 * three things that matter: closing the tab does not kill a campaign halfway
 * through; a refresh replays the run exactly; and two people can watch the same
 * run at once. The cost is that a serverless deploy needs `waitUntil` to keep
 * the function alive — noted in the README.
 */

const MODEL = process.env.PULSE_MODEL?.trim() || "claude-opus-5";
const EFFORT = (process.env.PULSE_EFFORT?.trim() || "high") as
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function agentMode(): "live" | "demo" {
  return hasApiKey() ? "live" : "demo";
}

const ZERO_USAGE: Omit<RunUsage, "costUsd" | "credits"> = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

/** Starts a run and returns immediately. Execution continues in the background. */
export function startRun(businessId: string, goal: string): AgentRun {
  const mode = agentMode();
  const run = agentStore.createRun(businessId, {
    goal,
    model: mode === "live" ? MODEL : "demo-planner",
    effort: EFFORT,
    mode,
  });

  agentStore.appendEvent(run.id, "status", { status: "running", mode });

  // Intentionally not awaited — the caller returns the run id straight away.
  void execute(businessId, run.id, goal, mode).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    agentStore.appendEvent(run.id, "error", { message });
    agentStore.finishRun(businessId, run.id, {
      status: "failed",
      error: message,
      usage: ZERO_USAGE,
    });
  });

  return run;
}

async function execute(
  businessId: string,
  runId: string,
  goal: string,
  mode: "live" | "demo",
): Promise<void> {
  const ctx = makeContext(businessId, runId);
  if (mode === "demo") {
    await runDemo(businessId, runId, goal, ctx);
    return;
  }
  await runLive(businessId, runId, goal, ctx);
}

/* ------------------------------------------------------------- approvals -- */

function makeContext(businessId: string, runId: string): ToolContext {
  return {
    businessId,
    runId,
    emit: (type, payload) => {
      agentStore.appendEvent(runId, type, payload);
    },
    requireApproval: async (tool, input, summary) => {
      const approval = agentStore.createApproval(businessId, runId, { tool, input, summary });
      agentStore.appendEvent(runId, "approval", {
        approvalId: approval.id,
        tool,
        summary,
        decision: null,
      });
      agentStore.setRunStatus(businessId, runId, "awaiting_approval");

      const decision = await waitForDecision(businessId, approval.id);

      agentStore.setRunStatus(businessId, runId, "running");
      agentStore.appendEvent(runId, "approval", {
        approvalId: approval.id,
        tool,
        summary,
        decision: decision ?? "timeout",
      });
      return decision === "allow";
    },
  };
}

/**
 * Polls for a decision.
 *
 * Polling rather than an in-memory promise registry because the decision
 * arrives on a DIFFERENT request (the approve endpoint), and in dev that can
 * even be a different module instance after a hot reload. A shared table is the
 * only thing both sides reliably see.
 */
async function waitForDecision(
  businessId: string,
  approvalId: string,
  timeoutMs = 5 * 60_000,
): Promise<"allow" | "deny" | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const approval = agentStore.getApproval(businessId, approvalId);
    if (approval?.decision) return approval.decision;
    await sleep(400);
  }
  return null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ live -- */

async function runLive(
  businessId: string,
  runId: string,
  goal: string,
  ctx: ToolContext,
): Promise<void> {
  const client = new Anthropic();
  const tools = buildTools(ctx);

  const business = one<{ name: string }>("SELECT name FROM businesses WHERE id = ?", businessId);
  const context = dynamicContext({
    businessName: business?.name ?? "this company",
    today: new Date().toISOString().slice(0, 10),
    pinned: pinnedContext(businessId),
  });

  const usage = { ...ZERO_USAGE };
  let stopReason: string | null = null;

  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 32_000,

    // Adaptive thinking: Claude decides depth per task. `budget_tokens` is
    // removed on Opus 5 and returns a 400. `display: "summarized"` is a
    // deliberate opt-in — the default is "omitted", which streams thinking
    // blocks with empty text and shows the user a long dead pause before any
    // output appears.
    thinking: { type: "adaptive", display: "summarized" },
    output_config: { effort: EFFORT },

    // The cached prefix. Order is tools -> system -> messages, and this string
    // is frozen at module scope so the prefix is byte-identical across runs.
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],

    // Per-run context rides as a `role: "system"` message AFTER the cached
    // prefix rather than being merged into `system` above — which would
    // invalidate the cache on every run.
    messages: [
      { role: "user", content: goal },
      { role: "system", content: context },
    ],

    tools,
    // Must stay a literal `true`, not widened to `boolean`. The runner is
    // generic over it: `stream: true` makes each iteration yield a
    // BetaMessageStream, while `boolean` collapses that to a union with
    // BetaMessage and nothing downstream type-checks.
    stream: true,
  });

  for await (const item of runner) {
    // With `stream: true` every iteration is a BetaMessageStream. The declared
    // return type still widens to `BetaMessage | BetaMessageStream` because
    // BetaToolRunnerParams is an Omit over a UNION of the streaming and
    // non-streaming param shapes, which defeats the `stream: true` overload.
    // This is a real narrowing rather than a cast, so a future SDK change that
    // genuinely returns a plain message degrades to skipping, not crashing.
    if (!("finalMessage" in item)) continue;
    const stream = item;

    // Text deltas accumulate as they arrive; thinking summaries are collected
    // separately so the UI can render them in their own lane.
    let text = "";
    let thinking = "";

    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          text += event.delta.text;
        } else if (event.delta.type === "thinking_delta") {
          thinking += event.delta.thinking;
        }
      }
    }

    const message = await stream.finalMessage();

    if (thinking.trim()) agentStore.appendEvent(runId, "thinking", { text: thinking.trim() });
    if (text.trim()) agentStore.appendEvent(runId, "text", { text: text.trim() });

    usage.inputTokens += message.usage.input_tokens ?? 0;
    usage.outputTokens += message.usage.output_tokens ?? 0;
    usage.cacheReadTokens += message.usage.cache_read_input_tokens ?? 0;
    usage.cacheWriteTokens += message.usage.cache_creation_input_tokens ?? 0;

    stopReason = message.stop_reason ?? null;

    // Check stop_reason BEFORE trusting content. Opus 5's safety classifiers
    // can decline a request and still return HTTP 200 with an empty or partial
    // content array; code that reads content[0] unconditionally breaks here.
    if (message.stop_reason === "refusal") {
      agentStore.appendEvent(runId, "error", {
        message: "The model declined this request.",
        stopReason: "refusal",
      });
      agentStore.finishRun(businessId, runId, {
        status: "refused",
        stopReason: "refusal",
        usage,
      });
      return;
    }
  }

  agentStore.appendEvent(runId, "usage", {
    ...usage,
    costUsd: agentStore.costOf(MODEL, usage),
    credits: agentStore.creditsOf(usage),
  });
  agentStore.appendEvent(runId, "status", { status: "done" });
  agentStore.finishRun(businessId, runId, { status: "done", stopReason, usage });
}
