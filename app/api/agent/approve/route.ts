import { NextResponse } from "next/server";
import { decideApproval, getApproval } from "@/lib/resources/agent";
import { currentBusiness } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Allow or deny a pending approval.
 *
 * The waiting tool call is polling `approvals` for a decision, so writing the
 * row here is what unblocks it. The decision is write-once at the SQL level
 * (`AND decision IS NULL`), which makes a double-click or a retried request
 * harmless rather than a second send.
 */
export async function POST(request: Request) {
  const business = currentBusiness();

  let approvalId: string;
  let decision: "allow" | "deny";
  let reason: string | undefined;

  try {
    const body = (await request.json()) as {
      approvalId?: unknown;
      decision?: unknown;
      reason?: unknown;
    };
    approvalId = typeof body.approvalId === "string" ? body.approvalId : "";
    decision = body.decision === "allow" ? "allow" : body.decision === "deny" ? "deny" : "deny";
    reason = typeof body.reason === "string" ? body.reason : undefined;
    if (body.decision !== "allow" && body.decision !== "deny") {
      return NextResponse.json({ error: "decision must be 'allow' or 'deny'" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  if (!approvalId) {
    return NextResponse.json({ error: "approvalId is required" }, { status: 400 });
  }
  if (!getApproval(business.id, approvalId)) {
    return NextResponse.json({ error: "No such approval" }, { status: 404 });
  }

  const approval = decideApproval(business.id, approvalId, decision, reason);
  return NextResponse.json({ approval });
}
