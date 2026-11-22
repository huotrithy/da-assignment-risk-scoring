// Run the whole scorecard pipeline: features -> fit -> score -> validate, with the automated checks
// (checks/*.sql) after each stage, then print the results. Stops with an error if any *_ok check is false.
// Usage: node new_version_berka/scripts/run_all.js [--reload]   (--reload first re-loads the raw Berka files)
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { connect, runFile } = require('./lib/db');

const node = (script, args = []) => execFileSync(process.execPath, [path.join(__dirname, script), ...args], { stdio: 'inherit' });

async function sql(db, file) {
  console.log(`> ${file}`);
  await runFile(db, file);
}

async function check(db, file) {
  const result = await db.query(fs.readFileSync(path.join(__dirname, 'checks', file), 'utf8'));
  const rows = [].concat(result).flatMap((r) => r.rows || []);
  const checks = rows.flatMap((row) => Object.entries(row).filter(([k]) => k.endsWith('_ok')));
  const failed = checks.filter(([, v]) => v !== true).map(([k]) => k);
  if (failed.length) throw new Error(`${file}: failed ${failed.join(', ')}`);
  console.log(`  ${file}: ${checks.length} checks passed`);
}

async function withDb(fn) {
  const db = await connect();
  try { await fn(db); } finally { await db.end(); }
}

async function main() {
  if (process.argv.includes('--reload')) node('load_berka.js');
  await withDb(async (db) => {
    await sql(db, '10_features.sql');
    await check(db, '10_features_check.sql');
  });

  node('fit_scorecard.js');

  await withDb(async (db) => {
    await check(db, 'fit_check.sql');
    await sql(db, '20_score.sql');
    await sql(db, '30_validate.sql');
    await check(db, 'score_check.sql');
    const { rows } = await db.query('SELECT * FROM berka.validation_summary ORDER BY split DESC');
    console.table(rows);
  });
}

main().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; });
