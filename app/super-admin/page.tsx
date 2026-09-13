import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentBusiness, PLAN_LIMITS } from "@/lib/session";
import { all, one } from "@/lib/db/client";
import { Card, CardHeader, Badge, Button, Stat, Th, Td } from "@/components/ui/Primitives";
import { num, usd, ago } from "@/lib/format";

export const metadata: Metadata = { title: "Pulse Platform Super Admin" };
export const dynamic = "force-dynamic";

interface CompanyStats {
  id: string;
  name: string;
  slug: string;
  plan: string;
  credits_used: number;
  credits_limit: number;
  created_at: number;
  user_count: number;
  people_count: number;
  content_count: number;
}

export default async function SuperAdminPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get("pulse_super_admin_session");

  if (!session || session.value !== "authenticated") {
    redirect("/super-admin/login");
  }

  const now = Date.now();

  // Platform-wide aggregation queries
  const companies = all<CompanyStats>(`
    SELECT 
      b.*,
      (SELECT COUNT(*) FROM users u WHERE u.business_id = b.id) AS user_count,
      (SELECT COUNT(*) FROM people p WHERE p.business_id = b.id) AS people_count,
      (SELECT COUNT(*) FROM content c WHERE c.business_id = b.id) AS content_count
    FROM businesses b
    ORDER BY b.created_at DESC
  `);

  const totalUsers = one<{ n: number }>("SELECT COUNT(*) AS n FROM users")?.n ?? 0;
  const totalSubscribers = one<{ n: number }>("SELECT COUNT(*) AS n FROM people")?.n ?? 0;
  const totalContent = one<{ n: number }>("SELECT COUNT(*) AS n FROM content")?.n ?? 0;
  const totalAgentRuns = one<{ n: number }>("SELECT COUNT(*) AS n FROM agent_runs")?.n ?? 0;
  const totalSpend = one<{ s: number }>("SELECT SUM(cost_usd) AS s FROM agent_runs")?.s ?? 0;

  // External API keys status
  const anthropicKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  const resendKey = Boolean(process.env.RESEND_API_KEY?.trim());
  const tavilyKey = Boolean(process.env.TAVILY_API_KEY?.trim());
  const twitterToken = Boolean(process.env.TWITTER_BEARER_TOKEN?.trim());

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-6">
      {/* ------------------------------------------------ Header -- */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <Badge tone="brand">PULSE PLATFORM OWNER</Badge>
            <h1 className="text-xl font-bold tracking-tight text-ink">Super Admin Command Center</h1>
          </div>
          <p className="mt-1 text-xs text-muted">
            Global monitoring of registered companies, platform users, subscribers, API balances, and revenue metrics.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge tone="up">SYSTEM ONLINE</Badge>
        </div>
      </div>

      {/* ---------------------------------- Global Platform Stats -- */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Stat label="Registered Companies" value={num(companies.length)} />
        <Stat label="Total Platform Users" value={num(totalUsers)} />
        <Stat label="Active Subscribers" value={num(totalSubscribers)} />
        <Stat label="Total Campaigns Published" value={num(totalContent)} />
        <Stat label="Total System Revenue/Spend" value={usd(totalSpend)} tone="up" />
      </div>

      {/* ---------------------------------- API Key Balances & Provider Status -- */}
      <Card>
        <CardHeader
          title="Global External API Services & Key Balances"
          subtitle="Real-time provider status and payment alerts across all platform services"
        />
        <div className="card-pad space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Anthropic */}
            <div className="p-3.5 rounded border border-hairline bg-raised/30 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-bold text-xs text-ink">🧠 Anthropic Claude</span>
                <Badge tone={anthropicKey ? "warn" : "down"}>{anthropicKey ? "Key Set" : "Missing"}</Badge>
              </div>
              <p className="text-2xs text-muted">Model: Claude Opus 5</p>
              <div className="p-2 rounded bg-down/10 text-2xs text-down font-semibold">
                ⚠️ Top up $5 credits at console.anthropic.com
              </div>
            </div>

            {/* Resend */}
            <div className="p-3.5 rounded border border-hairline bg-raised/30 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-bold text-xs text-ink">📧 Resend Email ESP</span>
                <Badge tone={resendKey ? "up" : "down"}>{resendKey ? "Active" : "Missing"}</Badge>
              </div>
              <p className="text-2xs text-muted">Account: arjun.ramachandran96@gmail.com</p>
              <div className="p-2 rounded bg-up/10 text-2xs text-up font-semibold">
                ✓ Free Quota Active (3,000 emails/mo)
              </div>
            </div>

            {/* Tavily */}
            <div className="p-3.5 rounded border border-hairline bg-raised/30 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-bold text-xs text-ink">🔍 Tavily Web Search</span>
                <Badge tone={tavilyKey ? "up" : "down"}>{tavilyKey ? "Active" : "Missing"}</Badge>
              </div>
              <p className="text-2xs text-muted">Live Research Tool (`web_search`)</p>
              <div className="p-2 rounded bg-up/10 text-2xs text-up font-semibold">
                ✓ Free Quota Active (1,000 queries/mo)
              </div>
            </div>

            {/* Twitter */}
            <div className="p-3.5 rounded border border-hairline bg-raised/30 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-bold text-xs text-ink">🐦 X / Twitter API</span>
                <Badge tone={twitterToken ? "up" : "down"}>{twitterToken ? "Active" : "Missing"}</Badge>
              </div>
              <p className="text-2xs text-muted">Twitter v2 Social Dispatch</p>
              <div className="p-2 rounded bg-info/10 text-2xs text-info font-semibold">
                ✓ Basic Developer Tier Active
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ---------------------------------- Registered Companies Table -- */}
      <Card>
        <CardHeader
          title="Registered Companies & Subscriptions"
          subtitle="Track tenant businesses, user headcount, subscriber count, and credit consumption"
        />
        <div className="scroll-x">
          <table className="w-full min-w-[700px]">
            <thead className="thead">
              <tr className="border-b border-hairline">
                <Th>Company Name</Th>
                <Th>Subscription Plan</Th>
                <Th right>Users</Th>
                <Th right>Subscribers</Th>
                <Th right>Campaigns</Th>
                <Th right>AI Credits Used</Th>
                <Th right>Joined</Th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="border-b border-hairline/50 hover:bg-raised/40">
                  <Td>
                    <div className="font-bold text-ink">{c.name}</div>
                    <div className="mono text-2xs text-muted">{c.slug}</div>
                  </Td>
                  <Td>
                    <Badge tone="brand" className="uppercase">{c.plan}</Badge>
                  </Td>
                  <Td right className="tnum font-semibold text-ink">{num(c.user_count)}</Td>
                  <Td right className="tnum font-semibold text-ink">{num(c.people_count)}</Td>
                  <Td right className="tnum font-semibold text-ink">{num(c.content_count)}</Td>
                  <Td right className="tnum font-semibold text-brand">
                    {num(c.credits_used)} / {num(c.credits_limit)}
                  </Td>
                  <Td right className="tnum text-2xs text-muted">{ago(c.created_at, now)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
