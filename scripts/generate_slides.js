// Generator for docs/Stage2_Presentation.pptx (Stage 2: workflow, database, scoring results)
// Run: node scripts/generate_slides.js   (needs: npm install --no-save pptxgenjs)
//
// Scorecard numbers come from the stored run in calculated_risk_score (scripts/06)
// — keep them in sync if 06 is re-run. Default-rate evidence is computed from
// bootstrap/german_credit.data (UCI, 1,000 real loans, 30% labelled bad).
const path = require("path");
const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
pres.title = "Retail Credit Risk Scoring — Stage 2";

const NAVY = "1F3864";
const BLUE = "4472C4";
const LIGHT = "EEF2F9";
const GREY = "595959";
const MUTED = "8C8C8C";
const FONT = "Calibri";
// Colour = decision (approve blue / reject red), same as the dashboard; grade letters are always labelled
const GRADE_COLORS = { A: "2A78D6", B: "2A78D6", C: "2A78D6", D: "E34948", E: "E34948" };

const W = 13.33;
const MX = 0.6; // side margin

// ---------------------------------------------------------------- helpers
function base(section, title, notes) {
    const s = pres.addSlide();
    s.background = { color: "FFFFFF" };
    s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: NAVY }, line: { color: NAVY } });
    if (section) {
        s.addText(section.toUpperCase(), {
            x: MX, y: 0.35, w: 9, h: 0.3, fontFace: FONT, fontSize: 12, bold: true, color: BLUE, charSpacing: 2, margin: 0,
        });
    }
    s.addText(title, { x: MX, y: 0.65, w: W - 2 * MX, h: 0.7, fontFace: FONT, fontSize: 28, bold: true, color: NAVY, margin: 0 });
    if (notes) s.addNotes(notes);
    return s;
}

function text(s, t, opts) {
    s.addText(t, { fontFace: FONT, fontSize: 16, color: GREY, valign: "top", margin: 0, ...opts });
}

function bullets(s, items, opts) {
    s.addText(
        items.map((it) => {
            const [t, sub] = Array.isArray(it) ? it : [it, null];
            const runs = [{ text: t, options: { bullet: { indent: 18 }, breakLine: true, paraSpaceAfter: sub ? 2 : 8 } }];
            if (sub) runs.push({ text: sub, options: { bullet: { characterCode: "00A0", indent: 18 }, fontSize: (opts.fontSize || 16) - 3, color: MUTED, breakLine: true, paraSpaceAfter: 8 } });
            return runs;
        }).flat(),
        { fontFace: FONT, fontSize: 16, color: GREY, valign: "top", margin: 0, ...opts },
    );
}

function card(s, x, y, w, h, title, body, color) {
    s.addShape(pres.ShapeType.rect, { x, y, w, h, fill: { color: LIGHT }, line: { color: LIGHT } });
    s.addShape(pres.ShapeType.rect, { x, y, w: 0.07, h, fill: { color: color || BLUE }, line: { color: color || BLUE } });
    s.addText(title, { x: x + 0.25, y: y + 0.15, w: w - 0.4, h: 0.4, fontFace: FONT, fontSize: 17, bold: true, color: NAVY, margin: 0 });
    if (Array.isArray(body)) bullets(s, body, { x: x + 0.25, y: y + 0.6, w: w - 0.4, h: h - 0.7, fontSize: 14 });
    else text(s, body, { x: x + 0.25, y: y + 0.6, w: w - 0.4, h: h - 0.7, fontSize: 14 });
}

// rows: array of arrays of strings (first row = header)
function table(s, rows, opts) {
    const fs = opts.fontSize || 13;
    const data = rows.map((r, i) =>
        r.map((c) => {
            const cell = typeof c === "object" ? c : { text: String(c) };
            const o = {
                fontFace: FONT, fontSize: fs, color: i === 0 ? "FFFFFF" : GREY, bold: i === 0,
                fill: { color: i === 0 ? NAVY : i % 2 ? "FFFFFF" : "F5F7FB" },
                valign: "middle", margin: [4, 6, 4, 6],
                border: { type: "solid", pt: 0.5, color: "D9D9D9" },
                ...(cell.options || {}),
            };
            return { text: cell.text, options: o };
        }),
    );
    s.addTable(data, { x: opts.x, y: opts.y, w: opts.w, colW: opts.colW, rowH: opts.rowH, autoPage: false });
}

function footer(s, t) {
    s.addText(t, { x: MX, y: 6.85, w: W - 2 * MX, h: 0.35, fontFace: FONT, fontSize: 11, italic: true, color: MUTED, margin: 0 });
}

// =============================================================== 1. Title
{
    const s = pres.addSlide();
    s.background = { color: NAVY };
    s.addText("DATA ANALYTICS 1 — ASSIGNMENT, STAGE 2", { x: 0.9, y: 2.0, w: 11, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: "A9C1E8", charSpacing: 2, margin: 0 });
    s.addText("Retail Credit Risk Scoring", { x: 0.9, y: 2.5, w: 11.5, h: 1.0, fontFace: FONT, fontSize: 44, bold: true, color: "FFFFFF", margin: 0 });
    s.addText("Workflow, database & scoring results", { x: 0.9, y: 3.5, w: 11.5, h: 0.6, fontFace: FONT, fontSize: 24, color: "D6E0F0", margin: 0 });
    s.addShape(pres.ShapeType.rect, { x: 0.9, y: 4.4, w: 1.2, h: 0.06, fill: { color: "A9C1E8" }, line: { color: "A9C1E8" } });
    s.addNotes("Stage 1 covered the business model and requirements. Stage 2 shows how we built it: the data workflow, the database, the scoring logic, and the results.");
}

// =============================================================== 2. Business problem
{
    const s = base("Recap", "Business problem & goal",
        "Quick recap from stage 1. The key point: the score must use internal data only and must be explainable — every criteria and weight is traceable.");
    card(s, MX, 1.7, 5.8, 3.4, "Problem", [
        "Loans that default cost the bank money",
        "Manual review by loan officers is slow and inconsistent — two officers can decide differently on the same customer",
    ], "C62828");
    card(s, MX + 6.3, 1.7, 5.8, 3.4, "Goal", [
        ["Score every customer consistently", "A score of 300–850 and a risk grade A–E"],
        ["Use internal data only", "Accounts, transactions, income, repayment history — no credit bureau"],
        ["Score in two ways", "Reactive: when a loan application arrives · Proactive: a batch scan of existing customers to make loan offers"],
        ["Keep it explainable", "Every criteria and weight is visible, not a black box"],
    ], "2E7D32");
}

