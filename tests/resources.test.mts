/**
 * Resource-layer tests.
 *
 * Runs against a THROWAWAY database (`PULSE_DB` is pointed at a temp file
 * before any app module is imported), so the suite never touches the dev data
 * and can be run repeatedly without cleanup. The env var has to be set before
 * the import of `db/client`, which is why the imports below are dynamic.
 */
import assert from "node:assert/strict";
import test from "node:test";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const TMP = path.join(os.tmpdir(), `pulse-test-${process.pid}.db`);
process.env.PULSE_DB = TMP;

const { run: sql, resetDatabase } = await import("../lib/db/client.ts");
const audience = await import("../lib/resources/audience.ts");
const memory = await import("../lib/resources/memory.ts");
const content = await import("../lib/resources/content.ts");
const flows = await import("../lib/resources/flows.ts");
const agent = await import("../lib/resources/agent.ts");

/** Two tenants, so every test can assert isolation rather than assuming it. */
const ACME = "biz_acme";
const ZENITH = "biz_zenith";

for (const [id, name] of [
  [ACME, "Acme"],
  [ZENITH, "Zenith"],
] as const) {
  sql(
    `INSERT OR IGNORE INTO businesses (id, name, slug, plan, credits_limit, created_at)
     VALUES (?, ?, ?, 'team', 5000, ?)`,
    id,
    name,
    name.toLowerCase(),
    Date.now(),
  );
}

test.after(() => {
  resetDatabase();
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(TMP + suffix, { force: true });
});

/* --------------------------------------------------------------- audience -- */

test("upsertPerson creates once and merges thereafter", () => {
  const first = audience.upsertPerson(ACME, {
    email: "Maya@Example.com",
    name: "Maya",
    traits: { plan: "free", source: "docs" },
  });
  assert.equal(first.created, true);
  assert.equal(first.person.email, "maya@example.com", "email is normalised to lowercase");

  const second = audience.upsertPerson(ACME, {
    email: "maya@example.com",
    traits: { plan: "pro" },
  });
  assert.equal(second.created, false);
  assert.equal(second.person.traits.plan, "pro", "new trait overwrites");
  assert.equal(
    second.person.traits.source,
    "docs",
    "traits MERGE — an unrelated trait must survive a partial update",
  );
  assert.equal(second.person.name, "Maya", "name is preserved when omitted");
});

test("upsertPerson rejects a malformed email", () => {
  assert.throws(() => audience.upsertPerson(ACME, { email: "not-an-email" }), /Invalid email/);
});

test("TENANT ISOLATION — one business cannot read another's people", () => {
  audience.upsertPerson(ZENITH, { email: "spy@zenith.test", name: "Zenith Person" });

  assert.equal(audience.getPerson(ACME, "spy@zenith.test"), null);
  assert.ok(audience.getPerson(ZENITH, "spy@zenith.test"));

  const acmeEmails = audience.listPeople(ACME, { limit: 100 }).data.map((p) => p.email);
  assert.ok(!acmeEmails.includes("spy@zenith.test"));
});

test("addToList reports added and already-member separately", () => {
  audience.upsertList(ACME, { name: "Beta testers" });
  audience.upsertPerson(ACME, { email: "a@example.com" });
  audience.upsertPerson(ACME, { email: "b@example.com" });

  const first = audience.addToList(ACME, "beta-testers", ["a@example.com", "b@example.com"]);
  assert.deepEqual({ added: first.added, already: first.alreadyMember }, { added: 2, already: 0 });

  const second = audience.addToList(ACME, "beta-testers", ["a@example.com", "missing@nope.com"]);
  assert.equal(second.added, 0);
  assert.equal(second.alreadyMember, 1, "re-adding must not double-count");
  assert.deepEqual(second.notFound, ["missing@nope.com"]);
});

test("listPeople filters by list without breaking parameter order", () => {
  // Regression guard: the list filter injects a `?` into the JOIN, which comes
  // BEFORE the WHERE placeholders in the final SQL. Binding them in the wrong
  // order silently returns the wrong tenant's rows rather than erroring.
  const page = audience.listPeople(ACME, { listSlug: "beta-testers", search: "a@" });
  assert.equal(page.total, 1);
  assert.equal(page.data[0]?.email, "a@example.com");
});

test("peopleWhoDid finds distinct people in the window", () => {
  audience.recordEvent(ACME, { name: "pricing_viewed", personRef: "a@example.com" });
  audience.recordEvent(ACME, { name: "pricing_viewed", personRef: "a@example.com" });
  audience.recordEvent(ACME, { name: "pricing_viewed", personRef: "b@example.com" });

  const who = audience.peopleWhoDid(ACME, "pricing_viewed", 7);
  assert.equal(who.length, 2, "the same person firing twice counts once");
});

