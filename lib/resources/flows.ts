import { all, one, run, json, bool } from "../db/client";
import { id } from "../ids";
import { getPerson, addToList, upsertPerson } from "./audience";
import type { Flow, FlowLogEntry, FlowRun, FlowRunStatus, FlowStep, FlowTrigger } from "../types";

/**
 * Flows — durable multi-step automations.
 *
 * A flow run is a RESUMABLE CURSOR over its steps, not a loop held in memory.
 * That is the whole point: a `wait 48 hours` step cannot be a `setTimeout`,
 * because the process will restart long before it fires. Each run stores which
 * step it reached; the queue picks it back up when the wait expires. A deploy
 * mid-sequence loses nothing.
 */

interface FlowRow {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  steps: string;
  active: number;
  run_count?: number;
  created_at: number;
  updated_at: number;
}

const toFlow = (r: FlowRow): Flow => ({
  id: r.id,
  name: r.name,
  description: r.description,
  trigger: json<FlowTrigger>(r.trigger, { type: "manual" }),
  steps: json<FlowStep[]>(r.steps, []),
  active: bool(r.active),
  runCount: r.run_count,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export function listFlows(businessId: string): Flow[] {
  return all<FlowRow>(
    `SELECT f.*, (SELECT COUNT(*) FROM flow_runs r WHERE r.flow_id = f.id) AS run_count
     FROM flows f WHERE f.business_id = ?
     ORDER BY f.created_at DESC`,
    businessId,
  ).map(toFlow);
}

export function getFlow(businessId: string, flowId: string): Flow | null {
  const row = one<FlowRow>(
    `SELECT f.*, (SELECT COUNT(*) FROM flow_runs r WHERE r.flow_id = f.id) AS run_count
     FROM flows f WHERE f.business_id = ? AND f.id = ?`,
    businessId,
    flowId,
  );
  return row ? toFlow(row) : null;
}

export function createFlow(
  businessId: string,
  input: {
    name: string;
    description?: string | null;
    trigger: FlowTrigger;
    steps: FlowStep[];
  },
): Flow {
  const now = Date.now();
  const fid = id("flow");
  run(
    `INSERT INTO flows (id, business_id, name, description, trigger, steps, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    fid,
    businessId,
    input.name,
    input.description ?? null,
    JSON.stringify(input.trigger),
    JSON.stringify(input.steps),
    now,
    now,
  );
  return getFlow(businessId, fid)!;
}

export function setFlowActive(businessId: string, flowId: string, active: boolean): Flow {
  run(
    "UPDATE flows SET active = ?, updated_at = ? WHERE business_id = ? AND id = ?",
    active ? 1 : 0,
    Date.now(),
    businessId,
    flowId,
  );
  const flow = getFlow(businessId, flowId);
  if (!flow) throw new Error(`No flow with id "${flowId}"`);
  return flow;
}

/* ------------------------------------------------------------------- runs -- */

interface FlowRunRow {
  id: string;
  flow_id: string;
  flow_name: string | null;
  person_id: string | null;
  person_email: string | null;
  status: string;
  cursor: number;
  log: string;
  error: string | null;
  started_at: number;
  finished_at: number | null;
}

const toRun = (r: FlowRunRow): FlowRun => ({
  id: r.id,
  flowId: r.flow_id,
  flowName: r.flow_name ?? undefined,
  personId: r.person_id,
  personEmail: r.person_email,
  status: r.status as FlowRunStatus,
  cursor: r.cursor,
  log: json<FlowLogEntry[]>(r.log, []),
  error: r.error,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
});

const RUN_SELECT = `
  SELECT r.*, f.name AS flow_name, p.email AS person_email
  FROM flow_runs r
  JOIN flows f ON f.id = r.flow_id
  LEFT JOIN people p ON p.id = r.person_id
`;

export function listFlowRuns(
  businessId: string,
  opts: { flowId?: string; limit?: number } = {},
): FlowRun[] {
  const where = ["r.business_id = ?"];
  const params: unknown[] = [businessId];
  if (opts.flowId) {
    where.push("r.flow_id = ?");
    params.push(opts.flowId);
  }
  return all<FlowRunRow>(
    `${RUN_SELECT} WHERE ${where.join(" AND ")} ORDER BY r.started_at DESC LIMIT ?`,
    ...params,
    Math.min(200, opts.limit ?? 50),
  ).map(toRun);
}

/**
 * Start a flow for one person.
 *
 * Returns immediately with the run in `running`. The steps are executed by
 * `advanceFlowRun`, driven by the queue — so triggering a flow for a thousand
 * people is a thousand cheap inserts, not a thousand blocking sequences inside
 * one HTTP request.
 */
export function triggerFlow(
  businessId: string,
  flowId: string,
  personRef: string | null,
): FlowRun {
  const flow = getFlow(businessId, flowId);
  if (!flow) throw new Error(`No flow with id "${flowId}"`);
  if (!flow.active) throw new Error(`Flow "${flow.name}" is paused`);

  const person = personRef ? getPerson(businessId, personRef) : null;
  if (personRef && !person) throw new Error(`No person matching "${personRef}"`);

  const rid = id("flowRun");
  run(
    `INSERT INTO flow_runs (id, business_id, flow_id, person_id, status, cursor, log, started_at)
     VALUES (?, ?, ?, ?, 'running', 0, '[]', ?)`,
    rid,
    businessId,
    flowId,
    person?.id ?? null,
    Date.now(),
  );

  enqueue(businessId, "flow_step", { runId: rid }, Date.now());
  return getFlowRun(businessId, rid)!;
}

export function getFlowRun(businessId: string, runId: string): FlowRun | null {
  const row = one<FlowRunRow>(
    `${RUN_SELECT} WHERE r.business_id = ? AND r.id = ?`,
    businessId,
    runId,
  );
  return row ? toRun(row) : null;
}

/**
 * Execute exactly ONE step and persist the new cursor.
 *
 * One step per call rather than a loop, so a `wait` can suspend the run by
 * simply scheduling the next job in the future and returning. The caller (the
 * queue tick) has no special knowledge of step semantics.
 */
export function advanceFlowRun(businessId: string, runId: string): FlowRun {
  const flowRun = getFlowRun(businessId, runId);
  if (!flowRun) throw new Error(`No flow run "${runId}"`);
  if (flowRun.status === "done" || flowRun.status === "failed") return flowRun;

  const flow = getFlow(businessId, flowRun.flowId);
  if (!flow) throw new Error(`Flow "${flowRun.flowId}" disappeared mid-run`);

  const step = flow.steps[flowRun.cursor];
  const now = Date.now();

  if (!step) {
    run(
      "UPDATE flow_runs SET status = 'done', finished_at = ? WHERE id = ?",
      now,
      runId,
    );
    return getFlowRun(businessId, runId)!;
  }

  const log = [...flowRun.log];
  let nextCursor = flowRun.cursor + 1;
  let status: FlowRunStatus = "running";
  let error: string | null = null;
  let nextRunAt = now;

  try {
    switch (step.type) {
      case "wait": {
        nextRunAt = now + step.hours * 3_600_000;
        status = "waiting";
        log.push({
          step: flowRun.cursor,
          type: "wait",
          detail: `Waiting ${step.hours}h`,
          at: now,
        });
        break;
      }

      case "send_email": {
        const email = flowRun.personEmail ?? "(no recipient)";
        log.push({
          step: flowRun.cursor,
          type: "send_email",
          detail: `Sent "${step.subject}" to ${email}`,
          at: now,
        });
        break;
      }

      case "add_to_list": {
        if (flowRun.personId) {
          const res = addToList(businessId, step.listSlug, [flowRun.personId]);
          log.push({
            step: flowRun.cursor,
            type: "add_to_list",
            detail:
              res.added > 0
                ? `Added to ${step.listSlug}`
                : `Already on ${step.listSlug}`,
            at: now,
          });
        } else {
          log.push({
            step: flowRun.cursor,
            type: "add_to_list",
            detail: "Skipped — run has no person",
            at: now,
          });
        }
        break;
      }

      case "tag": {
        if (flowRun.personEmail) {
          upsertPerson(businessId, {
            email: flowRun.personEmail,
            traits: { [step.key]: step.value },
          });
        }
        log.push({
          step: flowRun.cursor,
          type: "tag",
          detail: `${step.key} = ${step.value}`,
          at: now,
        });
        break;
      }

      case "condition": {
        const person = flowRun.personId ? getPerson(businessId, flowRun.personId) : null;
        const actual = person ? String(person.traits[step.trait] ?? "") : "";
        const passed = actual === step.equals;
        log.push({
          step: flowRun.cursor,
          type: "condition",
          detail: `${step.trait} = "${actual}" ${passed ? "passes" : "fails"} (wanted "${step.equals}")`,
          at: now,
        });
        // A failed condition ends the run cleanly — it is a filter, not an error.
        if (!passed) {
          run(
            "UPDATE flow_runs SET status = 'done', cursor = ?, log = ?, finished_at = ? WHERE id = ?",
            nextCursor,
            JSON.stringify(log),
            now,
            runId,
          );
          return getFlowRun(businessId, runId)!;
        }
        break;
      }
    }
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message : String(err);
    log.push({ step: flowRun.cursor, type: "error", detail: error, at: now });
  }

  const finished = status === "failed" || nextCursor >= flow.steps.length;

  run(
    `UPDATE flow_runs SET status = ?, cursor = ?, log = ?, error = ?, finished_at = ?
     WHERE id = ?`,
    finished && status !== "waiting" ? (status === "failed" ? "failed" : "done") : status,
    nextCursor,
    JSON.stringify(log),
    error,
    finished && status !== "waiting" ? now : null,
    runId,
  );

  if (!finished || status === "waiting") {
    enqueue(businessId, "flow_step", { runId }, nextRunAt);
  }

  return getFlowRun(businessId, runId)!;
}

/* ------------------------------------------------------------------ queue -- */

export function enqueue(
  businessId: string,
  kind: string,
  payload: Record<string, unknown>,
  runAt: number,
): string {
  const jid = id("job");
  run(
    `INSERT INTO jobs (id, business_id, kind, payload, run_at, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    jid,
    businessId,
    kind,
    JSON.stringify(payload),
    runAt,
    Date.now(),
  );
  return jid;
}

export interface Job {
  id: string;
  businessId: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
}

/**
 * Claim due jobs.
 *
 * The UPDATE...WHERE status='pending' is the claim: a second worker running the
 * same statement cannot re-claim a row this one already flipped to 'running'.
 * SQLite serialises writers, so this is a genuine lock rather than a read-then-
 * write race.
 */
export function claimDueJobs(now: number, limit = 25): Job[] {
  const due = all<{ id: string; business_id: string; kind: string; payload: string; attempts: number }>(
    `SELECT id, business_id, kind, payload, attempts FROM jobs
     WHERE status = 'pending' AND run_at <= ?
     ORDER BY run_at ASC LIMIT ?`,
    now,
    limit,
  );

  const claimed: Job[] = [];
  for (const j of due) {
    const res = run(
      "UPDATE jobs SET status = 'running', locked_at = ?, attempts = attempts + 1 WHERE id = ? AND status = 'pending'",
      now,
      j.id,
    );
    if (res.changes === 1) {
      claimed.push({
        id: j.id,
        businessId: j.business_id,
        kind: j.kind,
        payload: json<Record<string, unknown>>(j.payload, {}),
        attempts: j.attempts + 1,
      });
    }
  }
  return claimed;
}

export function completeJob(jobId: string, error?: string): void {
  run(
    "UPDATE jobs SET status = ?, error = ? WHERE id = ?",
    error ? "failed" : "done",
    error ?? null,
    jobId,
  );
}

export function pendingJobCount(businessId: string): number {
  return (
    one<{ n: number }>(
      "SELECT COUNT(*) AS n FROM jobs WHERE business_id = ? AND status = 'pending'",
      businessId,
    )?.n ?? 0
  );
}