// =============================================================== 3. Agenda
{
    const s = base("Stage 2", "What we built",
        "Stage 2 walk-through, in the order the data flows.");
    const items = [
        ["1", "Workflow", "From raw data to a stored score"],
        ["2", "Database", "13 tables in PostgreSQL"],
        ["3", "Analytical questions", "12 metrics, each answering one business question — with real-data evidence"],
        ["4", "Scoring", "Weights, points, score range & grades, worked examples"],
        ["5", "Results", "Grade distribution for 800 customers"],
        ["6", "Dashboard", "Interactive report of the results"],
        ["7", "Data quality & limitations", "What to watch out for"],
    ];
    items.forEach(([n, t, d], i) => {
        const y = 1.65 + i * 0.72;
        s.addShape(pres.ShapeType.ellipse, { x: MX, y, w: 0.55, h: 0.55, fill: { color: NAVY }, line: { color: NAVY } });
        s.addText(n, { x: MX, y, w: 0.55, h: 0.55, align: "center", valign: "middle", fontFace: FONT, fontSize: 18, bold: true, color: "FFFFFF", margin: 0 });
        s.addText(t, { x: MX + 0.8, y: y - 0.02, w: 4.5, h: 0.6, fontFace: FONT, fontSize: 20, bold: true, color: NAVY, valign: "middle", margin: 0 });
        s.addText(d, { x: MX + 4.6, y: y - 0.02, w: 7.2, h: 0.6, fontFace: FONT, fontSize: 16, color: GREY, valign: "middle", margin: 0 });
    });
}

// =============================================================== 4. Workflow
{
    const s = base("1 · Workflow", "End-to-end workflow",
        "Read left to right. Steps 3–5 are SQL script files in the scripts/ folder, run in order 01 to 07. Scripts 01–05 each compute one criteria, so each one's logic can be reviewed on its own; 06 combines them and saves the result; 07 checks it.");
    // [title, description, file caption, fill]
    const steps = [
        ["Generate data", "Real UCI German Credit loans + Faker → consistent data for 800 customers", "generate_data.js", "D6E0F0"],
        ["Store in database", "PostgreSQL, 13 tables linked by customer", "01_schema.sql", "B4C7E7"],
        ["Compute metrics", "One script per criteria: raw data → metric points for every customer", "scripts 01–05", "8FAADC"],
        ["Calculate score", "Weight the 5 criteria → score 300–850 → grade A–E, saved per customer", "script 06", "8FAADC"],
        ["Check results", "Grade distribution and a 20-customer spot check", "script 07", "8FAADC"],
        ["Dashboard", "Streamlit report on the results", "", "2E7D32"],
    ];
    const n = steps.length, gap = 0.22, bw = (W - 2 * MX - gap * (n - 1)) / n, y = 1.9, h = 2.6;
    steps.forEach(([t, d, file, c], i) => {
        const x = MX + i * (bw + gap);
        const dark = i === n - 1;
        s.addShape(pres.ShapeType.rect, { x, y, w: bw, h, fill: { color: c }, line: { color: c } });
        s.addText(String(i + 1), { x, y: y + 0.12, w: bw, h: 0.35, align: "center", fontFace: FONT, fontSize: 14, bold: true, color: dark ? "FFFFFF" : BLUE, margin: 0 });
        s.addText(t, { x: x + 0.08, y: y + 0.45, w: bw - 0.16, h: 0.5, align: "center", valign: "middle", fontFace: FONT, fontSize: 16, bold: true, color: dark ? "FFFFFF" : NAVY, margin: 0 });
        s.addText(d, { x: x + 0.12, y: y + 1.0, w: bw - 0.24, h: 1.1, align: "center", valign: "top", fontFace: FONT, fontSize: 12.5, color: dark ? "FFFFFF" : GREY, margin: 0 });
        if (file) s.addText(file, { x: x + 0.08, y: y + h - 0.45, w: bw - 0.16, h: 0.3, align: "center", fontFace: "Consolas", fontSize: 11, color: NAVY, margin: 0 });
        if (i < n - 1) {
            s.addShape(pres.ShapeType.line, { x: x + bw + 0.02, y: y + h / 2, w: gap - 0.04, h: 0, line: { color: NAVY, width: 1.5, endArrowType: "triangle" } });
        }
    });
    // phase brackets
    const phase = (from, to, label) => {
        const x1 = MX + from * (bw + gap), x2 = MX + to * (bw + gap) + bw;
        s.addShape(pres.ShapeType.line, { x: x1, y: y + h + 0.3, w: x2 - x1, h: 0, line: { color: MUTED, width: 1 } });
        s.addText(label, { x: x1, y: y + h + 0.4, w: x2 - x1, h: 0.4, align: "center", fontFace: FONT, fontSize: 14, bold: true, color: MUTED, margin: 0 });
    };
    phase(0, 1, "Data & database");
    phase(2, 4, "Scoring (SQL)");
    phase(5, 5, "Reporting");
    text(s, "The scoring is split into numbered SQL scripts (01–07), run in order, so each step can be checked on its own. Every script is safe to re-run.",
        { x: MX, y: 5.85, w: W - 2 * MX, h: 0.6, fontSize: 15 });
}

// =============================================================== 5. Database
{
    const s = base("2 · Database", "Database: 13 tables in 4 groups",
        "Every table traces back to customer. The scorecard reads the raw tables and writes its result into calculated_risk_score.");
    const groups = [
        ["Customer", ["customer", "income_source"]],
        ["Banking behaviour", ["account", "transaction", "account_balance_history"]],
        ["Loan lifecycle", ["loan_product", "loan_offer", "loan_application", "loan_account", "payment_history", "delinquency_event"]],
        ["Scoring", ["risk_score", "calculated_risk_score (our output)"]],
    ];
    const gw = 2.0, gx0 = MX;
    groups.forEach(([g, tables], i) => {
        const x = gx0 + i * (gw + 0.15);
        s.addShape(pres.ShapeType.rect, { x, y: 1.7, w: gw, h: 0.5, fill: { color: NAVY }, line: { color: NAVY } });
        s.addText(g, { x, y: 1.7, w: gw, h: 0.5, align: "center", valign: "middle", fontFace: FONT, fontSize: 14, bold: true, color: "FFFFFF", margin: 0 });
        tables.forEach((t, j) => {
            const y = 2.3 + j * 0.55;
            s.addShape(pres.ShapeType.rect, { x, y, w: gw, h: 0.47, fill: { color: LIGHT }, line: { color: "D6E0F0" } });
            s.addText(t, { x: x + 0.05, y, w: gw - 0.1, h: 0.47, align: "center", valign: "middle", fontFace: "Consolas", fontSize: t.length > 22 ? 9.5 : 11, color: NAVY, margin: 0 });
        });
    });
    // volumes
    const vx = MX + 4 * (gw + 0.15) + 0.25;
    s.addText("Data volume", { x: vx, y: 1.7, w: 3.3, h: 0.5, fontFace: FONT, fontSize: 16, bold: true, color: NAVY, margin: 0, valign: "middle" });
    const vols = [["800", "customers"], ["1,063", "accounts"], ["21,260", "transactions"], ["341", "loan applications"], ["240", "loan accounts"], ["1,440", "scheduled payments"]];
    vols.forEach(([n, l], i) => {
        const y = 2.3 + i * 0.55;
        s.addText([
            { text: n + "  ", options: { bold: true, color: NAVY, fontSize: 20 } },
            { text: l, options: { color: GREY, fontSize: 14 } },
        ], { x: vx, y, w: 3.3, h: 0.47, fontFace: FONT, valign: "middle", margin: 0 });
    });
    bullets(s, [
        "Every table links back to customer, so one customer's income, accounts, transactions and loans can be joined into one picture",
        "calculated_risk_score holds the output of our SQL scorecard: one row per customer with each criteria's points, the score and the grade",
    ], { x: MX, y: 5.75, w: W - 2 * MX, h: 1.1, fontSize: 14 });
}

