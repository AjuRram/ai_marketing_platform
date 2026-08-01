import { NextResponse } from "next/server";
import { claimDueJobs, completeJob, advanceFlowRun, enqueue } from "@/lib/resources/flows";
import { dueContent, publishContent } from "@/lib/resources/content";
import { currentBusinessId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Queue drain. Point a scheduler at this (Vercel Cron, a systemd timer, or a
 * plain `curl` in a loop) and it advances every piece of deferred work.
 *
 * Deliberately idempotent and safe to over-call: jobs are claimed with a
 * conditional UPDATE, so two overlapping ticks cannot execute the same job
 * twice. Under-calling only delays work; it never loses it.
 */

const MAX_ATTEMPTS = 3;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  // No secret configured means local development — allow it. A deployment that
  // wants this endpoint protected sets CRON_SECRET and the check turns on with
  // no code change.
  if (!secret) return true;

  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const businessId = currentBusinessId();
  const results = { flowSteps: 0, published: 0, failed: 0, requeued: 0 };

  /* ---- scheduled content whose time has come ---- */
  for (const item of dueContent(businessId, now)) {
    try {
      publishContent(businessId, item.id);
      results.published++;
    } catch {
      results.failed++;
    }
  }

  /* ---- queued jobs ---- */
  for (const job of claimDueJobs(now, 50)) {
    try {
      if (job.kind === "flow_step") {
        const runId = String(job.payload.runId ?? "");
        if (runId) {
          advanceFlowRun(job.businessId, runId);
          results.flowSteps++;
        }
      }
      completeJob(job.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      completeJob(job.id, message);
      results.failed++;

      // Retry with backoff, but only a bounded number of times — a job that
      // fails deterministically would otherwise be retried forever.
      if (job.attempts < MAX_ATTEMPTS) {
        enqueue(job.businessId, job.kind, job.payload, now + job.attempts * 60_000);
        results.requeued++;
      }
    }
  }

  return NextResponse.json({ ok: true, at: now, ...results });
}

/** GET mirrors POST so a browser or a plain cron `curl` can trigger it too. */
export async function GET(request: Request) {
  return POST(request);
}
