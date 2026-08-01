import { NextResponse } from "next/server";
import { startRun, agentMode } from "@/lib/agent/run";
import { currentBusiness } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start an agent run.
 *
 * Returns as soon as the run row exists — execution continues in the
 * background and is observed through /api/agent/stream. A request that waited
 * for the run to finish would hit the platform's HTTP timeout on any campaign
 * worth running.
 */
export async function POST(request: Request) {
  const business = currentBusiness();

  let goal: string;
  try {
    const body = (await request.json()) as { goal?: unknown };
    goal = typeof body.goal === "string" ? body.goal.trim() : "";
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  if (!goal) {
    return NextResponse.json({ error: "A goal is required" }, { status: 400 });
  }
  if (goal.length > 2_000) {
    return NextResponse.json({ error: "Goal is too long (max 2000 characters)" }, { status: 400 });
  }

  if (business.creditsUsed >= business.creditsLimit) {
    return NextResponse.json(
      { error: "Credit limit reached for this billing period." },
      { status: 402 },
    );
  }

  const run = startRun(business.id, goal);
  return NextResponse.json({ runId: run.id, mode: agentMode() }, { status: 201 });
}
