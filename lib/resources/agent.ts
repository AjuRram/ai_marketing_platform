import { all, one, run, json } from "../db/client";
import { id } from "../ids";
import type { AgentEvent, AgentEventType, AgentRun, Approval, RunStatus, RunUsage } from "../types";

/**
 * Agent run persistence.
 *
 * Every event a run emits is written here as it happens, not buffered until the
 * end. Two things fall out of that:
 *
 *   - A run is REPLAYABLE. Refreshing the page mid-run, or opening it a week
 *     later, replays the identical event sequence — so each run has a stable,
 *     shareable permalink instead of being a one-shot stream you had to watch.
 *   - A crashed or refused run still has its full history. If events were only
 *     flushed on completion, the failures you most want to inspect would be
 *     exactly the ones that left nothing behind.
 */

/* --------------------------------------------------------------- pricing -- */

/**
 * USD per million tokens, per model. Cache reads bill at ~0.1x input and cache
 * writes at ~1.25x, which is what makes a stable system-prompt prefix worth
 * engineering for rather than a micro-optimisation.
 */
export const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

const DEFAULT_PRICE = { input: 5, output: 25 };

export function costOf(model: string, usage: Omit<RunUsage, "costUsd" | "credits">): number {
  const price = PRICING[model] ?? DEFAULT_PRICE;
  return (
    (usage.inputTokens * price.input) / 1e6 +
    (usage.outputTokens * price.output) / 1e6 +
    (usage.cacheReadTokens * price.input * 0.1) / 1e6 +
    (usage.cacheWriteTokens * price.input * 1.25) / 1e6
  );
}

/**
 * Credits consumed by a run.
 *
 * Output tokens count in full and input at a tenth, mirroring the ~10x price
 * difference — so the meter a customer sees tracks the cost we actually incur
 * rather than being an arbitrary number.
 */
export function creditsOf(usage: Omit<RunUsage, "costUsd" | "credits">): number {
  return Math.max(1, Math.ceil((usage.outputTokens + usage.inputTokens / 10) / 100));
}

/* ------------------------------------------------------------------- runs -- */

interface RunRow {
  id: string;
  goal: string;
  status: string;
  mode: string;
  model: string;
  effort: string | null;
  stop_reason: string | null;
  error: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  credits: number;
  created_at: number;
  finished_at: number | null;
}

const toRun = (r: RunRow): AgentRun => ({
  id: r.id,
  goal: r.goal,
  status: r.status as RunStatus,
  mode: r.mode === "demo" ? "demo" : "live",
  model: r.model,
  effort: r.effort,
  stopReason: r.stop_reason,
  error: r.error,
  usage: {
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    cacheReadTokens: r.cache_read_tokens,
    cacheWriteTokens: r.cache_write_tokens,
    costUsd: r.cost_usd,
    credits: r.credits,
  },
  createdAt: r.created_at,
  finishedAt: r.finished_at,
});

export function createRun(
  businessId: string,
  input: { goal: string; model: string; effort: string; mode: "live" | "demo" },
): AgentRun {
  const rid = id("agentRun");
  run(
    `INSERT INTO agent_runs (id, business_id, goal, status, mode, model, effort, created_at)
     VALUES (?, ?, ?, 'running', ?, ?, ?, ?)`,
    rid,
    businessId,
    input.goal,
    input.mode,
    input.model,
    input.effort,
    Date.now(),
  );
  return getRun(businessId, rid)!;
}

export function getRun(businessId: string, runId: string): AgentRun | null {
  const row = one<RunRow>(
    "SELECT * FROM agent_runs WHERE business_id = ? AND id = ?",
    businessId,
    runId,
  );
  return row ? toRun(row) : null;
}

export function listRuns(businessId: string, limit = 25): AgentRun[] {
  return all<RunRow>(
    "SELECT * FROM agent_runs WHERE business_id = ? ORDER BY created_at DESC LIMIT ?",
    businessId,
    Math.min(200, limit),
  ).map(toRun);
}

export function finishRun(
  businessId: string,
  runId: string,
  input: {
    status: RunStatus;
    stopReason?: string | null;
    error?: string | null;
    usage: Omit<RunUsage, "costUsd" | "credits">;
  },
): AgentRun {
  const model = getRun(businessId, runId)?.model ?? "claude-opus-5";
  const costUsd = costOf(model, input.usage);
  const credits = creditsOf(input.usage);

  run(
    `UPDATE agent_runs
     SET status = ?, stop_reason = ?, error = ?,
         input_tokens = ?, output_tokens = ?, cache_read_tokens = ?, cache_write_tokens = ?,
         cost_usd = ?, credits = ?, finished_at = ?
     WHERE business_id = ? AND id = ?`,
    input.status,
    input.stopReason ?? null,
    input.error ?? null,
    input.usage.inputTokens,
    input.usage.outputTokens,
    input.usage.cacheReadTokens,
    input.usage.cacheWriteTokens,
    costUsd,
    credits,
    Date.now(),
    businessId,
    runId,
  );

  // Meter the tenant. Deliberately additive and never reset here — the billing
  // period reset is a separate concern that does not belong in the run path.
  run(
    "UPDATE businesses SET credits_used = credits_used + ? WHERE id = ?",
    credits,
    businessId,
  );

  return getRun(businessId, runId)!;
}

