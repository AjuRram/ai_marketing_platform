const { DatabaseSync } = require("node:sqlite");

const db = new DatabaseSync("data/pulse.db");
db.prepare("UPDATE businesses SET name = ?, slug = ? WHERE id = ?").run("DRAN'S", "drans", "biz_live_aditya");
console.log("Business name updated to DRAN'S!");
