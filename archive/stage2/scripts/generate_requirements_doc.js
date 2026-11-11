// One-off generator for docs/Business_Requirements_and_Analytical_Questions.docx
// Run: node scripts/generate_requirements_doc.js
const fs = require("fs");
const path = require("path");
const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
    AlignmentType,
    ShadingType,
} = require("docx");

const HEADER_FILL = "4472C4";

function h1(text) {
    return new Paragraph({
        text,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 150 },
    });
}
function h2(text) {
    return new Paragraph({
        text,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 120 },
    });
}
function p(text, opts = {}) {
    return new Paragraph({
        children: [new TextRun({ text, ...opts })],
        spacing: { after: 120 },
    });
}
function bullet(text) {
    return new Paragraph({
        text,
        bullet: { level: 0 },
        spacing: { after: 80 },
    });
}
function numbered(text, ref = "num1") {
    return new Paragraph({
        text,
        numbering: { reference: ref, level: 0 },
        spacing: { after: 80 },
    });
}
function cell(text, { header = false, width } = {}) {
    return new TableCell({
        width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
        shading: header
            ? { type: ShadingType.CLEAR, fill: HEADER_FILL }
            : undefined,
        children: [
            new Paragraph({
                children: [
                    new TextRun({
                        text,
                        bold: header,
                        color: header ? "FFFFFF" : undefined,
                        size: 20,
                    }),
                ],
            }),
        ],
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
    });
}
function monoBox(text, size = 16) {
    const lines = text.split("\n");
    const children = lines.map(
        (line, i) =>
            new TextRun({
                text: line,
                font: "Consolas",
                size,
                break: i === 0 ? 0 : 1,
            }),
    );
    return new Paragraph({
        children,
        shading: { type: ShadingType.CLEAR, fill: "F2F2F2" },
        spacing: { before: 100, after: 200 },
        border: {
            top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
            left: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
            right: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
        },
    });
}
function codeBlock(code) {
    return monoBox(code, 16);
}
function table(headerRow, rows, widths) {
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: "AAAAAA" },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: "AAAAAA" },
            left: { style: BorderStyle.SINGLE, size: 4, color: "AAAAAA" },
            right: { style: BorderStyle.SINGLE, size: 4, color: "AAAAAA" },
            insideHorizontal: {
                style: BorderStyle.SINGLE,
                size: 2,
                color: "CCCCCC",
            },
            insideVertical: {
                style: BorderStyle.SINGLE,
                size: 2,
                color: "CCCCCC",
            },
        },
        rows: [
            new TableRow({
                children: headerRow.map((t, i) =>
                    cell(t, {
                        header: true,
                        width: widths ? widths[i] : undefined,
                    }),
                ),
                tableHeader: true,
            }),
            ...rows.map(
                (r) =>
                    new TableRow({
                        children: r.map((t, i) =>
                            cell(t, { width: widths ? widths[i] : undefined }),
                        ),
                    }),
            ),
        ],
    });
}

