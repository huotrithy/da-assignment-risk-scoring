// Load the Berka (PKDD'99) dataset into Postgres schema `berka`.
// Usage: node new_version_berka/scripts/load_berka.js [folder-with-.asc-files]
// Without a folder, downloads the original zip into data/berka/ (git-ignored) if not there yet.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { connect, runFile } = require('./lib/db');
const { parseDate, parseBirthNumber, translate } = require('./lib/parse');

const URL = 'http://lisp.vse.cz/pkdd99/DATA/data_berka.zip';
const DEFAULT_DIR = path.join(__dirname, '..', '..', 'data', 'berka');

function ensureData(dir) {
  if (fs.existsSync(path.join(dir, 'trans.asc'))) return dir;
  fs.mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, 'data_berka.zip');
  console.log('Downloading', URL);
  execFileSync('curl', ['-sSL', '-o', zip, URL], { stdio: 'inherit' });
  execFileSync('tar', ['-xf', zip, '-C', dir], { stdio: 'inherit' });
  return dir;
}

// Berka files: ';'-separated, latin-1, quoted strings.
function readAsc(dir, file) {
  const lines = fs.readFileSync(path.join(dir, file), 'latin1').trim().split(/\r?\n/);
  const head = lines[0].split(';').map((s) => s.replace(/"/g, ''));
  return lines.slice(1).map((l) => {
    const v = l.split(';').map((s) => s.replace(/"/g, ''));
    return Object.fromEntries(head.map((k, i) => [k, v[i]]));
  });
}

const num = (v) => (v == null || v.trim() === '' || v.trim() === '?' ? null : Number(v));
const txt = (v) => (v == null || v.trim() === '' ? null : v.trim());

async function insert(client, table, cols, rows, batch = 5000) {
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch);
    const params = [];
    const values = chunk.map((r) => '(' + r.map((v) => { params.push(v); return '$' + params.length; }).join(',') + ')');
    await client.query(`INSERT INTO berka.${table} (${cols.join(',')}) VALUES ${values.join(',')}`, params);
  }
  console.log(`  ${table}: ${rows.length}`);
}

async function main() {
  const dir = ensureData(process.argv[2] || DEFAULT_DIR);
  const client = await connect();
  try {
    await client.query('BEGIN');
    await runFile(client, '00_schema.sql');

    await insert(client, 'district',
      ['district_id', 'name', 'region', 'inhabitants', 'avg_salary', 'unemployment_95', 'unemployment_96', 'entrepreneurs_per_1000', 'crimes_95', 'crimes_96'],
      readAsc(dir, 'district.asc').map((d) => [num(d.A1), d.A2, d.A3, num(d.A4), num(d.A11), num(d.A12), num(d.A13), num(d.A14), num(d.A15), num(d.A16)]));

    await insert(client, 'account', ['account_id', 'district_id', 'frequency', 'open_date'],
      readAsc(dir, 'account.asc').map((a) => [num(a.account_id), num(a.district_id), translate('frequency', a.frequency), parseDate(a.date)]));

    await insert(client, 'client', ['client_id', 'birth_date', 'gender', 'district_id'],
      readAsc(dir, 'client.asc').map((c) => { const b = parseBirthNumber(c.birth_number); return [num(c.client_id), b.birth_date, b.gender, num(c.district_id)]; }));

    await insert(client, 'disposition', ['disp_id', 'client_id', 'account_id', 'type'],
      readAsc(dir, 'disp.asc').map((d) => [num(d.disp_id), num(d.client_id), num(d.account_id), d.type]));

    await insert(client, 'card', ['card_id', 'disp_id', 'type', 'issued_date'],
      readAsc(dir, 'card.asc').map((c) => [num(c.card_id), num(c.disp_id), c.type, parseDate(c.issued)]));

    await insert(client, 'loan', ['loan_id', 'account_id', 'loan_date', 'amount', 'duration_months', 'monthly_payment', 'status', 'is_bad'],
      readAsc(dir, 'loan.asc').map((l) => [num(l.loan_id), num(l.account_id), parseDate(l.date), num(l.amount), num(l.duration), num(l.payments), l.status, l.status === 'B' || l.status === 'D']));

    await insert(client, 'standing_order', ['order_id', 'account_id', 'bank_to', 'account_to', 'amount', 'k_symbol'],
      readAsc(dir, 'order.asc').map((o) => [num(o.order_id), num(o.account_id), txt(o.bank_to), txt(o.account_to), num(o.amount), txt(o.k_symbol)]));

    await insert(client, 'trans', ['trans_id', 'account_id', 'trans_date', 'type', 'operation', 'amount', 'balance', 'k_symbol', 'bank', 'partner_account'],
      readAsc(dir, 'trans.asc').map((t) => [num(t.trans_id), num(t.account_id), parseDate(t.date), translate('type', t.type), translate('operation', t.operation),
        num(t.amount), num(t.balance), translate('k_symbol', t.k_symbol), txt(t.bank), txt(t.account) === '0' ? null : txt(t.account)]));

    await client.query('COMMIT');
    await client.query('ANALYZE');
    console.log('Berka loaded into schema berka.');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; });
