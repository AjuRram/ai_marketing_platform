"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Card, Button, Badge } from "@/components/ui/Primitives";

export function LandingPage() {
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [selectedPortal, setSelectedPortal] = useState<"crm" | "member" | null>(null);

  const handleOpenLogin = (portal: "crm" | "member") => {
    setSelectedPortal(portal);
    setLoginModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* ------------------------------------------------------------- Navigation Header -- */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-brand flex items-center justify-center font-bold text-brand-ink text-lg shadow-md shadow-brand/20">
              P
            </div>
            <span className="text-xl font-bold tracking-tight text-ink">Pulse</span>
            <Badge tone="brand">v0.1.0</Badge>
          </div>

          <nav className="hidden md:flex items-center space-x-8 text-sm font-medium text-muted">
            <a href="#features" className="hover:text-ink transition-colors">Features</a>
            <a href="#architecture" className="hover:text-ink transition-colors">Architecture</a>
            <a href="#portals" className="hover:text-ink transition-colors">Login Portals</a>
            <a href="#pricing" className="hover:text-ink transition-colors">Plans & Pricing</a>
          </nav>

          <div className="flex items-center space-x-3">
            <Button variant="outline" size="sm" onClick={() => handleOpenLogin("member")}>
              Member Login
            </Button>
            <Button variant="primary" size="sm" onClick={() => handleOpenLogin("crm")}>
              CRM Operator Login
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ------------------------------------------------------------------- Hero Section -- */}
        <section className="relative py-24 px-6 overflow-hidden border-b border-border/40">
          <div className="absolute inset-0 bg-gradient-to-b from-brand/5 via-transparent to-transparent pointer-events-none" />
          <div className="max-w-5xl mx-auto text-center space-y-6">
            <Badge tone="brand" className="px-3 py-1 text-xs">
              ⚡ Autonomous Agentic Marketing Platform
            </Badge>

            <h1 className="text-4xl sm:text-6xl font-extrabold text-ink tracking-tight leading-tight">
              An AI Agent That Plans & Executes <br className="hidden sm:inline" />
              <span className="bg-gradient-to-r from-brand via-info to-up bg-clip-text text-transparent">
                Marketing Campaigns End-to-End
              </span>
            </h1>

            <p className="text-lg text-muted max-w-3xl mx-auto leading-relaxed">
              Give Pulse an outcome — <span className="text-ink font-mono bg-raised px-2 py-0.5 rounded text-sm">&quot;Draft the August promo email and schedule it for Tuesday&quot;</span> — and it reads your brand voice from memory, drafts the content, targets customer lists, and executes with human approval safety gates.
            </p>

            <div className="flex flex-wrap justify-center gap-4 pt-4">
              <Button size="lg" variant="primary" onClick={() => handleOpenLogin("crm")}>
                Launch CRM Console 🚀
              </Button>
              <Button size="lg" variant="outline" onClick={() => handleOpenLogin("member")}>
                Access Member Portal 👤
              </Button>
            </div>

            {/* Simulated Live Console Frame */}
            <div className="mt-12 text-left max-w-4xl mx-auto border border-border rounded-2xl bg-card shadow-2xl overflow-hidden">
              <div className="bg-raised border-b border-border px-4 py-3 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                  <span className="text-xs font-mono text-muted ml-2">agent://pulse.dev/console</span>
                </div>
                <Badge tone="up">LIVE STREAMING</Badge>
              </div>
              <div className="p-5 font-mono text-xs space-y-3 bg-background/50">
                <div className="text-muted">Goal: &quot;Research competitor notes and draft Q3 email digest&quot;</div>
                <div className="text-brand">⚡ Thinking (adaptive): Searching company memory for brand voice...</div>
                <div className="text-up">✓ Tool Call [memory_search]: Found 3 match(es) in /brand/voice.md</div>
                <div className="text-info">✓ Tool Call [draft_content]: Created email draft &quot;Q3 Digest&quot;</div>
                <div className="text-warn bg-warn/10 p-2.5 rounded border border-warn/20">
                  ⚠️ Human Approval Required: Publish email to 1,200 recipients?
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- Features Grid -- */}
        <section id="features" className="py-20 px-6 max-w-7xl mx-auto space-y-12">
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-bold text-ink tracking-tight">Built for Autonomous Marketing Execution</h2>
            <p className="text-muted text-sm max-w-2xl mx-auto">
              Everything required to plan, create, segment, schedule, and measure marketing across all digital channels.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <Card className="p-6 space-y-3 border border-border bg-card hover:border-brand/50 transition-colors">
              <div className="text-2xl">🤖</div>
              <h3 className="text-lg font-bold text-ink">LLM Agent Engine</h3>
              <p className="text-xs text-muted leading-relaxed">
                Powered by Claude Opus 5 with adaptive thinking, high effort mode, and low-latency Server-Sent Events (SSE) live streaming.
              </p>
            </Card>

            <Card className="p-6 space-y-3 border border-border bg-card hover:border-brand/50 transition-colors">
              <div className="text-2xl">🧠</div>
              <h3 className="text-lg font-bold text-ink">Filesystem Memory</h3>
              <p className="text-xs text-muted leading-relaxed">
                Long-term company memory stored as human-auditable files with SQLite FTS5 full-text search over brand rules and personas.
              </p>
            </Card>

            <Card className="p-6 space-y-3 border border-border bg-card hover:border-brand/50 transition-colors">
              <div className="text-2xl">🛡️</div>
              <h3 className="text-lg font-bold text-ink">Approval Safety Gates</h3>
              <p className="text-xs text-muted leading-relaxed">
                Irreversible actions (publishing emails or triggering flow automations) pause for explicit human approval before dispatching.
              </p>
            </Card>

            <Card className="p-6 space-y-3 border border-border bg-card hover:border-brand/50 transition-colors">
              <div className="text-2xl">👥</div>
              <h3 className="text-lg font-bold text-ink">Audience & CDP</h3>
              <p className="text-xs text-muted leading-relaxed">
                Unified Customer Data Platform with people, companies, target subscriber lists, and behavioral event logging.
              </p>
            </Card>

            <Card className="p-6 space-y-3 border border-border bg-card hover:border-brand/50 transition-colors">
              <div className="text-2xl">📨</div>
              <h3 className="text-lg font-bold text-ink">Multi-Channel Delivery</h3>
              <p className="text-xs text-muted leading-relaxed">
                Integrated email sending via Resend API, social media dispatches to LinkedIn & X, and blog publishing pipelines.
              </p>
            </Card>

            <Card className="p-6 space-y-3 border border-border bg-card hover:border-brand/50 transition-colors">
              <div className="text-2xl">🔌</div>
              <h3 className="text-lg font-bold text-ink">MCP Server & APIs</h3>
              <p className="text-xs text-muted leading-relaxed">
                Model Context Protocol (MCP) JSON-RPC endpoint allowing external AI tools (Claude Desktop, Cursor, Slack bots) to interface seamlessly.
              </p>
            </Card>
          </div>
        </section>

        {/* ------------------------------------------------------------- Separate Login Portals -- */}
        <section id="portals" className="py-20 px-6 bg-raised/40 border-y border-border/60">
          <div className="max-w-6xl mx-auto space-y-12">
            <div className="text-center space-y-3">
              <Badge tone="info">DUAL PORTAL ACCESS</Badge>
              <h2 className="text-3xl font-bold text-ink">Separate Login Portals for Teams & Members</h2>
              <p className="text-muted text-sm max-w-xl mx-auto">
                Dedicated interfaces tailored for marketing operators managing campaigns and end-users managing preferences.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              {/* CRM Portal Card */}
              <Card className="p-8 space-y-5 border-2 border-brand/30 bg-card relative overflow-hidden shadow-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <Badge tone="brand">CRM & MARKETING OPERATOR</Badge>
                    <h3 className="text-2xl font-bold text-ink mt-2">Marketing CRM Console</h3>
                  </div>
                  <div className="text-3xl">🚀</div>
                </div>

                <p className="text-xs text-muted leading-relaxed">
                  For CMOs, marketing managers, and growth teams. Access full agent control, CDP analytics, content pipeline, memory editor, and automated flow builders.
                </p>

                <ul className="text-xs text-muted space-y-2">
                  <li className="flex items-center space-x-2">
                    <span className="text-brand font-bold">✓</span>
                    <span>Full Autonomous Agent Control & SSE Console</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <span className="text-brand font-bold">✓</span>
                    <span>CDP Audience Lists & Behavioral Event Tracking</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <span className="text-brand font-bold">✓</span>
                    <span>Approval Gate Management & Token Cost Accounting</span>
                  </li>
                </ul>

                <Link href="/dashboard" className="block pt-2">
                  <Button block variant="primary" size="md">
                    Log In to Marketing CRM Console →
                  </Button>
                </Link>
              </Card>

              {/* Member Portal Card */}
              <Card className="p-8 space-y-5 border border-border bg-card relative overflow-hidden shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <Badge tone="info">END-USER & MEMBER PORTAL</Badge>
                    <h3 className="text-2xl font-bold text-ink mt-2">Member Portal</h3>
                  </div>
                  <div className="text-3xl">👤</div>
                </div>

                <p className="text-xs text-muted leading-relaxed">
                  For end-users, subscribers, and community members. Manage email preferences, list subscriptions, and communication profiles.
                </p>

                <ul className="text-xs text-muted space-y-2">
                  <li className="flex items-center space-x-2">
                    <span className="text-info font-bold">✓</span>
                    <span>Self-Service Email Preference Center</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <span className="text-info font-bold">✓</span>
                    <span>Subscriber List & Topic Subscriptions</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <span className="text-info font-bold">✓</span>
                    <span>1-Click Unsubscribe & Privacy Data Controls</span>
                  </li>
                </ul>

                <Link href="/audience" className="block pt-2">
                  <Button block variant="outline" size="md">
                    Log In to Member Portal →
                  </Button>
                </Link>
              </Card>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- Plans & Pricing -- */}
        <section id="pricing" className="py-20 px-6 max-w-7xl mx-auto space-y-12">
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-bold text-ink tracking-tight">Transparent Plans & Pricing</h2>
            <p className="text-muted text-sm max-w-2xl mx-auto">
              Simple credit-based metering tracking actual model usage and execution cost.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Free */}
            <Card className="p-5 space-y-4 border border-border bg-card flex flex-col justify-between">
              <div className="space-y-2">
                <h4 className="font-bold text-ink">Free Trial</h4>
                <div className="text-3xl font-extrabold text-ink">₹0 <span className="text-xs text-muted font-normal">/ lifetime</span></div>
                <div className="text-xs text-muted">500 credits / mo</div>
                <Badge tone="neutral">Haiku Model</Badge>
              </div>
              <ul className="text-xs text-muted space-y-1.5 pt-4 border-t border-border">
                <li>• Keyless Demo Mode</li>
                <li>• 1 User Account</li>
                <li>• 2-Step OTP Verification</li>
              </ul>
              <Link href="/onboarding">
                <Button block variant="outline" size="sm">
                  Start Free Trial →
                </Button>
              </Link>
            </Card>

            {/* Weekly Pass */}
            <Card className="p-5 space-y-4 border border-border bg-card flex flex-col justify-between">
              <div className="space-y-2">
                <h4 className="font-bold text-ink">Weekly Pass</h4>
                <div className="text-3xl font-extrabold text-ink">₹299 <span className="text-xs text-muted font-normal">/ week</span></div>
                <div className="text-xs text-muted">2,000 credits / wk</div>
                <Badge tone="info">Sonnet Model</Badge>
              </div>
              <ul className="text-xs text-muted space-y-1.5 pt-4 border-t border-border">
                <li>• Email & Social Publishing</li>
                <li>• Resend ESP Integration</li>
                <li>• Standard Memory Search</li>
              </ul>
              <Link href="/onboarding">
                <Button block variant="outline" size="sm">
                  Subscribe ₹299/wk →
                </Button>
              </Link>
            </Card>

            {/* Monthly Plan (Popular) */}
            <Card className="p-5 space-y-4 border-2 border-brand bg-card flex flex-col justify-between relative shadow-lg">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge tone="brand" className="text-[10px] uppercase tracking-wider font-bold">Most Popular</Badge>
              </div>
              <div className="space-y-2 pt-2">
                <h4 className="font-bold text-ink">Monthly Plan</h4>
                <div className="text-3xl font-extrabold text-ink">₹599 <span className="text-xs text-muted font-normal">/ month</span></div>
                <div className="text-xs text-muted">5,000 credits / mo</div>
                <Badge tone="brand">Claude Opus 5</Badge>
              </div>
              <ul className="text-xs text-muted space-y-1.5 pt-4 border-t border-border">
                <li>• Full Agent Tools & SSE</li>
                <li>• Team RBAC Roles</li>
                <li>• MCP Server Endpoint</li>
                <li>• Approval Safety Gates</li>
              </ul>
              <Link href="/onboarding">
                <Button block variant="primary" size="sm">
                  Subscribe ₹599/mo →
                </Button>
              </Link>
            </Card>

            {/* Yearly Pass */}
            <Card className="p-5 space-y-4 border border-border bg-card flex flex-col justify-between">
              <div className="space-y-2">
                <h4 className="font-bold text-ink">Yearly Pass</h4>
                <div className="text-3xl font-extrabold text-ink">₹999 <span className="text-xs text-muted font-normal">/ year</span></div>
                <div className="text-xs text-muted">30,000 credits / yr</div>
                <Badge tone="up">Opus 5 Best Value</Badge>
              </div>
              <ul className="text-xs text-muted space-y-1.5 pt-4 border-t border-border">
                <li>• High Effort Reasoning</li>
                <li>• Live Web Search Tools</li>
                <li>• Custom Webhook Triggers</li>
                <li>• Priority Support</li>
              </ul>
              <Link href="/onboarding">
                <Button block variant="outline" size="sm">
                  Subscribe ₹999/yr →
                </Button>
              </Link>
            </Card>
          </div>
        </section>
      </main>

      {/* ------------------------------------------------------------- Login Modal -- */}
      {loginModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-6 space-y-6 bg-card border border-border shadow-2xl relative">
            <button
              onClick={() => setLoginModalOpen(false)}
              className="absolute top-4 right-4 text-muted hover:text-ink text-sm font-bold"
            >
              ✕
            </button>

            <div className="space-y-1">
              <Badge tone={selectedPortal === "crm" ? "brand" : "info"}>
                {selectedPortal === "crm" ? "CRM OPERATOR PORTAL" : "MEMBER PORTAL"}
              </Badge>
              <h3 className="text-xl font-bold text-ink">
                {selectedPortal === "crm" ? "Log in to Pulse CRM Console" : "Log in to Member Preference Portal"}
              </h3>
              <p className="text-xs text-muted">
                {selectedPortal === "crm"
                  ? "Enter your operator credentials to manage campaigns and agent runs."
                  : "Enter your subscriber email to manage your preferences."}
              </p>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); window.location.href = selectedPortal === "crm" ? "/dashboard" : "/audience"; }} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder={selectedPortal === "crm" ? "operator@acme.com" : "subscriber@example.com"}
                  className="w-full p-2.5 rounded border border-border bg-background text-sm text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Password / Auth Key</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  className="w-full p-2.5 rounded border border-border bg-background text-sm text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <Button block variant="primary" size="md" type="submit">
                {selectedPortal === "crm" ? "Access CRM Dashboard →" : "Access Member Portal →"}
              </Button>
            </form>
          </Card>
        </div>
      )}

      {/* ------------------------------------------------------------- Footer -- */}
      <footer className="border-t border-border py-8 px-6 text-xs text-muted">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-ink">Pulse AI</span>
            <span>— Autonomous Marketing Platform</span>
          </div>
          <div className="flex space-x-6">
            <a href="#features" className="hover:text-ink">Features</a>
            <a href="#pricing" className="hover:text-ink">Pricing</a>
            <Link href="/dashboard" className="hover:text-ink">CRM Dashboard</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
