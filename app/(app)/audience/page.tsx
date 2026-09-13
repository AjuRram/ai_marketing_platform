import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { Users, Building2, ListFilter, Search } from "lucide-react";
import { Card, CardHeader, Th, Td, Badge, Avatar, Empty, Stat } from "@/components/ui/Primitives";
import { currentBusinessId } from "@/lib/session";
import { listPeople, listCompanies, listLists, countPeople } from "@/lib/resources/audience";
import { num, ago, initials, truncate } from "@/lib/format";
import { AddPersonModal } from "@/components/audience/AddPersonModal";

export const metadata: Metadata = { title: "Audience" };
export const dynamic = "force-dynamic";

type Tab = "people" | "companies" | "lists";

/**
 * Tabs and search are driven by SEARCH PARAMS, not client state.
 *
 * That makes every view linkable and shareable, keeps the whole page a server
 * component (no data fetching waterfall, no loading spinner), and means the
 * back button works the way a user expects. The cost is a round trip per tab
 * switch, which at this payload size is imperceptible.
 */
export default async function AudiencePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; list?: string }>;
}) {
  const params = await searchParams;
  const tab: Tab =
    params.tab === "companies" ? "companies" : params.tab === "lists" ? "lists" : "people";
  const query = params.q?.trim() ?? "";
  const listSlug = params.list?.trim() || undefined;

  const businessId = currentBusinessId();
  const now = Date.now();

  const total = countPeople(businessId);
  const lists = listLists(businessId);
  const companies = tab === "companies" ? listCompanies(businessId, { search: query, limit: 60 }) : null;
  const people =
    tab === "people" ? listPeople(businessId, { search: query, listSlug, limit: 50 }) : null;

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-ink">Audience</h1>
          <p className="mt-0.5 text-xs text-muted">
            People, companies and the segments built from them.
          </p>
        </div>
        <AddPersonModal lists={lists.map((l) => ({ slug: l.slug, name: l.name }))} />
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="People" value={num(total)} icon={<Users size={14} />} />
        <Stat label="Companies" value={num(listCompanies(businessId, { limit: 1 }).total)} icon={<Building2 size={14} />} />
        <Stat label="Lists" value={num(lists.length)} icon={<ListFilter size={14} />} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex gap-1 rounded-soft bg-raised p-0.5" role="tablist">
          {(["people", "companies", "lists"] as const).map((t) => (
            <Link
              key={t}
              href={`/audience?tab=${t}`}
              role="tab"
              aria-selected={tab === t}
              className={clsx(
                "rounded-[7px] px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                tab === t ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              {t}
            </Link>
          ))}
        </nav>

        {tab !== "lists" ? (
          <form action="/audience" className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-xs">
            <input type="hidden" name="tab" value={tab} />
            <div className="relative min-w-0 flex-1">
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
              />
              <input
                name="q"
                defaultValue={query}
                placeholder={tab === "people" ? "Search name or email" : "Search domain or name"}
                aria-label="Search"
                className="h-9 w-full rounded-soft border border-hairline bg-surface pl-7 pr-2.5 text-xs text-ink outline-none placeholder:text-faint focus:border-brand"
              />
            </div>
          </form>
        ) : null}
      </div>

      {listSlug ? (
        <p className="text-xs text-muted">
          Filtered to <span className="font-semibold text-ink">{listSlug}</span> ·{" "}
          <Link href="/audience?tab=people" className="text-brand hover:underline">
            clear
          </Link>
        </p>
      ) : null}

      {tab === "people" && people ? (
        <Card>
          <CardHeader title="People" subtitle={`${num(people.total)} matching`} />
          {people.data.length === 0 ? (
            <Empty icon={<Users size={20} />} title="Nobody here" hint="Try a different search." />
          ) : (
            // `scroll-x` on the wrapper + `min-w-0` from Card is the pair that
            // makes a wide table scroll INSIDE its container rather than
            // pushing the page sideways.
            <div className="scroll-x">
              <table className="w-full min-w-[620px]">
                <thead className="thead">
                  <tr className="border-b border-hairline">
                    <Th>Person</Th>
                    <Th>Company</Th>
                    <Th>Role</Th>
                    <Th>Lifecycle</Th>
                    <Th right>Added</Th>
                  </tr>
                </thead>
                <tbody>
                  {people.data.map((person) => (
                    <tr
                      key={person.id}
                      className="border-b border-hairline/50 last:border-0 hover:bg-raised/40"
                    >
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <Avatar label={initials(person.name ?? person.email)} />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink">
                              {person.name ?? "—"}
                            </p>
                            <p className="truncate text-2xs text-faint">{person.email}</p>
                          </div>
                        </div>
                      </Td>
                      <Td className="text-muted">{person.companyName ?? "—"}</Td>
                      <Td className="text-muted">
                        {truncate(String(person.traits.role ?? "—"), 26)}
                      </Td>
                      <Td>
                        <Badge tone={person.traits.lifecycle === "customer" ? "up" : "neutral"}>
                          {String(person.traits.lifecycle ?? "—")}
                        </Badge>
                      </Td>
                      <Td right className="tnum whitespace-nowrap text-faint">
                        {ago(person.createdAt, now)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {tab === "companies" && companies ? (
        <Card>
          <CardHeader title="Companies" subtitle={`${num(companies.total)} matching`} />
          <div className="scroll-x">
            <table className="w-full min-w-[560px]">
              <thead className="thead">
                <tr className="border-b border-hairline">
                  <Th>Company</Th>
                  <Th>Industry</Th>
                  <Th right>Headcount</Th>
                  <Th right>People</Th>
                </tr>
              </thead>
              <tbody>
                {companies.data.map((company) => (
                  <tr
                    key={company.id}
                    className="border-b border-hairline/50 last:border-0 hover:bg-raised/40"
                  >
                    <Td>
                      <p className="font-semibold text-ink">{company.name ?? company.domain}</p>
                      <p className="text-2xs text-faint">{company.domain}</p>
                    </Td>
                    <Td className="text-muted">{String(company.traits.industry ?? "—")}</Td>
                    <Td right className="tnum text-muted">
                      {company.traits.headcount ? num(Number(company.traits.headcount)) : "—"}
                    </Td>
                    <Td right className="tnum font-semibold text-ink">
                      {num(company.peopleCount ?? 0)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {tab === "lists" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {lists.map((list) => (
            <Card key={list.id} className="card-pad">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-ink">{list.name}</h2>
                  <p className="mono mt-0.5 text-2xs text-faint">{list.slug}</p>
                </div>
                <p className="tnum shrink-0 text-lg font-bold text-ink">{num(list.memberCount)}</p>
              </div>
              {list.description ? (
                <p className="mt-2 text-xs leading-relaxed text-muted">{list.description}</p>
              ) : null}
              <Link
                href={`/audience?tab=people&list=${encodeURIComponent(list.slug)}`}
                className="mt-3 inline-block text-2xs font-semibold text-brand hover:underline"
              >
                View members →
              </Link>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
