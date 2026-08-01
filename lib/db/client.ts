import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_SQL } from "./schema";

/**
 * SQLite connection, held open for the life of the process.
 *
 * The handle is stashed on `globalThis` because Next's dev server re-evaluates
 * modules on every hot reload. Without this, each edit would open a new
 * connection and leak the previous one until the WAL lock started failing —
 * the same class of bug as running two dev servers against one `.next`.
 */

const g = globalThis as typeof globalThis & { __pulseDb?: DatabaseSync };

function dbPath(): string {
  const configured = process.env.PULSE_DB?.trim();
  if (configured) return configured;
  return path.join(process.cwd(), "data", "pulse.db");
}

function open(): DatabaseSync {
  const file = dbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const conn = new DatabaseSync(file);
  // Applied on every open: each statement is idempotent, so this doubles as
  // the migration step and there is no separate "did you run migrations?" mode.
  conn.exec(SCHEMA_SQL);
  return conn;
}

export function db(): DatabaseSync {
  if (!g.__pulseDb) g.__pulseDb = open();
  return g.__pulseDb;
}

/* ------------------------------------------------------------------ query --
 * node:sqlite returns plain objects with SQLite's own type mapping (INTEGER →
 * number, TEXT → string, NULL → null). These wrappers add the generic so call
 * sites are typed, and normalise the `undefined`-vs-`null` mismatch: JS
 * `undefined` is not a valid bind value, but `null` is.
 * -------------------------------------------------------------------------- */

type Param = string | number | bigint | null | Uint8Array;

function bind(params: unknown[]): Param[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === "boolean") return p ? 1 : 0;
    if (p instanceof Date) return p.getTime();
    if (typeof p === "object" && !(p instanceof Uint8Array)) return JSON.stringify(p);
    return p as Param;
  });
}

export function all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
  return db().prepare(sql).all(...bind(params)) as T[];
}

export function one<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): T | undefined {
  return db().prepare(sql).get(...bind(params)) as T | undefined;
}

export function run(sql: string, ...params: unknown[]): { changes: number } {
  const r = db().prepare(sql).run(...bind(params));
  return { changes: Number(r.changes) };
}

/**
 * Wrap a unit of work in a transaction. Nested calls reuse the outer
 * transaction rather than failing on SQLite's lack of nested BEGIN.
 */
let depth = 0;
export function tx<T>(fn: () => T): T {
  if (depth > 0) return fn();
  const conn = db();
  conn.exec("BEGIN");
  depth++;
  try {
    const out = fn();
    conn.exec("COMMIT");
    return out;
  } catch (err) {
    conn.exec("ROLLBACK");
    throw err;
  } finally {
    depth--;
  }
}

/* ------------------------------------------------------------- conversion --
 * SQLite has no boolean, array or object types. These keep the coercions in
 * one place so a resource module never hand-rolls `Boolean(row.pinned)` and
 * never forgets a JSON.parse.
 * -------------------------------------------------------------------------- */

export const bool = (v: unknown): boolean => v === 1 || v === true;

export function json<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function resetDatabase(): void {
  const file = dbPath();
  if (g.__pulseDb) {
    g.__pulseDb.close();
    g.__pulseDb = undefined;
  }
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    fs.rmSync(file + suffix, { force: true });
  }
}
