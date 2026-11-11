// Shared Postgres connection for the Berka scripts (reads DATABASE_URL from .env).
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = process.env[m[1].trim()] || m[2].trim().replace(/^["']|["']$/g, '');
  }
}

async function connect() {
  loadEnv();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (.env)');
  const client = new Client({ connectionString: process.env.DATABASE_URL.replace('postgresql+psycopg://', 'postgresql://') });
  await client.connect();
  return client;
}

// Run a .sql file from scripts/berka by name.
async function runFile(client, name) {
  const sql = fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
  return client.query(sql);
}

module.exports = { connect, runFile };
