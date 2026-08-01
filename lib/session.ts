import "server-only";
import { one, json } from "./db/client";
import { ensureSeeded } from "./db/seed";
import type { Business, Plan } from "./types";

/**
 * Tenant resolution.
 *
 * Auth here is simulated — there is one demo business and the login screen is a
 * UI exercise, not an identity provider. What matters architecturally is that
 * EVERY read and write goes through a resolved `businessId`, so wiring in real
 * auth later is a change to this file alone. No resource function reaches for
 * "the current tenant" on its own.
 *
 * This is also the single bootstrap chokepoint: the first call to
 * `currentBusiness()` in a fresh process seeds an empty database, which is why
 * there is no separate seed command to forget.
 */

let booted = false;

function bootstrap(): void {
  if (booted) return;
  ensureSeeded();
  booted = true;
}

interface BusinessRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  credits_used: number;
  credits_limit: number;
  created_at: number;
}

export function currentBusiness(): Business {
  bootstrap();
  const row = one<BusinessRow>(
    "SELECT * FROM businesses ORDER BY created_at ASC LIMIT 1",
  );
  if (!row) {
    // Only reachable if seeding failed — surfacing it loudly beats every page
    // rendering an empty state and hiding the real cause.
    throw new Error("No business found. The database failed to seed.");
  }
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan as Plan,
    creditsUsed: row.credits_used,
    creditsLimit: row.credits_limit,
    createdAt: row.created_at,
  };
}

export function currentBusinessId(): string {
  return currentBusiness().id;
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function currentUser(): CurrentUser {
  const bizId = currentBusinessId();
  const row = one<{ id: string; name: string; email: string; role: string }>(
    "SELECT id, name, email, role FROM users WHERE business_id = ? ORDER BY created_at ASC LIMIT 1",
    bizId,
  );
  return row ?? { id: "usr_unknown", name: "Unknown", email: "unknown@example.com", role: "member" };
}

/** Plan limits, mirrored in the pricing UI. */
export const PLAN_LIMITS: Record<Plan, { credits: number; label: string; model: string }> = {
  free: { credits: 500, label: "Free", model: "Haiku" },
  starter: { credits: 2_000, label: "Starter", model: "Sonnet" },
  team: { credits: 5_000, label: "Team", model: "Opus" },
  pro: { credits: 10_000, label: "Pro", model: "Opus" },
  scale: { credits: 30_000, label: "Scale", model: "Opus" },
};

export { json };
