import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { Folder, FileText, Pin, Search, Brain } from "lucide-react";
import { Card, CardHeader, Badge, Empty, Stat } from "@/components/ui/Primitives";
import { currentBusinessId } from "@/lib/session";
import { listMemories, readMemory, searchMemories, countMemories } from "@/lib/resources/memory";
import { ago, num } from "@/lib/format";

export const metadata: Metadata = { title: "Memory" };
export const dynamic = "force-dynamic";

/**
 * Memory browser.
 *
 * Presented as a file tree because that is genuinely what it is — the agent
 * addresses these documents by path. Showing them as a searchable list of
 * "embeddings" would hide the fact that a human can open /brand/voice.md and
 * edit the rules the agent will follow on the next run.
 */
export default async function MemoryPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string; q?: string }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const businessId = currentBusinessId();
  const now = Date.now();

  const all = listMemories(businessId, { prefix: "/", deep: true });
  const files = all.filter((m) => !m.isDir);
  const results = query ? searchMemories(businessId, query, { limit: 20 }) : null;

  const selectedPath = params.path ?? files.find((f) => f.pinned)?.path ?? files[0]?.path;
  const selected = selectedPath ? readMemory(businessId, selectedPath) : null;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight text-ink">
          <Brain size={17} className="text-brand" />
          Memory
        </h1>
        <p className="mt-0.5 text-xs text-muted">
          What the agent knows about this company. Plain Markdown, addressed by path.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Documents" value={num(countMemories(businessId))} />
        <Stat label="Pinned" value={num(files.filter((f) => f.pinned).length)} sub="in every run" />
        <Stat label="Folders" value={num(all.filter((m) => m.isDir).length)} />
        <Stat
          label="Words"
          value={num(files.reduce((acc, f) => acc + f.content.split(/\s+/).length, 0))}
        />
      </div>

      <form action="/memory" className="max-w-md">
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            name="q"
            defaultValue={query}
            placeholder="Full-text search across memory"
            aria-label="Search memory"
            className="h-9 w-full rounded-soft border border-hairline bg-surface pl-7 pr-2.5 text-xs text-ink outline-none placeholder:text-faint focus:border-brand"
          />
        </div>
      </form>

      {results ? (
        <Card>
          <CardHeader title="Search results" subtitle={`${results.length} for "${query}"`} />
          {results.length === 0 ? (
            <Empty title="No matches" hint="FTS5 matches whole words with stemming." />
          ) : (
            <ul className="divide-y divide-hairline/50">
              {results.map((hit) => (
                <li key={hit.id}>
                  <Link
                    href={`/memory?path=${encodeURIComponent(hit.path)}`}
                    className="block px-4 py-2.5 hover:bg-raised/40"
                  >
                    <p className="mono text-2xs text-brand">{hit.path}</p>
                    <p className="mt-0.5 text-xs text-ink">{hit.title}</p>
                    {hit.snippet ? (
                      <p className="mt-0.5 text-2xs text-muted">{hit.snippet}</p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* -------------------------------------------------------- tree -- */}
        <Card className="lg:sticky lg:top-20 lg:self-start">
          <CardHeader title="Files" subtitle={`${files.length} documents`} />
          <ul className="max-h-[70vh] overflow-y-auto p-1.5">
            {all.map((node) => {
              const depth = node.path.split("/").length - 2;
              const name = node.path.slice(node.path.lastIndexOf("/") + 1);
              const active = node.path === selectedPath;

              if (node.isDir) {
                return (
                  <li
                    key={node.id}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-2xs font-semibold uppercase tracking-wider text-faint"
                    style={{ paddingLeft: `${8 + depth * 12}px` }}
                  >
                    <Folder size={11} />
                    {name}
                  </li>
                );
              }

              return (
                <li key={node.id}>
                  <Link
                    href={`/memory?path=${encodeURIComponent(node.path)}`}
                    style={{ paddingLeft: `${8 + depth * 12}px` }}
                    className={clsx(
                      "flex items-center gap-1.5 rounded-soft py-1.5 pr-2 text-xs transition-colors",
                      active
                        ? "bg-brand/12 font-semibold text-brand"
                        : "text-muted hover:bg-raised hover:text-ink",
                    )}
                  >
                    <FileText size={11} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    {node.pinned ? <Pin size={10} className="shrink-0 text-warn" /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* ------------------------------------------------------ viewer -- */}
        <Card className="min-w-0">
          {selected ? (
            <>
              <CardHeader
                title={selected.title}
                subtitle={selected.path}
                action={
                  <div className="flex items-center gap-1.5">
                    {selected.pinned ? (
                      <Badge tone="warn">
                        <Pin size={9} /> pinned
                      </Badge>
                    ) : null}
                    {selected.tags.map((tag) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                  </div>
                }
              />
              <div className="card-pad">
                <p className="mb-3 text-2xs text-faint">
                  Updated {ago(selected.updatedAt, now)}
                </p>
                {/* Rendered as preformatted text rather than parsed Markdown:
                    this is the exact byte sequence handed to the model, and
                    prettifying it would hide what the agent actually reads. */}
                <pre className="scroll-x whitespace-pre-wrap break-words font-[family-name:var(--font-mono)] text-xs leading-relaxed text-ink">
                  {selected.content}
                </pre>
              </div>
            </>
          ) : (
            <Empty
              icon={<Brain size={20} />}
              title="No memory yet"
              hint="Ask the agent to research something — it writes findings back here."
            />
          )}
        </Card>
      </div>
    </div>
  );
}
