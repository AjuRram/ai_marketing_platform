import type { Metadata } from "next";
import clsx from "clsx";
import {
  Workflow,
  Clock,
  Mail,
  ListPlus,
  Tag,
  GitBranch,
  Zap,
  Calendar,
  MousePointerClick,
} from "lucide-react";
import { Card, CardHeader, Badge, Empty, Stat, Th, Td } from "@/components/ui/Primitives";
import { currentBusinessId } from "@/lib/session";
import { listFlows, listFlowRuns, pendingJobCount } from "@/lib/resources/flows";
import { num, ago, duration } from "@/lib/format";
import type { Flow, FlowStep } from "@/lib/types";

export const metadata: Metadata = { title: "Flows" };
export const dynamic = "force-dynamic";

const STEP_ICON = {
  wait: Clock,
  send_email: Mail,
  add_to_list: ListPlus,
  tag: Tag,
  condition: GitBranch,
} as const;

export default function FlowsPage() {
  const businessId = currentBusinessId();
  const now = Date.now();
  const flows = listFlows(businessId);
  const runs = listFlowRuns(businessId, { limit: 12 });
  const pending = pendingJobCount(businessId);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-bold tracking-tight text-ink">Flows</h1>
        <p className="mt-0.5 text-xs text-muted">
          Multi-step automations. Each run is a resumable cursor, so a wait step survives a restart.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Flows" value={num(flows.length)} icon={<Workflow size={14} />} />
        <Stat label="Active" value={num(flows.filter((f) => f.active).length)} tone="brand" />
        <Stat label="Runs" value={num(runs.length)} />
        <Stat
          label="Queued jobs"
          value={num(pending)}
          sub={pending > 0 ? "waiting on the next tick" : "queue empty"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {flows.map((flow) => (
          <FlowCard key={flow.id} flow={flow} />
        ))}
      </div>

      <Card>
        <CardHeader title="Recent flow runs" subtitle="One row per person enrolled" />
        {runs.length === 0 ? (
          <Empty
            icon={<Workflow size={20} />}
            title="No runs yet"
            hint="Trigger a flow from the agent, or wait for an event to fire one."
          />
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[600px]">
              <thead className="thead">
                <tr className="border-b border-hairline">
                  <Th>Flow</Th>
                  <Th>Person</Th>
                  <Th>Status</Th>
                  <Th right>Step</Th>
                  <Th right>Started</Th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    className="border-b border-hairline/50 last:border-0 hover:bg-raised/40"
                  >
                    <Td className="font-semibold text-ink">{run.flowName}</Td>
                    <Td className="text-muted">{run.personEmail ?? "—"}</Td>
                    <Td>
                      <Badge
                        tone={
                          run.status === "done"
                            ? "up"
                            : run.status === "failed"
                              ? "down"
                              : run.status === "waiting"
                                ? "warn"
                                : "brand"
                        }
                      >
                        {run.status}
                      </Badge>
                    </Td>
                    <Td right className="tnum text-muted">
                      {run.cursor}
                    </Td>
                    <Td right className="tnum whitespace-nowrap text-faint">
                      {ago(run.startedAt, Date.now())}
                      {run.finishedAt ? (
                        <span className="ml-1 text-faint">
                          ({duration(run.finishedAt - run.startedAt)})
                        </span>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function FlowCard({ flow }: { flow: Flow }) {
  const TriggerIcon =
    flow.trigger.type === "schedule"
      ? Calendar
      : flow.trigger.type === "event"
        ? Zap
        : MousePointerClick;

  return (
    <Card>
      <CardHeader
        title={flow.name}
        subtitle={flow.description ?? undefined}
        action={
          <Badge tone={flow.active ? "up" : "neutral"}>{flow.active ? "active" : "paused"}</Badge>
        }
      />
      <div className="card-pad">
        <div className="mb-3 flex items-center gap-1.5 text-2xs text-muted">
          <TriggerIcon size={12} className="text-brand" />
          {flow.trigger.type === "event"
            ? `on ${flow.trigger.event}`
            : flow.trigger.type === "schedule"
              ? `cron ${flow.trigger.cron}`
              : "manual trigger"}
          <span className="text-faint">· {flow.runCount ?? 0} runs</span>
        </div>

        <ol className="space-y-1.5">
          {flow.steps.map((step, i) => (
            <StepRow key={i} step={step} index={i} last={i === flow.steps.length - 1} />
          ))}
        </ol>
      </div>
    </Card>
  );
}

function StepRow({ step, index, last }: { step: FlowStep; index: number; last: boolean }) {
  const Icon = STEP_ICON[step.type];
  return (
    <li className="flex items-start gap-2.5">
      <div className="flex flex-col items-center self-stretch">
        <span
          className={clsx(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-2xs",
            step.type === "wait" ? "bg-raised text-faint" : "bg-brand/14 text-brand",
          )}
        >
          <Icon size={10} />
        </span>
        {/* The connector between steps makes the sequence read as a pipeline
            rather than a bulleted list. */}
        {!last ? <span className="w-px flex-1 bg-hairline" /> : null}
      </div>
      <div className="min-w-0 flex-1 pb-1.5">
        <p className="text-xs text-ink">{describe(step)}</p>
        <p className="text-2xs text-faint">step {index + 1}</p>
      </div>
    </li>
  );
}

function describe(step: FlowStep): string {
  switch (step.type) {
    case "wait":
      return step.hours >= 24
        ? `Wait ${Math.round(step.hours / 24)} day${step.hours >= 48 ? "s" : ""}`
        : `Wait ${step.hours} hours`;
    case "send_email":
      return `Send "${step.subject}"`;
    case "add_to_list":
      return `Add to ${step.listSlug}`;
    case "tag":
      return `Set ${step.key} = ${step.value}`;
    case "condition":
      return `Only if ${step.trait} is "${step.equals}"`;
  }
}
