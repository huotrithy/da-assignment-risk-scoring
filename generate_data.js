// Retail Credit Risk Scoring — synthetic data generator
// Runs on Node's built-in SQLite (node >= 22, --experimental-sqlite not needed on 22.5+)
//
// Grounding: Loan Application / Risk Score / Loan Account / Payment History /
// Delinquency values are bootstrap-sampled (age, credit amount, duration,
// good/bad label) from the real UCI "Statlog German Credit Data" dataset in
// reference_data/german_credit.data — see reference_data/ATTRIBUTION.md.
// Customer / Account / Transaction / Balance History have no equivalent in
// that dataset and remain fully synthetic, driven by a per-customer risk
// bucket (customer_id % 5: 0,1=low risk, 2,3=medium risk, 4=high risk).

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const DB_PATH = path.join(DIR, 'credit_risk.db');
const PG_EXPORT_PATH = path.join(DIR, 'postgres_export.sql');

if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

// ---------------------------------------------------------------------------
// Load + parse the UCI German Credit dataset
// ---------------------------------------------------------------------------
const rawLines = fs.readFileSync(path.join(DIR, 'reference_data', 'german_credit.data'), 'utf8')
    .trim().split('\n');
const german = rawLines.map(line => {
    const f = line.trim().split(/\s+/);
    return {
        duration: +f[1],
        amount: +f[4],
        age: +f[12],
        classLabel: +f[20], // 1 = good, 2 = bad
    };
});

