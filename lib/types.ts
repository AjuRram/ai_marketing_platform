/**
 * Domain types.
 *
 * These are the shapes the resource layer returns — camelCase, real booleans,
 * parsed JSON, `Date`-friendly numbers. The snake_case, 0/1, JSON-string shape
 * of the database never escapes `lib/resources/*`.
 */

export type Plan = "free" | "starter" | "team" | "pro" | "scale";
export type UserRole = "owner" | "admin" | "marketer" | "viewer";
export type ContentKind = "email" | "social" | "blog";
export type ContentStatus = "draft" | "scheduled" | "published";
export type RunStatus = "running" | "awaiting_approval" | "done" | "failed" | "refused";
export type FlowRunStatus = "running" | "waiting" | "done" | "failed";
export type JobStatus = "pending" | "running" | "done" | "failed";

export interface User {
  id: string;
  businessId: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: number;
}

export interface Business {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  creditsUsed: number;
  creditsLimit: number;
  createdAt: number;
}

export interface Person {
  id: string;
  email: string;
  name: string | null;
  companyId: string | null;
  companyName?: string | null;
  companyDomain?: string | null;
  traits: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface Company {
  id: string;
  domain: string;
  name: string | null;
  traits: Record<string, unknown>;
  peopleCount?: number;
  createdAt: number;
  updatedAt: number;
}

export interface AudienceList {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  memberCount: number;
  createdAt: number;
}

export interface TrackedEvent {
  id: string;
  personId: string | null;
  personEmail?: string | null;
  name: string;
  props: Record<string, unknown>;
  ts: number;
}

export interface Memory {
  id: string;
  path: string;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  isDir: boolean;
  createdAt: number;
  updatedAt: number;
  /** Populated only by search results. */
  snippet?: string;
}

export interface ContentItem {
  id: string;
  kind: ContentKind;
  status: ContentStatus;
  title: string;
  slug: string | null;
  body: string;
  meta: ContentMeta;
  listId: string | null;
  listName?: string | null;
  createdBy: "human" | "agent";
  agentRunId: string | null;
  scheduledAt: number | null;
  publishedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ContentMeta {
  subject?: string;
  preheader?: string;
  network?: "linkedin" | "x" | "instagram";
  tags?: string[];
  excerpt?: string;
  /** Simulated delivery stats, filled in on publish. */
  sent?: number;
  opened?: number;
  clicked?: number;
  impressions?: number;
}

/* ------------------------------------------------------------------ flows -- */

export type FlowTrigger =
  | { type: "manual" }
  | { type: "event"; event: string }
  | { type: "schedule"; cron: string };

export type FlowStep =
  | { type: "wait"; hours: number }
  | { type: "send_email"; contentId?: string; subject: string; body: string }
  | { type: "add_to_list"; listSlug: string }
  | { type: "tag"; key: string; value: string }
  | { type: "condition"; trait: string; equals: string };

export interface Flow {
  id: string;
  name: string;
  description: string | null;
  trigger: FlowTrigger;
  steps: FlowStep[];
  active: boolean;
  runCount?: number;
  createdAt: number;
  updatedAt: number;
}

export interface FlowRun {
  id: string;
  flowId: string;
  flowName?: string;
  personId: string | null;
  personEmail?: string | null;
  status: FlowRunStatus;
  cursor: number;
  log: FlowLogEntry[];
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
}

export interface FlowLogEntry {
  step: number;
  type: string;
  detail: string;
  at: number;
}

/* ------------------------------------------------------------------ agent -- */

export type AgentEventType =
  | "status"
  | "thinking"
  | "text"
  | "tool_use"
  | "tool_result"
  | "approval"
  | "usage"
  | "error";

export interface AgentEvent {
  id: string;
  runId: string;
  seq: number;
  type: AgentEventType;
  payload: Record<string, unknown>;
  ts: number;
}

export interface AgentRun {
  id: string;
  goal: string;
  status: RunStatus;
  mode: "live" | "demo";
  model: string;
  effort: string | null;
  stopReason: string | null;
  error: string | null;
  usage: RunUsage;
  createdAt: number;
  finishedAt: number | null;
}

export interface RunUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  credits: number;
}

export interface Approval {
  id: string;
  runId: string;
  tool: string;
  input: Record<string, unknown>;
  summary: string;
  decision: "allow" | "deny" | null;
  reason: string | null;
  createdAt: number;
  decidedAt: number | null;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  kind: "pk" | "sk";
  display: string;
  scopes: string[];
  lastUsedAt: number | null;
  revokedAt: number | null;
  createdAt: number;
}

/** Cursor-style pagination envelope used by every list endpoint. */
export interface Page<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}
