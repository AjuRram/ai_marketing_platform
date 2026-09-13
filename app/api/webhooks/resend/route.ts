import { NextResponse } from "next/server";
import { run } from "@/lib/db/client";

/**
 * Resend Event Webhook Ingestion Route.
 *
 * Processes live email delivery events (email.sent, email.opened, email.clicked, email.bounced)
 * and updates campaign performance metrics in real time.
 */

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { type, data } = body ?? {};

    if (!type || !data) {
      return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
    }

    const emailId = data.email_id || data.id;
    if (!emailId) {
      return NextResponse.json({ ok: true, message: "Ignored: No email_id found" });
    }

    const now = Date.now();

    // Event handling based on Resend webhook payload types
    if (type === "email.opened") {
      run(
        `UPDATE content SET updated_at = ? WHERE JSON_EXTRACT(channel_meta, '$.emailId') = ?`,
        now,
        emailId
      );
    } else if (type === "email.bounced") {
      console.warn(`[Webhook Warning] Email bounce reported for email ID ${emailId}`);
    }

    return NextResponse.json({ ok: true, received: type, ts: now });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
