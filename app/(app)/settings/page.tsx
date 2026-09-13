import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { KeyRound, ShieldCheck, TriangleAlert, Cpu } from "lucide-react";
import { Card, CardHeader, Badge, Button, Meter, Th, Td, Stat } from "@/components/ui/Primitives";
import { currentBusiness, currentUser, PLAN_LIMITS } from "@/lib/session";
import { listKeys, createKey, revokeKey } from "@/lib/resources/keys";
import { agentStats } from "@/lib/resources/agent";
import { hasApiKey, agentMode } from "@/lib/agent/run";
import { num, usd, ago, pct } from "@/lib/format";
import { NewKeyForm } from "@/components/settings/NewKeyForm";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

/**
 * Key creation and revocation are SERVER ACTIONS rather than API routes.
 *
 * The plaintext key exists for exactly one render — it is returned from the
 * action, shown once, and never persisted. Routing it through a client fetch
 * would put it in the network tab and in any request log along the way.
 */
async function createKeyAction(formData: FormData): Promise<string> {
  "use server";
  const business = currentBusiness();
  const name = String(formData.get("name") ?? "").trim() || "Untitled key";
  const kind = formData.get("kind") === "pk" ? "pk" : "sk";
  const { plaintext } = createKey(business.id, { name, kind });
  revalidatePath("/settings");
  return plaintext;
}

async function revokeKeyAction(formData: FormData): Promise<void> {
  "use server";
  const business = currentBusiness();
  const keyId = String(formData.get("keyId") ?? "");
  if (keyId) revokeKey(business.id, keyId);
  revalidatePath("/settings");
}

