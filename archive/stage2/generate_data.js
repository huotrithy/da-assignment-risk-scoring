// Retail Credit Risk Scoring — synthetic data generator
// Runs on Node's built-in SQLite (node >= 22, --experimental-sqlite not needed on 22.5+)
//
// Grounding: Loan Application / Risk Score / Loan Account / Payment History /
// Delinquency values are bootstrap-sampled (age, credit amount, duration,
// good/bad label) from the real UCI "Statlog German Credit Data" dataset in
// bootstrap/german_credit.data — see bootstrap/ATTRIBUTION.md.
// Customer / Account / Transaction / Balance History have no equivalent in
// that dataset and remain fully synthetic, driven by a per-customer risk
// bucket (customer_id % 5: 0,1=low risk, 2,3=medium risk, 4=high risk).

const { DatabaseSync } = require('node:sqlite');
const { faker } = require('@faker-js/faker');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const DB_PATH = path.join(DIR, 'credit_risk.db');
const PG_EXPORT_PATH = path.join(DIR, 'postgres_export.sql');

if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

// ---------------------------------------------------------------------------
// Load + parse the UCI German Credit dataset
// ---------------------------------------------------------------------------
const rawLines = fs.readFileSync(path.join(DIR, 'bootstrap', 'german_credit.data'), 'utf8')
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

// RNG primitives backed by Faker (faker.js has no Khmer locale, so names stay
// on the curated arrays below — Faker is used for numeric/date/pick realism
// and for fields where a library-shaped value is genuinely more convincing).
function sampleGerman() { return faker.helpers.arrayElement(german); }
function rint(a, b) { return faker.number.int({ min: a, max: b }); }
function rnd(a, b) { return faker.number.float({ min: a, max: b, fractionDigits: 2 }); }
function pick(arr) { return faker.helpers.arrayElement(arr); }
function chance(p) { return faker.datatype.boolean({ probability: p }); }
function round2(n) { return Math.round(n * 100) / 100; }

// Reproducible runs: same seed + same as-of date => identical data.
// Override with AS_OF=YYYY-MM-DD / SEED=n if needed.
const SEED = +(process.env.SEED || 20261003);
faker.seed(SEED);
const TODAY = new Date((process.env.AS_OF || '2026-10-03') + 'T00:00:00Z'); // the data's "today"
const TODAY_STR = TODAY.toISOString().slice(0, 10);

// All dates are UTC calendar dates (no local-timezone drift).
function addDays(base, days) {
    const d = new Date(typeof base === 'string' ? base + 'T00:00:00Z' : base);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}
function daysAgo(dateStr) { return Math.round((TODAY - new Date(dateStr + 'T00:00:00Z')) / 86400000); }

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

// All inserts below run inside one transaction — without this, SQLite fsyncs
// on every single autocommit insert, which turns tens of thousands of rows
// into a multi-minute run.
db.exec('BEGIN');

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
    ['Education Loan', 8.50, 1000, 25000, 48],
    ['Medical Loan', 12.75, 500, 12000, 24],
    ['Debt Consolidation Loan', 13.90, 1000, 18000, 36],
    ['Wedding Loan', 16.00, 500, 8000, 18],
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
               'Kunthea','Rithy','Malis','Panha','Sotheara','Chenda','Makara','Sreynich','Veasna','Kimlong',
               'Sovann','Chariya','Bunthoeun','Kalliyan','Ponleu','Rachana','Sambath','Thida','Vannak','Chakriya',
               'Sreyleak','Pisach','Channary','Sokun','Mengly','Reaksmey','Sopheak','Bunroeun','Chanreaksmey','Kosal',
               'Leakhena','Narith','Oudom','Pheakdey','Rasmey','Sina','Tola','Udom','Virak','Yuthea'];