/* ----------------------------------------------------------------- memory -- */

test("writeMemory auto-creates parent directories", () => {
  memory.writeMemory(ACME, {
    path: "/competitors/newco.md",
    title: "NewCo",
    content: "They just raised a Series A and shipped a jobs view.",
    tags: ["competitor"],
  });

  const dir = memory.readMemory(ACME, "/competitors");
  assert.ok(dir, "the parent directory is created implicitly");
  assert.equal(dir.isDir, true);
});

test("memory paths are normalised and traversal is rejected", () => {
  assert.equal(memory.normalizePath("brand//voice.md/"), "/brand/voice.md");
  assert.throws(() => memory.normalizePath("/brand/../../etc/passwd"), /may not contain/);
});

test("searchMemories finds by content and survives a malformed query", () => {
  const hits = memory.searchMemories(ACME, "Series A");
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.path, "/competitors/newco.md");

  // A stray quote must return nothing, not throw an FTS5 parse error up into
  // the agent as a tool failure.
  assert.doesNotThrow(() => memory.searchMemories(ACME, 'jobs" OR *'));
});

test("TENANT ISOLATION — memory search is scoped", () => {
  memory.writeMemory(ZENITH, { path: "/secret.md", title: "Secret", content: "Series A plans" });
  const acmeHits = memory.searchMemories(ACME, "Series A").map((m) => m.path);
  assert.ok(!acmeHits.includes("/secret.md"));
});

test("deleteMemory removes a directory recursively", () => {
  memory.writeMemory(ACME, { path: "/scratch/a.md", title: "A", content: "one" });
  memory.writeMemory(ACME, { path: "/scratch/b.md", title: "B", content: "two" });
  const removed = memory.deleteMemory(ACME, "/scratch");
  assert.ok(removed >= 3, "the directory row and both children are removed");
  assert.equal(memory.readMemory(ACME, "/scratch/a.md"), null);
});

/* ---------------------------------------------------------------- content -- */

test("publishing an email records deterministic delivery stats", () => {
  const draft = content.createDraft(ACME, {
    kind: "email",
    title: "Launch note",
    body: "We shipped.",
    listSlug: "beta-testers",
    createdBy: "agent",
  });
  assert.equal(draft.status, "draft");

  const published = content.publishContent(ACME, draft.id);
  assert.equal(published.status, "published");
  assert.equal(published.meta.sent, 2, "sends to the list's actual membership");
  assert.ok((published.meta.opened ?? 0) > 0);

  // Re-publishing is a no-op rather than double-counting.
  const again = content.publishContent(ACME, draft.id);
  assert.equal(again.meta.sent, published.meta.sent);
  assert.equal(again.publishedAt, published.publishedAt);
});

test("blog slugs stay unique within a business", () => {
  const a = content.createDraft(ACME, { kind: "blog", title: "Same Title", body: "x" });
  const b = content.createDraft(ACME, { kind: "blog", title: "Same Title", body: "y" });
  assert.equal(a.slug, "same-title");
  assert.equal(b.slug, "same-title-2");
});

test("scheduling published content is refused", () => {
  const item = content.createDraft(ACME, { kind: "social", title: "Post", body: "hi" });
  content.publishContent(ACME, item.id);
  assert.throws(() => content.scheduleContent(ACME, item.id, Date.now() + 1000), /already published/);
});

/* ------------------------------------------------------------------ flows -- */

test("a flow run advances one step at a time and suspends on wait", () => {
  const flow = flows.createFlow(ACME, {
    name: "Test sequence",
    trigger: { type: "manual" },
    steps: [
      { type: "tag", key: "stage", value: "onboarding" },
      { type: "wait", hours: 48 },
      { type: "add_to_list", listSlug: "beta-testers" },
    ],
  });

  let flowRun = flows.triggerFlow(ACME, flow.id, "a@example.com");
  assert.equal(flowRun.status, "running");
  assert.equal(flowRun.cursor, 0);

  flowRun = flows.advanceFlowRun(ACME, flowRun.id);
  assert.equal(flowRun.cursor, 1, "one call executes exactly one step");
  assert.equal(audience.getPerson(ACME, "a@example.com")?.traits.stage, "onboarding");

  flowRun = flows.advanceFlowRun(ACME, flowRun.id);
  assert.equal(flowRun.status, "waiting", "a wait suspends rather than blocking");
  assert.equal(flowRun.finishedAt, null);

  flowRun = flows.advanceFlowRun(ACME, flowRun.id);
  assert.equal(flowRun.status, "done");
  assert.ok(flowRun.finishedAt);
});

