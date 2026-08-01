import { NextResponse } from "next/server";
import { authenticate, hasScope, tokenFromRequest, type AuthenticatedKey } from "@/lib/resources/keys";
import * as audience from "@/lib/resources/audience";
import * as memory from "@/lib/resources/memory";
import * as content from "@/lib/resources/content";
import * as flows from "@/lib/resources/flows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public API.
 *
 * Every handler here is a thin HTTP wrapper over `lib/resources/*` — the same
 * functions the dashboard renders from and the agent calls as tools. That is
 * the point of the architecture: there is one implementation of "add someone to
 * a list", and all three consumers share it.
 *
 * Auth is a bearer key resolved by hash. Publishable (`pk_`) keys are assumed
 * to be public — they ship in browser bundles — so they are restricted to the
 * two write-only ingest endpoints and cannot read anything back.
 */

type Handler = (input: {
  key: AuthenticatedKey;
  request: Request;
  segments: string[];
  query: URLSearchParams;
  body: Record<string, unknown>;
}) => Promise<unknown> | unknown;

class ApiError extends Error {
  constructor(
    override readonly message: string,
    readonly status: number,
    readonly scope?: string,
  ) {
    super(message);
  }
}

const needScope = (key: AuthenticatedKey, scope: string) => {
  if (!hasScope(key, scope)) {
    throw new ApiError(`This key is missing the "${scope}" scope`, 403, scope);
  }
};

/* ------------------------------------------------------------------ routes -- */