// =============================================================== 6. Data source
{
    const s = base("2 · Database", "Where the data comes from",
        "The data is synthetic but grounded in a real dataset where one exists. We also use the same real dataset later as evidence that our metrics relate to default.");
    card(s, MX, 1.7, 5.8, 2.6, "Real data: UCI German Credit (1,000 loans)", [
        ["Use 1 — make the mock data realistic", "Real ages, loan amounts and loan terms; the real good / bad outcome decides which mock loans are approved and which fall behind on payments"],
        ["Use 2 — evidence for our metrics", "Default rates in the real loans show each metric points the right way (section 3)"],
    ], NAVY);
    card(s, MX + 6.3, 1.7, 5.8, 2.6, "Generated (Faker + rules)", [
        "Names, dates, transaction amounts & categories",
        "Balance trends and account tenure",
        "Rules keep each customer's accounts, transactions and loans consistent with one risk level",
    ], BLUE);
    s.addShape(pres.ShapeType.rect, { x: MX, y: 4.55, w: W - 2 * MX, h: 1.1, fill: { color: LIGHT }, line: { color: LIGHT } });
    text(s, [
        { text: "Note: ", options: { bold: true, color: NAVY } },
        { text: "the scorecard itself (SQL scripts 01–07) never reads the UCI file — it only scores the 13 tables in our PostgreSQL database." },
    ], { x: MX + 0.25, y: 4.6, w: W - 2 * MX - 0.5, h: 1.0, fontSize: 16, valign: "middle" });
}

// =============================================================== Sample of the real dataset
{
    const s = base("2 · Database", "What the real data looks like",
        "First 5 rows of bootstrap/german_credit.data, decoded with the UCI code list. Point out: each row is one loan, the only outcome is good/bad (no score), and there are no transactions or balances over time — that is why the rest of our data is generated.");
    s.addText("RAW FILE — one line per applicant, mostly codes", { x: MX, y: 1.5, w: 8, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color: MUTED, charSpacing: 1, margin: 0 });
    s.addShape(pres.ShapeType.rect, { x: MX, y: 1.85, w: W - 2 * MX, h: 0.5, fill: { color: "F2F2F2" }, line: { color: "D9D9D9" } });
    s.addText("A11 6 A34 A43 1169 A65 A75 4 A93 A101 4 A121 67 A143 A152 2 A173 1 A192 A201 1", {
        x: MX + 0.2, y: 1.85, w: W - 2 * MX - 0.4, h: 0.5, fontFace: "Consolas", fontSize: 14, color: NAVY, valign: "middle", margin: 0,
    });
    s.addText("DECODED — 5 real applicants, only the columns we use", { x: MX, y: 2.6, w: 8, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color: MUTED, charSpacing: 1, margin: 0 });
    const outcome = (o) => ({ text: o, options: { bold: true, color: o === "Good" ? "2E7D32" : "C62828" } });
    table(s, [
        ["Applicant", "Checking balance", "Loan amount", "Duration", "Installment burden", "Years in job", "Age", "Outcome"],
        ["1", "< 0 DM", "1,169 DM", "6 months", "4 (high)", "7+", "67", outcome("Good")],
        ["2", "0–200 DM", "5,951 DM", "48 months", "2", "1–4", "22", outcome("Bad")],
        ["3", "No account", "2,096 DM", "12 months", "2", "4–7", "49", outcome("Good")],
        ["4", "< 0 DM", "7,882 DM", "42 months", "2", "4–7", "45", outcome("Good")],
        ["5", "< 0 DM", "4,870 DM", "24 months", "3", "1–4", "53", outcome("Bad")],
    ], { x: MX, y: 2.95, w: W - 2 * MX, colW: [1.1, 1.75, 1.55, 1.45, 1.9, 1.4, 0.9, 2.08], rowH: 0.42, fontSize: 14 });
    bullets(s, [
        ["1,000 real loans, 20 attributes each, outcome = good or bad", "No credit score in the data — only whether the loan was repaid"],
        ["No transactions, balances over time or payment history", "That is why our accounts, transactions and payments are generated"],
    ], { x: MX, y: 5.65, w: W - 2 * MX, h: 1.2, fontSize: 15 });
}

