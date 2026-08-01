import { all, one, run, tx, json } from "../db/client";
import { id, slugify } from "../ids";
import type { AudienceList, Company, Page, Person, TrackedEvent } from "../types";

/**
 * Audience resource.
 *
 * Every exported function takes `businessId` as its FIRST parameter. That is
 * not a style preference — it is how tenant isolation is enforced. There is no
 * ambient "current tenant" available here, so a query physically cannot be
 * written without deciding whose data it reads, and a missing scope is a
 * compile error rather than a data leak.
 *
 * These functions are consumed by three callers with no adapter in between:
 * server components render them, the public API wraps them in HTTP, and the
 * agent wraps them in tool schemas.
 */

/* ----------------------------------------------------------------- people -- */

interface PersonRow {
  id: string;
  email: string;
  name: string | null;
  company_id: string | null;
  company_name: string | null;
  company_domain: string | null;
  traits: string;
  created_at: number;
  updated_at: number;
}

const toPerson = (r: PersonRow): Person => ({
  id: r.id,
  email: r.email,
  name: r.name,
  companyId: r.company_id,
  companyName: r.company_name,
  companyDomain: r.company_domain,
  traits: json<Record<string, unknown>>(r.traits, {}),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const PERSON_SELECT = `
  SELECT p.id, p.email, p.name, p.company_id, p.traits, p.created_at, p.updated_at,
         c.name AS company_name, c.domain AS company_domain
  FROM people p
  LEFT JOIN companies c ON c.id = p.company_id
`;

export interface ListPeopleOptions {
  search?: string;
  listSlug?: string;
  page?: number;
  limit?: number;
}

export function listPeople(businessId: string, opts: ListPeopleOptions = {}): Page<Person> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 25));
  const offset = (page - 1) * limit;

  // Placeholders bind POSITIONALLY, so the params array has to be assembled in
  // the order the `?`s appear in the final SQL text — JOIN clauses first, then
  // WHERE. Building `where` and `params` in lockstep and prepending the join
  // param separately is what keeps those two orderings from drifting apart.
  let joinList = "";
  const joinParams: unknown[] = [];
  if (opts.listSlug) {
    joinList = `
      JOIN list_members lm ON lm.person_id = p.id
      JOIN lists l ON l.id = lm.list_id AND l.business_id = p.business_id AND l.slug = ?
    `;
    joinParams.push(opts.listSlug);
  }

  const where: string[] = ["p.business_id = ?"];
  const whereParams: unknown[] = [businessId];

  if (opts.search?.trim()) {
    // LIKE rather than FTS: a substring match over two short columns, where an
    // FTS index would add write cost and prefix-match surprises for no
    // measurable gain at this row count.
    where.push("(p.email LIKE ? OR p.name LIKE ?)");
    const q = `%${opts.search.trim()}%`;
    whereParams.push(q, q);
  }

  const whereSql = where.join(" AND ");
  const params = [...joinParams, ...whereParams];

  const total =
    one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM people p ${joinList} WHERE ${whereSql}`,
      ...params,
    )?.n ?? 0;

  const rows = all<PersonRow>(
    `${PERSON_SELECT} ${joinList} WHERE ${whereSql}
     ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset,
  );

  return { data: rows.map(toPerson), page, limit, total, hasMore: offset + rows.length < total };
}

export function getPerson(businessId: string, personIdOrEmail: string): Person | null {
  const row = one<PersonRow>(
    `${PERSON_SELECT} WHERE p.business_id = ? AND (p.id = ? OR p.email = ?)`,
    businessId,
    personIdOrEmail,
    personIdOrEmail.toLowerCase(),
  );
  return row ? toPerson(row) : null;
}

export interface UpsertPersonInput {
  email: string;
  name?: string | null;
  companyDomain?: string | null;
  traits?: Record<string, unknown>;
}

