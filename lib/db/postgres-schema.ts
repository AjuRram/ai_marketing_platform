/**
 * PostgreSQL Schema Definition & Drizzle ORM Migration Target.
 *
 * Provides PostgreSQL table definitions matching the SQLite schema in schema.ts
 * for managed cloud deployments on Supabase, Neon, or AWS Aurora PostgreSQL.
 */

export interface PostgresTableConfig {
  tableName: string;
  columns: Record<string, { type: string; primaryKey?: boolean; nullable?: boolean }>;
}

export const POSTGRES_TABLES: Record<string, PostgresTableConfig> = {
  businesses: {
    tableName: "businesses",
    columns: {
      id: { type: "text", primaryKey: true },
      name: { type: "text", nullable: false },
      slug: { type: "text", nullable: false },
      plan: { type: "text", nullable: false },
      credits_used: { type: "integer", nullable: false },
      credits_limit: { type: "integer", nullable: false },
      created_at: { type: "bigint", nullable: false },
    },
  },
  people: {
    tableName: "people",
    columns: {
      id: { type: "text", primaryKey: true },
      business_id: { type: "text", nullable: false },
      email: { type: "text", nullable: false },
      name: { type: "text", nullable: true },
      company_id: { type: "text", nullable: true },
      traits: { type: "jsonb", nullable: false },
      created_at: { type: "bigint", nullable: false },
      updated_at: { type: "bigint", nullable: false },
    },
  },
  memories: {
    tableName: "memories",
    columns: {
      id: { type: "text", primaryKey: true },
      business_id: { type: "text", nullable: false },
      path: { type: "text", nullable: false },
      title: { type: "text", nullable: false },
      content: { type: "text", nullable: false },
      tags: { type: "jsonb", nullable: false },
      pinned: { type: "boolean", nullable: false },
      is_dir: { type: "boolean", nullable: false },
      created_at: { type: "bigint", nullable: false },
      updated_at: { type: "bigint", nullable: false },
    },
  },
  content: {
    tableName: "content",
    columns: {
      id: { type: "text", primaryKey: true },
      business_id: { type: "text", nullable: false },
      kind: { type: "text", nullable: false },
      status: { type: "text", nullable: false },
      title: { type: "text", nullable: false },
      slug: { type: "text", nullable: true },
      body: { type: "text", nullable: false },
      channel_meta: { type: "jsonb", nullable: false },
      list_id: { type: "text", nullable: true },
      created_by: { type: "text", nullable: false },
      agent_run_id: { type: "text", nullable: true },
      scheduled_at: { type: "bigint", nullable: true },
      published_at: { type: "bigint", nullable: true },
      created_at: { type: "bigint", nullable: false },
      updated_at: { type: "bigint", nullable: false },
    },
  },
  agent_runs: {
    tableName: "agent_runs",
    columns: {
      id: { type: "text", primaryKey: true },
      business_id: { type: "text", nullable: false },
      goal: { type: "text", nullable: false },
      status: { type: "text", nullable: false },
      mode: { type: "text", nullable: false },
      model: { type: "text", nullable: false },
      cost_usd: { type: "double precision", nullable: false },
      credits: { type: "integer", nullable: false },
      created_at: { type: "bigint", nullable: false },
      finished_at: { type: "bigint", nullable: true },
    },
  },
};

/** Utility to generate DDL string for PostgreSQL migrations. */
export function generatePostgresDDL(): string {
  const statements: string[] = [];
  statements.push(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
  statements.push(`CREATE EXTENSION IF NOT EXISTS "pg_trgm";`);

  for (const [name, config] of Object.entries(POSTGRES_TABLES)) {
    const cols = Object.entries(config.columns)
      .map(([colName, col]) => `${colName} ${col.type}${col.primaryKey ? " PRIMARY KEY" : ""}${!col.nullable && !col.primaryKey ? " NOT NULL" : ""}`)
      .join(",\n  ");
    statements.push(`CREATE TABLE IF NOT EXISTS ${name} (\n  ${cols}\n);`);
  }

  return statements.join("\n\n");
}