// =============================================================== 3. Analytical questions
const QUESTIONS = [
    ["Payment Behaviour", "% on-time payments", "Does the customer pay their installments on time?", "more on-time payments"],
    ["", "Worst delinquency", "Has the customer ever fallen seriously behind?", "no or only mild delinquency"],
    ["Income & Capacity", "Monthly income level", "Does the customer earn enough to repay?", "higher income"],
    ["", "Income diversification", "Would income continue if one source stopped?", "2+ income sources"],
    ["", "Debt-to-income", "Is the loan reasonable for this income?", "smaller loan vs income"],
    ["Transaction Behaviour", "Transaction volume", "Is account activity normal, or dormant / erratic?", "activity close to typical"],
    ["", "Spend-to-income", "Does the customer spend more than they earn?", "lower spending vs income"],
    ["", "Balance trend", "Is the customer's balance growing or shrinking?", "rising balance"],
    ["Account Relationship", "Account tenure", "How long has the customer banked with us?", "longer relationship"],
    ["", "Account status", "Are the customer's accounts still in use?", "all accounts active"],
    ["Demographics & Loan", "Age", "Is the customer in the lowest-default age range?", "age near 42"],
    ["", "Amount vs product range", "Is the customer asking for the top of what the product allows?", "smaller share of the range"],
];
{
    const s = base("3 · Analytical questions", "Every metric answers one analytical question",
        "This is the bridge from business question to score. Each of the 12 metrics is a question a loan officer would ask; the SQL answers it the same way for every customer and turns the answer into points.");
    const rows = [["Criteria", "Metric", "Analytical question", "Score goes up with…"]];
    QUESTIONS.forEach(([c, m, q, up]) => rows.push([
        c ? { text: c, options: { bold: true, color: NAVY } } : "",
        m, q,
        { text: "▲ " + up, options: { color: "2E7D32" } },
    ]));
    table(s, rows, { x: MX, y: 1.55, w: W - 2 * MX, colW: [2.5, 2.4, 4.53, 2.7], rowH: 0.38, fontSize: 12.5 });
}
{
    const s = base("3 · Analytical questions", "Evidence: these factors predict default in real loans",
        "Each chart uses the real UCI German Credit data (1,000 loans, 30% defaulted). Each bar is the % of loans in that group that went bad. It is not our mock data, so it is independent evidence that the direction of each metric is right. Employment length is a proxy for account tenure (both measure stability over time).");
    const panels = [
        ["Income & Capacity", "Installment as % of disposable income", ["1 (low)", "2", "3", "4 (high)"], [25.0, 26.8, 28.7, 33.4], "Bigger repayment burden → more defaults"],
        ["Transaction Behaviour", "Checking account balance (DM)", ["< 0", "0–200", "≥ 200"], [49.3, 39.0, 22.2], "Higher balance → fewer defaults"],
        ["Account Relationship (proxy)", "Years in current job", ["None", "< 1", "1–4", "4–7", "7+"], [37.1, 40.7, 30.7, 22.4, 25.3], "More stability → fewer defaults"],
        ["Demographics — age", "Years away from age 42", ["0–5", "6–10", "11–15", "16+"], [26.1, 23.2, 31.7, 36.8], "Further from 42 → more defaults"],
        ["Demographics — loan", "Loan amount (DM)", ["< 1.5k", "1.5–3k", "3–6k", "6k+"], [28.8, 24.8, 28.6, 45.6], "Largest loans → most defaults"],
    ];
    const ch = 2.55, gx = 0.25, gy = 0.15, y0 = 1.5;
    const cell = (i) => {
        const perRow = i < 3 ? 3 : 2, col = i < 3 ? i : i - 3;
        const w = (W - 2 * MX - gx * (perRow - 1)) / perRow;
        return { x: MX + col * (w + gx), y: y0 + (i < 3 ? 0 : ch + gy), w };
    };
    panels.forEach(([crit, title, labels, vals, takeaway], j) => {
        const { x, y, w: cw } = cell(j);
        s.addShape(pres.ShapeType.rect, { x, y, w: cw, h: ch, fill: { color: LIGHT }, line: { color: LIGHT } });
        s.addText(crit.toUpperCase(), { x: x + 0.2, y: y + 0.12, w: cw - 0.4, h: 0.28, fontFace: FONT, fontSize: 10.5, bold: true, color: BLUE, charSpacing: 1, margin: 0 });
        s.addText(title, { x: x + 0.2, y: y + 0.38, w: cw - 0.4, h: 0.32, fontFace: FONT, fontSize: 13, bold: true, color: NAVY, margin: 0 });
        s.addChart(pres.ChartType.bar, [{ name: "Default rate", labels, values: vals.map((v) => v / 100) }], {
            x: x + 0.1, y: y + 0.7, w: cw - 0.2, h: 1.45, barDir: "col", barGapWidthPct: 40,
            chartColors: [BLUE], showValue: true, dataLabelFormatCode: "0%", dataLabelFontSize: 10, dataLabelColor: GREY, dataLabelPosition: "outEnd",
            catAxisLabelFontSize: 10, catAxisLabelColor: GREY, catAxisLabelFontFace: FONT,
            valAxisHidden: true, valAxisMaxVal: 0.6, valAxisMinVal: 0, valGridLine: { style: "none" },
            showLegend: false, showTitle: false,
        });
        s.addText(takeaway, { x: x + 0.2, y: y + 2.15, w: cw - 0.4, h: 0.3, fontFace: FONT, fontSize: 12, italic: true, color: GREY, margin: 0 });
    });
    footer(s, "Bars = share of applicants who defaulted, in 1,000 real loans (UCI Statlog German Credit Data; average 30%). Balance chart leaves out applicants with no checking account.");
}

// =============================================================== 7. Scorecard structure
{
    const s = base("4 · Scoring", "How the score is built: a weighted scorecard",
        "Same structure as FICO-style scorecards. Every metric becomes points from 0 to 100, so different units (money, counts, ratios) can be combined.");
    const steps = [
        ["1", "Metric → points", "Each metric is put into a band and gets 0–100 points"],
        ["2", "Average per criteria", "Criteria points = average of its metric points"],
        ["3", "Weighted sum", "Composite (0–100) = Σ weight × criteria points"],
        ["4", "Scale", "Score = 300 + composite × 5.5  (range 300–850)"],
        ["5", "Grade", "Score → grade A–E → approve / reject"],
    ];
    const bw = 2.25, gap = 0.21, y = 1.9;
    steps.forEach(([n, t, d], i) => {
        const x = MX + i * (bw + gap);
        s.addShape(pres.ShapeType.rect, { x, y, w: bw, h: 2.3, fill: { color: LIGHT }, line: { color: "D6E0F0" } });
        s.addText(n, { x, y: y + 0.15, w: bw, h: 0.5, align: "center", fontFace: FONT, fontSize: 26, bold: true, color: BLUE, margin: 0 });
        s.addText(t, { x: x + 0.1, y: y + 0.7, w: bw - 0.2, h: 0.5, align: "center", fontFace: FONT, fontSize: 16, bold: true, color: NAVY, margin: 0 });
        s.addText(d, { x: x + 0.15, y: y + 1.2, w: bw - 0.3, h: 1.0, align: "center", fontFace: FONT, fontSize: 13, color: GREY, margin: 0 });
        if (i < steps.length - 1)
            s.addShape(pres.ShapeType.line, { x: x + bw + 0.02, y: y + 1.15, w: gap - 0.04, h: 0, line: { color: NAVY, width: 1.5, endArrowType: "triangle" } });
    });
    s.addShape(pres.ShapeType.rect, { x: MX, y: 4.6, w: W - 2 * MX, h: 1.5, fill: { color: "F2F2F2" }, line: { color: "D9D9D9" } });
    s.addText(
        "Composite = 0.35×Payment + 0.25×Income + 0.20×Transaction + 0.10×Account + 0.10×Demographics\n" +
        "Score     = ROUND(300 + Composite × 5.5)",
        { x: MX + 0.3, y: 4.7, w: W - 2 * MX - 0.6, h: 1.3, fontFace: "Consolas", fontSize: 16, color: NAVY, valign: "middle", margin: 0 },
    );
    footer(s, "Why 5.5? It maps the 0–100 composite onto the 300–850 score range: (850 − 300) ÷ 100 = 5.5.");
}

// =============================================================== Score range & grades
{
    const s = base("4 · Scoring", "Why 300–850, and what makes an A or an E",
        "The 300–850 range is only the display scale; the ranking of customers comes from the 0–100 composite. The grade cut-offs are a policy choice by the bank, not a calculation — a bank with more appetite for risk would set them lower.");
    card(s, MX, 1.6, 5.3, 2.75, "Why 300–850?", [
        ["Same range as FICO, the best-known credit score", "Anyone who has seen a credit score can read ours"],
        ["Simple conversion from the composite", "Score = 300 + composite × 5.5 → composite 0 = 300, composite 100 = 850"],
        ["The scale doesn't change who ranks higher", "It only makes the result easier to read and compare"],
    ], NAVY);
    const gx = MX + 5.6, gw = W - MX - gx;
    table(s, [
        ["Grade", "Score", "Risk", "Decision"],
        ...[["A", "750–850", "Very low", "Approve"], ["B", "680–749", "Low", "Approve"], ["C", "600–679", "Moderate", "Approve"], ["D", "500–599", "High", "Reject"], ["E", "300–499", "Very high", "Reject"]]
            .map(([g, sc, r, d]) => [
                { text: g, options: { bold: true, color: "FFFFFF", fill: { color: GRADE_COLORS[g] }, align: "center", fontSize: 16 } },
                sc, r,
                { text: d, options: { bold: true, color: d === "Approve" ? "2A78D6" : "E34948" } },
            ]),
    ], { x: gx, y: 1.6, w: gw, colW: [1.0, 1.9, 2.0, gw - 4.9], rowH: 0.82, fontSize: 16 });
    card(s, MX, 4.55, 5.3, 2.0, "Where the grade cut-offs come from", [
        ["A bank policy choice (risk appetite), not a calculation", "We set them close to FICO's bands: Good 670+, Fair 580–669, Poor below 580"],
        ["Approve from 600 (grade C and above)", "A real bank might send grade C to manual review instead"],
    ], "C88A00");
}