/**
 * Create or merge a person, keyed on email.
 *
 * Upsert rather than create/update because callers — a tracking SDK, an
 * import, the agent — rarely know whether the person already exists, and
 * making them check first is a race condition waiting to happen. Traits MERGE
 * rather than replace, so recording one new trait never silently drops the
 * rest of a profile.
 */
export function upsertPerson(
  businessId: string,
  input: UpsertPersonInput,
): { person: Person; created: boolean } {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error(`Invalid email: ${input.email}`);
  const now = Date.now();

  return tx(() => {
    let companyId: string | null = null;
    if (input.companyDomain) {
      companyId = upsertCompany(businessId, { domain: input.companyDomain }).company.id;
    }

    const existing = one<{ id: string; traits: string; company_id: string | null }>(
      "SELECT id, traits, company_id FROM people WHERE business_id = ? AND email = ?",
      businessId,
      email,
    );

    if (existing) {
      const merged = { ...json<Record<string, unknown>>(existing.traits, {}), ...(input.traits ?? {}) };
      run(
        `UPDATE people
         SET name = COALESCE(?, name),
             company_id = COALESCE(?, company_id),
             traits = ?, updated_at = ?
         WHERE id = ?`,
        input.name ?? null,
        companyId,
        JSON.stringify(merged),
        now,
        existing.id,
      );
      return { person: getPerson(businessId, existing.id)!, created: false };
    }

    const pid = id("person");
    run(
      `INSERT INTO people (id, business_id, email, name, company_id, traits, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      pid,
      businessId,
      email,
      input.name ?? null,
      companyId,
      JSON.stringify(input.traits ?? {}),
      now,
      now,
    );
    return { person: getPerson(businessId, pid)!, created: true };
  });
}

export function countPeople(businessId: string): number {
  return one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM people WHERE business_id = ?",
    businessId,
  )?.n ?? 0;
}

/* -------------------------------------------------------------- companies -- */

interface CompanyRow {
  id: string;
  domain: string;
  name: string | null;
  traits: string;
  people_count?: number;
  created_at: number;
  updated_at: number;
}

const toCompany = (r: CompanyRow): Company => ({
  id: r.id,
  domain: r.domain,
  name: r.name,
  traits: json<Record<string, unknown>>(r.traits, {}),
  peopleCount: r.people_count,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export function listCompanies(
  businessId: string,
  opts: { search?: string; page?: number; limit?: number } = {},
): Page<Company> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 25));
  const offset = (page - 1) * limit;

  const params: unknown[] = [businessId];
  let filter = "";
  if (opts.search?.trim()) {
    filter = "AND (c.domain LIKE ? OR c.name LIKE ?)";
    const q = `%${opts.search.trim()}%`;
    params.push(q, q);
  }

  const total =
    one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM companies c WHERE c.business_id = ? ${filter}`,
      ...params,
    )?.n ?? 0;

  const rows = all<CompanyRow>(
    `SELECT c.*, (SELECT COUNT(*) FROM people p WHERE p.company_id = c.id) AS people_count
     FROM companies c
     WHERE c.business_id = ? ${filter}
     ORDER BY people_count DESC, c.created_at DESC
     LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset,
  );

  return { data: rows.map(toCompany), page, limit, total, hasMore: offset + rows.length < total };
}

export function upsertCompany(
  businessId: string,
  input: { domain: string; name?: string | null; traits?: Record<string, unknown> },
): { company: Company; created: boolean } {
  const domain = input.domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const now = Date.now();

  const existing = one<CompanyRow>(
    "SELECT * FROM companies WHERE business_id = ? AND domain = ?",
    businessId,
    domain,
  );

  if (existing) {
    const merged = { ...json<Record<string, unknown>>(existing.traits, {}), ...(input.traits ?? {}) };
    run(
      "UPDATE companies SET name = COALESCE(?, name), traits = ?, updated_at = ? WHERE id = ?",
      input.name ?? null,
      JSON.stringify(merged),
      now,
      existing.id,
    );
    return {
      company: toCompany(
        one<CompanyRow>("SELECT * FROM companies WHERE id = ?", existing.id)!,
      ),
      created: false,
    };
  }

  const cid = id("company");
  run(
    `INSERT INTO companies (id, business_id, domain, name, traits, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    cid,
    businessId,
    domain,
    input.name ?? null,
    JSON.stringify(input.traits ?? {}),
    now,
    now,
  );
  return {
    company: toCompany(one<CompanyRow>("SELECT * FROM companies WHERE id = ?", cid)!),
    created: true,
  };
}

/* ------------------------------------------------------------------ lists -- */

interface ListRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  member_count: number;
  created_at: number;
}

const toList = (r: ListRow): AudienceList => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  description: r.description,
  memberCount: r.member_count,
  createdAt: r.created_at,
});