const doc = new Document({
    numbering: {
        config: [
            {
                reference: "num1",
                levels: [
                    {
                        level: 0,
                        format: "decimal",
                        text: "%1.",
                        alignment: AlignmentType.START,
                    },
                ],
            },
            {
                reference: "num2",
                levels: [
                    {
                        level: 0,
                        format: "decimal",
                        text: "%1.",
                        alignment: AlignmentType.START,
                    },
                ],
            },
        ],
    },
    sections: [
        {
            properties: {},
            children: [
                new Paragraph({
                    children: [
                        new TextRun({
                            text: "Business Requirements & Analytical Questions",
                            bold: true,
                            size: 40,
                        }),
                    ],
                    spacing: { after: 100 },
                }),
                new Paragraph({
                    children: [
                        new TextRun({
                            text: "Retail Credit Risk Scoring — Data Analytics 1 Assignment",
                            italics: true,
                            size: 24,
                            color: "555555",
                        }),
                    ],
                    spacing: { after: 400 },
                }),

                h1("1. Business Context"),
                p(
                    "Retail banks lose money on loans that default and lose time/consistency when every " +
                        "application is judged manually by a loan officer. A credit risk scoring system solves " +
                        "both problems: it converts a customer’s financial behavior into a single, consistent " +
                        "score that (a) protects the bank by filtering out or re-pricing the riskiest applicants, " +
                        "and (b) lets approve/reject decisions happen in seconds instead of days, applied the same " +
                        "way to every customer.",
                ),
                p(
                    "This assignment models that process end-to-end for a retail bank: the customer and account " +
                        "data the bank already holds internally (no external credit bureau), a weighted scorecard " +
                        "that turns that data into a score and an A–E risk grade, and the downstream loan " +
                        "application / offer decision that score drives.",
                ),

                h1("2. Business Requirements"),
                h2("2.1 Business Objectives"),
                bullet(
                    "Protect the bank from default losses by scoring every applicant consistently before approval.",
                ),
                bullet(
                    "Score both reactively (a customer submits a Loan Application) and proactively (a periodic batch scan of existing customers that generates Loan Offers for qualifying customers).",
                ),
                bullet(
                    "Base the score entirely on data the bank already holds internally — account activity, transactions, declared income, and prior loan repayment history — without relying on an external credit bureau.",
                ),
                bullet(
                    "Produce a score and grade that are explainable: each contributing factor (criteria) and its weight must be traceable, not a black box.",
                ),

                h2("2.2 Functional Requirements"),
                numbered(
                    "Capture one or more income sources per customer, allowing multiple concurrent sources (e.g. salary + rental) and preserving history as income changes.",
                    "num1",
                ),
                numbered(
                    "Capture one or more deposit/transaction accounts per customer, with individual transactions and periodic balance snapshots, to support behavioral/cash-flow analysis.",
                    "num1",
                ),
                numbered(
                    "Capture the full loan lifecycle: catalog of loan products → optional proactive offer → application → risk score → approve/reject decision → disbursed loan account → scheduled payments → delinquency events if any.",
                    "num1",
                ),
                numbered(
                    "Compute a risk score (300–850) and risk grade (A–E) for a customer from a defined, weighted set of criteria (see §3–4 below), and store every computed score with a timestamp so score history is preserved, not overwritten.",
                    "num1",
                ),
                numbered(
                    "Apply a consistent approval policy from the resulting grade: grade A/B/C → approve, grade D/E → reject, so the same rule applies to every applicant. (Simplification: many real scorecards route the borderline grade — here, C — to manual/underwriter review rather than auto-approving it; this assignment uses a simpler binary split for a mock dataset, though the schema’s status field does allow a future 'pending' state.)",
                    "num1",
                ),
                numbered(
                    "For a first-time applicant with no prior payment history, redistribute the Payment Behavior criteria’s weight across the remaining criteria rather than scoring it as an automatic worst-case.",
                    "num1",
                ),

                h2("2.3 Non-Functional Requirements / Assumptions"),
                bullet(
                    "Internal-only scoring: no external credit bureau data is used or required.",
                ),
                bullet(
                    "The schema is normalized to 3NF so that repeating data (multiple income sources, multiple accounts, multiple applications per customer) is never forced into a fixed set of columns.",
                ),
                bullet(
                    "The dataset backing this assignment is synthetic: age, requested amount, tenor, and the good/bad outcome label are bootstrap-sampled from the UCI Statlog German Credit Data (1000 real historical applications); all other values (names, transaction amounts/categories, balance trends) are generated with Faker library.",
                ),

                h1("3. Scoring Methodology Overview"),
                p(
                    "This defines how the raw features in §5 (Analytical Questions) combine into the single " +
                        "score value / risk grade pair. It follows the standard weighted scorecard approach used " +
                        "in retail credit scoring — the same structure behind FICO-style scorecards:",
                ),
                monoBox(
                    "Criteria (category)\n" +
                        "  └─ Metric (measurable characteristic)\n" +
                        "       └─ Point band (metric value → points, via binning)\n" +
                        "  └─ Criteria Weight (% contribution to final score)\n\n" +
                        "Final Score = Σ over criteria [ weight_i × avg(metric points in criteria_i) ]\n" +
                        "            → scaled to 300–850\n" +
                        "            → bucketed into risk_grade A–E",
                    19,
                ),
                p(
                    "This mirrors real world practice: metrics are grouped by category, bucketed into a few point " +
                        "bands instead of raw continuous values, and each category is weighted by how much it " +
                        "matters for default risk. In a real bank, those weights come from statistical analysis of " +
                        "historical outcomes; here, the weights are assigned subjectively.",
                ),

                h1("4. Scoring Criteria & Weights"),
                p(
                    "Each analytic feature below is grouped into one of five weighted criteria, using population-quartile point bands for ratio/trend metrics and absolute thresholds for payment behavior (detailed further in §5).",
                ),
                table(
                    ["#", "Criteria", "Weight", "Why it’s weighted this way"],
                    [
                        [
                            "1",
                            "Payment Behavior (repeat borrowers only)",
                            "35%",
                            "Strongest predictor in virtually every real scorecard — actual past repayment conduct beats any proxy signal.",
                        ],
                        [
                            "2",
                            "Income & Capacity",
                            "25%",
                            "Direct measure of ability to repay; second-strongest signal.",
                        ],
                        [
                            "3",
                            "Transaction Behavior",
                            "20%",
                            "Behavioral proxy for financial discipline and cash-flow stability — especially valuable for first-time borrowers with no payment history yet.",
                        ],
                        [
                            "4",
                            "Account Relationship",
                            "10%",
                            "Tenure/engagement as a stability proxy — weaker but still informative.",
                        ],
                        [
                            "5",
                            "Demographics & Loan Context",
                            "10%",
                            "Deliberately low weight — avoids over-relying on non-behavioral factors; a light adjustment only.",
                        ],
                    ],
                    [8, 32, 12, 48],
                ),
                p(
                    "For a first-time applicant (no loan history yet), Criteria 1’s 35% weight is redistributed proportionally across Criteria 2–5.",
                    { italics: true, size: 20 },
                ),

                h1("5. Analytical Questions"),
                p(
                    "The table below maps each raw data feature in the schema to the business question it " +
                        "answers and how it moves the risk score.",
                ),
                table(
                    [
                        "Feature (table.column)",
                        "Analytic question it answers",
                        "How it impacts Risk Score",
                    ],
                    [
                        [
                            "income_source.monthly_income, income_type",
                            "Can this customer afford the loan? Is income diversified/stable?",
                            "Higher, more stable/diversified income → higher repayment capacity → raises score. Drives the debt-to-income metric under Income & Capacity.",
                        ],
                        [
                            "transaction.amount, category, transaction_date",
                            "How does this customer actually spend and manage cash flow day-to-day?",
                            "High spend-to-income ratio or erratic activity → lowers score. Feeds Transaction Behavior.",
                        ],
                        [
                            "account_balance_history.closing_balance (trend)",
                            "Is this customer’s financial position improving, flat, or deteriorating?",
                            "Rising average balance trend → raises score; declining trend → lowers score. Also feeds Transaction Behavior.",
                        ],
                        [
                            "account.status, open_date",
                            "How long and how actively has this customer banked with us?",
                            "Longer tenure + active status → raises score (relationship depth/loyalty proxy); dormant/closed → neutral-to-negative. Feeds Account Relationship.",
                        ],
                        [
                            "payment_history.status (on_time/late/missed)",
                            "For repeat borrowers: did they pay as agreed?",
                            "Single strongest predictor — raises score sharply when clean, lowers it sharply with late/missed patterns. Feeds Payment Behavior (highest weight).",
                        ],
                        [
                            "delinquency_event.event_type, days_past_due",
                            "How severely and how often has this customer defaulted?",
                            "Presence/severity lowers score, with 90dpd/write-off applying the heaviest penalty. Also Payment Behavior.",
                        ],
                        [
                            "customer.date_of_birth, customer_since_date",
                            "Are there baseline demographic/tenure risk factors?",
                            "Minor weight — age band (distance from population “prime” age) and tenure as light-touch adjustments. Feeds Demographics (lowest weight).",
                        ],
                        [
                            "loan_application.requested_amount vs loan_product.min/max_amount",
                            "Is the requested amount proportionate to capacity and product design?",
                            "Requested amount far above what income/product would support → lowers score (higher exposure relative to capacity).",
                        ],
                    ],
                    [28, 36, 36],
                ),

                h1("6. Core Entities"),
                p(
                    "This business model outlines the structure of a retail bank that evaluates the " +
                        "creditworthiness of its customers, both when they actively apply for a loan and " +
                        "proactively by scanning its existing customer base for candidates who may qualify for " +
                        "a loan offer. The model draws entirely on data the bank already holds internally " +
                        "about its own customers, rather than external credit bureau data.",
                ),
                h2("6.1 Customer"),
                p(
                    "The account holder in the bank's retail ecosystem. Every other entity ultimately traces " +
                        "back to a customer: they hold one or more deposit/transaction accounts, declare one " +
                        "or more income sources, and may submit one or more loan applications or receive " +
                        "proactive loan offers over time.",
                ),
                h2("6.2 Account"),
                p(
                    "A deposit or transaction account held by the customer (savings, current). This is the " +
                        "source of the behavioral data used in scoring — without an account, the bank has no " +
                        "internal signal to score the customer on.",
                ),
                h2("6.3 Transaction"),
                p(
                    "Individual transaction records against an account: deposits, withdrawals, and spending by " +
                        "category. Aggregated over time, these form the spending-habit signal used as an " +
                        "input to the risk score (spend-to-income ratio, transaction-volume normality).",
                ),
                h2("6.4 Income Source"),
                p(
                    "A declared source of income belonging to the customer — salary, business, rental, or " +
                        "other. Modeled as one row per income source per point in time rather than a single " +
                        "overwritten field, so a customer can have multiple concurrent sources and history is " +
                        "preserved as income changes.",
                ),
                h2("6.5 Account Balance History"),
                p(
                    "A periodic balance snapshot for an account. Distinct from Transaction — a transaction is " +
                        "a movement, a balance snapshot is the resulting position — which is what the balance " +
                        "trend (stability) feature is actually computed from.",
                ),
                h2("6.6 Loan Product"),
                p(
                    "The catalog of loan products the bank offers, each with its own terms — interest rate, " +
                        "tenor, and minimum/maximum amount.",
                ),
                h2("6.7 Loan Offer"),
                p(
                    "A proactive, bank-initiated offer of a specific loan product to a specific customer, " +
                        "generated when a periodic scan finds the customer's score qualifies them — without " +
                        "the customer having applied.",
                ),
                h2("6.8 Loan Application"),
                p(
                    "A formal request by a customer for a specific loan product. This is the event that (in " +
                        "the reactive case) triggers a risk score calculation and an approve/reject decision.",
                ),
                h2("6.9 Risk Score"),
                p(
                    "The output of the credit risk scoring process: a numeric score and risk grade (A–E). " +
                        "Always tied to one customer, and may optionally be tied to the loan application that " +
                        "triggered it, or stand alone for periodic/batch scores.",
                ),
                h2("6.10 Loan Account"),
                p(
                    "Once a loan application is approved and disbursed, it becomes an active loan account — " +
                        "the servicing record tracking principal, outstanding balance, and status.",
                ),
                h2("6.11 Payment History"),
                p(
                    "The record of each installment payment made against a loan account — due date, amount " +
                        "due/paid, and status (on-time, late, missed). Both an operational record and a key " +
                        "input back into future risk scores for repeat borrowers.",
                ),
                h2("6.12 Delinquency / Default Event"),
                p(
                    "A record raised when a loan account misses a payment threshold or is classified as " +
                        "delinquent (30/60/90 days past due, write-off). Tracked separately from routine " +
                        "payment history because it drives collections workflows and materially affects " +
                        "future risk scoring.",
                ),

                h1("7. Relational Data Model"),
                h2("7.1 Relationships"),
                p("The core relationships between entities:"),
                numbered("Customer owns Account — one-to-many.", "num2"),
                numbered("Account generates Transaction — one-to-many.", "num2"),
                numbered("Account records Account Balance History — one-to-many.", "num2"),
                numbered("Customer declares Income Source — one-to-many (including concurrently).", "num2"),
                numbered("Customer is targeted by Loan Offer, which promotes Loan Product — many-to-many, resolved by the Loan Offer associative entity.", "num2"),
                numbered("Customer submits Loan Application — one-to-many.", "num2"),
                numbered("Loan Application is for Loan Product — many-to-one.", "num2"),
                numbered("Loan Application triggers Risk Score — one-to-one at decision time.", "num2"),
                numbered("Customer accumulates Risk Score — one-to-many (application-triggered or periodic batch scores).", "num2"),
                numbered("Loan Application becomes Loan Account — one-to-one, once approved.", "num2"),
                numbered("Loan Account tracks Payment History — one-to-many.", "num2"),
                numbered("Loan Account raises Delinquency Event — one-to-many.", "num2"),

                h2("7.2 Database Schema Overview"),
                p(
                    "The schema is a single PostgreSQL database of 13 tables (customer, income_source, " +
                        "account, transaction, account_balance_history, loan_product, loan_offer, " +
                        "loan_application, risk_score, loan_account, payment_history, delinquency_event, and " +
                        "the computed calculated_risk_score output table), all in 3rd Normal Form. Enum-like " +
                        "columns (status, income_type, account_type, event_type, risk_grade) are constrained " +
                        "with CHECK clauses rather than separate lookup tables, since these value sets are " +
                        "small, fixed, and not expected to grow.",
                ),

                h2("7.3 Keys & Source Systems"),
                p(
                    "Every table in the schema uses a surrogate integer primary key, not a natural key. The one " +
                        "natural-key candidate in the model — customer.national_id — is deliberately kept as a " +
                        "unique attribute on customer rather than promoted to primary key, since national ID " +
                        "formats vary and could need correction for a customer, which would be disruptive if " +
                        "every child table's foreign key were built on it directly. The table below also states " +
                        "the system each table's data would realistically originate from in a production bank " +
                        "(this dataset itself is mocked, not sourced from any real system).",
                ),
                table(
                    ["Table", "Primary Key", "Likely Source System"],
                    [
                        ["customer", "customer_id (surrogate)", "Core Banking System's Customer Information File (CIF) — branch/app onboarding & KYC"],
                        ["income_source", "income_id (surrogate)", "Loan Origination System (declared at application) or CRM (self-declared/updated by customer)"],
                        ["account", "account_id (surrogate)", "Core Banking System's deposit/account management module"],
                        ["transaction", "transaction_id (surrogate)", "Core Banking System / payment switch — system of record for account movements"],
                        ["account_balance_history", "balance_history_id (surrogate)", "Core Banking System's nightly batch job that snapshots end-of-day balances"],
                        ["loan_product", "product_id (surrogate)", "Product catalog maintained within the Loan Origination System (LOS)"],
                        ["loan_offer", "offer_id (surrogate)", "CRM / marketing campaign engine running the periodic proactive-offer scan"],
                        ["loan_application", "application_id (surrogate)", "Loan Origination System (LOS)"],
                        ["risk_score", "score_id (surrogate)", "Credit scoring / decision engine (rules or model service called by the LOS)"],
                        ["loan_account", "loan_account_id (surrogate)", "Loan Management System (LMS) — loan servicing module, post-disbursement"],
                        ["payment_history", "payment_id (surrogate)", "Loan Management System (LMS) — installment schedule and collection module"],
                        ["delinquency_event", "event_id (surrogate)", "Collections system, fed by the LMS once a payment is missed past a threshold"],
                    ],
                    [22, 22, 56],
                ),

                h1("8. SQL Queries"),
                p(
                    "A representative selection from the full set of scoring queries in scripts/ — each " +
                        "computes one criteria's points per customer directly from the raw schema tables.",
                ),
                h2("8.1 Payment Behavior (35% weight)"),
                p("Data: % on-time payments and worst delinquency severity per customer, for repeat borrowers only.", { bold: true, size: 20 }),
                p("Importance: the single strongest predictor in virtually every real scorecard — actual past repayment conduct beats any proxy signal. Joins loan_account, loan_application, payment_history and delinquency_event across four tables.", { bold: false, size: 20 }),
                codeBlock(
`WITH customer_payments AS (
    SELECT lap.customer_id,
           COUNT(ph.payment_id) AS total_payments,
           COUNT(ph.payment_id) FILTER (WHERE ph.status = 'on_time') AS on_time_payments
    FROM loan_account la
    JOIN loan_application lap ON lap.application_id = la.application_id
    LEFT JOIN payment_history ph ON ph.loan_account_id = la.loan_account_id
    GROUP BY lap.customer_id
),
worst_delinquency AS (
    SELECT lap.customer_id,
           MAX(CASE de.event_type
               WHEN 'write_off' THEN 4 WHEN '90dpd' THEN 3
               WHEN '60dpd' THEN 2 WHEN '30dpd' THEN 1 ELSE 0 END) AS worst_severity
    FROM loan_account la
    JOIN loan_application lap ON lap.application_id = la.application_id
    LEFT JOIN delinquency_event de ON de.loan_account_id = la.loan_account_id
    GROUP BY lap.customer_id
)
SELECT p.customer_id,
       CASE WHEN 100.0*on_time_payments/total_payments >= 95 THEN 100
            WHEN 100.0*on_time_payments/total_payments >= 85 THEN 70
            WHEN 100.0*on_time_payments/total_payments >= 70 THEN 40
            ELSE 10 END AS points_on_time,
       CASE w.worst_severity WHEN 0 THEN 100 WHEN 1 THEN 60 WHEN 2 THEN 30 ELSE 0 END AS points_delinquency
FROM customer_payments p JOIN worst_delinquency w ON w.customer_id = p.customer_id
ORDER BY p.customer_id;`
                ),

                h2("8.2 Income & Capacity (25% weight)"),
                p("Data: income level, income diversification, and debt-to-income ratio per customer, scored by population quartile.", { bold: true, size: 20 }),
                p("Importance: a direct measure of repayment capacity. Population-quartile scoring (bottom 25% of customers on a metric always score worst) guarantees genuine spread instead of every customer converging on the same band.", { bold: false, size: 20 }),
                codeBlock(
`WITH total_income AS (
    SELECT customer_id, SUM(monthly_income) AS total_monthly_income,
           COUNT(DISTINCT income_type) AS income_type_count
    FROM income_source GROUP BY customer_id
),
income_quartile AS (
    SELECT customer_id, total_monthly_income, income_type_count,
           NTILE(4) OVER (ORDER BY total_monthly_income) AS q  -- q1 = lowest income (worst)
    FROM total_income
),
dti AS (
    SELECT iq.customer_id,
           la.requested_amount / iq.total_monthly_income AS ratio
    FROM income_quartile iq
    LEFT JOIN loan_application la ON la.customer_id = iq.customer_id
),
dti_quartile AS (
    SELECT customer_id, NTILE(4) OVER (ORDER BY ratio ASC) AS q FROM dti WHERE ratio IS NOT NULL
)
SELECT iq.customer_id, iq.total_monthly_income,
       CASE iq.q WHEN 4 THEN 100 WHEN 3 THEN 70 WHEN 2 THEN 40 ELSE 10 END AS points_income_level,
       CASE WHEN iq.income_type_count >= 2 THEN 100 ELSE 60 END AS points_diversification,
       COALESCE(CASE dq.q WHEN 1 THEN 100 WHEN 2 THEN 70 WHEN 3 THEN 40 WHEN 4 THEN 10 END, 55) AS points_debt_to_income
FROM income_quartile iq
LEFT JOIN dti_quartile dq ON dq.customer_id = iq.customer_id
ORDER BY iq.customer_id;`
                ),

                h2("8.3 Master Scorecard: Combine & Weight (excerpt)"),
                p("Data: the final weighted composite score, scaled score (300–850), and risk grade (A–E) per customer, stored in calculated_risk_score.", { bold: true, size: 20 }),
                p("Importance: this is the actual scoring engine — it recombines all 5 criteria (built the same way as 8.1/8.2 above), redistributes Payment Behavior's weight for first-time applicants with no loan history, and produces the final decision-ready output.", { bold: false, size: 20 }),
                codeBlock(
`-- weight redistribution: first-time applicants (no payment_behavior_points)
-- get Payment Behavior's 35% spread proportionally across the other 4 criteria
weighted AS (
    SELECT customer_id, payment_behavior_points, income_capacity_points,
           transaction_behavior_points, account_relationship_points, demographics_points,
           CASE WHEN payment_behavior_points IS NOT NULL THEN 0.35 ELSE 0 END AS w_pb,
           CASE WHEN payment_behavior_points IS NOT NULL THEN 0.25 ELSE 0.25/0.65 END AS w_ic,
           CASE WHEN payment_behavior_points IS NOT NULL THEN 0.20 ELSE 0.20/0.65 END AS w_tb,
           CASE WHEN payment_behavior_points IS NOT NULL THEN 0.10 ELSE 0.10/0.65 END AS w_ar,
           CASE WHEN payment_behavior_points IS NOT NULL THEN 0.10 ELSE 0.10/0.65 END AS w_dg
    FROM combined
)
SELECT customer_id,
       ROUND(300 + composite * 5.5)::INT AS calculated_score_value,
       CASE WHEN 300 + composite*5.5 >= 750 THEN 'A'
            WHEN 300 + composite*5.5 >= 680 THEN 'B'
            WHEN 300 + composite*5.5 >= 600 THEN 'C'
            WHEN 300 + composite*5.5 >= 500 THEN 'D'
            ELSE 'E' END AS calculated_risk_grade
FROM (
    SELECT *, w_pb*COALESCE(payment_behavior_points,0) + w_ic*income_capacity_points
        + w_tb*transaction_behavior_points + w_ar*account_relationship_points
        + w_dg*demographics_points AS composite
    FROM weighted
) scored;`
                ),

                h2("8.4 Model Validation"),
                p("Data: grade distribution of the computed scorecard, and its correlation against the mock risk_score for customers who have both.", { bold: true, size: 20 }),
                p("Importance: sanity-checks that the scorecard produces a realistic, spread-out distribution across all five grades rather than collapsing into one or two, and quantifies agreement with the separately-seeded mock score.", { bold: false, size: 20 }),
                codeBlock(
`SELECT calculated_risk_grade, COUNT(*) AS customers
FROM calculated_risk_score
GROUP BY calculated_risk_grade
ORDER BY calculated_risk_grade;

WITH latest_mock_score AS (
    SELECT DISTINCT ON (customer_id) customer_id, score_value AS mock_score_value
    FROM risk_score ORDER BY customer_id, score_date DESC
)
SELECT CORR(cr.calculated_score_value, lm.mock_score_value) AS correlation,
       COUNT(*) AS n_customers_compared
FROM calculated_risk_score cr
JOIN latest_mock_score lm ON lm.customer_id = cr.customer_id;`
                ),

                h1("9. Sensitive Data & Data Quality Issues"),
                h2("9.1 Sensitive Data Classification"),
                p(
                    "Of the four categories commonly assessed — PII, CFI, CPNI, PHI — only PII and CFI are " +
                        "relevant here; CPNI (telecom network usage) and PHI (health information) don't apply to " +
                        "a retail banking domain.",
                ),
                table(
                    ["Field(s)", "Category", "Why"],
                    [
                        ["customer.full_name, date_of_birth, national_id", "PII", "Directly identifies a specific person; national_id is a government-issued identifier and the most sensitive field in the model."],
                        ["income_source.monthly_income, income_type", "CFI", "Reveals a customer's earnings and how they're earned."],
                        ["transaction.amount, category, transaction_date", "CFI", "Aggregated over time, reconstructs a customer's spending habits and lifestyle."],
                        ["account_balance_history.closing_balance", "CFI", "Reveals a customer's financial position/trajectory over time."],
                        ["loan_application.requested_amount, loan_account.outstanding_balance", "CFI", "Loan exposure and outstanding debt."],
                        ["risk_score.score_value, risk_grade", "CFI (derived)", "A derived creditworthiness judgment used to decide approval/pricing — sensitive due to fair-lending/discrimination scrutiny, not just its raw content."],
                        ["payment_history.status, delinquency_event.event_type", "CFI", "A customer's repayment/default history — the most consequential CFI, since it follows the customer into every future score."],
                    ],
                    [34, 14, 52],
                ),
                p(
                    "Access implication: every table above joins back to customer via customer_id, so access " +
                        "control has to be enforced at the query/view layer, not just by hiding a few 'obviously " +
                        "sensitive' tables — transaction and payment_history look innocuous per-row but are " +
                        "highly re-identifying and sensitive in aggregate.",
                    { italics: true, size: 20 },
                ),

                h2("9.2 Data Quality Challenges"),
                table(
                    ["Data Element", "Challenge", "Why It Matters"],
                    [
                        ["income_source.monthly_income", "Self-declared, not independently verified against payslips/bank statements", "Feeds directly into Income & Capacity scoring (25% weight) — a customer has incentive to overstate income, making the scorecard's output only as trustworthy as this one unverified input."],
                        ["customer.national_id", "No enforced format/checksum validation beyond uniqueness; a mistyped or differently-formatted ID at a different branch/time could create a duplicate customer record", "Breaks the 'one customer, one record' assumption — payment history and risk scores would be split across two identities."],
                        ["transaction.category", "Free-text-style field with no CHECK constraint (unlike income_type/account_type/status)", "Feeds the spend-to-income ratio metric — inconsistent labels silently under- or over-count spend categories in aggregation, producing wrong results rather than an obvious failure."],
                        ["account_balance_history", "Populated by a periodic snapshot job; a missed run leaves a gap", "Feeds the balance-trend slope metric — a gap changes the number of points in the regression and can flip the slope's sign for customers with few snapshots."],
                    ],
                    [24, 40, 36],
                ),
                p(
                    "Separately, this assignment's own mock dataset has one dataset-specific caveat: the mock " +
                        "risk_score values are bootstrap-sampled from a reference dataset's outcome label rather " +
                        "than computed from the scorecard formula, so the mock score and the computed scorecard " +
                        "score are expected to correlate only moderately, not strongly — a property of how the " +
                        "mock data was generated, not a flaw in the scorecard logic itself.",
                ),

                h1("10. Summary"),
                p(
                    "Together, §3–9 define the full path from raw schema feature to final decision: " +
                        "each feature is grouped into a weighted criteria, scored on a 0–100 point band " +
                        "(population-quartile based for ratio/trend metrics, absolute thresholds for payment " +
                        "behavior), combined into a 300–850 composite score, bucketed into an A–E grade, and " +
                        "finally mapped to an approve/reject decision. This was implemented and validated as a set " +
                        "of SQL queries run directly against the live schema, independent of how the mock " +
                        "risk_score rows were originally seeded.",
                ),
            ],
        },
    ],
});

const outPath = path.join(
    __dirname,
    "..",
    "docs",
    "Business_Requirements_and_Analytical_Questions.docx",
);
Packer.toBuffer(doc).then((buf) => {
    fs.writeFileSync(outPath, buf);
    console.log("Wrote", outPath);
});
