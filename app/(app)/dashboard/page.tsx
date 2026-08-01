import type { Metadata } from "next";
import Link from "next/link";
import {
  Users,
  FileText,
  Sparkles,
  Wallet,
  ChevronRight,
  Calendar,
  Zap,
} from "lucide-react";
import { Card, CardHeader, Stat, Badge, Meter, Empty } from "@/components/ui/Primitives";
import { BarSeries, StackBar } from "@/components/ui/Charts";
import { RunHistory } from "@/components/agent/RunHistory";
import { currentBusiness, PLAN_LIMITS } from "@/lib/session";
import { countPeople, eventsPerDay, listLists } from "@/lib/resources/audience";
import { contentStats, listContent } from "@/lib/resources/content";
import { countMemories } from "@/lib/resources/memory";
import { listFlows } from "@/lib/resources/flows";
import { agentStats, listRuns } from "@/lib/resources/agent";
import { num, compact, usd, pct, until, shortDate, truncate } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const KIND_TONE = { email: "email", social: "social", blog: "blog" } as const;

export default function DashboardPage() {
  const business = currentBusiness();
  const now = Date.now();

  const people = countPeople(business.id);
  const content = contentStats(business.id);
  const memories = countMemories(business.id);
  const flows = listFlows(business.id);
  const stats = agentStats(business.id);
  const runs = listRuns(business.id, 6);
  const lists = listLists(business.id);
  const activity = eventsPerDay(business.id, 30, now);
  const upcoming = listContent(business.id, { status: "scheduled", limit: 6 });

  const creditsLeft = Math.max(0, business.creditsLimit - business.creditsUsed);
  const creditPct = business.creditsUsed / business.creditsLimit;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-ink">{business.name}</h1>
          <p className="mt-0.5 text-xs text-muted">
            {PLAN_LIMITS[business.plan].label} plan · {PLAN_LIMITS[business.plan].model} models
          </p>
        </div>
        <Link
          href="/agent"
          className="flex items-center gap-1.5 rounded-soft bg-brand px-3 py-2 text-xs font-semibold text-brand-ink transition-colors hover:bg-brand/90"
        >
          <Sparkles size={14} /> Run the agent
        </Link>
      </header>

      {/* ---------------------------------------------------------- stats -- */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Audience"
          value={num(people)}
          sub={`${lists.length} lists`}
          icon={<Users size={14} />}
        />
        <Stat
          label="Content"
          value={num(content.drafts + content.scheduled + content.published)}
          sub={`${content.byAgent} made by the agent`}
          icon={<FileText size={14} />}
        />
        <Stat
          label="Agent spend"
          value={usd(stats.totalCostUsd)}
          sub={`${num(stats.runs)} runs`}
          icon={<Sparkles size={14} />}
          tone="brand"
        />
        <Stat
          label="Credits left"
          value={num(creditsLeft)}
          sub={`of ${compact(business.creditsLimit)}`}
          icon={<Wallet size={14} />}
          tone={creditPct > 0.85 ? "down" : undefined}
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {/* ------------------------------------------------------ activity -- */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Audience activity"
            subtitle="Tracked events, last 30 days"
            action={
              <span className="tnum text-2xs text-muted">
                {compact(activity.reduce((a, d) => a + d.count, 0))} events
              </span>
            }
          />
          <div className="px-4 pb-3 pt-4">
            <BarSeries data={activity.map((d) => d.count)} height={110} />
            <div className="mt-1.5 flex justify-between text-2xs text-faint">
              <span>{shortDate(activity[0]?.day ?? now)}</span>
              <span>{shortDate(activity[activity.length - 1]?.day ?? now)}</span>
            </div>
          </div>
        </Card>

        {/* ------------------------------------------------------- credits -- */}
        <Card>
          <CardHeader title="This period" subtitle="Usage against plan" />
          <div className="card-pad space-y-4">
            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="eyebrow">AI credits</span>
                <span className="tnum text-2xs font-semibold text-ink">
                  {num(business.creditsUsed)} / {num(business.creditsLimit)}
                </span>
              </div>
              <Meter
                value={business.creditsUsed}
                max={business.creditsLimit}
                tone={creditPct > 0.85 ? "down" : creditPct > 0.6 ? "warn" : "brand"}
              />
            </div>

            <div className="divider" />

            <dl className="space-y-2 text-xs">
              <Row label="Cache hit rate">
                <span className={stats.cacheHitRate && stats.cacheHitRate > 0.5 ? "text-up" : ""}>
                  {stats.cacheHitRate === null ? "—" : pct(stats.cacheHitRate)}
                </span>
              </Row>
              <Row label="Emails sent">{num(content.emailsSent)}</Row>
              <Row label="Avg open rate">
                {content.avgOpenRate === null ? "—" : pct(content.avgOpenRate)}
              </Row>
              <Row label="Memory documents">{num(memories)}</Row>
              <Row label="Active flows">{num(flows.filter((f) => f.active).length)}</Row>
            </dl>

            <div>
              <p className="eyebrow mb-1.5">Content mix</p>
              <StackBar
                segments={[
                  { label: "Drafts", value: content.drafts, className: "bg-faint" },
                  { label: "Scheduled", value: content.scheduled, className: "bg-warn" },
                  { label: "Published", value: content.published, className: "bg-up" },
                ]}
              />
              <p className="mt-1.5 flex flex-wrap gap-x-3 text-2xs text-faint">
                <span>{content.drafts} draft</span>
                <span>{content.scheduled} scheduled</span>
                <span>{content.published} published</span>
              </p>
            </div>
          </div>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        {/* ------------------------------------------------------ upcoming -- */}
        <Card>
          <CardHeader
            title="Going out next"
            subtitle="Scheduled content"
            action={
              <Link
                href="/content"
                className="flex items-center gap-0.5 text-2xs font-semibold text-brand hover:underline"
              >
                All content <ChevronRight size={12} />
              </Link>
            }
          />
          {upcoming.length === 0 ? (
            <Empty
              icon={<Calendar size={20} />}
              title="Nothing scheduled"
              hint="Ask the agent to draft and schedule something."
            />
          ) : (
            <ul className="divide-y divide-hairline/50">
              {upcoming.map((item) => (
                <li key={item.id} className="flex items-start gap-2.5 px-4 py-2.5">
                  <Badge tone={KIND_TONE[item.kind]}>{item.kind}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-ink">{truncate(item.title, 70)}</p>
                    <p className="mt-0.5 text-2xs text-faint">
                      {item.scheduledAt ? shortDate(item.scheduledAt) : "—"} ·{" "}
                      {item.scheduledAt ? until(item.scheduledAt, now) : ""}
                      {item.createdBy === "agent" ? " · by agent" : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---------------------------------------------------------- runs -- */}
        <RunHistory runs={runs} now={now} />
      </section>

      {/* ----------------------------------------------------------- lists -- */}
      <Card>
        <CardHeader
          title="Lists"
          subtitle="Audience segments"
          action={
            <Link
              href="/audience"
              className="flex items-center gap-0.5 text-2xs font-semibold text-brand hover:underline"
            >
              Audience <ChevronRight size={12} />
            </Link>
          }
        />
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {lists.map((list) => (
            <div key={list.id} className="min-w-0 rounded-soft border border-hairline px-3 py-2.5">
              <p className="truncate text-xs font-semibold text-ink">{list.name}</p>
              <p className="tnum mt-0.5 text-lg font-bold text-ink">{num(list.memberCount)}</p>
              <Meter value={list.memberCount} max={people} className="mt-1.5" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="tnum font-semibold text-ink">{children}</dd>
    </div>
  );
}