// =============================================================== 8. Criteria & weights
{
    const s = base("4 · Scoring", "5 criteria and their weights",
        "Weights were set by judgment, based on what usually matters most in retail scorecards. A real bank would fit them statistically on historical defaults.");
    const crit = [
        ["Payment Behaviour", 35, "Past repayment is the strongest predictor (repeat borrowers only)"],
        ["Income & Capacity", 25, "Direct measure of ability to repay"],
        ["Transaction Behaviour", 20, "Cash-flow discipline — useful for first-time borrowers"],
        ["Account Relationship", 10, "Tenure and account status as a stability signal"],
        ["Demographics & Loan Context", 10, "Kept low on purpose — a light adjustment only"],
    ];
    const x0 = MX, labelW = 3.3, barMax = 4.2, y0 = 1.8, rh = 0.72;
    crit.forEach(([n, w, why], i) => {
        const y = y0 + i * rh;
        s.addText(n, { x: x0, y, w: labelW, h: 0.5, fontFace: FONT, fontSize: 15, bold: true, color: NAVY, valign: "middle", margin: 0 });
        s.addShape(pres.ShapeType.rect, { x: x0 + labelW, y: y + 0.07, w: (barMax * w) / 35, h: 0.36, fill: { color: i === 0 ? NAVY : BLUE }, line: { color: i === 0 ? NAVY : BLUE } });
        s.addText(`${w}%`, { x: x0 + labelW + (barMax * w) / 35 + 0.1, y, w: 0.8, h: 0.5, fontFace: FONT, fontSize: 15, bold: true, color: NAVY, valign: "middle", margin: 0 });
        s.addText(why, { x: x0 + labelW + barMax + 1.0, y, w: W - MX - (x0 + labelW + barMax + 1.0), h: 0.5, fontFace: FONT, fontSize: 13, color: GREY, valign: "middle", margin: 0 });
    });
    // redistribution
    s.addShape(pres.ShapeType.rect, { x: MX, y: 5.5, w: W - 2 * MX, h: 1.2, fill: { color: LIGHT }, line: { color: LIGHT } });
    s.addText([
        { text: "First-time applicants ", options: { bold: true, color: NAVY } },
        { text: "(no loan yet, so no payment history — 560 of 800 customers): the 35% is shared out proportionally, each other weight ÷ 0.65 → " },
        { text: "Income 38.5% · Transaction 30.8% · Account 15.4% · Demographics 15.4%", options: { bold: true, color: NAVY } },
        { text: ". They are not punished with zero points for missing history." },
    ], { x: MX + 0.25, y: 5.55, w: W - 2 * MX - 0.5, h: 1.1, fontFace: FONT, fontSize: 15, color: GREY, valign: "middle", margin: 0 });
}

// =============================================================== Two ways to earn points
{
    const s = base("4 · Scoring", "How a metric turns into points",
        "Every metric ends up as 100, 70, 40 or 10 points. The only question is how we decide which band a customer lands in. Payment uses fixed limits; everything else is ranked against the other customers.");
    const colW = 5.9, y = 1.6, h = 3.65;
    // left: fixed limits
    s.addShape(pres.ShapeType.rect, { x: MX, y, w: colW, h, fill: { color: LIGHT }, line: { color: LIGHT } });
    s.addText("A. Fixed limits", { x: MX + 0.25, y: y + 0.15, w: colW - 0.5, h: 0.4, fontFace: FONT, fontSize: 18, bold: true, color: NAVY, margin: 0 });
    s.addText("Used when the number means the same for everyone", { x: MX + 0.25, y: y + 0.55, w: colW - 0.5, h: 0.35, fontFace: FONT, fontSize: 13, italic: true, color: GREY, margin: 0 });
    s.addText("Example: % of payments made on time", { x: MX + 0.25, y: y + 1.05, w: colW - 0.5, h: 0.35, fontFace: FONT, fontSize: 14, bold: true, color: GREY, margin: 0 });
    const fixed = [["≥ 95%", "100"], ["85–94%", "70"], ["70–84%", "40"], ["< 70%", "10"]];
    fixed.forEach(([r, p], i) => {
        const bx = MX + 0.25 + i * 1.36;
        s.addShape(pres.ShapeType.rect, { x: bx, y: y + 1.5, w: 1.26, h: 1.0, fill: { color: ["2E7D32", "7CB342", "F9A825", "EF6C00"][i] }, line: { color: "FFFFFF" } });
        s.addText([{ text: r, options: { fontSize: 13, breakLine: true } }, { text: p + " pts", options: { fontSize: 17, bold: true } }],
            { x: bx, y: y + 1.5, w: 1.26, h: 1.0, align: "center", valign: "middle", fontFace: FONT, color: "FFFFFF", margin: 0 });
    });
    s.addText("Paying 95% on time is good in any bank, so the limit doesn't need the other customers.",
        { x: MX + 0.25, y: y + 2.7, w: colW - 0.5, h: 0.8, fontFace: FONT, fontSize: 13, color: GREY, margin: 0 });
    // right: ranking
    const rx = MX + colW + 0.33;
    s.addShape(pres.ShapeType.rect, { x: rx, y, w: colW, h, fill: { color: LIGHT }, line: { color: LIGHT } });
    s.addText("B. Ranked against all customers", { x: rx + 0.25, y: y + 0.15, w: colW - 0.5, h: 0.4, fontFace: FONT, fontSize: 18, bold: true, color: NAVY, margin: 0 });
    s.addText("Used when there is no universal “good” value", { x: rx + 0.25, y: y + 0.55, w: colW - 0.5, h: 0.35, fontFace: FONT, fontSize: 13, italic: true, color: GREY, margin: 0 });
    s.addText("Example: monthly income — sort all 800 customers, cut into 4 groups of 200", { x: rx + 0.25, y: y + 1.05, w: colW - 0.5, h: 0.35, fontFace: FONT, fontSize: 14, bold: true, color: GREY, margin: 0 });
    const ranked = [["Top 25%", "100"], ["2nd 25%", "70"], ["3rd 25%", "40"], ["Bottom 25%", "10"]];
    ranked.forEach(([r, p], i) => {
        const bx = rx + 0.25 + i * 1.36;
        s.addShape(pres.ShapeType.rect, { x: bx, y: y + 1.5, w: 1.26, h: 1.0, fill: { color: ["2E7D32", "7CB342", "F9A825", "EF6C00"][i] }, line: { color: "FFFFFF" } });
        s.addText([{ text: r, options: { fontSize: 13, breakLine: true } }, { text: p + " pts", options: { fontSize: 17, bold: true } }],
            { x: bx, y: y + 1.5, w: 1.26, h: 1.0, align: "center", valign: "middle", fontFace: FONT, color: "FFFFFF", margin: 0 });
    });
    s.addText("Whether 1,500 a month is “high” depends on the customer base, so we compare customers with each other. This also spreads customers across all grades.",
        { x: rx + 0.25, y: y + 2.7, w: colW - 0.5, h: 0.8, fontFace: FONT, fontSize: 13, color: GREY, margin: 0 });
    bullets(s, [
        ["Fixed (4 metrics): on-time %, worst delinquency, income diversification, account status · Ranked (8 metrics): all other ratios and trends", "SQL: CASE WHEN for fixed limits, NTILE(4) for ranking"],
        ["Missing data → 55 points, the middle of 10 and 100", "e.g. no loan application yet, so no debt-to-income — the customer is neither rewarded nor punished"],
    ], { x: MX, y: 5.45, w: W - 2 * MX, h: 1.4, fontSize: 15 });
}

