import type { Metadata } from "next";
import { currentBusiness } from "@/lib/session";
import { listContent } from "@/lib/resources/content";
import { Card, CardHeader, Badge } from "@/components/ui/Primitives";
import { EmailEditor } from "@/components/content/EmailEditor";

export const metadata: Metadata = { title: "Team Member Content Portal" };
export const dynamic = "force-dynamic";

export default function UserPortalPage() {
  const business = currentBusiness();
  const items = listContent(business.id);

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-6">
      {/* ------------------------------------------------ Header -- */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <Badge tone="info">TEAM MEMBER & CREATOR PORTAL</Badge>
            <h1 className="text-xl font-bold tracking-tight text-ink">Content Creator & Checklist Studio</h1>
          </div>
          <p className="mt-1 text-xs text-muted">
            Workspace for company copywriters & team members to draft, edit, preview HTML emails, write blogs, and manage task checklists.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge tone="neutral">{business.name}</Badge>
        </div>
      </div>

      {/* ---------------------------------- Creator Task Checklist -- */}
      <Card>
        <CardHeader
          title="Creator Task Checklist"
          subtitle="Daily content checklist for team members & copywriters"
        />
        <div className="card-pad space-y-3">
          <div className="grid md:grid-cols-3 gap-3">
            <div className="p-3 rounded border border-border bg-raised/30 space-y-1">
              <div className="flex justify-between items-center text-xs font-bold text-ink">
                <span>1. Brand Voice Review</span>
                <Badge tone="up">Done</Badge>
              </div>
              <p className="text-2xs text-muted">Read company tone rules in `/brand/voice.md` before writing.</p>
            </div>

            <div className="p-3 rounded border border-border bg-raised/30 space-y-1">
              <div className="flex justify-between items-center text-xs font-bold text-ink">
                <span>2. Draft HTML Email</span>
                <Badge tone="brand">In Progress</Badge>
              </div>
              <p className="text-2xs text-muted">Draft newsletter copy using the visual HTML editor below.</p>
            </div>

            <div className="p-3 rounded border border-border bg-raised/30 space-y-1">
              <div className="flex justify-between items-center text-xs font-bold text-ink">
                <span>3. Manager Approval</span>
                <Badge tone="warn">Pending</Badge>
              </div>
              <p className="text-2xs text-muted">Submit finished draft for Company Admin approval before dispatch.</p>
            </div>
          </div>
        </div>
      </Card>

      {/* ---------------------------------- Visual HTML Email & Blog Editor -- */}
      <EmailEditor />

      {/* ---------------------------------- Existing Drafts & Content Items -- */}
      <Card>
        <CardHeader
          title="Workspace Content Pipeline"
          subtitle="All drafted, scheduled, and published items across channels"
        />
        <div className="card-pad space-y-3">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <div key={item.id} className="p-3.5 rounded border border-border bg-raised/20 space-y-2">
                <div className="flex justify-between items-center">
                  <Badge tone={item.kind === "email" ? "email" : item.kind === "social" ? "social" : "blog"}>
                    {item.kind}
                  </Badge>
                  <Badge tone={item.status === "published" ? "up" : item.status === "scheduled" ? "info" : "neutral"}>
                    {item.status}
                  </Badge>
                </div>
                <h4 className="font-bold text-xs text-ink truncate">{item.title}</h4>
                <p className="text-2xs text-muted line-clamp-2">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