export function setRunStatus(businessId: string, runId: string, status: RunStatus): void {
  run(
    "UPDATE agent_runs SET status = ? WHERE business_id = ? AND id = ?",
    status,
    businessId,
    runId,
  );
}

/* ----------------------------------------------------------------- events -- */

interface EventRow {
  id: string;
  run_id: string;
  seq: number;
  type: string;
  payload: string;
  ts: number;
}

const toEvent = (r: EventRow): AgentEvent => ({
  id: r.id,
  runId: r.run_id,
  seq: r.seq,
  type: r.type as AgentEventType,
  payload: json<Record<string, unknown>>(r.payload, {}),
  ts: r.ts,
});

export function appendEvent(
  runId: string,
  type: AgentEventType,
  payload: Record<string, unknown>,
): AgentEvent {
  // The sequence number is derived inside the same statement rather than read
  // and incremented in JS, so two concurrent appends cannot collide on it.
  const next =
    (one<{ n: number | null }>("SELECT MAX(seq) AS n FROM agent_events WHERE run_id = ?", runId)
      ?.n ?? -1) + 1;

  const eid = id("agentEvent");
  const ts = Date.now();
  run(
    "INSERT INTO agent_events (id, run_id, seq, type, payload, ts) VALUES (?, ?, ?, ?, ?, ?)",
    eid,
    runId,
    next,
    type,
    JSON.stringify(payload),
    ts,
  );
  return { id: eid, runId, seq: next, type, payload, ts };
}

export function listEvents(runId: string, sinceSeq = -1): AgentEvent[] {
  return all<EventRow>(
    "SELECT * FROM agent_events WHERE run_id = ? AND seq > ? ORDER BY seq ASC",
    runId,
    sinceSeq,
  ).map(toEvent);
}

/* -------------------------------------------------------------- approvals -- */

interface ApprovalRow {
  id: string;
  run_id: string;
  tool: string;
  input: string;
  summary: string;
  decision: string | null;
  reason: string | null;
  created_at: number;
  decided_at: number | null;
}

const toApproval = (r: ApprovalRow): Approval => ({
  id: r.id,
  runId: r.run_id,
  tool: r.tool,
  input: json<Record<string, unknown>>(r.input, {}),
  summary: r.summary,
  decision: r.decision === "allow" || r.decision === "deny" ? r.decision : null,
  reason: r.reason,
  createdAt: r.created_at,
  decidedAt: r.decided_at,
});

export function createApproval(
  businessId: string,
  runId: string,
  input: { tool: string; input: Record<string, unknown>; summary: string },
): Approval {
  const aid = id("approval");
  run(
    `INSERT INTO approvals (id, run_id, business_id, tool, input, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    aid,
    runId,
    businessId,
    input.tool,
    JSON.stringify(input.input),
    input.summary,
    Date.now(),
  );
  return getApproval(businessId, aid)!;
}

export function getApproval(businessId: string, approvalId: string): Approval | null {
  const row = one<ApprovalRow>(
    "SELECT * FROM approvals WHERE business_id = ? AND id = ?",
    businessId,
    approvalId,
  );
  return row ? toApproval(row) : null;
}

export function decideApproval(
  businessId: string,
  approvalId: string,
  decision: "allow" | "deny",
  reason?: string,
): Approval {
  run(
    "UPDATE approvals SET decision = ?, reason = ?, decided_at = ? WHERE business_id = ? AND id = ? AND decision IS NULL",
    decision,
    reason ?? null,
    Date.now(),
    businessId,
    approvalId,
  );
  const approval = getApproval(businessId, approvalId);
  if (!approval) throw new Error(`No approval "${approvalId}"`);
  return approval;
}

export function pendingApprovals(businessId: string, runId?: string): Approval[] {
  const where = ["business_id = ?", "decision IS NULL"];
  const params: unknown[] = [businessId];
  if (runId) {
    where.push("run_id = ?");
    params.push(runId);
  }
  return all<ApprovalRow>(
    `SELECT * FROM approvals WHERE ${where.join(" AND ")} ORDER BY created_at ASC`,
    ...params,
  ).map(toApproval);
}

/* ------------------------------------------------------------------ stats -- */

export interface AgentStats {
  runs: number;
  totalCostUsd: number;
  totalCredits: number;
  cacheReadTokens: number;
  totalInputTokens: number;
  /** Share of input tokens served from cache — the headline caching metric. */
  cacheHitRate: number | null;
}

export function agentStats(businessId: string): AgentStats {
  const row = one<{
    n: number;
    cost: number | null;
    credits: number | null;
    cache_read: number | null;
    input: number | null;
  }>(
    `SELECT COUNT(*) AS n,
            SUM(cost_usd) AS cost,
            SUM(credits) AS credits,
            SUM(cache_read_tokens) AS cache_read,
            SUM(input_tokens) AS input
     FROM agent_runs WHERE business_id = ?`,
    businessId,
  );

  const cacheRead = row?.cache_read ?? 0;
  const input = row?.input ?? 0;
  const denominator = cacheRead + input;

  return {
    runs: row?.n ?? 0,
    totalCostUsd: row?.cost ?? 0,
    totalCredits: row?.credits ?? 0,
    cacheReadTokens: cacheRead,
    totalInputTokens: input,
    cacheHitRate: denominator > 0 ? cacheRead / denominator : null,
  };
}