// =============================================================== Criteria detail (one slide per criteria)
function metricCard(s, x, y, w, h, m) {
    s.addShape(pres.ShapeType.rect, { x, y, w, h, fill: { color: LIGHT }, line: { color: LIGHT } });
    s.addShape(pres.ShapeType.rect, { x, y, w, h: 0.07, fill: { color: NAVY }, line: { color: NAVY } });
    s.addText(m.name, { x: x + 0.2, y: y + 0.2, w: w - 0.4, h: 0.4, fontFace: FONT, fontSize: 18, bold: true, color: NAVY, margin: 0 });
    s.addText("“" + m.q + "”", { x: x + 0.2, y: y + 0.62, w: w - 0.4, h: 0.65, fontFace: FONT, fontSize: 14, italic: true, color: BLUE, valign: "top", margin: 0 });
    const label = (t, ly) => s.addText(t, { x: x + 0.2, y: ly, w: w - 0.4, h: 0.25, fontFace: FONT, fontSize: 10.5, bold: true, color: MUTED, charSpacing: 1, margin: 0 });
    label("WHY IT SIGNALS RISK", y + 1.35);
    s.addText(m.why, { x: x + 0.2, y: y + 1.62, w: w - 0.4, h: 1.1, fontFace: FONT, fontSize: 13, color: GREY, valign: "top", margin: 0 });
    label("HOW WE MEASURE IT", y + 2.6);
    s.addText(m.how, { x: x + 0.2, y: y + 2.87, w: w - 0.4, h: 0.75, fontFace: FONT, fontSize: 13, color: GREY, valign: "top", margin: 0 });
    s.addShape(pres.ShapeType.rect, { x: x + 0.2, y: y + h - 0.95, w: w - 0.4, h: 0.78, fill: { color: "FFFFFF" }, line: { color: "D6E0F0" } });
    s.addText(m.points, { x: x + 0.3, y: y + h - 0.95, w: w - 0.6, h: 0.78, fontFace: FONT, fontSize: 12.5, bold: true, color: NAVY, valign: "middle", margin: 0 });
}
function criteriaSlide(title, notes, metrics, script) {
    const s = base("4 · Scoring", title, notes);
    const n = metrics.length, gap = 0.25, cw = (W - 2 * MX - gap * (n - 1)) / n;
    metrics.forEach((m, i) => metricCard(s, MX + i * (cw + gap), 1.55, cw, 4.75, m));
    footer(s, `Criteria points = average of these ${n} metrics · ${script}`);
}
criteriaSlide("Criteria 1 — Payment Behaviour (35%)",
    "Only the 240 customers who already have a loan with us have payment history. For the other 560 the 35% is shared across the other criteria. Fixed limits, because repayment means the same in any population.",
    [
        { name: "% on-time payments", q: "Does the customer pay their installments on time?",
          why: "Past repayment is the best guide to future repayment — people who paid on time usually keep doing so.",
          how: "On-time installments ÷ all installments, from payment_history",
          points: "Fixed: ≥ 95% → 100 · 85–94% → 70 · 70–84% → 40 · < 70% → 10" },
        { name: "Worst delinquency", q: "Has the customer ever fallen seriously behind?",
          why: "Being 90 days late or written off shows serious financial distress. How far behind matters more than one late day.",
          how: "Most severe event in delinquency_event across the customer's loans",
          points: "Fixed: none → 100 · 30 days → 60 · 60 days → 30 · 90 days / write-off → 0" },
    ], "scripts/01_metric_payment_behavior.sql");
criteriaSlide("Criteria 2 — Income & Capacity (25%)",
    "Ability to repay. Income is the latest declared amount for each income type, added up. Debt-to-income uses the customer's latest application.",
    [
        { name: "Monthly income level", q: "Does the customer earn enough to repay?",
          why: "More income leaves more room to pay installments after living costs.",
          how: "Sum of the latest monthly_income for each income type",
          points: "Ranked: highest 25% → 100 · 70 · 40 · lowest 25% → 10" },
        { name: "Income diversification", q: "Would income continue if one source stopped?",
          why: "A second income (e.g. salary + rental) cushions the customer if one is lost.",
          how: "Number of different income types the customer declares",
          points: "Fixed: 2 or more → 100 · 1 → 60" },
        { name: "Debt-to-income", q: "Is the loan reasonable for this income?",
          why: "The bigger the loan compared with income, the heavier each installment and the easier it is to fall behind.",
          how: "Latest requested amount ÷ total monthly income",
          points: "Ranked: lowest ratio → 100 · 70 · 40 · highest → 10 · no application → 55" },
    ], "scripts/02_metric_income_capacity.sql");
criteriaSlide("Criteria 3 — Transaction Behaviour (20%)",
    "How the customer manages money day to day. Especially useful for first-time borrowers, who have no payment history yet.",
    [
        { name: "Transaction volume", q: "Is account activity normal, or dormant / erratic?",
          why: "Almost no activity means we know little about the customer; very heavy, erratic activity can mean cash-flow stress.",
          how: "Average transactions per active month, compared with the median customer",
          points: "Ranked: closest to median → 100 · 70 · 40 · furthest → 10" },
        { name: "Spend-to-income", q: "Does the customer spend more than they earn?",
          why: "Spending more than comes in drains savings and leaves nothing spare for loan repayments.",
          how: "Total spending ÷ total income transactions",
          points: "Ranked: lowest ratio → 100 · 70 · 40 · highest → 10" },
        { name: "Balance trend", q: "Is the customer's balance growing or shrinking?",
          why: "A growing balance builds a safety buffer; a shrinking one shows savings being used up.",
          how: "Slope of closing balance over 26 weekly snapshots (REGR_SLOPE)",
          points: "Ranked: most rising → 100 · 70 · 40 · most falling → 10" },
    ], "scripts/03_metric_transaction_behavior.sql");
criteriaSlide("Criteria 4 — Account Relationship (10%)",
    "A stability signal. Low weight because it says less about ability to repay than income or payment history.",
    [
        { name: "Account tenure", q: "How long has the customer banked with us?",
          why: "A long relationship gives the bank more history to judge, and long-standing customers tend to be more stable.",
          how: "Time since the customer's first account was opened",
          points: "Ranked: longest 25% → 100 · 70 · 40 · newest 25% → 10" },
        { name: "Account status", q: "Are the customer's accounts still in use?",
          why: "Dormant or closed accounts give less recent data and can mean the customer is drifting away or banking elsewhere.",
          how: "Active accounts compared with all the customer's accounts",
          points: "Fixed: all active → 100 · some active → 40 · none active → 0" },
    ], "scripts/04_metric_account_relationship.sql");
