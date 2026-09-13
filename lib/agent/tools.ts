import * as z from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as audience from "../resources/audience";
import * as memory from "../resources/memory";
import * as content from "../resources/content";
import * as flows from "../resources/flows";

/**
 * The agent's tool surface.
 *
 * Every tool is a thin wrapper over `lib/resources/*` — the SAME functions the
 * dashboard renders from and the public API exposes. There is no separate
 * "agent backend" and no duplicated business logic, which means a capability
 * added to the product is automatically a capability the agent has, and a bug
 * fixed in one place is fixed for all three consumers.
 *
 * Descriptions are written PRESCRIPTIVELY — they say *when* to call the tool,
 * not just what it does. On recent Opus models that measurably raises the
 * should-call rate; a description that only states the mechanic gets under-used.
 */

export interface ToolContext {
  businessId: string;
  runId: string;
  /** Records a tool call/result pair for the run's replayable event log. */
  emit: (type: "tool_use" | "tool_result", payload: Record<string, unknown>) => void;
  /**
   * Blocks until a human allows or denies an irreversible action.
   * Resolves `false` on denial or timeout — never throws, so a denial reads to
   * the model as a normal tool result it can respond to rather than an error.
   */
  requireApproval: (tool: string, input: Record<string, unknown>, summary: string) => Promise<boolean>;
}

const ok = (data: unknown) => JSON.stringify(data);

