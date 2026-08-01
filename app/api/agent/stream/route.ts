import { listEvents, getRun } from "@/lib/resources/agent";
import { currentBusiness } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-Sent Events over a run's persisted event log.
 *
 * This endpoint is a READER, not the executor. The run is already writing to
 * `agent_events` in the background, so this simply replays everything after
 * `since` and then tails for new rows.
 *
 * Consequences worth having:
 *   - Refreshing mid-run resumes exactly where the client left off (`since`),
 *     with no duplicated or dropped events.
 *   - Opening a finished run replays it identically — every run has a stable
 *     permalink rather than being a one-shot stream.
 *   - Two people can watch the same run.
 *
 * Polling rather than an in-process event emitter is deliberate: the executor
 * may live in a different module instance after a hot reload, and in a
 * multi-process deployment it would be on another worker entirely. The table
 * is the only thing both sides reliably share.
 */
export async function GET(request: Request) {
  const business = currentBusiness();
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId");
  const since = Number(url.searchParams.get("since") ?? "-1");

  if (!runId) {
    return new Response("runId is required", { status: 400 });
  }
  if (!getRun(business.id, runId)) {
    return new Response("No such run", { status: 404 });
  }

  const encoder = new TextEncoder();
  let cursor = Number.isFinite(since) ? since : -1;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // If the client disconnects mid-run, stop polling. Without this the
      // interval would keep querying for a reader that no longer exists.
      request.signal.addEventListener("abort", () => {
        closed = true;
      });

      const run = getRun(business.id, runId)!;
      send("run", run);

      let idleTicks = 0;

      while (!closed) {
        const events = listEvents(runId, cursor);
        for (const event of events) {
          send("event", event);
          cursor = event.seq;
        }

        const current = getRun(business.id, runId);
        if (!current) break;

        const finished =
          current.status === "done" ||
          current.status === "failed" ||
          current.status === "refused";

        if (finished && events.length === 0) {
          send("run", current);
          send("done", { status: current.status });
          break;
        }

        if (events.length === 0) {
          idleTicks++;
          // A heartbeat comment keeps proxies from closing an idle connection.
          if (idleTicks % 20 === 0 && !closed) {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          }
          // Hard stop for a run that never reports a terminal status — better
          // to end the stream than leak a connection forever.
          if (idleTicks > 1_500) {
            send("done", { status: "timeout" });
            break;
          }
        } else {
          idleTicks = 0;
        }

        await new Promise((r) => setTimeout(r, 250));
      }

      if (!closed) controller.close();
      closed = true;
    },

    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Nginx buffers proxied responses by default, which would hold the whole
      // stream until completion and defeat the point.
      "X-Accel-Buffering": "no",
    },
  });
}
