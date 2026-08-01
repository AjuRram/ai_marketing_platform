"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  ArrowUp,
  Brain,
  Check,
  ChevronDown,
  CircleAlert,
  Loader2,
  ShieldQuestion,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { Badge, Button, Card, LiveDot } from "../ui/Primitives";
import { tokens, usd, duration } from "@/lib/format";
import type { AgentEvent, AgentRun } from "@/lib/types";

/**
 * The agent console.
 *
 * Reads a run's event stream over SSE and renders it as a timeline. The
 * component is deliberately dumb about *how* the run is produced — a live
 * Claude run and a scripted demo run emit the same event types, so there is one
 * rendering path rather than two that can drift.
 */

const EXAMPLES = [
  "Draft the August changelog digest and schedule it for Tuesday 9am",
  "Research what Datadog shipped for background jobs and update our notes",
  "Add everyone who viewed pricing this week to the enterprise leads list",
  "Write a LinkedIn post about retry policies in our brand voice",
];

export function AgentConsole({
  mode,
  initialRun,
  initialEvents,
}: {
  mode: "live" | "demo";
  initialRun?: AgentRun;
  initialEvents?: AgentEvent[];
}) {
  const [goal, setGoal] = useState("");
  const [run, setRun] = useState<AgentRun | null>(initialRun ?? null);
  const [events, setEvents] = useState<AgentEvent[]>(initialEvents ?? []);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = run?.status === "running" || run?.status === "awaiting_approval";

  /* --------------------------------------------------------------- stream -- */

  const subscribe = useCallback((runId: string, sinceSeq: number) => {
    const source = new EventSource(
      `/api/agent/stream?runId=${encodeURIComponent(runId)}&since=${sinceSeq}`,
    );

    source.addEventListener("run", (e) => {
      setRun(JSON.parse((e as MessageEvent<string>).data) as AgentRun);
    });

    source.addEventListener("event", (e) => {
      const event = JSON.parse((e as MessageEvent<string>).data) as AgentEvent;
      // Dedupe on seq. A reconnect replays from `since`, and without this an
      // event delivered twice would render twice.
      setEvents((prev) => (prev.some((x) => x.seq === event.seq) ? prev : [...prev, event]));
    });

    source.addEventListener("done", () => source.close());
    source.onerror = () => source.close();

    return () => source.close();
  }, []);

  // Reattach to a run that was still in flight when the page loaded, resuming
  // from the last event we already have rather than replaying from zero.
  useEffect(() => {
    if (!initialRun) return;
    if (initialRun.status !== "running" && initialRun.status !== "awaiting_approval") return;
    const lastSeq = initialEvents?.length ? initialEvents[initialEvents.length - 1]!.seq : -1;
    return subscribe(initialRun.id, lastSeq);
  }, [initialRun, initialEvents, subscribe]);

  /* ---------------------------------------------------------------- start -- */

  async function start(text: string) {
    const trimmed = text.trim();
    if (!trimmed || starting) return;

    setStarting(true);
    setError(null);
    setEvents([]);
    setRun(null);

    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: trimmed }),
      });
      const body = (await res.json()) as { runId?: string; error?: string };
      if (!res.ok || !body.runId) {
        setError(body.error ?? "Could not start the run.");
        return;
      }
      setGoal("");
      subscribe(body.runId, -1);
      window.history.replaceState(null, "", `/agent/${body.runId}`);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setStarting(false);
    }
  }

  /* ----------------------------------------------------------------- view -- */

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight text-ink">
            <Sparkles size={17} className="text-brand" />
            Agent
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            Give it an outcome, not instructions. It reads memory, drafts, and places the work.
          </p>
        </div>
        <ModeBadge mode={mode} />
      </header>

      <Composer
        value={goal}
        onChange={setGoal}
        onSubmit={() => start(goal)}
        disabled={starting || active}
        busy={starting || active}
      />

      {error ? (
        <div className="flex items-center gap-2 rounded-soft border border-down/40 bg-down/10 px-3 py-2 text-xs text-down">
          <CircleAlert size={14} /> {error}
        </div>
      ) : null}

      {!run && !starting ? (
        <div>
          <p className="eyebrow mb-2">Try one</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                onClick={() => start(example)}
                className="rounded-soft border border-hairline px-2.5 py-1.5 text-left text-2xs text-muted transition-colors hover:border-brand hover:text-brand"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {run ? <RunView run={run} events={events} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ parts -- */

function ModeBadge({ mode }: { mode: "live" | "demo" }) {
  if (mode === "live") {
    return (
      <span className="flex items-center gap-1.5 rounded-soft border border-up/40 bg-up/10 px-2 py-1 text-2xs font-semibold text-up">
        <LiveDot tone="up" /> Live · Claude
      </span>
    );
  }
  return (
    <span
      className="flex items-center gap-1.5 rounded-soft border border-warn/40 bg-warn/10 px-2 py-1 text-2xs font-semibold text-warn"
      title="No ANTHROPIC_API_KEY is set. Runs use a scripted planner driving the same real tools against the same database."
    >
      Demo · scripted planner
    </span>
  );
}

function Composer({
  value,
  onChange,
  onSubmit,
  disabled,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  busy: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Enter submits, Shift+Enter breaks the line — the convention for a
          // single-purpose composer.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        rows={3}
        disabled={disabled}
        placeholder="What should the agent get done?"
        aria-label="Agent goal"
        className="w-full resize-none bg-transparent px-4 py-3.5 text-sm text-ink outline-none placeholder:text-faint disabled:opacity-60"
      />
      <div className="flex items-center justify-between gap-3 border-t border-hairline px-3 py-2">
        <span className="hidden text-2xs text-faint sm:inline">
          Enter to run · Shift+Enter for a new line
        </span>
        <Button size="sm" onClick={onSubmit} disabled={disabled || !value.trim()}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <ArrowUp size={13} />}
          {busy ? "Running" : "Run"}
        </Button>
      </div>
    </Card>
  );
}

function RunView({ run, events }: { run: AgentRun; events: AgentEvent[] }) {
  const elapsed = (run.finishedAt ?? Date.now()) - run.createdAt;
  const usage = events.find((e) => e.type === "usage")?.payload as
    | Record<string, number>
    | undefined;

  return (
    <Card className="animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-ink">{run.goal}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-faint">
            <span className="mono">{run.model}</span>
            {run.effort ? <span>effort {run.effort}</span> : null}
            <span className="tnum">{duration(elapsed)}</span>
          </p>
        </div>
        <StatusBadge status={run.status} />
      </div>

      <ol className="divide-y divide-hairline/50">
        {events.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
        {run.status === "running" ? (
          <li className="flex items-center gap-2 px-4 py-3 text-xs text-muted">
            <Loader2 size={13} className="animate-spin text-brand" />
            Working…
          </li>
        ) : null}
      </ol>

      {usage ? <UsagePanel usage={usage} mode={run.mode} /> : null}
    </Card>
  );
}

function StatusBadge({ status }: { status: AgentRun["status"] }) {
  switch (status) {
    case "running":
      return (
        <Badge tone="brand">
          <LiveDot tone="brand" /> Running
        </Badge>
      );
    case "awaiting_approval":
      return <Badge tone="warn">Needs approval</Badge>;
    case "done":
      return (
        <Badge tone="up">
          <Check size={11} /> Done
        </Badge>
      );
    case "refused":
      return <Badge tone="warn">Declined by model</Badge>;
    default:
      return <Badge tone="down">Failed</Badge>;
  }
}

function EventRow({ event }: { event: AgentEvent }) {
  switch (event.type) {
    case "thinking":
      return <ThinkingRow text={String(event.payload.text ?? "")} />;

    case "text":
      return (
        <li className="px-4 py-3">
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink">
            {String(event.payload.text ?? "")}
          </p>
        </li>
      );

    case "tool_use":
      return (
        <li className="flex items-start gap-2.5 px-4 py-2.5">
          <Wrench size={13} className="mt-0.5 shrink-0 text-faint" />
          <div className="min-w-0 flex-1">
            <p className="mono text-2xs font-semibold text-ink">
              {String(event.payload.name ?? "tool")}
            </p>
            <ToolInput input={event.payload.input} />
          </div>
        </li>
      );

    case "tool_result": {
      const ok = event.payload.ok === true;
      return (
        <li className="flex items-start gap-2.5 px-4 py-2 pl-[34px]">
          {ok ? (
            <Check size={12} className="mt-0.5 shrink-0 text-up" />
          ) : (
            <X size={12} className="mt-0.5 shrink-0 text-down" />
          )}
          <p className={clsx("min-w-0 text-2xs", ok ? "text-muted" : "text-down")}>
            {String(event.payload.summary ?? "")}
          </p>
        </li>
      );
    }

    case "approval":
      return <ApprovalRow event={event} />;

    case "error":
      return (
        <li className="flex items-start gap-2 bg-down/8 px-4 py-3">
          <CircleAlert size={13} className="mt-0.5 shrink-0 text-down" />
          <p className="text-xs text-down">{String(event.payload.message ?? "Something failed")}</p>
        </li>
      );

    default:
      return null;
  }
}

/** Thinking is collapsed by default — it is context, not the answer. */
function ThinkingRow({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="px-4 py-2.5">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left text-2xs font-semibold text-faint transition-colors hover:text-muted"
      >
        <Brain size={12} />
        Thinking
        <ChevronDown
          size={12}
          className={clsx("transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <p className="mt-2 whitespace-pre-wrap border-l-2 border-hairline pl-3 text-2xs leading-relaxed text-muted">
          {text}
        </p>
      ) : null}
    </li>
  );
}

function ToolInput({ input }: { input: unknown }) {
  if (!input || typeof input !== "object") return null;
  const entries = Object.entries(input as Record<string, unknown>).filter(
    ([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0),
  );
  if (entries.length === 0) return null;

  return (
    <dl className="mt-1 space-y-0.5">
      {entries.slice(0, 4).map(([key, value]) => {
        const rendered = typeof value === "string" ? value : JSON.stringify(value);
        return (
          <div key={key} className="flex gap-1.5 text-2xs">
            <dt className="shrink-0 text-faint">{key}</dt>
            <dd className="min-w-0 truncate text-muted">{rendered}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * Approval gate.
 *
 * The run is blocked on this decision — a tool call is polling the approvals
 * table and will not proceed until a row is written. Rendering it as a
 * prominent card rather than an inline line is deliberate: a missed approval
 * looks like a hung run.
 */
function ApprovalRow({ event }: { event: AgentEvent }) {
  const approvalId = String(event.payload.approvalId ?? "");
  const decisionFromEvent = event.payload.decision as string | null;
  const [decision, setDecision] = useState<string | null>(decisionFromEvent);
  const [busy, setBusy] = useState(false);
  const sent = useRef(false);

  async function decide(next: "allow" | "deny") {
    if (sent.current) return;
    sent.current = true;
    setBusy(true);
    try {
      await fetch("/api/agent/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId, decision: next }),
      });
      setDecision(next);
    } finally {
      setBusy(false);
    }
  }

  if (decision) {
    return (
      <li className="flex items-center gap-2 px-4 py-2.5 pl-[34px]">
        {decision === "allow" ? (
          <Check size={12} className="shrink-0 text-up" />
        ) : (
          <X size={12} className="shrink-0 text-down" />
        )}
        <p className="text-2xs text-muted">
          {decision === "allow" ? "You approved this." : "You declined this."}
        </p>
      </li>
    );
  }

  return (
    <li className="bg-warn/8 px-4 py-3.5">
      <div className="flex items-start gap-2.5">
        <ShieldQuestion size={15} className="mt-0.5 shrink-0 text-warn" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-ink">Approval needed</p>
          <p className="mt-0.5 text-xs text-muted">{String(event.payload.summary ?? "")}</p>
          <p className="mono mt-1 text-2xs text-faint">{String(event.payload.tool ?? "")}</p>
          <div className="mt-2.5 flex gap-2">
            <Button size="sm" onClick={() => decide("allow")} disabled={busy}>
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => decide("deny")} disabled={busy}>
              <X size={12} /> Decline
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * Cost panel.
 *
 * Shown per run rather than hidden in a billing page because the whole point of
 * an agent product is that a single run has a real, variable cost — and the
 * cache hit rate is the number that most affects it.
 */
function UsagePanel({ usage, mode }: { usage: Record<string, number>; mode: "live" | "demo" }) {
  const input = usage.inputTokens ?? 0;
  const cacheRead = usage.cacheReadTokens ?? 0;
  const hitRate = input + cacheRead > 0 ? cacheRead / (input + cacheRead) : 0;

  return (
    <div className="border-t border-hairline bg-raised/30 px-4 py-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Input" value={tokens(input)} hint="uncached" />
        <Metric label="Output" value={tokens(usage.outputTokens ?? 0)} />
        <Metric
          label="Cache hit"
          value={`${Math.round(hitRate * 100)}%`}
          hint={`${tokens(cacheRead)} read`}
          tone={hitRate > 0.5 ? "up" : undefined}
        />
        <Metric
          label="Cost"
          value={usd(usage.costUsd ?? 0)}
          hint={`${usage.credits ?? 0} credits`}
        />
      </div>
      {mode === "demo" ? (
        <p className="mt-2 text-2xs text-faint">
          Estimated — demo runs do not call the API. Token counts are derived from the text
          actually produced.
        </p>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "up";
}) {
  return (
    <div className="min-w-0">
      <p className="eyebrow truncate">{label}</p>
      <p
        className={clsx(
          "tnum mt-0.5 truncate text-sm font-bold",
          tone === "up" ? "text-up" : "text-ink",
        )}
      >
        {value}
      </p>
      {hint ? <p className="truncate text-2xs text-faint">{hint}</p> : null}
    </div>
  );
}
