import { all, one, run, json } from "../db/client";
import { id, slugify } from "../ids";
import type { ContentItem, ContentKind, ContentMeta, ContentStatus } from "../types";

/**
 * Content resource — email, social and blog items share one table.
 *
 * They are one table rather than three because every consumer wants them
 * together: the kanban, the calendar, the dashboard feed and the agent's
 * "what's scheduled?" question all span channels. The per-channel differences
 * live in `channel_meta` (subject/preheader for email, network for social,
 * excerpt/tags for blog), which is exactly the shape that varies.
 */

interface ContentRow {
  id: string;
  kind: string;
  status: string;
  title: string;
  slug: string | null;
  body: string;
  channel_meta: string;
  list_id: string | null;
  list_name: string | null;
  created_by: string;
  agent_run_id: string | null;
  scheduled_at: number | null;
  published_at: number | null;
  created_at: number;
  updated_at: number;
}

const toContent = (r: ContentRow): ContentItem => ({
  id: r.id,
  kind: r.kind as ContentKind,
  status: r.status as ContentStatus,
  title: r.title,
  slug: r.slug,
  body: r.body,
  meta: json<ContentMeta>(r.channel_meta, {}),
  listId: r.list_id,
  listName: r.list_name,
  createdBy: r.created_by === "agent" ? "agent" : "human",
  agentRunId: r.agent_run_id,
  scheduledAt: r.scheduled_at,
  publishedAt: r.published_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const SELECT = `
  SELECT c.*, l.name AS list_name
  FROM content c
  LEFT JOIN lists l ON l.id = c.list_id
`;

export function listContent(
  businessId: string,
  opts: { kind?: ContentKind; status?: ContentStatus; limit?: number } = {},
): ContentItem[] {
  const where = ["c.business_id = ?"];
  const params: unknown[] = [businessId];

  if (opts.kind) {
    where.push("c.kind = ?");
    params.push(opts.kind);
  }
  if (opts.status) {
    where.push("c.status = ?");
    params.push(opts.status);
  }

  return all<ContentRow>(
    `${SELECT} WHERE ${where.join(" AND ")}
     ORDER BY COALESCE(c.published_at, c.scheduled_at, c.updated_at) DESC
     LIMIT ?`,
    ...params,
    Math.min(500, opts.limit ?? 100),
  ).map(toContent);
}

export function getContent(businessId: string, contentId: string): ContentItem | null {
  const row = one<ContentRow>(
    `${SELECT} WHERE c.business_id = ? AND c.id = ?`,
    businessId,
    contentId,
  );
  return row ? toContent(row) : null;
}

export interface DraftInput {
  kind: ContentKind;
  title: string;
  body: string;
  meta?: ContentMeta;
  listSlug?: string | null;
  createdBy?: "human" | "agent";
  agentRunId?: string | null;
}

export function createDraft(businessId: string, input: DraftInput): ContentItem {
  const now = Date.now();
  const cid = id("content");

  let listId: string | null = null;
  if (input.listSlug) {
    const row = one<{ id: string }>(
      "SELECT id FROM lists WHERE business_id = ? AND slug = ?",
      businessId,
      input.listSlug,
    );
    if (!row) throw new Error(`No list with slug "${input.listSlug}"`);
    listId = row.id;
  }

  run(
    `INSERT INTO content (id, business_id, kind, status, title, slug, body, channel_meta,
                          list_id, created_by, agent_run_id, created_at, updated_at)
     VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    cid,
    businessId,
    input.kind,
    input.title,
    input.kind === "blog" ? uniqueSlug(businessId, input.title) : null,
    input.body,
    JSON.stringify(input.meta ?? {}),
    listId,
    input.createdBy ?? "human",
    input.agentRunId ?? null,
    now,
    now,
  );

  return getContent(businessId, cid)!;
}

/** Blog slugs are unique per business, so collisions get a numeric suffix. */
function uniqueSlug(businessId: string, title: string): string {
  const base = slugify(title);
  let candidate = base;
  let n = 2;
  while (
    one<{ n: number }>(
      "SELECT COUNT(*) AS n FROM content WHERE business_id = ? AND slug = ?",
      businessId,
      candidate,
    )!.n > 0
  ) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

export function updateContent(
  businessId: string,
  contentId: string,
  patch: { title?: string; body?: string; meta?: ContentMeta },
): ContentItem {
  const existing = getContent(businessId, contentId);
  if (!existing) throw new Error(`No content with id "${contentId}"`);

  run(
    `UPDATE content SET title = ?, body = ?, channel_meta = ?, updated_at = ?
     WHERE business_id = ? AND id = ?`,
    patch.title ?? existing.title,
    patch.body ?? existing.body,
    JSON.stringify({ ...existing.meta, ...(patch.meta ?? {}) }),
    Date.now(),
    businessId,
    contentId,
  );
  return getContent(businessId, contentId)!;
}

export function scheduleContent(
  businessId: string,
  contentId: string,
  whenMs: number,
): ContentItem {
  const existing = getContent(businessId, contentId);
  if (!existing) throw new Error(`No content with id "${contentId}"`);
  if (existing.status === "published") {
    throw new Error("Cannot schedule content that is already published");
  }
  if (!Number.isFinite(whenMs)) throw new Error("Invalid scheduled time");

  run(
    `UPDATE content SET status = 'scheduled', scheduled_at = ?, updated_at = ?
     WHERE business_id = ? AND id = ?`,
    whenMs,
    Date.now(),
    businessId,
    contentId,
  );
  return getContent(businessId, contentId)!;
}

/**
 * Publish.
 *
 * Nothing is actually sent — there is no ESP and no social API wired in, by
 * design. What happens instead is that plausible delivery stats are recorded so
 * every downstream surface (performance tables, the dashboard, the agent's
 * `campaign_performance` tool) has real data to read.
 *
 * Rates are derived DETERMINISTICALLY from the content id rather than randomly,
 * so a given campaign reports the same numbers on every page load. Random rates
 * would make the performance table flicker between renders and would break
 * screenshot stability.
 */
export function publishContent(businessId: string, contentId: string): ContentItem {
  const existing = getContent(businessId, contentId);
  if (!existing) throw new Error(`No content with id "${contentId}"`);
  if (existing.status === "published") return existing;

  const now = Date.now();
  const meta: ContentMeta = { ...existing.meta };

  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const spread = hashUnit(contentId);

  if (existing.kind === "email") {
    const audience = existing.listId ? listSize(existing.listId) : 0;
    const sent = audience || 120 + Math.round(spread * 900);
    const openRate = 0.28 + spread * 0.2;
    const clickRate = 0.05 + spread * 0.07;
    meta.sent = sent;
    meta.opened = Math.round(sent * openRate);
    meta.clicked = Math.round(sent * clickRate);

    // If Resend API Key is set, trigger asynchronous real dispatch
    if (resendApiKey) {
      void dispatchResendEmail(resendApiKey, existing).catch((err) => {
        console.error(`[Resend ESP Error] Failed to send content "${contentId}":`, err);
      });
    }
  } else {
    meta.impressions = 800 + Math.round(spread * 12_000);

    // Trigger Social API dispatches if tokens are configured
    if (existing.kind === "social") {
      void dispatchSocialPost(existing).catch((err) => {
        console.error(`[Social API Error] Failed to publish post "${contentId}":`, err);
      });
    }
  }

  run(
    `UPDATE content SET status = 'published', published_at = ?, channel_meta = ?, updated_at = ?
     WHERE business_id = ? AND id = ?`,
    now,
    JSON.stringify(meta),
    now,
    businessId,
    contentId,
  );
  return getContent(businessId, contentId)!;
}

async function dispatchSocialPost(item: ContentItem): Promise<void> {
  const linkedinToken = process.env.LINKEDIN_ACCESS_TOKEN?.trim();
  const twitterToken = process.env.TWITTER_BEARER_TOKEN?.trim();
  const network = item.meta.network || "linkedin";

  if (network === "linkedin" && linkedinToken) {
    await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${linkedinToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: process.env.LINKEDIN_AUTHOR_URN || "urn:li:organization:123456",
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: item.body },
            shareMediaCategory: "NONE",
          },
        },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      }),
    });
  } else if (network === "x" && twitterToken) {
    await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${twitterToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: item.body }),
    });
  }
}

async function dispatchResendEmail(apiKey: string, item: ContentItem): Promise<void> {
  const fromEmail = process.env.RESEND_FROM_EMAIL || "marketing@pulse.dev";
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: item.meta.subject || "subscribers@example.com",
      subject: item.title,
      html: `<p>${item.body.replace(/\n/g, "<br/>")}</p>`,
    }),
  });
}

function listSize(listId: string): number {
  return (
    one<{ n: number }>("SELECT COUNT(*) AS n FROM list_members WHERE list_id = ?", listId)?.n ?? 0
  );
}

/** Stable [0,1) value derived from a string — deterministic stand-in for a random rate. */
function hashUnit(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

export function deleteContent(businessId: string, contentId: string): boolean {
  return (
    run("DELETE FROM content WHERE business_id = ? AND id = ?", businessId, contentId).changes > 0
  );
}

/** Items whose scheduled time has arrived — the queue's publish candidates. */
export function dueContent(businessId: string, now: number): ContentItem[] {
  return all<ContentRow>(
    `${SELECT} WHERE c.business_id = ? AND c.status = 'scheduled' AND c.scheduled_at <= ?
     ORDER BY c.scheduled_at ASC`,
    businessId,
    now,
  ).map(toContent);
}

export interface ContentStats {
  drafts: number;
  scheduled: number;
  published: number;
  byAgent: number;
  emailsSent: number;
  avgOpenRate: number | null;
}

export function contentStats(businessId: string): ContentStats {
  const counts = all<{ status: string; n: number }>(
    "SELECT status, COUNT(*) AS n FROM content WHERE business_id = ? GROUP BY status",
    businessId,
  );
  const by = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;

  const byAgent =
    one<{ n: number }>(
      "SELECT COUNT(*) AS n FROM content WHERE business_id = ? AND created_by = 'agent'",
      businessId,
    )?.n ?? 0;

  const published = listContent(businessId, { kind: "email", status: "published" });
  const sent = published.reduce((acc, c) => acc + (c.meta.sent ?? 0), 0);
  const opened = published.reduce((acc, c) => acc + (c.meta.opened ?? 0), 0);

  return {
    drafts: by("draft"),
    scheduled: by("scheduled"),
    published: by("published"),
    byAgent,
    emailsSent: sent,
    avgOpenRate: sent > 0 ? opened / sent : null,
  };
}