export function listLists(businessId: string): AudienceList[] {
  return all<ListRow>(
    `SELECT l.*, (SELECT COUNT(*) FROM list_members m WHERE m.list_id = l.id) AS member_count
     FROM lists l WHERE l.business_id = ?
     ORDER BY member_count DESC, l.created_at ASC`,
    businessId,
  ).map(toList);
}

export function getList(businessId: string, slug: string): AudienceList | null {
  const row = one<ListRow>(
    `SELECT l.*, (SELECT COUNT(*) FROM list_members m WHERE m.list_id = l.id) AS member_count
     FROM lists l WHERE l.business_id = ? AND l.slug = ?`,
    businessId,
    slug,
  );
  return row ? toList(row) : null;
}

export function upsertList(
  businessId: string,
  input: { name: string; slug?: string; description?: string | null },
): AudienceList {
  const slug = input.slug?.trim() || slugify(input.name);
  const existing = getList(businessId, slug);
  if (existing) {
    run(
      "UPDATE lists SET name = ?, description = COALESCE(?, description) WHERE id = ?",
      input.name,
      input.description ?? null,
      existing.id,
    );
    return getList(businessId, slug)!;
  }
  run(
    `INSERT INTO lists (id, business_id, slug, name, description, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id("list"),
    businessId,
    slug,
    input.name,
    input.description ?? null,
    Date.now(),
  );
  return getList(businessId, slug)!;
}

/**
 * Add people to a list by email or ID.
 *
 * Reports `added` and `alreadyMember` separately rather than a single count.
 * The agent surfaces this distinction to the user ("added 12, 7 were already
 * on it"), and a bare total would make a no-op indistinguishable from success.
 */
export function addToList(
  businessId: string,
  slug: string,
  refs: string[],
): { added: number; alreadyMember: number; notFound: string[] } {
  const list = getList(businessId, slug);
  if (!list) throw new Error(`No list with slug "${slug}"`);

  let added = 0;
  let alreadyMember = 0;
  const notFound: string[] = [];
  const now = Date.now();

  tx(() => {
    for (const ref of refs) {
      const person = getPerson(businessId, ref);
      if (!person) {
        notFound.push(ref);
        continue;
      }
      const exists = one<{ n: number }>(
        "SELECT COUNT(*) AS n FROM list_members WHERE list_id = ? AND person_id = ?",
        list.id,
        person.id,
      );
      if ((exists?.n ?? 0) > 0) {
        alreadyMember++;
        continue;
      }
      run(
        "INSERT INTO list_members (list_id, person_id, added_at) VALUES (?, ?, ?)",
        list.id,
        person.id,
        now,
      );
      added++;
    }
  });

  return { added, alreadyMember, notFound };
}

export function removeFromList(businessId: string, slug: string, refs: string[]): number {
  const list = getList(businessId, slug);
  if (!list) throw new Error(`No list with slug "${slug}"`);
  let removed = 0;
  tx(() => {
    for (const ref of refs) {
      const person = getPerson(businessId, ref);
      if (!person) continue;
      removed += run(
        "DELETE FROM list_members WHERE list_id = ? AND person_id = ?",
        list.id,
        person.id,
      ).changes;
    }
  });
  return removed;
}

/* ----------------------------------------------------------------- events -- */

interface EventRow {
  id: string;
  person_id: string | null;
  person_email: string | null;
  name: string;
  props: string;
  ts: number;
}

export function recordEvent(
  businessId: string,
  input: { name: string; personRef?: string | null; props?: Record<string, unknown> },
): TrackedEvent {
  const person = input.personRef ? getPerson(businessId, input.personRef) : null;
  const eid = id("event");
  const ts = Date.now();
  run(
    "INSERT INTO events (id, business_id, person_id, name, props, ts) VALUES (?, ?, ?, ?, ?, ?)",
    eid,
    businessId,
    person?.id ?? null,
    input.name,
    JSON.stringify(input.props ?? {}),
    ts,
  );
  return {
    id: eid,
    personId: person?.id ?? null,
    personEmail: person?.email ?? null,
    name: input.name,
    props: input.props ?? {},
    ts,
  };
}

export function queryEvents(
  businessId: string,
  opts: { name?: string; sinceDays?: number; limit?: number } = {},
): TrackedEvent[] {
  const params: unknown[] = [businessId];
  const where = ["e.business_id = ?"];

  if (opts.name) {
    where.push("e.name = ?");
    params.push(opts.name);
  }
  if (opts.sinceDays !== undefined) {
    where.push("e.ts >= ?");
    params.push(Date.now() - opts.sinceDays * 86_400_000);
  }

  return all<EventRow>(
    `SELECT e.id, e.person_id, e.name, e.props, e.ts, p.email AS person_email
     FROM events e LEFT JOIN people p ON p.id = e.person_id
     WHERE ${where.join(" AND ")}
     ORDER BY e.ts DESC LIMIT ?`,
    ...params,
    Math.min(1000, opts.limit ?? 100),
  ).map((r) => ({
    id: r.id,
    personId: r.person_id,
    personEmail: r.person_email,
    name: r.name,
    props: json<Record<string, unknown>>(r.props, {}),
    ts: r.ts,
  }));
}

/** Distinct people who fired an event in the window — the agent's targeting primitive. */
export function peopleWhoDid(
  businessId: string,
  eventName: string,
  sinceDays: number,
): Person[] {
  const rows = all<PersonRow>(
    `${PERSON_SELECT}
     WHERE p.business_id = ? AND p.id IN (
       SELECT DISTINCT e.person_id FROM events e
       WHERE e.business_id = ? AND e.name = ? AND e.ts >= ? AND e.person_id IS NOT NULL
     )
     ORDER BY p.created_at DESC`,
    businessId,
    businessId,
    eventName,
    Date.now() - sinceDays * 86_400_000,
  );
  return rows.map(toPerson);
}

/** Daily event counts for the activity chart. Zero-filled so the x-axis is continuous. */
export function eventsPerDay(
  businessId: string,
  days: number,
  now: number,
): Array<{ day: number; count: number }> {
  const start = now - days * 86_400_000;
  const rows = all<{ bucket: number; n: number }>(
    `SELECT (ts / 86400000) AS bucket, COUNT(*) AS n
     FROM events WHERE business_id = ? AND ts >= ?
     GROUP BY bucket ORDER BY bucket ASC`,
    businessId,
    start,
  );
  const byBucket = new Map(rows.map((r) => [r.bucket, r.n]));
  const out: Array<{ day: number; count: number }> = [];
  const firstBucket = Math.floor(start / 86_400_000);
  const lastBucket = Math.floor(now / 86_400_000);
  for (let b = firstBucket; b <= lastBucket; b++) {
    out.push({ day: b * 86_400_000, count: byBucket.get(b) ?? 0 });
  }
  return out;
}