const LAST = ['Chan','Sok','Heng','Meas','Pich','Ly','Chea','Kim','San','Vong',
              'Nou','Sen','Iv','Touch','Keo','Long','Nhem','Roeun','Suon','Yin',
              'Vann','Ouk','Prak','Ros','Sarin','Thou','Ung','Vuth','Yem','Ang',
              'Chhay','Dy','Eng','Hor','Im','Khun','Lim','Mao','Nget','Or',
              'Phon','Reth','Sath','Tep','Uch','Var','Yoeun','Chhun','Deth','Ek'];

const N_CUSTOMERS = 800;
const insCustomer = db.prepare(`INSERT INTO customer (full_name, date_of_birth, national_id, customer_since_date) VALUES (?,?,?,?)`);
const customers = [];
const usedNationalIds = new Set();
function uniqueNationalId() {
    let id;
    do { id = 'NID' + faker.string.numeric(9); } while (usedNationalIds.has(id));
    usedNationalIds.add(id);
    return id;
}
for (let i = 1; i <= N_CUSTOMERS; i++) {
    const age = sampleGerman().age; // real age distribution
    // faker.date.birthdate picks a realistic month/day for the exact target
    // age (leap years etc. handled correctly) instead of a manually capped range
    const dobStr = faker.date.birthdate({ min: age, max: age, mode: 'age', refDate: TODAY }).toISOString().slice(0, 10);
    const sinceDaysAgo = rint(180, 3650);
    const sinceDate = addDays(TODAY, -sinceDaysAgo);
    const fullName = `${pick(FIRST)} ${pick(LAST)}`;
    const nationalId = uniqueNationalId();
    insCustomer.run(fullName, dobStr, nationalId, sinceDate);
    pgInsert('customer', ['full_name', 'date_of_birth', 'national_id', 'customer_since_date'], [fullName, dobStr, nationalId, sinceDate]);
    customers.push({ id: i, bucket: i % 5, sinceDate });
}

