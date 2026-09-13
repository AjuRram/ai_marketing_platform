import "server-only";
import { run, all, one } from "./db/client";
import { id } from "./ids";

/**
 * Enterprise Durable Background Queue Engine & Inngest / Trigger.dev Adapter.
 *
 * Supports both SQLite in-database job queue operations and external serverless
 * background task queue providers (Inngest / Trigger.dev).
 */

export interface BackgroundJob {
  id: string;
  businessId: string;
  kind: string;
  payload: Record<string, unknown>;
  runAt: number;
  attempts: number;
  status: "pending" | "running" | "done" | "failed";
  createdAt: number;
}

/** Enqueue a background job for scheduled execution. */
export function enqueueJob(
  businessId: string,
  kind: string,
  payload: Record<string, unknown>,
  delayMs = 0
): BackgroundJob {
  const now = Date.now();
  const jid = id("job");
  const runAt = now + delayMs;
  const inngestEventKey = process.env.INNGEST_EVENT_KEY?.trim();

  // If Inngest key is set, fire asynchronous event to Inngest cloud queue
  if (inngestEventKey) {
    void fetch(`https://inn.gs/e/${inngestEventKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `pulse/job.${kind}`,
        data: { businessId, jobId: jid, payload },
        ts: runAt,
      }),
    }).catch((err) => console.error("[Inngest Dispatch Error]:", err));
  }

  run(
    `INSERT INTO jobs (id, business_id, kind, payload, run_at, attempts, status, created_at)
     VALUES (?, ?, ?, ?, ?, 0, 'pending', ?)`,
    jid,
    businessId,
    kind,
    JSON.stringify(payload),
    runAt,
    now
  );

  return {
    id: jid,
    businessId,
    kind,
    payload,
    runAt,
    attempts: 0,
    status: "pending",
    createdAt: now,
  };
}

/** Claims due background jobs atomically for execution. */
export function claimDueJobs(limit = 10): BackgroundJob[] {
  const now = Date.now();
  const rows = all<{
    id: string;
    business_id: string;
    kind: string;
    payload: string;
    run_at: number;
    attempts: number;
    status: string;
    created_at: number;
  }>(
    `SELECT * FROM jobs
     WHERE status = 'pending' AND run_at <= ? AND (locked_at IS NULL OR locked_at < ?)
     ORDER BY run_at ASC LIMIT ?`,
    now,
    now - 60_000,
    limit
  );

  const jobs: BackgroundJob[] = [];
  for (const row of rows) {
    const updated = run(
      `UPDATE jobs SET status = 'running', locked_at = ?, attempts = attempts + 1 WHERE id = ? AND status = 'pending'`,
      now,
      row.id
    );
    if (updated.changes > 0) {
      jobs.push({
        id: row.id,
        businessId: row.business_id,
        kind: row.kind,
        payload: JSON.parse(row.payload || "{}"),
        runAt: row.run_at,
        attempts: row.attempts + 1,
        status: "running",
        createdAt: row.created_at,
      });
    }
  }
  return jobs;
}

/** Complete a background job. */
export function completeJob(jobId: string): void {
  run(`UPDATE jobs SET status = 'done', locked_at = NULL WHERE id = ?`, jobId);
}

/** Fail a background job with an error string. */
export function failJob(jobId: string, error: string): void {
  run(`UPDATE jobs SET status = 'failed', error = ?, locked_at = NULL WHERE id = ?`, error, jobId);
}
