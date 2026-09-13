# Pulse — Agentic AI Marketing Platform

**Pulse** is an enterprise-grade **Agentic AI Marketing Platform**. Instead of manually navigating complex marketing tools, users give Pulse a high-level outcome directive — such as *"Draft the Q3 product update digest, align it with our brand voice, target active developer segments, and schedule it for Tuesday"* — and the AI agent plans, writes, targets, and executes the entire workflow end-to-end.

Every action streams in real-time to the browser, irreversible actions automatically block for human approval, and complete resource consumption metrics are reported per run.

---

## 📸 Dashboards & Workflow Gallery

| View / Workflow | Preview | Description |
|---|---|---|
| **Main Marketing Dashboard** | ![Main Dashboard](docs/screenshots/dashboard.png) | Unified command center for active campaigns, audience activity, content metrics, and agent performance. |
| **Real-time AI Execution Streaming** | ![Agent Streaming](docs/screenshots/agent-streaming.png) | Live streaming of agent thinking, tool invocations, reasoning, and execution steps via Server-Sent Events (SSE). |
| **Human-in-the-Loop Approval Gate** | ![Approval Gate](docs/screenshots/agent-approval.png) | Irreversible actions (e.g. sending batch emails or publishing live content) pause safely for human approval. |
| **Campaign Run Completion** | ![Run Complete](docs/screenshots/agent-run-complete.png) | Full audit report detailing tool calls made, time elapsed, tokens consumed, and execution cost. |
| **Audience CDP & Contact Lists** | ![Audience CRM](docs/screenshots/audience.png) | Customer Data Platform (CDP) for managing profiles, behavioral events, and smart audience segments. |
| **Content Creator Studio** | ![Content Studio](docs/screenshots/content.png) | Collaborative workspace for drafting, editing, and publishing emails, blogs, and social posts. |
| **Automation Flows Engine** | ![Flows Engine](docs/screenshots/flows.png) | Visual, durable multi-step automation engine with event triggers, branching logic, and delay controls. |
| **AI Memory Bank & Brand Intelligence** | ![Memory Bank](docs/screenshots/memory.png) | Filesystem-based long-term agent memory storing brand voice guidelines, positioning, and personas. |
| **Settings & Security Center** | ![Settings](docs/screenshots/settings.png) | Workspace key management, party integration settings, and tenant configuration. |

---

## ⚡ How AI is Used in Pulse

Pulse leverages large language models (LLMs) not just as simple chat assistants, but as an **autonomous goal-seeking execution engine**:

1. **Outcome Directives**: Users supply high-level prompts. The planner breaks the directive down into a sequence of tool calls.
2. **Context-Aware Memory Retrieval**: Before drafting any copy or planning a campaign, the agent reads brand guidelines from `/brand/voice.md`, positioning from `/brand/positioning.md`, and target personas from `/personas/*.md`.
3. **Tool Invocation**: The agent autonomously queries audience segments, creates content drafts, triggers automation flows, and schedules campaign delivery.
4. **Safety & Human-in-the-Loop Gates**: Actions classified as state-modifying or irreversible pause automatically, surfacing an interactive approval interface for human verification before proceeding.

---

## 🛠️ MCP (Model Context Protocol) & Tool Integration

Pulse implements the **Model Context Protocol (MCP)** architecture to expose platform resources cleanly to the AI planner:

```
lib/resources/*.ts   ← Pure TypeScript Business Logic Layer
       ▲       ▲       ▲
       │       │       │
   Dashboard  Public   Agent MCP Tools
     (RSC)     API    (Zod Schemas)
```

- **Unified Resource Layer**: A single underlying TypeScript function serves server-side components, public API endpoints, and agent tools.
- **Strict Zod Schemas**: Every agent tool is typed with strict Zod validation, declaring exact parameters and payload structures.
- **Automatic Capability Parity**: Any new feature added to the core resource library automatically becomes an executable tool for the AI agent, eliminating backend drift.

---

## 🚀 Performance, Speed & Latency Optimization

Pulse is engineered for near-instant responsiveness and zero UI lag:

- **Sub-100ms Streaming (SSE / NDJSON)**: AI reasoning, tool calls, and status updates stream directly to the browser with zero polling overhead.
- **Zero-Network Database Latency**: Built on an embedded SQLite database engine (`node:sqlite` in Node 22.5+), providing microsecond data read/write speeds without network round-trips to external database servers.
- **Optimistic UI Updates**: Client state updates immediately while background executions process asynchronously.
- **Local Response Caching**: Keyword search and memory retrieval utilize SQLite FTS5 (Full-Text Search 5) for ultra-fast document scanning.

---

## 🔌 Party Integration Architecture

Pulse features a modular **Party Integration** system that enables seamless connectivity with external services and data sources:

- **CRM Party Integration**: Sync customer data, subscriber profiles, and contact lists across external party platforms.
- **Messaging & Distribution Party Integration**: Connect email distribution parties and messaging platforms for reliable multi-channel campaign delivery.
- **Web Analytics & Tracking Party Integration**: Embedded browser tracking script to ingest real-time behavioral events from web applications and external party sites.
- **Dual-Key Party Security**: Public publishable keys (`pk_live_*`) for client-side event ingestion and secret server keys (`sk_live_*`) for party backend integrations.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: `v22.5.0` or higher (utilizes native `node:sqlite`).

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/AjuRram/ai_marketing_platform.git
cd ai_marketing_platform

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev
```

Open [http://localhost:3200](http://localhost:3200) in your browser. The database seeds automatically with demo data on first boot.

---

## 🧪 Testing

Run the full automated test suite (79/79 passing tests):

```bash
npm run test
```

---

## 📜 License

Private Repository — All rights reserved.
