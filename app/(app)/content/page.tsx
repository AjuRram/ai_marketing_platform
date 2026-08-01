import type { Metadata } from "next";
import clsx from "clsx";
import { Mail, Share2, FileText, Sparkles, User } from "lucide-react";
import { Card, CardHeader, Badge, Empty, Stat } from "@/components/ui/Primitives";
import { currentBusinessId } from "@/lib/session";
import { listContent, contentStats } from "@/lib/resources/content";
import { num, pct, shortDate, until, ago, truncate } from "@/lib/format";
import type { ContentItem, ContentStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Content" };
export const dynamic = "force-dynamic";

const COLUMNS: Array<{ status: ContentStatus; label: string; hint: string }> = [
  { status: "draft", label: "Drafts", hint: "Not going anywhere yet" },
  { status: "scheduled", label: "Scheduled", hint: "Queued to go out" },
  { status: "published", label: "Published", hint: "Already sent" },
];

const KIND_ICON = { email: Mail, social: Share2, blog: FileText } as const;
const KIND_TONE = { email: "email", social: "social", blog: "blog" } as const;

export default function ContentPage() {
  const businessId = currentBusinessId();
  const now = Date.now();
  const stats = contentStats(businessId);
  const all = listContent(businessId, { limit: 200 });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-bold tracking-tight text-ink">Content</h1>
        <p className="mt-0.5 text-xs text-muted">
          Email, social and blog in one pipeline — whoever made them.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Drafts" value={num(stats.drafts)} />
        <Stat label="Scheduled" value={num(stats.scheduled)} tone="brand" />
        <Stat
          label="Emails sent"
          value={num(stats.emailsSent)}
          sub={stats.avgOpenRate === null ? undefined : `${pct(stats.avgOpenRate)} open rate`}
        />
        <Stat
          label="Made by agent"
          value={num(stats.byAgent)}
          icon={<Sparkles size={14} />}
          tone="brand"
        />
      </div>

      {/* A three-column board on desktop; on mobile the columns stack, which
          keeps the status grouping legible instead of collapsing to one list. */}
      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((column) => {
          const items = all.filter((c) => c.status === column.status);
          return (
            <section key={column.status} className="min-w-0">
              <Card>
                <CardHeader
                  title={column.label}
                  subtitle={column.hint}
                  action={
                    <span className="tnum text-2xs font-semibold text-muted">{items.length}</span>
                  }
                />
                {items.length === 0 ? (
                  <Empty title="Empty" hint="Nothing in this stage." />
                ) : (
                  <ul className="space-y-2 p-2.5">
                    {items.map((item) => (
                      <ContentCard key={item.id} item={item} now={now} />
                    ))}
                  </ul>
                )}
              </Card>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ContentCard({ item, now }: { item: ContentItem; now: number }) {
  const Icon = KIND_ICON[item.kind];

  return (
    <li
      className={clsx(
        "rounded-soft border border-hairline bg-canvas/40 p-3 transition-colors hover:border-brand/40",
        // A left accent tinted per channel makes the board scannable by colour
        // before any text is read.
        "border-l-2",
        item.kind === "email" && "border-l-email",
        item.kind === "social" && "border-l-social",
        item.kind === "blog" && "border-l-blog",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon size={12} className="shrink-0 text-faint" />
          <Badge tone={KIND_TONE[item.kind]}>{item.kind}</Badge>
        </div>
        {item.createdBy === "agent" ? (
          <span title="Created by the agent" className="shrink-0 text-brand">
            <Sparkles size={11} />
          </span>
        ) : (
          <span title="Created by a person" className="shrink-0 text-faint">
            <User size={11} />
          </span>
        )}
      </div>

      <p className="mt-1.5 text-xs font-semibold leading-snug text-ink">
        {truncate(item.title, 72)}
      </p>

      {item.meta.subject ? (
        <p className="mt-1 truncate text-2xs text-muted">Subject: {item.meta.subject}</p>
      ) : null}
      {item.listName ? (
        <p className="mt-0.5 truncate text-2xs text-faint">→ {item.listName}</p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-faint">
        {item.status === "scheduled" && item.scheduledAt ? (
          <span className="tnum text-warn">
            {shortDate(item.scheduledAt)} · {until(item.scheduledAt, now)}
          </span>
        ) : null}
        {item.status === "published" && item.publishedAt ? (
          <span className="tnum">{ago(item.publishedAt, now)}</span>
        ) : null}
        {item.status === "draft" ? <span className="tnum">{ago(item.updatedAt, now)}</span> : null}
      </div>

      {item.status === "published" ? <Performance item={item} /> : null}
    </li>
  );
}

function Performance({ item }: { item: ContentItem }) {
  const { sent, opened, clicked, impressions } = item.meta;

  if (impressions !== undefined) {
    return (
      <p className="tnum mt-2 border-t border-hairline/60 pt-2 text-2xs text-muted">
        {num(impressions)} impressions
      </p>
    );
  }
  if (sent === undefined) return null;

  return (
    <dl className="mt-2 grid grid-cols-3 gap-1 border-t border-hairline/60 pt-2 text-2xs">
      <div>
        <dt className="text-faint">Sent</dt>
        <dd className="tnum font-semibold text-ink">{num(sent)}</dd>
      </div>
      <div>
        <dt className="text-faint">Opened</dt>
        <dd className="tnum font-semibold text-up">
          {opened !== undefined && sent > 0 ? pct(opened / sent) : "—"}
        </dd>
      </div>
      <div>
        <dt className="text-faint">Clicked</dt>
        <dd className="tnum font-semibold text-ink">
          {clicked !== undefined && sent > 0 ? pct(clicked / sent) : "—"}
        </dd>
      </div>
    </dl>
  );
}
