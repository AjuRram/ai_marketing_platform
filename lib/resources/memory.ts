import { all, one, run, tx, json, bool } from "../db/client";
import { id } from "../ids";
import type { Memory } from "../types";

/**
 * Agent long-term memory, addressed by PATH like a filesystem.
 *
 * This is deliberately not a vector store. The reasoning:
 *
 *   - Paths are human-auditable and directly editable. A marketer can open
 *     /brand/voice.md and fix a line. Nobody can meaningfully edit an embedding.
 *   - The model already understands directory semantics, so `memory_list` and
 *     `memory_read` need no explanation in their tool descriptions.
 *   - There is no embedding model to version, no re-index job when it changes,
 *     and no silent recall degradation when it drifts.
 *   - Retrieval at this scale is a keyword problem, and SQLite's FTS5 solves it
 *     exactly, with tags as a second axis.
 *
 * The cost is real and worth naming: purely semantic queries ("what tone do we
 * use?" when the file says "voice") rely on the porter stemmer and tag overlap
 * rather than true synonym matching. At tens of documents that trade is clearly
 * correct; at tens of thousands it would not be.
 */

interface MemoryRow {
  id: string;
  path: string;
  title: string;
  content: string;
  tags: string;
  pinned: number;
  is_dir: number;
  created_at: number;
  updated_at: number;
  snippet?: string;
}

const toMemory = (r: MemoryRow): Memory => ({
  id: r.id,
  path: r.path,
  title: r.title,
  content: r.content,
  tags: json<string[]>(r.tags, []),
  pinned: bool(r.pinned),
  isDir: bool(r.is_dir),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  ...(r.snippet !== undefined ? { snippet: r.snippet } : {}),
});

/** Normalise to a leading slash, no trailing slash, no duplicate separators. */
export function normalizePath(input: string): string {
  const cleaned = `/${input.trim()}`.replace(/\/+/g, "/").replace(/\/$/, "");
  if (cleaned.includes("..")) throw new Error("Memory paths may not contain '..'");
  return cleaned || "/";
}

export function listMemories(
  businessId: string,
  opts: { prefix?: string; deep?: boolean; tag?: string } = {},
): Memory[] {
  const prefix = opts.prefix ? normalizePath(opts.prefix) : "/";
  const params: unknown[] = [businessId];
  const where = ["business_id = ?"];

  if (prefix !== "/") {
    where.push("(path = ? OR path LIKE ?)");
    params.push(prefix, `${prefix}/%`);
  }

  if (!opts.deep && prefix !== "/") {
    // Direct children only: everything under the prefix that has no further
    // separator after it.
    where.push("instr(substr(path, ?), '/') = 0");
    params.push(prefix.length + 2);
  }

  let rows = all<MemoryRow>(
    `SELECT * FROM memories WHERE ${where.join(" AND ")}
     ORDER BY is_dir DESC, pinned DESC, path ASC`,
    ...params,
  );

  if (opts.tag) {
    const needle = opts.tag.toLowerCase();
    rows = rows.filter((r) => json<string[]>(r.tags, []).some((t) => t.toLowerCase() === needle));
  }

  return rows.map(toMemory);
}

export function readMemory(businessId: string, path: string): Memory | null {
  const row = one<MemoryRow>(
    "SELECT * FROM memories WHERE business_id = ? AND path = ?",
    businessId,
    normalizePath(path),
  );
  return row ? toMemory(row) : null;
}

export interface WriteMemoryInput {
  path: string;
  content: string;
  title?: string;
  tags?: string[];
  pinned?: boolean;
}

/**
 * Create or overwrite a memory, creating any missing parent directories.
 *
 * Auto-creating parents matters because the agent writes paths it invents
 * ("/competitors/newco.md"). Requiring an explicit mkdir first would mean every
 * write is two tool calls, and a forgotten one is a confusing failure rather
 * than the obvious intent.
 */
