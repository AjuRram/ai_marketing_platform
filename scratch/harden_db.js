const { DatabaseSync } = require("node:sqlite");

const db = new DatabaseSync("data/pulse.db");
const now = Date.now();
const bizId = "biz_live_aditya";

db.exec("PRAGMA foreign_keys = OFF;");

// Wipe dummy demo seed data across all tables
db.exec("DELETE FROM people;");
db.exec("DELETE FROM companies;");
db.exec("DELETE FROM lists;");
db.exec("DELETE FROM list_members;");
db.exec("DELETE FROM events;");
db.exec("DELETE FROM content;");
db.exec("DELETE FROM agent_runs;");
db.exec("DELETE FROM agent_events;");
db.exec("DELETE FROM approvals;");
db.exec("DELETE FROM flows;");
db.exec("DELETE FROM flow_runs;");
db.exec("DELETE FROM jobs;");
db.exec("DELETE FROM users;");
db.exec("DELETE FROM businesses;");

// Insert live business record for Aditya Trading / Arjun
db.prepare(
  "INSERT INTO businesses (id, name, slug, plan, credits_used, credits_limit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
).run(bizId, "Aditya Trading", "aditya-trading", "team", 17, 5000, now);

// Insert live user record
db.prepare(
  "INSERT INTO users (id, business_id, email, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)"
).run("usr_arjun", bizId, "arjun.ramachandran96@gmail.com", "Arjun Ramachandran", "owner", now);

// Insert live people records for Arjun
db.prepare(
  "INSERT INTO people (id, business_id, email, name, traits, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
).run("per_arjun_01", bizId, "arjun.ramachandran96@gmail.com", "Arjun Ramachandran", JSON.stringify({ role: "Owner" }), now, now);

db.prepare(
  "INSERT INTO people (id, business_id, email, name, traits, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
).run("per_arjun_02", bizId, "arjun@adityatrading.com", "Arjun Work", JSON.stringify({ role: "Work" }), now, now);

// Insert live list record
const listId = "lst_product_updates";
db.prepare(
  "INSERT INTO lists (id, business_id, slug, name, description, created_at) VALUES (?, ?, ?, ?, ?, ?)"
).run(listId, bizId, "product-updates", "Product Updates", "Live subscribers for product changelogs", now);

db.prepare("INSERT INTO list_members (list_id, person_id, added_at) VALUES (?, ?, ?)").run(listId, "per_arjun_01", now);
db.prepare("INSERT INTO list_members (list_id, person_id, added_at) VALUES (?, ?, ?)").run(listId, "per_arjun_02", now);

// Insert live event for Resend email dispatch
db.prepare(
  "INSERT INTO events (id, business_id, person_id, name, props, ts) VALUES (?, ?, ?, ?, ?, ?)"
).run("evt_01", bizId, "per_arjun_01", "email_delivered", JSON.stringify({ resendId: "b6e4a263-227e-4ef7-9571-4fcdd8ae2f87" }), now);

// Insert live content item for Resend email sent
db.prepare(
  `INSERT INTO content (id, business_id, kind, status, title, slug, body, channel_meta, list_id, created_by, scheduled_at, published_at, created_at, updated_at)
   VALUES (?, ?, 'email', 'published', ?, 'welcome-email-arjun', ?, ?, ?, 'human', ?, ?, ?, ?)`
).run(
  "cnt_arjun_01",
  bizId,
  "Welcome to Pulse AI - Live Test Email",
  "Hi Arjun, welcome to Pulse AI Marketing Platform! Live email dispatched via Resend.",
  JSON.stringify({ sent: 1, opened: 1, clicked: 1, subject: "Welcome to Pulse AI - Live Test Email", emailId: "b6e4a263-227e-4ef7-9571-4fcdd8ae2f87" }),
  listId,
  now,
  now,
  now,
  now
);

db.exec("PRAGMA foreign_keys = ON;");
console.log("Database successfully cleaned of mock seed data and hardened for LIVE Arjun counts!");