// ---------------------------------------------------------------------------
// 3. Income Source
// ---------------------------------------------------------------------------
const incomeOf = {}; // customer_id -> total declared monthly income (drives income deposits below)
const insIncome = db.prepare(`INSERT INTO income_source (customer_id, income_type, monthly_income, effective_date) VALUES (?,?,?,?)`);
function addIncome(customerId, type, amount, effDate) {
    incomeOf[customerId] = (incomeOf[customerId] || 0) + amount;
    insIncome.run(customerId, type, amount, effDate);
    pgInsert('income_source', ['customer_id', 'income_type', 'monthly_income', 'effective_date'], [customerId, type, amount, effDate]);
}
customers.forEach(c => {
    const type = c.bucket === 4 ? pick(['salary', 'other']) : pick(['salary', 'business']);
    const amount = c.bucket <= 1 ? round2(rnd(1200, 3000)) : c.bucket <= 3 ? round2(rnd(600, 1500)) : round2(rnd(300, 900));
    addIncome(c.id, type, amount, addDays(c.sinceDate, rint(0, Math.min(180, daysAgo(c.sinceDate)))));
    if (c.bucket <= 3 && chance(0.3)) {
        addIncome(c.id, 'rental', round2(rnd(150, 600)), addDays(c.sinceDate, rint(0, Math.min(365, daysAgo(c.sinceDate)))));
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
    accounts.push({ id: accId1, customerId: c.id, bucket: c.bucket, openDate: c.sinceDate, primary: true });

    if (chance(0.35)) {
        const openDate = addDays(c.sinceDate, rint(0, Math.min(365, daysAgo(c.sinceDate))));
        insAccount.run(c.id, 'current', openDate, 'active');
        const accId2 = db.prepare('SELECT last_insert_rowid() AS id').get().id;
        pgInsert('account', ['customer_id', 'account_type', 'open_date', 'status'], [c.id, 'current', openDate, 'active']);
        accounts.push({ id: accId2, customerId: c.id, bucket: c.bucket, openDate, primary: false });
    }
});

// ---------------------------------------------------------------------------
// 5. Transaction (last 12 months, never before the account opened)
//    Primary account: one income deposit per month ~ the customer's declared income.
//    Spending: a few purchases per month per account; total spend as a share of
//    income depends on the risk bucket (low-risk customers spend less of what comes in).
// ---------------------------------------------------------------------------
const CATEGORIES = ['income', 'groceries', 'utilities', 'rent', 'transfer', 'entertainment', 'healthcare',
                     'transport', 'education', 'insurance', 'dining', 'shopping', 'fuel', 'subscription',
                     'travel', 'atm_withdrawal'];
const SPEND_CATEGORIES = CATEGORIES.filter(c => c !== 'income');
const insTxn = db.prepare(`INSERT INTO "transaction" (account_id, transaction_date, amount, category) VALUES (?,?,?,?)`);
function addTxn(accountId, date, amount, cat) {
    insTxn.run(accountId, date, amount, cat);
    pgInsert('transaction', ['account_id', 'transaction_date', 'amount', 'category'], [accountId, date, amount, cat]);
}
const accountsOf = {};
accounts.forEach(a => (accountsOf[a.customerId] = accountsOf[a.customerId] || []).push(a));
customers.forEach(c => {
    const accs = accountsOf[c.id];
    const income = incomeOf[c.id] || 0;
    // share of monthly income spent: low risk 45-80%, medium 70-100%, high 90-125%
    const [lo, hi] = c.bucket <= 1 ? [0.45, 0.8] : c.bucket <= 3 ? [0.7, 1.0] : [0.9, 1.25];
    for (let m = 0; m < 12; m++) {
        const monthStart = addDays(TODAY, -(m + 1) * 30 + 1); // 30-day windows counting back from today
        const open = accs.filter(a => a.openDate <= monthStart);
        if (!open.length) continue;
        const inMonth = () => addDays(monthStart, rint(0, 29));
        const primary = open.find(a => a.primary);
        if (primary && income > 0) addTxn(primary.id, inMonth(), round2(income * rnd(0.95, 1.05)), 'income');
        const budget = income * rnd(lo, hi);
        open.forEach(a => {
            const n = rint(2, 6);
            for (let k = 0; k < n; k++) {
                const amount = Math.max(5, budget / open.length / n * rnd(0.6, 1.4));
                addTxn(a.id, inMonth(), -round2(amount), pick(SPEND_CATEGORIES));
            }
        });
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
        if (date < a.openDate) continue; // no snapshot before the account existed
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
    if (c.bucket <= 3 && chance(0.3)) {
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
    if (!chance(0.4)) return; // ~40% of customers submit an application

    const g = sampleGerman(); // real amount / duration / good-bad label
    // Pick the product whose tenor is closest to the sampled real duration
    const product = productRows.reduce((best, p) =>
        Math.abs(p.tenor_months - g.duration) < Math.abs(best.tenor_months - g.duration) ? p : best, productRows[0]);
    const requestedAmount = round2(Math.min(product.max_amount, Math.max(product.min_amount, g.amount)));
    // after the customer joined, and at least 5 days ago so the payout (app + 5 days) is not in the future
    const appDate = addDays(TODAY, -rint(5, Math.max(5, Math.min(365, daysAgo(c.sinceDate)))));

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
        // Delinquency risk follows the actual score/grade, not an unrelated bucket.
        // Approved applications are always grade A/B/C (status requires score >= 600),
        // so risk still increases monotonically as grade worsens, with a small
        // non-zero chance even for A/B (real prime borrowers occasionally default too).
        const delinquencyChance = grade === 'A' ? 0.02 : grade === 'B' ? 0.05 : 0.20;
        const risky = chance(delinquencyChance);
        // Status and outstanding balance are worked out from the repayment history (section 11),
        // so they always agree with the dates. Inserted with placeholders here, updated there.
        insLoanAcct.run(applicationId, requestedAmount, disbDate, requestedAmount, 'current');
        const loanAccountId = db.prepare('SELECT last_insert_rowid() AS id').get().id;
        loanAccounts.push({ id: loanAccountId, applicationId, disbDate, principal: requestedAmount, risky, grade,
            tenor: product.tenor_months, productId: product.product_id, productName: product.product_name });
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
// 11. Payment History (monthly installments; risky/delinquent accounts -> late/missed)
// ---------------------------------------------------------------------------
const insPay = db.prepare(`INSERT INTO payment_history (loan_account_id, due_date, amount_due, amount_paid, status) VALUES (?,?,?,?,?)`);
// Only installments already due by TODAY get a payment record. The loan's status and
// outstanding balance then follow from that record.
const updLoan = db.prepare(`UPDATE loan_account SET outstanding_balance = ?, status = ? WHERE loan_account_id = ?`);
loanAccounts.forEach(la => {
    const installment = round2(la.principal / la.tenor);
    let paidTotal = 0, nDue = 0;
    const pgPayments = []; // emitted after the loan_account row so the Postgres FK is satisfied
    la.firstMissed = null;
    for (let m = 1; m <= la.tenor; m++) {
        const dueDate = addDays(la.disbDate, m * 30);
        if (dueDate > TODAY_STR) break; // not due yet
        let paid = installment, status = 'on_time';
        if (la.risky) {
            const roll = faker.number.float({ min: 0, max: 1, fractionDigits: 4 });
            if (roll < 0.3) { paid = 0; status = 'missed'; if (!la.firstMissed) la.firstMissed = dueDate; }
            else if (roll < 0.5) { paid = round2(installment * 0.6); status = 'late'; }
        }
        paidTotal += paid;
        nDue = m;
        insPay.run(la.id, dueDate, installment, paid, status);
        pgPayments.push([la.id, dueDate, installment, paid, status]);
    }
    la.outstanding = Math.max(0, round2(la.principal - paidTotal));
    la.dpd = la.firstMissed ? daysAgo(la.firstMissed) : 0; // days past due of the oldest missed installment
    la.status = la.dpd >= 180 ? 'written_off'
              : la.dpd >= 30 ? 'delinquent'
              : (nDue === la.tenor && la.outstanding === 0) ? 'closed' : 'current';
    updLoan.run(la.outstanding, la.status, la.id);
    pgInsert('loan_account', ['application_id', 'principal_amount', 'disbursement_date', 'outstanding_balance', 'status'],
        [la.applicationId, la.principal, la.disbDate, la.outstanding, la.status]);
    pgPayments.forEach(v => pgInsert('payment_history', ['loan_account_id', 'due_date', 'amount_due', 'amount_paid', 'status'], v));
});

// ---------------------------------------------------------------------------
// 12. Delinquency Event
// ---------------------------------------------------------------------------
const insDelinq = db.prepare(`INSERT INTO delinquency_event (loan_account_id, event_date, days_past_due, event_type) VALUES (?,?,?,?)`);
// One event per threshold the oldest missed installment has actually reached, dated the day it was reached.
loanAccounts.filter(la => la.firstMissed).forEach(la => {
    [[30, '30dpd'], [60, '60dpd'], [90, '90dpd'], [180, 'write_off']].forEach(([days, eventType]) => {
        if (la.dpd < days) return;
        const eventDate = addDays(la.firstMissed, days);
        insDelinq.run(la.id, eventDate, days, eventType);
        pgInsert('delinquency_event', ['loan_account_id', 'event_date', 'days_past_due', 'event_type'], [la.id, eventDate, days, eventType]);
    });
});

// ---------------------------------------------------------------------------
// 13. Collateral (secured products only)
// ---------------------------------------------------------------------------
const insCollateral = db.prepare(`INSERT INTO collateral (loan_account_id, collateral_type, estimated_value) VALUES (?,?,?)`);
loanAccounts.filter(la => ['Auto Loan', 'Home Improvement Loan'].includes(la.productName) && chance(0.7))
    .forEach(la => {
        const type = la.productName === 'Auto Loan' ? 'vehicle' : 'property';
        const value = round2(la.principal * rnd(1.1, 1.5));
        insCollateral.run(la.id, type, value);
        pgInsert('collateral', ['loan_account_id', 'collateral_type', 'estimated_value'], [la.id, type, value]);
    });

db.exec('COMMIT');

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