export function writeMemory(businessId: string, input: WriteMemoryInput): Memory {
  const path = normalizePath(input.path);
  if (path === "/") throw new Error("Cannot write to the memory root");
  const now = Date.now();

  return tx(() => {
    ensureParents(businessId, path, now);

    const existing = one<MemoryRow>(
      "SELECT * FROM memories WHERE business_id = ? AND path = ?",
      businessId,
      path,
    );

    const title = input.title ?? existing?.title ?? path.slice(path.lastIndexOf("/") + 1);

    if (existing) {
      run(
        `UPDATE memories SET title = ?, content = ?, tags = ?, pinned = ?, updated_at = ?
         WHERE id = ?`,
        title,
        input.content,
        JSON.stringify(input.tags ?? json<string[]>(existing.tags, [])),
        input.pinned ?? existing.pinned,
        now,
        existing.id,
      );
    } else {
      run(
        `INSERT INTO memories (id, business_id, path, title, content, tags, pinned, is_dir, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        id("memory"),
        businessId,
        path,
        title,
        input.content,
        JSON.stringify(input.tags ?? []),
        input.pinned ? 1 : 0,
        now,
        now,
      );
    }

    return readMemory(businessId, path)!;
  });
}

function ensureParents(businessId: string, path: string, now: number): void {
  const segments = path.split("/").filter(Boolean);
  segments.pop(); // the leaf itself is not a directory
  let acc = "";
  for (const segment of segments) {
    acc += `/${segment}`;
    run(
      `INSERT OR IGNORE INTO memories
         (id, business_id, path, title, content, tags, pinned, is_dir, created_at, updated_at)
       VALUES (?, ?, ?, ?, '', '[]', 0, 1, ?, ?)`,
      id("memory"),
      businessId,
      acc,
      segment,
      now,
      now,
    );
  }
}

export function makeDir(businessId: string, path: string): Memory {
  const normalized = normalizePath(path);
  const now = Date.now();
  run(
    `INSERT OR IGNORE INTO memories
       (id, business_id, path, title, content, tags, pinned, is_dir, created_at, updated_at)
     VALUES (?, ?, ?, ?, '', '[]', 0, 1, ?, ?)`,
    id("memory"),
    businessId,
    normalized,
    normalized.slice(normalized.lastIndexOf("/") + 1),
    now,
    now,
  );
  return readMemory(businessId, normalized)!;
}

/** Delete a path. Directories delete recursively. */
export function deleteMemory(businessId: string, path: string): number {
  const normalized = normalizePath(path);
  if (normalized === "/") throw new Error("Cannot delete the memory root");
  return run(
    "DELETE FROM memories WHERE business_id = ? AND (path = ? OR path LIKE ?)",
    businessId,
    normalized,
    `${normalized}/%`,
  ).changes;
}

/**
 * Full-text search over titles and bodies.
 *
 * The user's query is passed to FTS5 as a quoted phrase per term rather than
 * raw. Raw input would let a stray `"` or a bare `*` throw a parse error out of
 * SQLite and surface to the agent as a tool failure — searching for `voice"`
 * should return nothing, not crash the run.
 */
export function searchMemories(
  businessId: string,
  query: string,
  opts: { tag?: string; limit?: number } = {},
): Memory[] {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, "")}"`);

  if (terms.length === 0) return [];
  const matchExpr = terms.join(" OR ");

  let rows: MemoryRow[];
  try {
    rows = all<MemoryRow>(
      `SELECT m.*, snippet(memories_fts, 3, '', '', '…', 12) AS snippet
       FROM memories_fts f
       JOIN memories m ON m.id = f.mem_id
       WHERE memories_fts MATCH ? AND f.business_id = ? AND m.is_dir = 0
       ORDER BY rank
       LIMIT ?`,
      matchExpr,
      businessId,
      Math.min(50, opts.limit ?? 10),
    );
  } catch {
    // A malformed MATCH expression is a bad query, not an outage.
    return [];
  }

  let results = rows.map(toMemory);
  if (opts.tag) {
    const needle = opts.tag.toLowerCase();
    results = results.filter((m) => m.tags.some((t) => t.toLowerCase() === needle));
  }
  return results;
}

export function countMemories(businessId: string): number {
  return (
    one<{ n: number }>(
      "SELECT COUNT(*) AS n FROM memories WHERE business_id = ? AND is_dir = 0",
      businessId,
    )?.n ?? 0
  );
}

/**
 * Memories the agent should always see, rendered into the system prompt.
 *
 * Kept small and capped: this text sits in the CACHED PREFIX of every request,
 * so it must be stable between runs. An unbounded "all pinned memories" would
 * silently invalidate the prompt cache the moment anyone pins one more file.
 */
export function pinnedContext(businessId: string, maxChars = 4_000): string {
  const pinned = all<MemoryRow>(
    `SELECT * FROM memories
     WHERE business_id = ? AND pinned = 1 AND is_dir = 0
     ORDER BY path ASC`,
    businessId,
  );

  const parts: string[] = [];
  let used = 0;
  for (const row of pinned) {
    const block = `## ${row.path}\n${row.content}`;
    if (used + block.length > maxChars) break;
    parts.push(block);
    used += block.length;
  }
  return parts.join("\n\n");
}
