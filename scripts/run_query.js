// Ad-hoc query runner against the live Postgres instance (for manual data review).
// Usage: node scripts/run_query.js <path-to-sql-file>
//    or: node scripts/run_query.js -e "SELECT * FROM customer LIMIT 5"
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = process.env[m[1].trim()] || m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const url = process.env.DATABASE_URL.replace('postgresql+psycopg://', 'postgresql://');
const arg = process.argv[2];
const sql = arg === '-e' ? process.argv[3] : fs.readFileSync(arg, 'utf8');

(async () => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const res = await client.query(sql);
    const results = Array.isArray(res) ? res : [res];
    for (const r of results) {
      if (r && r.rows) {
        console.log('--- rows:', r.rows.length);
        console.table(r.rows.slice(0, 30));
      } else if (r) {
        console.log('--- command:', r.command, 'rowCount:', r.rowCount);
      }
    }
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
