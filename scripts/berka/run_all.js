// Run the whole Stage 3 pipeline: features -> fit -> score -> validate, then print the results.
// Usage: node scripts/berka/run_all.js [--reload]   (--reload first re-loads the raw Berka files)
const { execFileSync } = require('child_process');
const path = require('path');
const { connect, runFile } = require('./lib/db');

const node = (script, args = []) => execFileSync(process.execPath, [path.join(__dirname, script), ...args], { stdio: 'inherit' });

async function sql(db, file) {
  console.log(`> ${file}`);
  await runFile(db, file);
}

async function main() {
  if (process.argv.includes('--reload')) node('load_berka.js');
  let db = await connect();
  try {
    await sql(db, '10_features.sql');
  } finally {
    await db.end();
  }

  node('fit_scorecard.js');

  db = await connect();
  try {
    await sql(db, '20_score.sql');
    await sql(db, '30_validate.sql');
    const { rows } = await db.query('SELECT * FROM berka.validation_summary ORDER BY split DESC');
    console.table(rows);
  } finally {
    await db.end();
  }
}

main().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; });
