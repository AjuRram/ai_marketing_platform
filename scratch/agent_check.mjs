import { startRun } from "../lib/agent/run.ts";
import { listEvents, listRuns } from "../lib/resources/agent.ts";

const businessId = "biz_f0040a4f1453416fa7d36c96"; // Lumen biz

console.log("⚡ Starting Pulse Agent Health Check...");
const goal = "Draft a product release email for our VIP list and check memory for brand voice";

const run = startRun(businessId, goal);
console.log("Run Created:", run.id, "| Mode:", run.mode, "| Model:", run.model);

// Poll for 5 seconds to show streaming events
let lastSeq = -1;
for (let i = 0; i < 10; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const events = listEvents(run.id, lastSeq);
  for (const ev of events) {
    console.log(`[Event ${ev.seq} - ${ev.type}]`, JSON.stringify(ev.payload));
    lastSeq = ev.seq;
  }
}

console.log("✅ Agent Health Check Completed Successfully!");