criteriaSlide("Criteria 5 — Demographics & Loan Context (10%)",
    "Deliberately the lowest weight, so non-behavioural factors like age can only nudge the score, not decide it.",
    [
        { name: "Age", q: "Is the customer in the lowest-default age range?",
          why: "Very young borrowers often have less stable income; in real loan data, defaults are lowest within about 10 years of age 42.",
          how: "Distance between the customer's age and 42",
          points: "Ranked: closest to 42 → 100 · 70 · 40 · furthest → 10" },
        { name: "Amount vs product range", q: "Is the customer asking for the top of what the product allows?",
          why: "Asking for the maximum means more money at risk and can mean the customer is stretching.",
          how: "Where the requested amount sits between the product's minimum and maximum",
          points: "Ranked: lowest share → 100 · 70 · 40 · highest → 10 · no application → 55" },
    ], "scripts/05_metric_demographics.sql");

// =============================================================== 15–16. Worked examples
function workedExample(sectionTitle, notes, rows, total, result) {
    const s = base("4 · Scoring", sectionTitle, notes);
    table(s, [["Criteria", "Metric points", "Criteria points", "Weight", "Contribution"], ...rows],
        { x: MX, y: 1.65, w: W - 2 * MX, colW: [3.0, 4.13, 1.7, 1.5, 1.8], rowH: 0.55, fontSize: 14 });
    s.addShape(pres.ShapeType.rect, { x: MX, y: 5.75, w: W - 2 * MX, h: 1.15, fill: { color: "F2F2F2" }, line: { color: "D9D9D9" } });
    s.addText(total, { x: MX + 0.3, y: 5.8, w: 8.4, h: 1.05, fontFace: "Consolas", fontSize: 16, color: NAVY, valign: "middle", margin: 0 });
    s.addShape(pres.ShapeType.rect, { x: W - MX - 2.9, y: 5.85, w: 2.7, h: 0.95, fill: { color: result.color }, line: { color: result.color } });
    s.addText(result.label, { x: W - MX - 2.9, y: 5.85, w: 2.7, h: 0.95, align: "center", valign: "middle", fontFace: FONT, fontSize: 20, bold: true, color: "FFFFFF", margin: 0 });
    return s;
}
workedExample(
    "Worked example 1 — repeat borrower (customer 13)",
    "Real row from calculated_risk_score. Metric points come from scripts 01–05 for customer 13. Walk through one row, e.g. Income: 40 + 60 + 100, divided by 3, is 66.67; times 0.25 is 16.67.",
    [
        ["Payment Behaviour", "On-time 100 · Delinquency 100", "100.00", "0.35", "35.00"],
        ["Income & Capacity", "Income level 40 · Diversification 60 · DTI 100", "66.67", "0.25", "16.67"],
        ["Transaction Behaviour", "Volume 10 · Spend ratio 70 · Balance trend 70", "50.00", "0.20", "10.00"],
        ["Account Relationship", "Tenure 40 · Status 100", "70.00", "0.10", "7.00"],
        ["Demographics", "Age 70 · Amount vs range 40", "55.00", "0.10", "5.50"],
        [{ text: "Composite", options: { bold: true, color: NAVY } }, "", "", { text: "1.00", options: { bold: true } }, { text: "74.17", options: { bold: true, color: NAVY } }],
    ],
    "Score = 300 + 74.17 × 5.5 = 707.9 → 708\n708 is in 680–749 → grade B",
    { label: "708 · Grade B\nApprove", color: GRADE_COLORS.B },
);
workedExample(
    "Worked example 2 — first-time applicant (customer 2)",
    "Same customer has no loan account, so Payment Behaviour is empty and its 35% is redistributed: each other weight divided by 0.65. Debt-to-income and amount-vs-range get the neutral 55 because there is no application on file.",
    [
        [{ text: "Payment Behaviour", options: { color: MUTED } }, { text: "No loan history", options: { color: MUTED } }, { text: "—", options: { color: MUTED } }, { text: "0", options: { color: MUTED } }, { text: "0", options: { color: MUTED } }],
        ["Income & Capacity", "Income level 70 · Diversification 100 · DTI 55 (neutral)", "75.00", "0.385", "28.85"],
        ["Transaction Behaviour", "Volume 70 · Spend ratio 10 · Balance trend 40", "40.00", "0.308", "12.31"],
        ["Account Relationship", "Tenure 70 · Status 100", "85.00", "0.154", "13.08"],
        ["Demographics", "Age 10 · Amount vs range 55 (neutral)", "32.50", "0.154", "5.00"],
        [{ text: "Composite", options: { bold: true, color: NAVY } }, "", "", { text: "1.00", options: { bold: true } }, { text: "59.23", options: { bold: true, color: NAVY } }],
    ],
    "Score = 300 + 59.23 × 5.5 = 625.8 → 626\n626 is in 600–679 → grade C",
    { label: "626 · Grade C\nApprove", color: GRADE_COLORS.C },
);

// =============================================================== 17. Results — distribution
{
    const s = base("5 · Results", "Results: 800 customers scored",
        "Shape is a realistic skew: most customers in the middle (C), a small top tier (A), and a thin tail of D/E. Under the approval policy, 681 customers (85%) would be approved.");
    const grades = ["A", "B", "C", "D", "E"];
    const counts = [27, 219, 435, 117, 2];
    s.addChart(pres.ChartType.bar, [{ name: "Customers", labels: grades.map((g) => `Grade ${g}`), values: counts }], {
        x: MX, y: 1.6, w: 7.4, h: 5.0, barDir: "col", barGapWidthPct: 45,
        chartColors: grades.map((g) => GRADE_COLORS[g]),
        showValue: true, dataLabelFontSize: 14, dataLabelFontBold: true, dataLabelColor: GREY, dataLabelPosition: "outEnd",
        catAxisLabelFontSize: 14, catAxisLabelColor: GREY, catAxisLabelFontFace: FONT,
        valAxisHidden: true, valGridLine: { style: "none" }, catAxisLineShow: false,
        showLegend: false, showTitle: false,
    });
    const kx = 8.2, kw = W - MX - kx;
    const kpis = [
        ["652", "average score (median 653)"],
        ["479–790", "lowest to highest score"],
        ["240 / 560", "repeat / first-time borrowers"],
        ["681 (85%)", "approved — grades A–C"],
        ["119 (15%)", "rejected — grades D–E"],
    ];
    kpis.forEach(([n, l], i) => {
        const y = 1.7 + i * 0.98;
        s.addShape(pres.ShapeType.rect, { x: kx, y, w: kw, h: 0.85, fill: { color: LIGHT }, line: { color: LIGHT } });
        s.addText(n, { x: kx + 0.2, y, w: 1.85, h: 0.85, fontFace: FONT, fontSize: 22, bold: true, color: NAVY, valign: "middle", margin: 0 });
        s.addText(l, { x: kx + 2.05, y, w: kw - 2.15, h: 0.85, fontFace: FONT, fontSize: 14, color: GREY, valign: "middle", margin: 0 });
    });
}

