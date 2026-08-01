import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentConsole } from "@/components/agent/AgentConsole";
import { RunHistory } from "@/components/agent/RunHistory";
import { currentBusinessId } from "@/lib/session";
import { getRun, listEvents, listRuns } from "@/lib/resources/agent";
import { agentMode } from "@/lib/agent/run";
import { truncate } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ runId: string }>;
}): Promise<Metadata> {
  const { runId } = await params;
  const run = getRun(currentBusinessId(), runId);
  return { title: run ? truncate(run.goal, 50) : "Run" };
}

/**
 * A run's permalink.
 *
 * The run and every event it emitted are loaded ON THE SERVER and passed to the
 * console as initial state, so a finished run renders complete in the first
 * HTML byte — no flash of an empty timeline while a stream connects. If the run
 * is still in flight the console reattaches to the live stream from the last
 * event it already has, so nothing is replayed twice and nothing is missed.
 */
export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const businessId = currentBusinessId();

  const run = getRun(businessId, runId);
  if (!run) notFound();

  const events = listEvents(runId);
  const runs = listRuns(businessId, 12);
  const now = Date.now();

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <AgentConsole mode={agentMode()} initialRun={run} initialEvents={events} />
      </div>
      <div className="min-w-0">
        <RunHistory runs={runs} now={now} />
      </div>
    </div>
  );
}
