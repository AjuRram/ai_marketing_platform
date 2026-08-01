import { randomUUID, randomBytes, createHash } from "node:crypto";

/**
 * Prefixed opaque IDs, Stripe-style.
 *
 * The prefix is not decoration: it makes an ID self-describing in a log line
 * or an error message, and it makes it structurally impossible to pass a
 * `list_…` where a `per_…` was meant without it being obvious on sight.
 */
const PREFIXES = {
  business: "biz",
  user: "usr",
  key: "key",
  person: "per",
  company: "cmp",
  list: "lst",
  event: "evt",
  memory: "mem",
  content: "cnt",
  flow: "flw",
  flowRun: "frn",
  agentRun: "run",
  agentEvent: "aev",
  approval: "apr",
  job: "job",
} as const;

export type IdKind = keyof typeof PREFIXES;

export function id(kind: IdKind): string {
  return `${PREFIXES[kind]}_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

/* --------------------------------------------------------------- API keys --
 * Two key kinds, mirroring the Stripe / Segment / Quotient split:
 *
 *   pk_…  publishable. Ships in browser bundles. Write-only: it can record
 *         events and identify people, nothing else.
 *   sk_…  secret. Server only. Full scoped access.
 *
 * Only the SHA-256 of a key is ever stored. The plaintext is returned exactly
 * once, at creation, and is unrecoverable afterwards.
 * -------------------------------------------------------------------------- */

export type KeyKind = "pk" | "sk";

export function generateApiKey(kind: KeyKind): { plaintext: string; hash: string; display: string } {
  const secret = randomBytes(24).toString("base64url");
  const plaintext = `${kind}_${secret}`;
  return {
    plaintext,
    hash: hashApiKey(plaintext),
    // Enough of the key to recognise it in a list, never enough to use it.
    display: `${kind}_${secret.slice(0, 4)}…${secret.slice(-4)}`,
  };
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

// Combining diacritical marks (U+0300–U+036F), left behind by NFKD so that
// "café" normalises to "cafe" rather than "caf". Built via the RegExp
// constructor so the source file stays pure ASCII — pasting literal combining
// characters into a regex literal is a silent corruption risk in transit.
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

/** URL-safe slug. Falls back to a random suffix when the input has no word characters. */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return base || `item-${randomBytes(3).toString("hex")}`;
}