// =============================================================== 18. Results — drivers
{
    const s = base("5 · Results", "What separates the grades",
        "Average criteria points per grade. Read across a row to compare grades. Payment Behaviour is averaged only over repeat borrowers in each grade.");
    const data = [
        ["A", 100.0, 81.9, 63.0, 85.6, 78.3],
        ["B", 100.0, 65.8, 58.5, 80.3, 56.5],
        ["C", 91.5, 57.8, 56.6, 77.4, 55.3],
        ["D", 25.0, 52.1, 41.1, 71.0, 46.3],
        ["E", 20.0, 26.7, 40.0, 62.5, 25.0],
    ];
    const heat = (v) => {
        // light → dark blue by value 0..100
        const t = Math.max(0, Math.min(1, v / 100));
        const lerp = (a, b) => Math.round(a + (b - a) * t);
        const r = lerp(0xf3, 0x1f), g = lerp(0xf6, 0x38), b = lerp(0xfb, 0x64);
        return [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase();
    };
    const crit = ["Payment (35%)", "Income (25%)", "Transaction (20%)", "Account (10%)", "Demographics (10%)"];
    const rows = [["Grade", ...crit]];
    data.forEach(([g, ...vals]) => {
        rows.push([
            { text: g, options: { bold: true, color: "FFFFFF", fill: { color: GRADE_COLORS[g] }, align: "center" } },
            ...vals.map((v) => ({ text: v.toFixed(1), options: { align: "center", fill: { color: heat(v) }, color: v > 55 ? "FFFFFF" : NAVY, bold: true } })),
        ]);
    });
    text(s, [
        { text: "How to read: ", options: { bold: true, color: NAVY } },
        { text: "each cell is the average points (0–100) that customers in that grade scored on that criteria. Darker = higher. E.g. A-grade customers averaged 81.9 on Income, E-grade only 26.7." },
    ], { x: MX, y: 1.5, w: W - 2 * MX, h: 0.6, fontSize: 15 });
    table(s, rows, { x: MX, y: 2.25, w: 8.2, colW: [1.0, 1.44, 1.44, 1.44, 1.44, 1.44], rowH: 0.65, fontSize: 14 });
    card(s, 9.1, 2.25, W - MX - 9.1, 3.9, "What it tells us", [
        ["Payment Behaviour is the big divider", "A–C average 91–100, D/E only 20–25: a bad repayment record pushes a borrower to rejection"],
        ["Income and Demographics fall steadily A → E", "They decide where a customer lands across the range"],
        ["Account Relationship barely moves", "A light adjustment, as its 10% weight intends"],
    ]);
    footer(s, "Payment averages cover the 240 repeat borrowers only. Grades are calculated from these points, so this shows what drives a grade — not proof the model is right (see the evidence slide for that).");
}

// =============================================================== 20. Dashboard
{
    const s = base("6 · Dashboard", "Dashboard",
        "Live demo if possible: open the app on port 8502. Show the overview, then pick customer 13 in the drill-down — it matches worked example 1.");
    const img = (file, x, y, w, caption) => {
        const h = w * 880 / 1400;
        s.addImage({ path: path.join(__dirname, "..", "docs", "img", file), x, y, w, h });
        s.addShape(pres.ShapeType.rect, { x, y, w, h, fill: { type: "none" }, line: { color: "D9D9D9", width: 0.75 } });
        s.addText(caption, { x, y: y + h + 0.05, w, h: 0.5, fontFace: FONT, fontSize: 12, color: GREY, margin: 0, valign: "top" });
    };
    img("dashboard_overview.png", MX, 1.5, 7.5, [
        { text: "Portfolio overview — ", options: { bold: true, color: NAVY } },
        { text: "KPIs, customers per grade, score distribution with the grade cut-offs" }]);
    img("dashboard_criteria.png", W - MX - 3.9, 1.5, 3.9, [
        { text: "Criteria by grade — ", options: { bold: true, color: NAVY } }, { text: "average points heatmap" }]);
    img("dashboard_customer.png", W - MX - 3.9, 4.4, 3.9, [
        { text: "Customer drill-down — ", options: { bold: true, color: NAVY } }, { text: "metric points → weights → score" }]);
    footer(s, "Streamlit app (dashboard/app.py) reading live from PostgreSQL · runs in Docker on port 8502");
}

// =============================================================== 21. Sensitive data & DQ
{
    const s = base("7 · Data quality", "Sensitive data & data quality risks",
        "Only PII and CFI apply — no telecom (CPNI) or health (PHI) data in this model.");
    card(s, MX, 1.65, 5.0, 3.4, "Sensitive data", [
        ["PII", "full_name, date_of_birth"],
        ["CFI", "income, transactions, balances, loan amounts, payment & delinquency history"],
        ["CFI (derived)", "risk scores — they decide approve / reject"],
        ["Control", "Mask or restrict at the view / query layer, since every table joins back to customer"],
    ], "C62828");
    table(s, [
        ["Data element", "Risk", "Effect on score"],
        ["monthly_income", "Self-declared, not verified", "Can inflate Income & Capacity (25%)"],
        ["balance snapshots", "Missed batch run leaves gaps", "Balance-trend slope can change sign"],
    ], { x: 6.0, y: 1.65, w: W - MX - 6.0, colW: [1.85, 2.4, 2.48], rowH: 0.9, fontSize: 14 });
}

// =============================================================== 22. Limitations & next steps
{
    const s = base("7 · Limitations", "Limitations & next steps",
        "Be upfront: the model logic is sound and traceable, but the weights and data are not validated against real defaults.");
    card(s, MX, 1.65, 5.8, 3.4, "Limitations", [
        "Synthetic data — only partly grounded in the UCI dataset",
        "Weights set by judgment, not fitted to real default outcomes",
        "Binary approve / reject — no manual review step for borderline grade C",
        "Quartile bands are relative: a customer's points depend on the rest of the population",
    ], "EF6C00");
    card(s, MX + 6.3, 1.65, 5.8, 3.4, "Next steps", [
        "Fit weights and bands on real historical defaults (e.g. Weight of Evidence / Information Value)",
        "Add a 'pending' manual review route for grade C (the schema already allows it)",
        "Run script 06 as a scheduled batch and keep each run's history",
        "Use the batch scores to generate proactive loan offers",
    ], "2E7D32");
}

// =============================================================== 23. Close
{
    const s = pres.addSlide();
    s.background = { color: NAVY };
    s.addText("Thank you", { x: 0.9, y: 2.6, w: 11, h: 1.0, fontFace: FONT, fontSize: 44, bold: true, color: "FFFFFF", margin: 0 });
    s.addText("Questions?", { x: 0.9, y: 3.6, w: 11, h: 0.6, fontFace: FONT, fontSize: 24, color: "D6E0F0", margin: 0 });
}

const out = path.join(__dirname, "..", "docs", "Stage2_Presentation.pptx");
pres.writeFile({ fileName: out }).then(() => console.log("Wrote " + out));
