const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/game.db', { readOnly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((t) => t.name);
console.log('tables:', tables.join(', '));
let total = 0;
for (const t of tables.filter((t) => t.startsWith('col_'))) {
  const n = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  if (n > 0) { console.log(`  ${t} = ${n}`); total += n; }
}
console.log('total rows:', total);
db.close();
