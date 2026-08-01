/**
 * Public API + SDK integration test.
 *
 * Runs against a LIVE server (default http://localhost:3200) rather than
 * importing the handlers, because the things most likely to break here are
 * HTTP-level: auth headers, scope enforcement, CORS, status codes. A test that
 * called the resource layer directly would pass while the API was completely
 * broken.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { Pulse, PulseError } from "../packages/sdk-node/index.mjs";

const BASE = process.env.PULSE_BASE_URL ?? "http://localhost:3200";
const DB = process.env.PULSE_DB ?? "data/pulse.db";

/**
 * Mint keys directly in the database.
 *
 * The settings UI shows a key exactly once and stores only its hash, so there
 * is no way to recover an existing key's plaintext — a test has to create its
 * own and remember the secret it generated.
 */
function mintKey(kind, scopes) {
  const db = new DatabaseSync(DB);
  const biz = db.prepare("SELECT id FROM businesses ORDER BY created_at ASC LIMIT 1").get();
  const secret = randomBytes(18).toString("base64url");
  const plaintext = `${kind}_${secret}`;
  db.prepare(
    `INSERT INTO api_keys (id, business_id, name, kind, display, hash, scopes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `key_test_${randomBytes(8).toString("hex")}`,
    biz.id,
    "integration test",
    kind,
    `${kind}_test`,
    createHash("sha256").update(plaintext).digest("hex"),
    JSON.stringify(scopes),
    Date.now(),
  );
  db.close();
  return { plaintext, businessId: biz.id };
}

const secret = mintKey("sk", ["*"]);
const publishable = mintKey("pk", ["events:write", "people:identify"]);
const pulse = new Pulse({ apiKey: secret.plaintext, baseUrl: BASE });

/* --------------------------------------------------------------------- auth */

test("a request without a key is rejected", async () => {
  const res = await fetch(`${BASE}/api/v1/whoami`);
  assert.equal(res.status, 401);
});

test("a garbage key is rejected", async () => {
  const res = await fetch(`${BASE}/api/v1/whoami`, {
    headers: { Authorization: "Bearer sk_not_a_real_key" },
  });
  assert.equal(res.status, 401);
});

test("whoami resolves the key to its business and scopes", async () => {
  const me = await pulse.whoami();
  assert.equal(me.business_id, secret.businessId);
  assert.equal(me.kind, "sk");
  assert.deepEqual(me.scopes, ["*"]);
});

/* ------------------------------------------------------------------- scopes */

test("SCOPES — a publishable key cannot read the audience", async () => {
  const res = await fetch(`${BASE}/api/v1/audience/people`, {
    headers: { Authorization: `Bearer ${publishable.plaintext}` },
  });
  assert.equal(res.status, 403, "pk_ keys ship in browsers and must not read data back");
  const body = await res.json();
  assert.match(body.error, /audience:read/);
});

test("SCOPES — a publishable key CAN write events and identify people", async () => {
  for (const [path, body] of [
    ["events", { name: "sdk_test_event", props: { from: "test" } }],
    ["audience/people/upsert", { email: "pk-writer@example.com", traits: { via: "pk" } }],
  ]) {
    const res = await fetch(`${BASE}/api/v1/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${publishable.plaintext}`,
      },
      body: JSON.stringify(body),
    });
    assert.equal(res.status, 200, `${path} should be allowed for a pk_ key`);
  }
});

test("the SDK refuses a publishable key at construction", () => {
  assert.throws(
    () => new Pulse({ apiKey: publishable.plaintext, baseUrl: BASE }),
    /publishable key/,
  );
});

/* --------------------------------------------------------------------- CRUD */

test("audience round-trips through the SDK", async () => {
  const email = `sdk-${Date.now()}@example.com`;
  const created = await pulse.upsertPerson({ email, name: "SDK Person", traits: { via: "sdk" } });
  assert.equal(created.created, true);
  assert.equal(created.person.email, email);

  const again = await pulse.upsertPerson({ email, traits: { stage: "two" } });
  assert.equal(again.created, false);
  assert.equal(again.person.traits.via, "sdk", "traits merge across calls");
  assert.equal(again.person.traits.stage, "two");

  const list = await pulse.createList({ name: "SDK integration list" });
  const added = await pulse.addToList(list.slug, [email]);
  assert.equal(added.added, 1);

  const members = await pulse.people({ list: list.slug });
  assert.ok(members.data.some((p) => p.email === email));
});

test("memory round-trips and is searchable", async () => {
  const path = `/tests/sdk-${Date.now()}.md`;
  await pulse.writeMemory({
    path,
    title: "SDK note",
    content: "Pulse integration test wrote this distinctive marmalade sentence.",
    tags: ["test"],
  });

  const read = await pulse.memory(path);
  assert.match(read.content, /marmalade/);

  const found = await pulse.searchMemory("marmalade");
  assert.ok(found.data.some((m) => m.path === path), "FTS index is updated by the trigger");
});

test("content and flows are readable", async () => {
  const content = await pulse.content({ status: "published" });
  assert.ok(Array.isArray(content.data));

  const flows = await pulse.flows();
  assert.ok(flows.data.length > 0);
  assert.ok(flows.data[0].name);
});

/* ------------------------------------------------------------------- errors */

test("validation errors are 400 with a useful message", async () => {
  await assert.rejects(
    () => pulse.upsertPerson({ name: "no email" }),
    (err) => err instanceof PulseError && err.status === 400 && /email/.test(err.message),
  );
});

test("an unknown route is 404, not a 500", async () => {
  const res = await fetch(`${BASE}/api/v1/nonsense/route`, {
    headers: { Authorization: `Bearer ${secret.plaintext}` },
  });
  assert.equal(res.status, 404);
});

test("CORS preflight is answered for the browser SDK", async () => {
  const res = await fetch(`${BASE}/api/v1/events`, { method: "OPTIONS" });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
});

/* --------------------------------------------------------------------- cron */

test("the cron tick drains the queue and reports what it did", async () => {
  const res = await fetch(`${BASE}/api/cron/tick`, { method: "POST" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  for (const field of ["flowSteps", "published", "failed", "requeued"]) {
    assert.equal(typeof body[field], "number");
  }
});