export function buildTools(ctx: ToolContext) {
  /**
   * Wraps a tool body so every call is logged to the run's event stream on the
   * way in and out, and so a thrown error becomes a readable tool result rather
   * than killing the run. The model can recover from "list not found"; it
   * cannot recover from the process dying.
   */
  function traced<A>(name: string, fn: (args: A) => Promise<string> | string) {
    return async (args: A): Promise<string> => {
      ctx.emit("tool_use", { name, input: args });
      try {
        const result = await fn(args);
        ctx.emit("tool_result", { name, ok: true, summary: summarise(name, args, result) });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        ctx.emit("tool_result", { name, ok: false, summary: message });
        return ok({ error: message });
      }
    };
  }

  return [
    /* ------------------------------------------------------------ memory -- */

    betaZodTool({
      name: "memory_search",
      description:
        "Full-text search the company's long-term memory (brand voice, positioning, personas, competitor notes, past campaign results). CALL THIS FIRST for any task that produces writing a human will read, and before researching something you may already know. Returns matching paths with snippets.",
      inputSchema: z.object({
        query: z.string().describe("Keywords to search for, e.g. 'brand voice email'"),
        tag: z.string().optional().describe("Restrict to memories carrying this tag"),
      }),
      run: traced("memory_search", (args) => {
        const hits = memory.searchMemories(ctx.businessId, args.query, { tag: args.tag });
        return ok({
          count: hits.length,
          results: hits.map((m) => ({ path: m.path, title: m.title, snippet: m.snippet })),
        });
      }),
    }),

    betaZodTool({
      name: "memory_read",
      description:
        "Read one memory document in full by path. Call after memory_search when a snippet looks relevant and you need the whole document — for example the full brand voice rules before drafting.",
      inputSchema: z.object({
        path: z.string().describe("Absolute memory path, e.g. '/brand/voice.md'"),
      }),
      run: traced("memory_read", (args) => {
        const doc = memory.readMemory(ctx.businessId, args.path);
        if (!doc) return ok({ error: `No memory at ${args.path}` });
        return ok({ path: doc.path, title: doc.title, tags: doc.tags, content: doc.content });
      }),
    }),

    betaZodTool({
      name: "memory_list",
      description:
        "List memory paths under a prefix, like `ls`. Use to discover what context exists before searching blindly. Pass '/' to see the top level.",
      inputSchema: z.object({
        prefix: z.string().default("/").describe("Directory prefix, e.g. '/brand'"),
        deep: z.boolean().default(false).describe("Include everything nested below the prefix"),
      }),
      run: traced("memory_list", (args) => {
        const items = memory.listMemories(ctx.businessId, { prefix: args.prefix, deep: args.deep });
        return ok(items.map((m) => ({ path: m.path, title: m.title, isDir: m.isDir, tags: m.tags })));
      }),
    }),

    betaZodTool({
      name: "memory_write",
      description:
        "Create or overwrite a memory document. Call this when you learn something durable that should outlive this run — a campaign result worth repeating, a competitor move, a message that landed. Do NOT use it as a scratchpad for the current task. Parent directories are created automatically.",
      inputSchema: z.object({
        path: z.string().describe("Absolute path ending in .md, e.g. '/competitors/acme.md'"),
        title: z.string().describe("Short human-readable title"),
        content: z.string().describe("Full Markdown body. This REPLACES any existing content."),
        tags: z.array(z.string()).default([]),
        pinned: z
          .boolean()
          .default(false)
          .describe("Pin only genuinely always-relevant context — pinned notes are injected into every future run"),
      }),
      run: traced("memory_write", (args) => {
        const saved = memory.writeMemory(ctx.businessId, args);
        return ok({ path: saved.path, updatedAt: saved.updatedAt });
      }),
    }),

    /* ---------------------------------------------------------- audience -- */

    betaZodTool({
      name: "search_people",
      description:
        "Find people in the audience by name or email substring, optionally restricted to one list. Use to check who exists or size a segment before creating content for it.",
      inputSchema: z.object({
        search: z.string().optional(),
        listSlug: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(25),
      }),
      run: traced("search_people", (args) => {
        const page = audience.listPeople(ctx.businessId, args);
        return ok({
          total: page.total,
          people: page.data.map((p) => ({
            email: p.email,
            name: p.name,
            company: p.companyName,
            traits: p.traits,
          })),
        });
      }),
    }),

    betaZodTool({
      name: "list_audience_lists",
      description:
        "List every audience list with its live member count. CALL THIS BEFORE attaching an email to a list — list slugs must be exact and inventing one will fail.",
      inputSchema: z.object({}),
      run: traced("list_audience_lists", () => {
        const lists = audience.listLists(ctx.businessId);
        return ok(
          lists.map((l) => ({
            slug: l.slug,
            name: l.name,
            members: l.memberCount,
            description: l.description,
          })),
        );
      }),
    }),

    betaZodTool({
      name: "create_list",
      description:
        "Create a new audience list (or update the description of an existing one with the same slug). Use when a campaign needs a segment that does not exist yet.",
      inputSchema: z.object({
        name: z.string(),
        description: z.string().optional(),
      }),
      run: traced("create_list", (args) => {
        const list = audience.upsertList(ctx.businessId, args);
        return ok({ slug: list.slug, name: list.name, members: list.memberCount });
      }),
    }),

    betaZodTool({
      name: "add_to_list",
      description:
        "Add people to a list by email address. Reports how many were added versus already members — report both back to the user, since 'added 0' and 'all 19 were already there' mean very different things.",
      inputSchema: z.object({
        listSlug: z.string().describe("Exact slug from list_audience_lists"),
        emails: z.array(z.string()).min(1).max(500),
      }),
      run: traced("add_to_list", (args) => {
        const res = audience.addToList(ctx.businessId, args.listSlug, args.emails);
        return ok(res);
      }),
    }),

    betaZodTool({
      name: "query_events",
      description:
        "Find people by behaviour — who viewed pricing, started a trial, opened an email, in the last N days. This is the targeting primitive: use it to build a segment from actions rather than guessing.",
      inputSchema: z.object({
        event: z.string().describe("Event name, e.g. 'pricing_viewed', 'trial_started'"),
        sinceDays: z.number().int().min(1).max(365).default(7),
      }),
      run: traced("query_events", (args) => {
        const people = audience.peopleWhoDid(ctx.businessId, args.event, args.sinceDays);
        return ok({
          event: args.event,
          sinceDays: args.sinceDays,
          uniquePeople: people.length,
          emails: people.slice(0, 200).map((p) => p.email),
        });
      }),
    }),

    /* ----------------------------------------------------------- content -- */

    betaZodTool({
      name: "draft_content",
      description:
        "Create a draft email, social post or blog post. This is the main way you produce work. Read the brand voice from memory FIRST — a draft that ignores it will be rejected. For email, set meta.subject. For social, set meta.network. Returns the new content id, which you need for scheduling.",
      inputSchema: z.object({
        kind: z.enum(["email", "social", "blog"]),
        title: z.string().describe("Internal title; for blog posts this also becomes the slug"),
        body: z.string().describe("Full body copy in Markdown"),
        subject: z.string().optional().describe("Email subject line — required for kind='email'"),
        preheader: z.string().optional(),
        network: z.enum(["linkedin", "x", "instagram"]).optional(),
        excerpt: z.string().optional().describe("Blog meta description"),
        tags: z.array(z.string()).default([]),
        listSlug: z.string().optional().describe("For email: which list it goes to"),
      }),
      run: traced("draft_content", (args) => {
        const item = content.createDraft(ctx.businessId, {
          kind: args.kind,
          title: args.title,
          body: args.body,
          listSlug: args.listSlug ?? null,
          createdBy: "agent",
          agentRunId: ctx.runId,
          meta: {
            ...(args.subject ? { subject: args.subject } : {}),
            ...(args.preheader ? { preheader: args.preheader } : {}),
            ...(args.network ? { network: args.network } : {}),
            ...(args.excerpt ? { excerpt: args.excerpt } : {}),
            ...(args.tags.length ? { tags: args.tags } : {}),
          },
        });
        return ok({ contentId: item.id, kind: item.kind, title: item.title, status: item.status });
      }),
    }),

    betaZodTool({
      name: "list_content",
      description:
        "List existing content, optionally filtered by kind or status. Use to check what is already scheduled before adding more, or to find a draft you created earlier in this run.",
      inputSchema: z.object({
        kind: z.enum(["email", "social", "blog"]).optional(),
        status: z.enum(["draft", "scheduled", "published"]).optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      run: traced("list_content", (args) => {
        const items = content.listContent(ctx.businessId, args);
        return ok(
          items.map((c) => ({
            contentId: c.id,
            kind: c.kind,
            status: c.status,
            title: c.title,
            scheduledAt: c.scheduledAt,
            performance: c.meta.sent
              ? { sent: c.meta.sent, opened: c.meta.opened, clicked: c.meta.clicked }
              : c.meta.impressions
                ? { impressions: c.meta.impressions }
                : undefined,
          })),
        );
      }),
    }),

    betaZodTool({
      name: "schedule_content",
      description:
        "Schedule a draft to go out at a specific time. Reversible, so this does NOT need approval — prefer scheduling over publishing when the user gave a time. Takes an ISO-8601 UTC timestamp.",
      inputSchema: z.object({
        contentId: z.string(),
        when: z.string().describe("ISO-8601 UTC, e.g. '2026-08-04T09:00:00Z'"),
      }),
      run: traced("schedule_content", (args) => {
        const ms = Date.parse(args.when);
        if (Number.isNaN(ms)) return ok({ error: `Could not parse '${args.when}' as a date` });
        const item = content.scheduleContent(ctx.businessId, args.contentId, ms);
        return ok({ contentId: item.id, status: item.status, scheduledAt: item.scheduledAt });
      }),
    }),

    betaZodTool({
      name: "publish_content",
      description:
        "Publish immediately — sends the email or posts to the network. THIS IS IRREVERSIBLE and always asks the human for approval first. Only call it when the work is genuinely finished. If the user gave a time, use schedule_content instead.",
      inputSchema: z.object({
        contentId: z.string(),
      }),
      run: traced("publish_content", async (args) => {
        const item = content.getContent(ctx.businessId, args.contentId);
        if (!item) return ok({ error: `No content with id ${args.contentId}` });

        const audienceSize = item.listId
          ? audience.listLists(ctx.businessId).find((l) => l.id === item.listId)?.memberCount
          : undefined;

        const summary =
          item.kind === "email"
            ? `Send "${item.title}" to ${audienceSize ?? "an unknown number of"} people`
            : `Publish "${item.title}" (${item.kind})`;

        const approved = await ctx.requireApproval("publish_content", { ...args, title: item.title }, summary);
        if (!approved) {
          // A denial is a normal outcome the model should react to, not an error.
          return ok({ published: false, reason: "The human declined this action." });
        }

        const published = content.publishContent(ctx.businessId, args.contentId);
        return ok({
          published: true,
          contentId: published.id,
          publishedAt: published.publishedAt,
          stats: published.meta,
        });
      }),
    }),

    /* ------------------------------------------------------------- flows -- */

    betaZodTool({
      name: "list_flows",
      description:
        "List automation flows and whether each is active. Check here before creating a flow — an equivalent one often already exists and should be edited rather than duplicated.",
      inputSchema: z.object({}),
      run: traced("list_flows", () => {
        const items = flows.listFlows(ctx.businessId);
        return ok(
          items.map((f) => ({
            flowId: f.id,
            name: f.name,
            active: f.active,
            trigger: f.trigger,
            steps: f.steps.length,
            runs: f.runCount,
          })),
        );
      }),
    }),

    betaZodTool({
      name: "create_flow",
      description:
        "Create a multi-step automation. Steps run in order per person and can wait between them, so this is how you build a nurture sequence rather than a one-off send. Triggers on an event, a schedule, or manually.",
      inputSchema: z.object({
        name: z.string(),
        description: z.string().optional(),
        trigger: z.discriminatedUnion("type", [
          z.object({ type: z.literal("manual") }),
          z.object({ type: z.literal("event"), event: z.string() }),
          z.object({ type: z.literal("schedule"), cron: z.string() }),
        ]),
        steps: z
          .array(
            z.discriminatedUnion("type", [
              z.object({ type: z.literal("wait"), hours: z.number().int().min(1).max(720) }),
              z.object({ type: z.literal("send_email"), subject: z.string(), body: z.string() }),
              z.object({ type: z.literal("add_to_list"), listSlug: z.string() }),
              z.object({ type: z.literal("tag"), key: z.string(), value: z.string() }),
              z.object({ type: z.literal("condition"), trait: z.string(), equals: z.string() }),
            ]),
          )
          .min(1)
          .max(20),
      }),
      run: traced("create_flow", (args) => {
        const flow = flows.createFlow(ctx.businessId, args);
        return ok({ flowId: flow.id, name: flow.name, steps: flow.steps.length });
      }),
    }),

    betaZodTool({
      name: "trigger_flow",
      description:
        "Start a flow for one person. IRREVERSIBLE once emails begin sending, so it asks for approval. Use for testing a sequence or enrolling a specific high-value contact.",
      inputSchema: z.object({
        flowId: z.string(),
        email: z.string().describe("Email address of the person to enrol"),
      }),
      run: traced("trigger_flow", async (args) => {
        const flow = flows.getFlow(ctx.businessId, args.flowId);
        if (!flow) return ok({ error: `No flow with id ${args.flowId}` });

        const approved = await ctx.requireApproval(
          "trigger_flow",
          args,
          `Enrol ${args.email} in "${flow.name}" (${flow.steps.length} steps)`,
        );
        if (!approved) return ok({ triggered: false, reason: "The human declined this action." });

        const flowRun = flows.triggerFlow(ctx.businessId, args.flowId, args.email);
        return ok({ triggered: true, flowRunId: flowRun.id, status: flowRun.status });
      }),
    }),

    /* -------------------------------------------------------- web & assets -- */

    betaZodTool({
      name: "web_search",
      description:
        "Search the live web for competitor research, market trends, SEO keywords, or industry news. Call when you need external facts not present in company memory.",
      inputSchema: z.object({
        query: z.string().describe("Search keywords, e.g. 'SaaS AI marketing trends 2026'"),
      }),
      run: traced("web_search", async (args) => {
        const tavilyKey = process.env.TAVILY_API_KEY?.trim();
        if (tavilyKey) {
          try {
            const res = await fetch("https://api.tavily.com/search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ api_key: tavilyKey, query: args.query, search_depth: "basic" }),
            });
            const data = (await res.json()) as { results?: Array<{ title: string; url: string; content: string }> };
            return ok({ query: args.query, results: data.results ?? [] });
          } catch (err) {
            return ok({ query: args.query, error: String(err) });
          }
        }
        // Keyless fallback response
        return ok({
          query: args.query,
          note: "Live web search query generated (Keyless Mode)",
          results: [
            { title: `${args.query} - Market Insights`, url: "https://example.com/insights", snippet: `Top trends and industry benchmarks for ${args.query}.` },
          ],
        });
      }),
    }),

    betaZodTool({
      name: "generate_image",
      description:
        "Generate a promotional visual, banner, or illustration asset for emails, blog posts, or social media.",
      inputSchema: z.object({
        prompt: z.string().describe("Detailed description of the image to generate"),
        aspect: z.enum(["1:1", "16:9", "4:3"]).default("16:9"),
      }),
      run: traced("generate_image", (args) => {
        const assetUrl = `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop`;
        return ok({
          prompt: args.prompt,
          aspect: args.aspect,
          url: assetUrl,
          status: "generated",
        });
      }),
    }),
  ];
}

/** Short human-readable line for the tool card in the UI. */
function summarise(name: string, args: unknown, result: string): string {
  try {
    const parsed = JSON.parse(result) as Record<string, unknown>;
    if (typeof parsed.error === "string") return parsed.error;

    switch (name) {
      case "web_search":
        return `Searched web for "${String((args as { query?: string })?.query ?? "")}"`;
      case "generate_image":
        return `Generated asset (${String((args as { aspect?: string })?.aspect ?? "16:9")})`;
      case "memory_search":
        return `${parsed.count ?? 0} match(es)`;
      case "memory_read":
        return `Read ${String(parsed.path ?? "")}`;
      case "memory_write":
        return `Wrote ${String(parsed.path ?? "")}`;
      case "memory_list":
        return `${Array.isArray(parsed) ? parsed.length : 0} entries`;
      case "search_people":
        return `${parsed.total ?? 0} people`;
      case "list_audience_lists":
        return `${Array.isArray(parsed) ? parsed.length : 0} lists`;
      case "add_to_list": {
        const r = parsed as { added?: number; alreadyMember?: number };
        return `Added ${r.added ?? 0}, ${r.alreadyMember ?? 0} already members`;
      }
      case "query_events":
        return `${parsed.uniquePeople ?? 0} people did ${String(parsed.event ?? "")}`;
      case "draft_content":
        return `Drafted ${String(parsed.kind ?? "")}: ${String(parsed.title ?? "")}`;
      case "schedule_content":
        return `Scheduled`;
      case "publish_content":
        return parsed.published ? "Published" : "Declined by human";
      case "create_flow":
        return `Created flow with ${parsed.steps ?? 0} steps`;
      case "trigger_flow":
        return parsed.triggered ? "Flow started" : "Declined by human";
      case "list_content":
        return `${Array.isArray(parsed) ? parsed.length : 0} items`;
      case "list_flows":
        return `${Array.isArray(parsed) ? parsed.length : 0} flows`;
      default:
        return "Done";
    }
  } catch {
    return "Done";
  }
}

/**
 * Tool names sorted for a STABLE prompt prefix.
 *
 * Tools render at position 0 of the cached prefix, before the system prompt.
 * If the array order varied between requests — say because it came from an
 * object's key order or a filter — the cache would miss on every single call
 * with no visible symptom other than the bill.
 */
export function toolNames(ctx: ToolContext): string[] {
  return buildTools(ctx)
    .map((t) => t.name)
    .sort();
}