test("a failing condition ends the run cleanly rather than erroring", () => {
  const flow = flows.createFlow(ACME, {
    name: "Gated",
    trigger: { type: "manual" },
    steps: [
      { type: "condition", trait: "plan", equals: "enterprise" },
      { type: "tag", key: "never", value: "reached" },
    ],
  });
  let flowRun = flows.triggerFlow(ACME, flow.id, "a@example.com");
  flowRun = flows.advanceFlowRun(ACME, flowRun.id);

  assert.equal(flowRun.status, "done");
  assert.equal(flowRun.error, null, "a filter miss is not a failure");
  assert.equal(audience.getPerson(ACME, "a@example.com")?.traits.never, undefined);
});

test("claimDueJobs cannot hand the same job to two workers", () => {
  const before = flows.claimDueJobs(Date.now(), 100).length;
  const second = flows.claimDueJobs(Date.now(), 100);
  assert.ok(before > 0, "the flow tests above enqueued work");
  assert.equal(second.length, 0, "a claimed job is not re-claimable");
});

/* ------------------------------------------------------------------ agent -- */

test("cost and credits are derived from real token counts", () => {
  const usage = {
    inputTokens: 40_000,
    outputTokens: 6_000,
    cacheReadTokens: 30_000,
    cacheWriteTokens: 5_000,
  };

  const cost = agent.costOf("claude-opus-5", usage);
  // 40k in @$5/M + 6k out @$25/M + 30k cache-read @0.1x + 5k cache-write @1.25x
  const expected = 0.2 + 0.15 + 0.015 + 0.03125;
  assert.ok(Math.abs(cost - expected) < 1e-9, `expected ~${expected}, got ${cost}`);

  assert.ok(agent.costOf("claude-haiku-4-5", usage) < cost, "cheaper model costs less");
  assert.equal(agent.creditsOf(usage), Math.ceil((6_000 + 4_000) / 100));
});

test("finishing a run meters the tenant's credits", () => {
  const before = agent.agentStats(ACME).totalCredits;
  const runRecord = agent.createRun(ACME, {
    goal: "Test run",
    model: "claude-opus-5",
    effort: "high",
    mode: "demo",
  });
  agent.appendEvent(runRecord.id, "text", { text: "hello" });

  const finished = agent.finishRun(ACME, runRecord.id, {
    status: "done",
    stopReason: "end_turn",
    usage: {
      inputTokens: 10_000,
      outputTokens: 2_000,
      cacheReadTokens: 8_000,
      cacheWriteTokens: 1_000,
    },
  });

  assert.equal(finished.status, "done");
  assert.ok(finished.usage.costUsd > 0);
  assert.ok(agent.agentStats(ACME).totalCredits > before, "credits accumulate on the business");
});

test("agent events keep a gapless sequence", () => {
  const runRecord = agent.createRun(ACME, {
    goal: "Sequencing",
    model: "claude-opus-5",
    effort: "low",
    mode: "demo",
  });
  for (let i = 0; i < 5; i++) agent.appendEvent(runRecord.id, "text", { i });

  const events = agent.listEvents(runRecord.id);
  assert.deepEqual(
    events.map((e) => e.seq),
    [0, 1, 2, 3, 4],
  );
  assert.equal(agent.listEvents(runRecord.id, 2).length, 2, "sinceSeq resumes a replay");
});

test("an approval can only be decided once", () => {
  const runRecord = agent.createRun(ACME, {
    goal: "Gated publish",
    model: "claude-opus-5",
    effort: "high",
    mode: "demo",
  });
  const approval = agent.createApproval(ACME, runRecord.id, {
    tool: "publish_content",
    input: { contentId: "cnt_x" },
    summary: "Publish the launch email to 1,240 people",
  });

  assert.equal(agent.pendingApprovals(ACME, runRecord.id).length, 1);

  const allowed = agent.decideApproval(ACME, approval.id, "allow");
  assert.equal(allowed.decision, "allow");

  const reDecided = agent.decideApproval(ACME, approval.id, "deny", "changed my mind");
  assert.equal(reDecided.decision, "allow", "the first decision stands — no double-spend");
  assert.equal(agent.pendingApprovals(ACME, runRecord.id).length, 0);
});
