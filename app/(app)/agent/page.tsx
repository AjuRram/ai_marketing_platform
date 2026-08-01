import type { Metadata } from "next";
import { AgentConsole } from "@/components/agent/AgentConsole";
import { RunHistory } from "@/components/agent/RunHistory";
import { currentBusinessId } from "@/lib/session";
import { listRuns } from "@/lib/resources/agent";
import { agentMode } from "@/lib/agent/run";

export const metadata: Metadata = { title: "Agent" };
export const dynamic = "force-dynamic";

export default function AgentPage() {
  const businessId = currentBusinessId();
  const runs = listRuns(businessId, 12);
  // One clock reading, passed down — see the note in RunHistory.
  const now = Date.now();

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <AgentConsole mode={agentMode()} />
      </div>
      <div className="min-w-0">
        <RunHistory runs={runs} now={now} />
      </div>
    </div>
  );
}