export default function SettingsPage() {
  const business = currentBusiness();
  const user = currentUser();
  const keys = listKeys(business.id);
  const stats = agentStats(business.id);
  const now = Date.now();
  const plan = PLAN_LIMITS[business.plan];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-bold tracking-tight text-ink">Settings</h1>
        <p className="mt-0.5 text-xs text-muted">Plan, usage and API access.</p>
      </header>

      {/* ------------------------------------------------------- agent mode -- */}
      <Card>
        <CardHeader
          title="Agent runtime"
          subtitle="Which planner drives runs"
          action={
            <Badge tone={hasApiKey() ? "up" : "warn"}>
              {agentMode() === "live" ? "live" : "demo"}
            </Badge>
          }
        />
        <div className="card-pad">
          {hasApiKey() ? (
            <p className="flex items-start gap-2 text-xs text-muted">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-up" />
              <span>
                <span className="font-semibold text-ink">Live.</span> Runs are planned by Claude
                (<span className="mono">{process.env.PULSE_MODEL || "claude-opus-5"}</span>) with
                adaptive thinking at <span className="mono">{process.env.PULSE_EFFORT || "high"}</span>{" "}
                effort.
              </span>
            </p>
          ) : (
            <p className="flex items-start gap-2 text-xs text-muted">
              <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warn" />
              <span>
                <span className="font-semibold text-ink">Demo.</span> No{" "}
                <span className="mono">ANTHROPIC_API_KEY</span> is set, so a scripted planner
                chooses which tools to call. The tools, the database writes and the event stream are
                the real ones — only the decision-making is scripted. Set the key and restart to
                switch to Claude; nothing else changes.
              </span>
            </p>
          )}
        </div>
      </Card>

      {/* ------------------------------------------- external services & balances -- */}
      <Card>
        <CardHeader
          title="External Services & API Key Balances"
          subtitle="Live status, free quota balances, and payment requirement alerts"
        />
        <div className="card-pad space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Anthropic Claude */}
            <div className="p-3.5 rounded border border-hairline bg-raised/30 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-xs text-ink">🧠 Anthropic Claude API</span>
                </div>
                <Badge tone={process.env.ANTHROPIC_API_KEY ? "warn" : "neutral"}>
                  {process.env.ANTHROPIC_API_KEY ? "Key Set (Action Needed)" : "Key Missing"}
                </Badge>
              </div>
              <p className="text-2xs text-muted">
                Drives Opus 5 adaptive model planning & reasoning loop.
              </p>
              <div className="p-2 rounded bg-down/10 border border-down/20 text-2xs text-down space-y-1">
                <div className="font-semibold">⚠️ Payment Needed to Unlock Live Opus 5</div>
                <div>Account balance is low ($0.00). Top up $5 credits at <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noreferrer" className="underline font-bold">console.anthropic.com</a>.</div>
              </div>
            </div>

            {/* Resend Email */}
            <div className="p-3.5 rounded border border-hairline bg-raised/30 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-xs text-ink">📧 Resend Email ESP</span>
                </div>
                <Badge tone={process.env.RESEND_API_KEY ? "up" : "neutral"}>
                  {process.env.RESEND_API_KEY ? "Active & Working" : "Key Missing"}
                </Badge>
              </div>
              <p className="text-2xs text-muted">
                Linked Account: <span className="font-mono text-ink">arjun.ramachandran96@gmail.com</span>
              </p>
              <div className="p-2 rounded bg-up/10 border border-up/20 text-2xs text-up space-y-1">
                <div className="font-semibold">✓ Free Tier Active (3,000 emails / mo)</div>
                <div>Dispatched to <span className="font-mono">arjun.ramachandran96@gmail.com</span>. Verify custom domain at <a href="https://resend.com/domains" target="_blank" rel="noreferrer" className="underline font-bold">resend.com/domains</a> to send to any recipient.</div>
              </div>
            </div>

            {/* Tavily Web Search */}
            <div className="p-3.5 rounded border border-hairline bg-raised/30 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-xs text-ink">🔍 Tavily Live Web Search</span>
                </div>
                <Badge tone={process.env.TAVILY_API_KEY ? "up" : "neutral"}>
                  {process.env.TAVILY_API_KEY ? "Active & Working" : "Key Missing"}
                </Badge>
              </div>
              <p className="text-2xs text-muted">
                Powers live market research & competitor intelligence (`web_search`).
              </p>
              <div className="p-2 rounded bg-up/10 border border-up/20 text-2xs text-up">
                <div className="font-semibold">✓ Free Quota Active (1,000 searches / mo)</div>
              </div>
            </div>

            {/* X / Twitter Developer API */}
            <div className="p-3.5 rounded border border-hairline bg-raised/30 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-xs text-ink">🐦 X / Twitter Publishing</span>
                </div>
                <Badge tone={process.env.TWITTER_BEARER_TOKEN ? "up" : "neutral"}>
                  {process.env.TWITTER_BEARER_TOKEN ? "Token Configured" : "Token Missing"}
                </Badge>
              </div>
              <p className="text-2xs text-muted">
                Posts social media campaign tweets via Twitter v2 REST API.
              </p>
              <div className="p-2 rounded bg-info/10 border border-info/20 text-2xs text-info">
                <div className="font-semibold">✓ Free Basic Developer Tier Active</div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------------------ plan -- */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Plan and usage" subtitle={`${plan.label} · ${plan.model} models`} />
          <div className="card-pad space-y-4">
            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="eyebrow">AI credits this period</span>
                <span className="tnum text-2xs font-semibold text-ink">
                  {num(business.creditsUsed)} / {num(business.creditsLimit)}
                </span>
              </div>
              <Meter
                value={business.creditsUsed}
                max={business.creditsLimit}
                tone={
                  business.creditsUsed / business.creditsLimit > 0.85
                    ? "down"
                    : business.creditsUsed / business.creditsLimit > 0.6
                      ? "warn"
                      : "brand"
                }
              />
              <p className="mt-2 text-2xs leading-relaxed text-faint">
                A credit is <span className="mono">ceil((output + input/10) / 100)</span> tokens —
                weighted so the meter tracks what a run actually costs to serve rather than being an
                arbitrary unit.
              </p>
            </div>

            <div className="divider" />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Runs" value={num(stats.runs)} />
              <Stat label="Spend" value={usd(stats.totalCostUsd)} />
              <Stat
                label="Cache hit"
                value={stats.cacheHitRate === null ? "—" : pct(stats.cacheHitRate)}
                tone={stats.cacheHitRate && stats.cacheHitRate > 0.5 ? "up" : undefined}
              />
              <Stat label="Credits" value={num(stats.totalCredits)} />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Workspace" />
          <dl className="card-pad space-y-2.5 text-xs">
            <Field label="Business">{business.name}</Field>
            <Field label="Slug">
              <span className="mono">{business.slug}</span>
            </Field>
            <Field label="Owner">{user.name}</Field>
            <Field label="Email">
              <span className="truncate">{user.email}</span>
            </Field>
            <Field label="Model tier">
              <span className="flex items-center gap-1">
                <Cpu size={11} className="text-brand" />
                {plan.model}
              </span>
            </Field>
          </dl>
        </Card>
      </div>

      {/* ------------------------------------------------------------ keys -- */}
      <Card>
        <CardHeader
          title="API keys"
          subtitle="Publishable keys are safe in a browser; secret keys are not"
        />

        <div className="border-b border-hairline p-4">
          <NewKeyForm action={createKeyAction} />
        </div>

        <div className="scroll-x">
          <table className="w-full min-w-[620px]">
            <thead className="thead">
              <tr className="border-b border-hairline">
                <Th>Name</Th>
                <Th>Key</Th>
                <Th>Scopes</Th>
                <Th right>Last used</Th>
                <Th right>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr
                  key={key.id}
                  className="border-b border-hairline/50 last:border-0 hover:bg-raised/40"
                >
                  <Td>
                    <div className="flex items-center gap-2">
                      <KeyRound size={12} className="shrink-0 text-faint" />
                      <span className="font-semibold text-ink">{key.name}</span>
                      {key.revokedAt ? <Badge tone="down">revoked</Badge> : null}
                    </div>
                  </Td>
                  <Td>
                    <span className="mono text-2xs text-muted">{key.display}</span>
                    <Badge tone={key.kind === "pk" ? "info" : "warn"} className="ml-2">
                      {key.kind === "pk" ? "public" : "secret"}
                    </Badge>
                  </Td>
                  <Td className="mono text-2xs text-faint">{key.scopes.join(", ")}</Td>
                  <Td right className="tnum whitespace-nowrap text-faint">
                    {key.lastUsedAt ? ago(key.lastUsedAt, now) : "never"}
                  </Td>
                  <Td right>
                    {key.revokedAt ? null : (
                      <form action={revokeKeyAction}>
                        <input type="hidden" name="keyId" value={key.id} />
                        <Button size="sm" variant="ghost" type="submit">
                          Revoke
                        </Button>
                      </form>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 truncate font-semibold text-ink">{children}</dd>
    </div>
  );
}
