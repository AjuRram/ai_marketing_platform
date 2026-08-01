import { all, one, run, json } from "../db/client";
import { id, generateApiKey, hashApiKey, type KeyKind } from "../ids";
import type { ApiKeyRecord } from "../types";

/**
 * API keys.
 *
 * Two kinds, mirroring the Stripe / Segment split that Quotient also uses:
 *
 *   pk_…  publishable. Ships inside browser bundles, so it is assumed public.
 *         Write-only and narrowly scoped — it can record events and identify
 *         people and nothing else. Leaking one is not a breach.
 *   sk_…  secret. Server-side only, full scoped access. Leaking one is.
 *
 * Only a SHA-256 hash is stored. The plaintext is returned exactly once, at
 * creation, and is unrecoverable afterwards — which is why the UI has to warn
 * the user to copy it there and then.
 */

interface KeyRow {
  id: string;
  name: string;
  kind: string;
  display: string;
  scopes: string;
  last_used_at: number | null;
  revoked_at: number | null;
  created_at: number;
}

const toKey = (r: KeyRow): ApiKeyRecord => ({
  id: r.id,
  name: r.name,
  kind: r.kind === "pk" ? "pk" : "sk",
  display: r.display,
  scopes: json<string[]>(r.scopes, []),
  lastUsedAt: r.last_used_at,
  revokedAt: r.revoked_at,
  createdAt: r.created_at,
});

export function listKeys(businessId: string): ApiKeyRecord[] {
  return all<KeyRow>(
    "SELECT * FROM api_keys WHERE business_id = ? ORDER BY created_at DESC",
    businessId,
  ).map(toKey);
}

export function createKey(
  businessId: string,
  input: { name: string; kind: KeyKind; scopes?: string[] },
): { record: ApiKeyRecord; plaintext: string } {
  const key = generateApiKey(input.kind);
  const scopes =
    input.scopes ?? (input.kind === "pk" ? ["events:write", "people:identify"] : ["*"]);
  const kid = id("key");

  run(
    `INSERT INTO api_keys (id, business_id, name, kind, display, hash, scopes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    kid,
    businessId,
    input.name,
    input.kind,
    key.display,
    key.hash,
    JSON.stringify(scopes),
    Date.now(),
  );

  const record = one<KeyRow>("SELECT * FROM api_keys WHERE id = ?", kid)!;
  return { record: toKey(record), plaintext: key.plaintext };
}

export function revokeKey(businessId: string, keyId: string): boolean {
  return (
    run(
      "UPDATE api_keys SET revoked_at = ? WHERE business_id = ? AND id = ? AND revoked_at IS NULL",
      Date.now(),
      businessId,
      keyId,
    ).changes > 0
  );
}

export interface AuthenticatedKey {
  businessId: string;
  keyId: string;
  kind: "pk" | "sk";
  scopes: string[];
}

/**
 * Resolve a bearer token to a tenant.
 *
 * The lookup is BY HASH, so a timing difference cannot leak key material and
 * the plaintext never has to exist in the database. A revoked key resolves to
 * null rather than throwing, so the caller decides the status code.
 */
export function authenticate(plaintext: string | null | undefined): AuthenticatedKey | null {
  if (!plaintext) return null;
  const token = plaintext.trim();
  if (!token.startsWith("pk_") && !token.startsWith("sk_")) return null;

  const row = one<KeyRow & { business_id: string }>(
    "SELECT * FROM api_keys WHERE hash = ? AND revoked_at IS NULL",
    hashApiKey(token),
  );
  if (!row) return null;

  // Best-effort usage stamp; never block the request on it.
  run("UPDATE api_keys SET last_used_at = ? WHERE id = ?", Date.now(), row.id);

  return {
    businessId: row.business_id,
    keyId: row.id,
    kind: row.kind === "pk" ? "pk" : "sk",
    scopes: json<string[]>(row.scopes, []),
  };
}

export function hasScope(key: AuthenticatedKey, scope: string): boolean {
  return key.scopes.includes("*") || key.scopes.includes(scope);
}

/** Reads the token from `Authorization: Bearer …`, falling back to `?key=` for the browser SDK. */
export function tokenFromRequest(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return new URL(request.url).searchParams.get("key");
}
