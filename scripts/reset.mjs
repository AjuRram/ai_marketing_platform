/**
 * Wipes the local database. The next request re-creates and re-seeds it.
 *
 * Plain `.mjs` rather than TypeScript on purpose: it must run under bare `node`
 * with no build step, no path-alias resolution, and no dependency on the app
 * compiling. A reset script that only works when the app already works is
 * useless exactly when you need it.
 */
import fs from "node:fs";
import path from "node:path";

const target = process.env.PULSE_DB?.trim() || path.join(process.cwd(), "data", "pulse.db");

let removed = 0;
for (const suffix of ["", "-journal", "-wal", "-shm"]) {
  const file = target + suffix;
  if (fs.existsSync(file)) {
    fs.rmSync(file, { force: true });
    removed++;
  }
}

if (removed === 0) {
  console.log(`No database at ${target} — nothing to reset.`);
} else {
  console.log(`Removed ${removed} file(s) for ${target}.`);
  console.log("It will be recreated and seeded on the next request.");
}