function sampleGerman() { return german[Math.floor(Math.random() * german.length)]; }
function rint(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function rnd(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function round2(n) { return Math.round(n * 100) / 100; }

function addDays(base, days) {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

// ---------------------------------------------------------------------------
// Schema (SQLite dialect)
// ---------------------------------------------------------------------------
const db = new DatabaseSync(DB_PATH);
db.exec(`
CREATE TABLE customer (
    customer_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name           TEXT NOT NULL,
    date_of_birth       TEXT NOT NULL,
    national_id         TEXT NOT NULL UNIQUE,
    customer_since_date TEXT NOT NULL
);
CREATE TABLE income_source (
    income_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id    INTEGER NOT NULL REFERENCES customer(customer_id),
    income_type    TEXT NOT NULL CHECK (income_type IN ('salary','business','rental','other')),
    monthly_income REAL NOT NULL CHECK (monthly_income >= 0),
    effective_date TEXT NOT NULL
);
CREATE TABLE account (
    account_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id  INTEGER NOT NULL REFERENCES customer(customer_id),
    account_type TEXT NOT NULL CHECK (account_type IN ('savings','current')),
    open_date    TEXT NOT NULL,
    status       TEXT NOT NULL CHECK (status IN ('active','dormant','closed'))
);
CREATE TABLE "transaction" (
    transaction_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id       INTEGER NOT NULL REFERENCES account(account_id),
    transaction_date TEXT NOT NULL,
    amount           REAL NOT NULL,
    category         TEXT NOT NULL
);
CREATE TABLE account_balance_history (
    balance_history_id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id          INTEGER NOT NULL REFERENCES account(account_id),
    snapshot_date       TEXT NOT NULL,
    closing_balance     REAL NOT NULL
);
CREATE TABLE loan_product (
    product_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    product_name   TEXT NOT NULL,
    interest_rate  REAL NOT NULL,
    min_amount     REAL NOT NULL,
    max_amount     REAL NOT NULL,
    tenor_months   INTEGER NOT NULL
);
CREATE TABLE loan_offer (
    offer_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customer(customer_id),
    product_id  INTEGER NOT NULL REFERENCES loan_product(product_id),
    offer_date  TEXT NOT NULL,
    status      TEXT NOT NULL CHECK (status IN ('pending','accepted','declined','expired'))
);
CREATE TABLE loan_application (
    application_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id       INTEGER NOT NULL REFERENCES customer(customer_id),
    product_id        INTEGER NOT NULL REFERENCES loan_product(product_id),
    application_date  TEXT NOT NULL,
    requested_amount  REAL NOT NULL,
    status            TEXT NOT NULL CHECK (status IN ('approved','rejected','pending'))
);
CREATE TABLE risk_score (
    score_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id    INTEGER NOT NULL REFERENCES customer(customer_id),
    application_id INTEGER REFERENCES loan_application(application_id),
    score_value    INTEGER NOT NULL CHECK (score_value BETWEEN 300 AND 850),
    risk_grade     TEXT NOT NULL CHECK (risk_grade IN ('A','B','C','D','E')),
    score_date     TEXT NOT NULL
);
CREATE TABLE loan_account (
    loan_account_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id      INTEGER NOT NULL UNIQUE REFERENCES loan_application(application_id),
    principal_amount    REAL NOT NULL,
    disbursement_date   TEXT NOT NULL,
    outstanding_balance REAL NOT NULL,
    status              TEXT NOT NULL CHECK (status IN ('current','closed','delinquent','written_off'))
);
CREATE TABLE payment_history (
    payment_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_account_id INTEGER NOT NULL REFERENCES loan_account(loan_account_id),
    due_date        TEXT NOT NULL,
    amount_due      REAL NOT NULL,
    amount_paid     REAL NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('on_time','late','missed'))
);
CREATE TABLE delinquency_event (
    event_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_account_id INTEGER NOT NULL REFERENCES loan_account(loan_account_id),
    event_date      TEXT NOT NULL,
    days_past_due   INTEGER NOT NULL,
    event_type      TEXT NOT NULL CHECK (event_type IN ('30dpd','60dpd','90dpd','write_off'))
);
CREATE TABLE collateral (
    collateral_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_account_id INTEGER NOT NULL REFERENCES loan_account(loan_account_id),
    collateral_type TEXT NOT NULL,
    estimated_value REAL NOT NULL
);
`);

// ---------------------------------------------------------------------------
// PG export buffer — mirrors every insert below, in Postgres-compatible SQL
// ---------------------------------------------------------------------------
const pg = [];
pg.push('-- Auto-generated Postgres-compatible data export. Run after 01_schema.sql.');
pg.push("SET client_min_messages TO WARNING;\n");
function esc(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    return `'${String(v).replace(/'/g, "''")}'`;
}
function pgInsert(table, cols, values) {
    pg.push(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${values.map(esc).join(', ')});`);
}

// ---------------------------------------------------------------------------
// 1. Loan Product (static catalog)
// ---------------------------------------------------------------------------
const products = [
    ['Personal Loan', 14.50, 500, 10000, 24],
    ['Auto Loan', 9.75, 3000, 30000, 60],
    ['Home Improvement Loan', 11.00, 1000, 20000, 36],
    ['Salary Advance', 18.00, 200, 2000, 6],
    ['Business Micro-Loan', 15.25, 1000, 15000, 36],
];
const insProduct = db.prepare(`INSERT INTO loan_product (product_name, interest_rate, min_amount, max_amount, tenor_months) VALUES (?,?,?,?,?)`);
products.forEach(p => {
    insProduct.run(...p);
    pgInsert('loan_product', ['product_name', 'interest_rate', 'min_amount', 'max_amount', 'tenor_months'], p);
});
const productRows = db.prepare('SELECT * FROM loan_product').all();

// ---------------------------------------------------------------------------
// 2. Customer (age bootstrap-sampled from German Credit Data)
// ---------------------------------------------------------------------------
const FIRST = ['Sokha','Dara','Piseth','Ratana','Sophea','Chanthou','Vichea','Sreymom','Bopha','Vuthy',
               'Kunthea','Rithy','Malis','Panha','Sotheara','Chenda','Makara','Sreynich','Veasna','Kimlong'];
const LAST = ['Chan','Sok','Heng','Meas','Pich','Ly','Chea','Kim','San','Vong',
              'Nou','Sen','Iv','Touch','Keo','Long','Nhem','Roeun','Suon','Yin'];

const N_CUSTOMERS = 200;
const insCustomer = db.prepare(`INSERT INTO customer (full_name, date_of_birth, national_id, customer_since_date) VALUES (?,?,?,?)`);
const customers = [];
for (let i = 1; i <= N_CUSTOMERS; i++) {
    const age = sampleGerman().age; // real age distribution
    const dob = new Date(TODAY); dob.setFullYear(dob.getFullYear() - age); dob.setDate(rint(1, 28));
    const sinceDaysAgo = rint(180, 3650);
    const sinceDate = addDays(TODAY, -sinceDaysAgo);
    const fullName = `${pick(FIRST)} ${pick(LAST)}`;
    const nationalId = 'NID' + String(i).padStart(9, '0');
    const dobStr = dob.toISOString().slice(0, 10);
    insCustomer.run(fullName, dobStr, nationalId, sinceDate);
    pgInsert('customer', ['full_name', 'date_of_birth', 'national_id', 'customer_since_date'], [fullName, dobStr, nationalId, sinceDate]);
    customers.push({ id: i, bucket: i % 5, sinceDate });
}

// ---------------------------------------------------------------------------
// 3. Income Source
// ---------------------------------------------------------------------------
const insIncome = db.prepare(`INSERT INTO income_source (customer_id, income_type, monthly_income, effective_date) VALUES (?,?,?,?)`);
function addIncome(customerId, type, amount, effDate) {
    insIncome.run(customerId, type, amount, effDate);
    pgInsert('income_source', ['customer_id', 'income_type', 'monthly_income', 'effective_date'], [customerId, type, amount, effDate]);
}
customers.forEach(c => {
    const type = c.bucket === 4 ? pick(['salary', 'other']) : pick(['salary', 'business']);
    const amount = c.bucket <= 1 ? round2(rnd(1200, 3000)) : c.bucket <= 3 ? round2(rnd(600, 1500)) : round2(rnd(300, 900));
    addIncome(c.id, type, amount, addDays(c.sinceDate, rint(0, 180)));
    if (c.bucket <= 3 && Math.random() < 0.3) {
        addIncome(c.id, 'rental', round2(rnd(150, 600)), addDays(c.sinceDate, rint(0, 365)));
    }
});

// ---------------------------------------------------------------------------
// 4. Account
// ---------------------------------------------------------------------------
const insAccount = db.prepare(`INSERT INTO account (customer_id, account_type, open_date, status) VALUES (?,?,?,?)`);
const accounts = [];
customers.forEach(c => {
    insAccount.run(c.id, 'savings', c.sinceDate, 'active');
    const accId1 = db.prepare('SELECT last_insert_rowid() AS id').get().id;
    pgInsert('account', ['customer_id', 'account_type', 'open_date', 'status'], [c.id, 'savings', c.sinceDate, 'active']);
    accounts.push({ id: accId1, customerId: c.id, bucket: c.bucket });

    if (Math.random() < 0.35) {
        const openDate = addDays(c.sinceDate, rint(0, 365));
        insAccount.run(c.id, 'current', openDate, 'active');
        const accId2 = db.prepare('SELECT last_insert_rowid() AS id').get().id;
        pgInsert('account', ['customer_id', 'account_type', 'open_date', 'status'], [c.id, 'current', openDate, 'active']);
        accounts.push({ id: accId2, customerId: c.id, bucket: c.bucket });
    }
});

// ---------------------------------------------------------------------------
// 5. Transaction (~15 per account)
// ---------------------------------------------------------------------------
const CATEGORIES = ['income', 'groceries', 'utilities', 'rent', 'transfer', 'entertainment', 'healthcare'];
const insTxn = db.prepare(`INSERT INTO "transaction" (account_id, transaction_date, amount, category) VALUES (?,?,?,?)`);
accounts.forEach(a => {
    for (let n = 0; n < 15; n++) {
        const cat = pick(CATEGORIES);
        const amount = cat === 'income' ? round2(rnd(300, 2300)) : round2(-rnd(20, 420));
        const date = addDays(TODAY, -rint(0, 180));
        insTxn.run(a.id, date, amount, cat);
        pgInsert('transaction', ['account_id', 'transaction_date', 'amount', 'category'], [a.id, date, amount, cat]);
    }
});

// ---------------------------------------------------------------------------
// 6. Account Balance History (26 weekly snapshots, trend by risk bucket)
// ---------------------------------------------------------------------------
const insBal = db.prepare(`INSERT INTO account_balance_history (account_id, snapshot_date, closing_balance) VALUES (?,?,?)`);
accounts.forEach(a => {
    for (let w = 0; w <= 25; w++) {
        const base = a.bucket <= 1 ? 3000 + w * 25 : a.bucket <= 3 ? 1200 + w * 2 : 900 - w * 15;
        const balance = Math.max(0, round2(base + rnd(-150, 150)));
        const date = addDays(TODAY, -(w * 7));
        insBal.run(a.id, date, balance);
        pgInsert('account_balance_history', ['account_id', 'snapshot_date', 'closing_balance'], [a.id, date, balance]);
    }
});

// ---------------------------------------------------------------------------
// 7. Loan Offer (~30% of low/medium risk customers)
// ---------------------------------------------------------------------------
const insOffer = db.prepare(`INSERT INTO loan_offer (customer_id, product_id, offer_date, status) VALUES (?,?,?,?)`);
const offerRecipients = [];
customers.forEach(c => {
    if (c.bucket <= 3 && Math.random() < 0.3) {
        const product = pick(productRows);
        const status = pick(['pending', 'accepted', 'declined', 'expired']);
        const offerDate = addDays(TODAY, -rint(0, 90));
        insOffer.run(c.id, product.product_id, offerDate, status);
        pgInsert('loan_offer', ['customer_id', 'product_id', 'offer_date', 'status'], [c.id, product.product_id, offerDate, status]);
        offerRecipients.push({ customerId: c.id, bucket: c.bucket, offerDate });
    }
});

// ---------------------------------------------------------------------------
// 8-10. Loan Application + Risk Score + Loan Account
//    Bootstrap-sampled from German Credit Data: amount, duration, class label
// ---------------------------------------------------------------------------
const insApp = db.prepare(`INSERT INTO loan_application (customer_id, product_id, application_date, requested_amount, status) VALUES (?,?,?,?,?)`);
const insScore = db.prepare(`INSERT INTO risk_score (customer_id, application_id, score_value, risk_grade, score_date) VALUES (?,?,?,?,?)`);
const insLoanAcct = db.prepare(`INSERT INTO loan_account (application_id, principal_amount, disbursement_date, outstanding_balance, status) VALUES (?,?,?,?,?)`);

function gradeFor(score) {
    if (score >= 750) return 'A';
    if (score >= 680) return 'B';
    if (score >= 600) return 'C';
    if (score >= 500) return 'D';
    return 'E';
}

const loanAccounts = [];
customers.forEach(c => {
    if (Math.random() >= 0.4) return; // ~40% of customers submit an application

    const g = sampleGerman(); // real amount / duration / good-bad label
    // Pick the product whose tenor is closest to the sampled real duration
    const product = productRows.reduce((best, p) =>
        Math.abs(p.tenor_months - g.duration) < Math.abs(best.tenor_months - g.duration) ? p : best, productRows[0]);
    const requestedAmount = round2(Math.min(product.max_amount, Math.max(product.min_amount, g.amount)));
    const appDate = addDays(TODAY, -rint(0, 365));

    // Real "good"/"bad" label drives the score band
    const scoreValue = g.classLabel === 1 ? rint(650, 820) : rint(350, 590);
    const grade = gradeFor(scoreValue);
    const status = scoreValue >= 600 ? 'approved' : 'rejected';

    insApp.run(c.id, product.product_id, appDate, requestedAmount, status);
    const applicationId = db.prepare('SELECT last_insert_rowid() AS id').get().id;
    pgInsert('loan_application', ['customer_id', 'product_id', 'application_date', 'requested_amount', 'status'],
        [c.id, product.product_id, appDate, requestedAmount, status]);

    insScore.run(c.id, applicationId, scoreValue, grade, appDate);
    pgInsert('risk_score', ['customer_id', 'application_id', 'score_value', 'risk_grade', 'score_date'],
        [c.id, applicationId, scoreValue, grade, appDate]);

    if (status === 'approved') {
        const disbDate = addDays(appDate, 5);
        const outstanding = round2(requestedAmount * rnd(0.3, 1.0));
        const loanStatus = c.bucket === 4 && Math.random() < 0.5 ? 'delinquent' : Math.random() < 0.1 ? 'closed' : 'current';
        insLoanAcct.run(applicationId, requestedAmount, disbDate, outstanding, loanStatus);
        const loanAccountId = db.prepare('SELECT last_insert_rowid() AS id').get().id;
        pgInsert('loan_account', ['application_id', 'principal_amount', 'disbursement_date', 'outstanding_balance', 'status'],
            [applicationId, requestedAmount, disbDate, outstanding, loanStatus]);
        loanAccounts.push({ id: loanAccountId, disbDate, principal: requestedAmount, status: loanStatus, bucket: c.bucket, productId: product.product_id, productName: product.product_name });
    }
});

// Periodic/batch risk scores for proactive offer recipients (no application link)
offerRecipients.forEach(r => {
    const scoreValue = r.bucket <= 1 ? rint(700, 820) : rint(580, 700);
    const grade = gradeFor(scoreValue);
    const scoreDate = addDays(r.offerDate, -rint(0, 10));
    insScore.run(r.customerId, null, scoreValue, grade, scoreDate);
    pgInsert('risk_score', ['customer_id', 'application_id', 'score_value', 'risk_grade', 'score_date'],
        [r.customerId, null, scoreValue, grade, scoreDate]);
});

// ---------------------------------------------------------------------------
// 11. Payment History (monthly installments; high-risk bucket -> late/missed)
// ---------------------------------------------------------------------------
const insPay = db.prepare(`INSERT INTO payment_history (loan_account_id, due_date, amount_due, amount_paid, status) VALUES (?,?,?,?,?)`);
loanAccounts.forEach(la => {
    const installment = round2(la.principal / 12);
    for (let m = 1; m <= 6; m++) {
        const dueDate = addDays(la.disbDate, m * 30);
        let paid = installment, status = 'on_time';
        if (la.bucket === 4) {
            const roll = Math.random();
            if (roll < 0.3) { paid = 0; status = 'missed'; }
            else if (roll < 0.5) { paid = round2(installment * 0.6); status = 'late'; }
        }
        insPay.run(la.id, dueDate, installment, paid, status);
        pgInsert('payment_history', ['loan_account_id', 'due_date', 'amount_due', 'amount_paid', 'status'],
            [la.id, dueDate, installment, paid, status]);
    }
});

// ---------------------------------------------------------------------------
// 12. Delinquency Event
// ---------------------------------------------------------------------------
const insDelinq = db.prepare(`INSERT INTO delinquency_event (loan_account_id, event_date, days_past_due, event_type) VALUES (?,?,?,?)`);
loanAccounts.filter(la => la.status === 'delinquent').forEach(la => {
    const dpd = rint(30, 100);
    const eventType = dpd >= 90 ? '90dpd' : dpd >= 60 ? '60dpd' : '30dpd';
    const eventDate = addDays(la.disbDate, 120);
    insDelinq.run(la.id, eventDate, dpd, eventType);
    pgInsert('delinquency_event', ['loan_account_id', 'event_date', 'days_past_due', 'event_type'], [la.id, eventDate, dpd, eventType]);
});

// ---------------------------------------------------------------------------
// 13. Collateral (secured products only)
// ---------------------------------------------------------------------------
const insCollateral = db.prepare(`INSERT INTO collateral (loan_account_id, collateral_type, estimated_value) VALUES (?,?,?)`);
loanAccounts.filter(la => ['Auto Loan', 'Home Improvement Loan'].includes(la.productName) && Math.random() < 0.7)
    .forEach(la => {
        const type = la.productName === 'Auto Loan' ? 'vehicle' : 'property';
        const value = round2(la.principal * rnd(1.1, 1.5));
        insCollateral.run(la.id, type, value);
        pgInsert('collateral', ['loan_account_id', 'collateral_type', 'estimated_value'], [la.id, type, value]);
    });

// ---------------------------------------------------------------------------
// Write Postgres export + print summary
// ---------------------------------------------------------------------------
fs.writeFileSync(PG_EXPORT_PATH, pg.join('\n') + '\n');

const tables = ['customer', 'income_source', 'account', '"transaction"', 'account_balance_history',
    'loan_product', 'loan_offer', 'loan_application', 'risk_score', 'loan_account',
    'payment_history', 'delinquency_event', 'collateral'];
console.log('Row counts:');
tables.forEach(t => {
    const count = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
    console.log(`  ${t.replace(/"/g, '')}: ${count}`);
});
console.log(`\nSQLite DB written to: ${DB_PATH}`);
console.log(`Postgres export written to: ${PG_EXPORT_PATH}`);
db.close();
