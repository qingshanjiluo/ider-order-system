// run_migration_v10.js — 执行 v10 迁移（提现审核表 + updated_at）
const DATABASE_ID = 'c93adc20-4e90-4c39-ac72-a1e5f4a88f52';
const ACCOUNT_ID = '63bcbd83f0a8b14e205a97e86aab3e65';

const SQL_STATEMENTS = [
  // 提现记录表
  `CREATE TABLE IF NOT EXISTS withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    points REAL NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    admin_reply TEXT DEFAULT '',
    processed_by INTEGER DEFAULT 0,
    processed_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status)`,
];

function execSql(sql) {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;
    const data = JSON.stringify({ sql });
    const options = {
      method: 'POST',
      hostname: 'api.cloudflare.com',
      path: `/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`,
      headers: {
        'Authorization': `Bearer ${process.env.CF_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.success) resolve(json);
          else reject(new Error(json.errors?.[0]?.message || 'Query failed'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('🔄 Running migration v10...');
  for (let i = 0; i < SQL_STATEMENTS.length; i++) {
    const sql = SQL_STATEMENTS[i];
    console.log(`[${i + 1}/${SQL_STATEMENTS.length}] ${sql.substring(0, 60)}...`);
    try {
      await execSql(sql);
      console.log('  ✅ OK');
    } catch (err) {
      // ignore "already exists" errors
      if (err.message && err.message.includes('already exists')) {
        console.log('  ⏭️ Already exists, skipping');
      } else {
        console.error('  ❌ Error:', err.message);
      }
    }
  }
  console.log('✅ Migration v10 complete');
}

main().catch(console.error);