const ROUTES: Record<string, Handler> = {
  /* -- identity ------------------------------------------------------------ */
  "GET whoami": ({ key }) => ({
    business_id: key.businessId,
    key_id: key.keyId,
    kind: key.kind,
    scopes: key.scopes,
  }),

  /* -- ingest: the only two endpoints a pk_ key may call ------------------- */
  "POST events": ({ key, body }) => {
    needScope(key, "events:write");
    const name = String(body.name ?? "").trim();
    if (!name) throw new ApiError("`name` is required", 400);
    return audience.recordEvent(key.businessId, {
      name,
      personRef: typeof body.email === "string" ? body.email : null,
      props: (body.props as Record<string, unknown>) ?? {},
    });
  },

  "POST audience/people/upsert": ({ key, body }) => {
    needScope(key, "people:identify");
    const email = String(body.email ?? "").trim();
    if (!email) throw new ApiError("`email` is required", 400);
    const result = audience.upsertPerson(key.businessId, {
      email,
      name: typeof body.name === "string" ? body.name : null,
      companyDomain: typeof body.company_domain === "string" ? body.company_domain : null,
      traits: (body.traits as Record<string, unknown>) ?? {},
    });
    return { person: result.person, created: result.created };
  },

  /* -- audience ------------------------------------------------------------ */
  "GET audience/people": ({ key, query }) => {
    needScope(key, "audience:read");
    return audience.listPeople(key.businessId, {
      search: query.get("search") ?? undefined,
      listSlug: query.get("list") ?? undefined,
      page: Number(query.get("page") ?? "1"),
      limit: Number(query.get("limit") ?? "25"),
    });
  },

  "GET audience/companies": ({ key, query }) => {
    needScope(key, "audience:read");
    return audience.listCompanies(key.businessId, {
      search: query.get("search") ?? undefined,
      page: Number(query.get("page") ?? "1"),
      limit: Number(query.get("limit") ?? "25"),
    });
  },

  "GET audience/lists": ({ key }) => {
    needScope(key, "audience:read");
    return { data: audience.listLists(key.businessId) };
  },

  "POST audience/lists": ({ key, body }) => {
    needScope(key, "audience:write");
    const name = String(body.name ?? "").trim();
    if (!name) throw new ApiError("`name` is required", 400);
    return audience.upsertList(key.businessId, {
      name,
      slug: typeof body.slug === "string" ? body.slug : undefined,
      description: typeof body.description === "string" ? body.description : null,
    });
  },

  "POST audience/lists/members": ({ key, body }) => {
    needScope(key, "audience:write");
    const slug = String(body.list ?? "").trim();
    const emails = Array.isArray(body.emails) ? body.emails.map(String) : [];
    if (!slug) throw new ApiError("`list` is required", 400);
    if (emails.length === 0) throw new ApiError("`emails` must be a non-empty array", 400);
    return audience.addToList(key.businessId, slug, emails);
  },

  /* -- content ------------------------------------------------------------- */
  "GET content": ({ key, query }) => {
    needScope(key, "content:read");
    const kind = query.get("kind");
    const status = query.get("status");
    return {
      data: content.listContent(key.businessId, {
        kind: kind === "email" || kind === "social" || kind === "blog" ? kind : undefined,
        status:
          status === "draft" || status === "scheduled" || status === "published"
            ? status
            : undefined,
        limit: Number(query.get("limit") ?? "50"),
      }),
    };
  },

  /* -- memory -------------------------------------------------------------- */
  "GET memory": ({ key, query }) => {
    needScope(key, "memory:read");
    const path = query.get("path");
    if (path) {
      const doc = memory.readMemory(key.businessId, path);
      if (!doc) throw new ApiError(`No memory at ${path}`, 404);
      return doc;
    }
    return {
      data: memory.listMemories(key.businessId, {
        prefix: query.get("prefix") ?? "/",
        deep: query.get("deep") === "true",
      }),
    };
  },

  "GET memory/search": ({ key, query }) => {
    needScope(key, "memory:read");
    const q = query.get("q");
    if (!q) throw new ApiError("`q` is required", 400);
    return { data: memory.searchMemories(key.businessId, q, { tag: query.get("tag") ?? undefined }) };
  },

  "POST memory": ({ key, body }) => {
    needScope(key, "memory:write");
    const path = String(body.path ?? "").trim();
    if (!path) throw new ApiError("`path` is required", 400);
    return memory.writeMemory(key.businessId, {
      path,
      title: String(body.title ?? path),
      content: String(body.content ?? ""),
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
      pinned: body.pinned === true,
    });
  },

  /* -- flows --------------------------------------------------------------- */
  "GET flows": ({ key }) => {
    needScope(key, "flows:read");
    return { data: flows.listFlows(key.businessId) };
  },

  "POST flows/trigger": ({ key, body }) => {
    needScope(key, "flows:write");
    const flowId = String(body.flow_id ?? "").trim();
    if (!flowId) throw new ApiError("`flow_id` is required", 400);
    return flows.triggerFlow(
      key.businessId,
      flowId,
      typeof body.email === "string" ? body.email : null,
    );
  },
};

/* ----------------------------------------------------------------- handler -- */

async function handle(request: Request, method: string, segments: string[]) {
  const key = authenticate(tokenFromRequest(request));
  if (!key) {
    return json(
      { error: "Missing or invalid API key. Send `Authorization: Bearer sk_…`." },
      401,
    );
  }

  const route = ROUTES[`${method} ${segments.join("/")}`];
  if (!route) {
    return json({ error: `No route for ${method} /api/v1/${segments.join("/")}` }, 404);
  }

  let body: Record<string, unknown> = {};
  if (method === "POST") {
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
  }

  try {
    const data = await route({
      key,
      request,
      segments,
      query: new URL(request.url).searchParams,
      body,
    });
    return json(data as Record<string, unknown>, 200);
  } catch (err) {
    if (err instanceof ApiError) return json({ error: err.message }, err.status);
    const message = err instanceof Error ? err.message : "Unexpected error";
    return json({ error: message }, 400);
  }
}

function json(data: unknown, status: number) {
  return NextResponse.json(data, {
    status,
    headers: {
      // The browser SDK posts from any origin using a publishable key, so the
      // two ingest endpoints have to be reachable cross-origin. Reads are
      // gated by scope rather than by origin, since a `pk_` key cannot read.
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function GET(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return handle(request, "GET", path);
}

export async function POST(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return handle(request, "POST", path);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
