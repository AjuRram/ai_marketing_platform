import Link from "next/link";
import clsx from "clsx";
import { Check, CircleAlert, Clock } from "lucide-react";
import { Card, CardHeader, Empty } from "../ui/Primitives";
import { ago, usd, truncate } from "@/lib/format";
import type { AgentRun } from "@/lib/types";

/**
 * Recent runs.
 *
 * `now` is passed in from the server render rather than read from the clock
 * inside the component. Calling `Date.now()` here would produce "3m ago" on the
 * server and "4m ago" on the client for the same row, which React reports as a
 * hydration mismatch.
 */
export function RunHistory({ runs, now }: { runs: AgentRun[]; now: number }) {
  return (
    <Card>
      <CardHeader title="Recent runs" subtitle={`${runs.length} total`} />
      {runs.length === 0 ? (
        <Empty
          icon={<Clock size={20} />}
          title="No runs yet"
          hint="Give the agent a goal above and it will show up here — every run is replayable from a permalink."
        />
      ) : (
        <ul className="divide-y divide-hairline/50">
          {runs.map((run) => (
            <li key={run.id}>
              <Link
                href={`/agent/${run.id}`}
                className="flex items-start gap-2.5 px-4 py-2.5 transition-colors hover:bg-raised/40"
              >
                <StatusIcon status={run.status} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-ink">{truncate(run.goal, 90)}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-2xs text-faint">
                    <span>{ago(run.createdAt, now)}</span>
                    <span className="tnum">{usd(run.usage.costUsd)}</span>
                    <span className="tnum">{run.usage.credits} cr</span>
                    {run.mode === "demo" ? <span className="text-warn">demo</span> : null}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function StatusIcon({ status }: { status: AgentRun["status"] }) {
  if (status === "done") return <Check size={13} className="mt-0.5 shrink-0 text-up" />;
  if (status === "running" || status === "awaiting_approval")
    return <Clock size={13} className="mt-0.5 shrink-0 text-brand" />;
  return <CircleAlert size={13} className={clsx("mt-0.5 shrink-0 text-down")} />;
}
