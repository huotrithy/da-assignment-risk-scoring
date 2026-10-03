"""Credit risk scorecard dashboard.

Reads the stored scorecard (calculated_risk_score, written by scripts/06) and
re-runs the read-only metric scripts 01-05 for the customer drill-down.

Run locally:  DATABASE_URL=postgresql://... streamlit run dashboard/app.py --server.port 8502
"""
import os
from pathlib import Path

import altair as alt
import pandas as pd
import psycopg
from psycopg.conninfo import conninfo_to_dict
import streamlit as st

st.set_page_config(page_title="Credit Risk Scorecard", page_icon="📊", layout="wide")

# --------------------------------------------------------------------------- constants
# Same scorecard constants as scripts/06_calculate_and_store_scorecard.sql
WEIGHTS = {"payment": 0.35, "income": 0.25, "transaction": 0.20, "account": 0.10, "demographics": 0.10}
CRITERIA = [  # key, label, column in calculated_risk_score
    ("payment", "Payment Behaviour", "payment_behavior_points"),
    ("income", "Income & Capacity", "income_capacity_points"),
    ("transaction", "Transaction Behaviour", "transaction_behavior_points"),
    ("account", "Account Relationship", "account_relationship_points"),
    ("demographics", "Demographics & Loan", "demographics_points"),
]
GRADES = ["A", "B", "C", "D", "E"]
GRADE_RANGE = {"A": "750–850", "B": "680–749", "C": "600–679", "D": "500–599", "E": "300–499"}
APPROVED = {"A", "B", "C"}

# Colour = decision (validated colour-blind safe pair); grade letters are always labelled.
APPROVE_COLOR, REJECT_COLOR = "#2a78d6", "#e34948"
DECISION_SCALE = alt.Scale(domain=["Approve", "Reject"], range=[APPROVE_COLOR, REJECT_COLOR])
SPEND_COLOR = "#eb6834"  # categorical slot 2 — pairs with blue (validated)
EXAMPLES = {"A": 268, "B": 3, "E": 719}  # top score · worked example 1 on the slides · lowest score
BLUE_RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"]

SQL_DIR = Path(os.environ.get("SQL_DIR", Path(__file__).resolve().parent.parent / "scripts"))
METRIC_SCRIPTS = {
    "payment": "01_metric_payment_behavior.sql",
    "income": "02_metric_income_capacity.sql",
    "transaction": "03_metric_transaction_behavior.sql",
    "account": "04_metric_account_relationship.sql",
    "demographics": "05_metric_demographics.sql",
}
# Short names for the one-line summary in the drill-down table (same wording as the slides)
SHORT = {
    "% on-time payments": "On-time", "Worst delinquency": "Delinquency",
    "Monthly income": "Income level", "Income types": "Diversification",
    "Debt-to-income (loan ÷ monthly income)": "DTI",
    "Avg transactions per month": "Volume", "Spend-to-income": "Spend ratio", "Balance trend": "Balance trend",
    "Account tenure (years)": "Tenure", "Account status": "Status",
    "Age": "Age", "Requested amount, % of product range": "Amount vs range",
}
SEVERITY = {0: "none", 1: "30 days", 2: "60 days", 3: "90 days", 4: "write-off"}
SEVERITY_RANK = {"30dpd": 1, "60dpd": 2, "90dpd": 3, "write_off": 4}
SEVERITY_NAME = {1: "30 days late", 2: "60 days late", 3: "90 days late", 4: "written off"}


# --------------------------------------------------------------------------- data
def database_url() -> str:
    url = os.environ.get("DATABASE_URL", "").strip().strip('"').strip("'")
    if not url:
        st.error("DATABASE_URL is not set. Pass it as an environment variable (see dashboard/README.md).")
        st.stop()
    return url.replace("postgresql+psycopg://", "postgresql://")


def connect():
    """Fail fast with a readable message instead of hanging when the database is unreachable."""
    url = database_url()
    try:
        return psycopg.connect(url, connect_timeout=int(os.environ.get("DB_CONNECT_TIMEOUT", "10")))
    except psycopg.OperationalError as e:
        host = conninfo_to_dict(url).get("host", "?")
        st.error(f"Cannot connect to the database at **{host}**. Check that this server can reach it "
                 f"(network / firewall / VPN) and that DATABASE_URL is correct.\n\n`{str(e).strip()}`")
        st.stop()


def query(sql: str, params=None) -> pd.DataFrame:
    with connect() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        cols = [c.name for c in cur.description]
        df = pd.DataFrame(cur.fetchall(), columns=cols)
    # NUMERIC comes back as Decimal — convert so pandas/altair can do maths on it
    for c in df.columns:
        if df[c].map(lambda v: v.__class__.__name__ == "Decimal").any():
            df[c] = pd.to_numeric(df[c])
    return df


@st.cache_data(ttl=600, show_spinner="Loading scorecard…")
def load_scores() -> pd.DataFrame:
    df = query("SELECT * FROM calculated_risk_score ORDER BY customer_id")
    df["decision"] = df["calculated_risk_grade"].map(lambda g: "Approve" if g in APPROVED else "Reject")
    df["borrower"] = df["payment_behavior_points"].isna().map({True: "First-time", False: "Repeat"})
    return df


@st.cache_data(ttl=600, show_spinner="Running metric scripts 01–05…")
def load_metrics() -> dict:
    out = {}
    for key, name in METRIC_SCRIPTS.items():
        sql = (SQL_DIR / name).read_text(encoding="utf-8").strip().rstrip(";")
        out[key] = query(sql).set_index("customer_id")
    return out


def tile(col, label, value, note=None):
    with col:
        st.metric(label, value)
        if note:
            st.caption(note)


@st.cache_data(ttl=600, show_spinner="Loading customer data…")
def load_customer(cid: int) -> dict:
    """Raw rows for one customer — the evidence behind each criteria. No name / national_id (PII)."""
    q = {
        "profile": "SELECT date_of_birth, customer_since_date FROM customer WHERE customer_id = %(c)s",
        "income": """SELECT income_type, monthly_income, effective_date FROM income_source
                     WHERE customer_id = %(c)s ORDER BY effective_date DESC""",
        "applications": """SELECT la.application_date, lp.product_name, la.requested_amount, lp.min_amount,
                                  lp.max_amount, lp.tenor_months, la.status
                           FROM loan_application la JOIN loan_product lp USING (product_id)
                           WHERE la.customer_id = %(c)s ORDER BY la.application_date DESC""",
        "loans": """SELECT ln.loan_account_id, lp.product_name, ln.principal_amount, ln.disbursement_date,
                           ln.outstanding_balance, ln.status
                    FROM loan_account ln JOIN loan_application la USING (application_id)
                    JOIN loan_product lp USING (product_id) WHERE la.customer_id = %(c)s""",
        "payments": """SELECT ph.due_date, ph.amount_due, ph.amount_paid, ph.status
                       FROM payment_history ph JOIN loan_account ln USING (loan_account_id)
                       JOIN loan_application la USING (application_id)
                       WHERE la.customer_id = %(c)s ORDER BY ph.due_date""",
        "delinquency": """SELECT de.event_date, de.event_type, de.days_past_due
                          FROM delinquency_event de JOIN loan_account ln USING (loan_account_id)
                          JOIN loan_application la USING (application_id)
                          WHERE la.customer_id = %(c)s ORDER BY de.event_date""",
        "accounts": """SELECT account_id, account_type, open_date, status FROM account
                       WHERE customer_id = %(c)s ORDER BY open_date""",
        "monthly": """SELECT date_trunc('month', t.transaction_date)::date AS month,
                             COALESCE(SUM(t.amount) FILTER (WHERE t.category = 'income'), 0) AS income,
                             COALESCE(-SUM(t.amount) FILTER (WHERE t.category <> 'income'), 0) AS spending,
                             COUNT(*) AS transactions
                      FROM "transaction" t JOIN account a USING (account_id)
                      WHERE a.customer_id = %(c)s GROUP BY 1 ORDER BY 1""",
        "categories": """SELECT t.category, -SUM(t.amount) AS total, COUNT(*) AS transactions
                         FROM "transaction" t JOIN account a USING (account_id)
                         WHERE a.customer_id = %(c)s AND t.category <> 'income'
                         GROUP BY 1 ORDER BY 2 DESC""",
        "balance": """SELECT bh.snapshot_date, SUM(bh.closing_balance) AS balance
                      FROM account_balance_history bh JOIN account a USING (account_id)
                      WHERE a.customer_id = %(c)s GROUP BY 1 ORDER BY 1""",
    }
    return {k: query(sql, {"c": int(cid)}) for k, sql in q.items()}


def share_below(series: pd.Series, value) -> float:
    """Share of customers with a lower value — 'higher than X% of customers'."""
    s = series.dropna()
    return float((s < value).mean()) if len(s) and pd.notna(value) else float("nan")


def money(v) -> str:
    return "—" if v is None or pd.isna(v) else f"{v:,.0f}"


def effective_weights(has_payment: bool) -> dict:
    if has_payment:
        return dict(WEIGHTS)
    rest = 1 - WEIGHTS["payment"]  # 0.65 — Payment's 35% shared out proportionally
    return {k: (0.0 if k == "payment" else w / rest) for k, w in WEIGHTS.items()}


scores = load_scores()

# --------------------------------------------------------------------------- header
st.title("Credit Risk Scorecard")
st.caption(
    f"{len(scores):,} customers scored by the SQL scorecard (scripts 01–06). "
    f"Stored run: {pd.to_datetime(scores['calculated_date']).max():%d %b %Y}. "
    "Colour shows the decision: blue = approve (A–C), red = reject (D–E)."
)

tab_overview, tab_criteria, tab_customer = st.tabs(["Portfolio overview", "Criteria by grade", "Customer drill-down"])

# =========================================================================== overview
with tab_overview:
    n = len(scores)
    approved = (scores["decision"] == "Approve").sum()
    c1, c2, c3, c4 = st.columns(4)
    tile(c1, "Customers scored", f"{n:,}")
    tile(c2, "Average score", f"{scores['calculated_score_value'].mean():.0f}",
         f"median {scores['calculated_score_value'].median():.0f} · range "
         f"{scores['calculated_score_value'].min()}–{scores['calculated_score_value'].max()}")
    tile(c3, "Approved (A–C)", f"{approved:,}", f"{approved / n:.0%} of customers · {n - approved:,} rejected")
    tile(c4, "Repeat borrowers", f"{(scores['borrower'] == 'Repeat').sum():,}",
         f"{(scores['borrower'] == 'First-time').sum():,} first-time applicants")

    left, right = st.columns(2)
    with left:
        st.subheader("Customers per grade")
        g = (scores.groupby("calculated_risk_grade").size().reindex(GRADES, fill_value=0)
             .rename_axis("grade").reset_index(name="customers"))
        g["share"] = g["customers"] / n
        g["decision"] = g["grade"].map(lambda x: "Approve" if x in APPROVED else "Reject")
        g["score_range"] = g["grade"].map(GRADE_RANGE)
        base = alt.Chart(g).encode(x=alt.X("grade:N", sort=GRADES, title="Grade", axis=alt.Axis(labelAngle=0)))
        bars = base.mark_bar(cornerRadiusTopLeft=4, cornerRadiusTopRight=4, size=56).encode(
            y=alt.Y("customers:Q", title="Customers"),
            color=alt.Color("decision:N", scale=DECISION_SCALE, legend=alt.Legend(title=None, orient="top")),
            tooltip=[alt.Tooltip("grade:N", title="Grade"), alt.Tooltip("score_range:N", title="Score"),
                     alt.Tooltip("customers:Q", title="Customers"), alt.Tooltip("share:Q", title="Share", format=".1%"),
                     alt.Tooltip("decision:N", title="Decision")],
        )
        labels = base.mark_text(dy=-8, fontSize=13).encode(y="customers:Q", text="customers:Q")
        st.altair_chart((bars + labels).properties(height=340), width="stretch")

    with right:
        st.subheader("Score distribution")
        h = scores[["calculated_score_value", "calculated_risk_grade", "decision"]].copy()
        h["score_from"] = (h["calculated_score_value"] // 10) * 10
        h = h.groupby(["score_from", "calculated_risk_grade", "decision"]).size().reset_index(name="customers")
        h["score_to"] = h["score_from"] + 10
        h["score_bin"] = h["score_from"].map(lambda b: f"{b}–{b + 9}")
        # no cornerRadius here: it hides pre-binned bars in Vega-Lite
        hist = alt.Chart(h).mark_bar(stroke="white", strokeWidth=1).encode(
            x=alt.X("score_from:Q", bin="binned", title="Score (bins of 10)", scale=alt.Scale(domain=[450, 820])),
            x2="score_to:Q",
            y=alt.Y("customers:Q", title="Customers"),
            color=alt.Color("decision:N", scale=DECISION_SCALE, legend=None),
            tooltip=[alt.Tooltip("score_bin:N", title="Score"), alt.Tooltip("calculated_risk_grade:N", title="Grade"),
                     alt.Tooltip("customers:Q", title="Customers")],
        )
        cut = pd.DataFrame({"score": [500, 600, 680, 750], "label": ["D | E", "C | D  (approve ≥ 600)", "B | C", "A | B"]})
        rules = alt.Chart(cut).mark_rule(strokeDash=[4, 3], color="#8c8c8c").encode(
            x="score:Q", tooltip=[alt.Tooltip("label:N", title="Grade cut-off"), alt.Tooltip("score:Q", title="Score")])
        st.altair_chart((hist + rules).properties(height=340), width="stretch")
        st.caption("Dashed lines are the grade cut-offs (500, 600, 680, 750).")

    with st.expander("Grade table"):
        st.dataframe(
            g.assign(share=lambda d: (d["share"] * 100).round(1))
             .rename(columns={"grade": "Grade", "score_range": "Score range", "customers": "Customers",
                              "share": "Share (%)", "decision": "Decision"})
             [["Grade", "Score range", "Customers", "Share (%)", "Decision"]],
            hide_index=True, width="stretch")

# =========================================================================== criteria
with tab_criteria:
    st.subheader("Average criteria points by grade")
    st.caption(
        "Each cell is the average points (0–100) that customers in that grade scored on that criteria — darker = higher. "
        "Payment Behaviour averages cover repeat borrowers only. Grades are calculated from these points, "
        "so this shows what drives a grade, not proof that the model is right."
    )
    long = (scores.melt(id_vars=["calculated_risk_grade"], value_vars=[c for _, _, c in CRITERIA],
                        var_name="col", value_name="points").dropna())
    label_of = {c: f"{lbl} ({WEIGHTS[k]:.0%})" for k, lbl, c in CRITERIA}
    order = [label_of[c] for _, _, c in CRITERIA]
    long["criteria"] = long["col"].map(label_of)
    heat = (long.groupby(["calculated_risk_grade", "criteria"])["points"]
            .agg(avg="mean", customers="count").reset_index())
    base = alt.Chart(heat).encode(
        x=alt.X("criteria:N", sort=order, title=None, axis=alt.Axis(labelAngle=0, labelLimit=180)),
        y=alt.Y("calculated_risk_grade:N", sort=GRADES, title="Grade"),
    )
    cells = base.mark_rect(stroke="white", strokeWidth=2).encode(
        color=alt.Color("avg:Q", scale=alt.Scale(domain=[0, 100], range=BLUE_RAMP),
                        legend=alt.Legend(title="Avg points", orient="right")),
        tooltip=[alt.Tooltip("calculated_risk_grade:N", title="Grade"), alt.Tooltip("criteria:N", title="Criteria"),
                 alt.Tooltip("avg:Q", title="Average points", format=".1f"),
                 alt.Tooltip("customers:Q", title="Customers with a value")],
    )
    text = base.mark_text(fontSize=14, fontWeight="bold").encode(
        text=alt.Text("avg:Q", format=".1f"),
        color=alt.condition("datum.avg > 55", alt.value("white"), alt.value("#0b0b0b")),
    )
    st.altair_chart((cells + text).properties(height=330), width="stretch")

    st.markdown(
        "- **Payment Behaviour is the big divider** — a bad repayment record pushes a borrower down to D/E.\n"
        "- **Income and Demographics fall steadily from A to E** — they decide where a customer lands across the range.\n"
        "- **Account Relationship barely moves** — a light adjustment, as its 10% weight intends."
    )
    with st.expander("Weights"):
        w = pd.DataFrame([{"Criteria": lbl, "Weight": f"{WEIGHTS[k]:.0%}",
                           "First-time applicant weight": "—" if k == "payment" else f"{WEIGHTS[k] / 0.65:.1%}"}
                          for k, lbl, _ in CRITERIA])
        st.dataframe(w, hide_index=True, width="stretch")
        st.caption("First-time applicants have no payment history, so Payment's 35% is shared out: each other weight ÷ 0.65.")

# =========================================================================== customer
with tab_customer:
    st.session_state.setdefault("f_grade", list(GRADES))
    st.session_state.setdefault("f_borrower", ["Repeat", "First-time"])
    st.session_state.setdefault("cid", EXAMPLES["B"])

    def pick_example(c):
        st.session_state.update(f_grade=list(GRADES), f_borrower=["Repeat", "First-time"], cid=c)

    ex = st.columns([1.4, 1, 1, 1, 3])
    ex[0].markdown("**Quick examples:**")
    for col, g in zip(ex[1:4], EXAMPLES):
        c = EXAMPLES[g]
        sc = int(scores.loc[scores.customer_id == c, "calculated_score_value"].iat[0])
        col.button(f"{g} · #{c} · {sc}", on_click=pick_example, args=(c,), width="stretch",
                   help=f"Customer {c}, grade {g}, score {sc}")

    f1, f2, f3 = st.columns([1, 1, 2])
    grade_pick = f1.multiselect("Grade", GRADES, key="f_grade")
    borrower_pick = f2.multiselect("Borrower type", ["Repeat", "First-time"], key="f_borrower")
    pool = scores[scores["calculated_risk_grade"].isin(grade_pick) & scores["borrower"].isin(borrower_pick)]
    if pool.empty:
        st.info("No customers match these filters.")
        st.stop()
    ids = pool["customer_id"].tolist()
    if st.session_state["cid"] not in ids:
        st.session_state["cid"] = ids[0]
    cid = f3.selectbox(
        "Customer", ids, key="cid",
        format_func=lambda i: f"Customer {i} — grade {pool.loc[pool.customer_id == i, 'calculated_risk_grade'].iat[0]}, "
                              f"score {pool.loc[pool.customer_id == i, 'calculated_score_value'].iat[0]}")
    row = scores.set_index("customer_id").loc[cid]
    has_payment = pd.notna(row["payment_behavior_points"])
    weights = effective_weights(has_payment)

    m1, m2, m3, m4 = st.columns(4)
    tile(m1, "Score", int(row["calculated_score_value"]))
    tile(m2, "Grade", row["calculated_risk_grade"], f"score range {GRADE_RANGE[row['calculated_risk_grade']]}")
    tile(m3, "Decision", row["decision"], "A–C approve · D–E reject")
    tile(m4, "Borrower type", row["borrower"],
         "standard weights" if has_payment else "no loan history — Payment's 35% redistributed")

    scored = sorted(((float(row[c]), lbl) for _, lbl, c in CRITERIA if pd.notna(row[c])), reverse=True)
    st.markdown(
        f"**Why grade {row['calculated_risk_grade']}:** strongest — "
        + ", ".join(f"{lbl} ({p:.0f})" for p, lbl in scored[:2])
        + " · weakest — " + ", ".join(f"{lbl} ({p:.0f})" for p, lbl in scored[-2:][::-1])
        + ("" if has_payment else " · no loan history yet, so Payment Behaviour is not scored")
        + ". Points are out of 100.")

    # ---- metric-level detail from scripts 01-05
    metrics = load_metrics()

    def get(key):
        df = metrics[key]
        return df.loc[cid] if cid in df.index else None

    def fmt(v, spec="{:,.2f}"):
        return "—" if v is None or pd.isna(v) else spec.format(v)

    p, i, t, a, d = (get(k) for k in METRIC_SCRIPTS)
    detail = {
        "payment": [] if p is None else [
            ("% on-time payments", fmt(p["pct_on_time"], "{:.1f}%"), p["points_on_time"]),
            ("Worst delinquency", SEVERITY.get(int(p["worst_severity"]), "—"), p["points_delinquency"]),
        ],
        "income": [] if i is None else [
            ("Monthly income", fmt(i["total_monthly_income"]), i["points_income_level"]),
            ("Income types", fmt(i["income_type_count"], "{:.0f}"), i["points_diversification"]),
            ("Debt-to-income (loan ÷ monthly income)",
             fmt(i["amount_to_income_ratio"]) if pd.notna(i["amount_to_income_ratio"]) else "no application",
             i["points_debt_to_income"]),
        ],
        "transaction": [] if t is None else [
            ("Avg transactions per month", fmt(t["avg_monthly_tx_count"], "{:.1f}"), t["points_tx_volume"]),
            ("Spend-to-income", fmt(t["spend_to_income_ratio"]), t["points_spend_ratio"]),
            ("Balance trend", "—" if pd.isna(t["balance_slope"]) else ("rising" if t["balance_slope"] > 0 else "falling"),
             t["points_balance_trend"]),
        ],
        "account": [] if a is None else [
            ("Account tenure (years)", fmt(a["tenure_years"], "{:.1f}"), a["points_tenure"]),
            ("Account status", {100: "all active", 40: "some active", 0: "none active"}.get(int(a["points_status"]), "—"),
             a["points_status"]),
        ],
        "demographics": [] if d is None else [
            ("Age", fmt(d["age"], "{:.0f}"), d["points_age"]),
            ("Requested amount, % of product range",
             "no application" if pd.isna(d["pct_of_range"]) else f"{d['pct_of_range'] * 100:.0f}%",
             d["points_amount_range"]),
        ],
    }

    st.subheader("How this score was built")
    rows, total = [], 0.0
    for key, label, col in CRITERIA:
        pts = row[col]
        contrib = 0.0 if pd.isna(pts) else weights[key] * float(pts)
        total += contrib
        rows.append({
            "Criteria": label,
            "Metric points": " · ".join(f"{SHORT.get(m, m)} {int(v)}" for m, _, v in detail[key]) if detail[key] else "no loan history",
            "Criteria points": None if pd.isna(pts) else float(pts),
            "Weight": weights[key],
            "Contribution": contrib,
        })
    build = pd.DataFrame(rows)
    st.dataframe(
        build, hide_index=True, width="stretch",
        column_config={
            "Criteria points": st.column_config.NumberColumn(format="%.2f"),
            "Weight": st.column_config.NumberColumn(format="%.3f"),
            "Contribution": st.column_config.NumberColumn(format="%.2f"),
        })
    comp = float(row["composite_score"])  # stored value; summing rounded contributions can be off by 0.01
    st.code(
        f"Composite = Σ weight × criteria points = {comp:.2f}\n"
        f"Score     = 300 + {comp:.2f} × 5.5 = {300 + comp * 5.5:.2f} → {int(row['calculated_score_value'])}\n"
        f"Grade     = {row['calculated_risk_grade']} ({GRADE_RANGE[row['calculated_risk_grade']]}) → {row['decision']}",
        language=None)

    # Scripts 01-05 use today's date (age, tenure) and population quartiles, so a
    # re-run can differ slightly from the stored scorecard — say so when it does.
    drift = []
    for key, label, col in CRITERIA:
        if detail[key] and pd.notna(row[col]):
            live = sum(float(v) for _, _, v in detail[key]) / len(detail[key])
            if abs(live - float(row[col])) > 0.01:
                drift.append(f"{label} (stored {float(row[col]):.2f}, today {live:.2f})")
    if drift:
        st.caption("ℹ️ Metric points are recomputed today by scripts 01–05; age, tenure and quartile ties can shift "
                   "slightly since the stored run. Differs for: " + "; ".join(drift) + ".")

    st.subheader("Metric detail")
    cols = st.columns(len(CRITERIA))
    for (key, label, _), c in zip(CRITERIA, cols):
        with c:
            st.markdown(f"**{label}**")
            if not detail[key]:
                st.caption("No loan history — weight redistributed.")
            for m, val, pts in detail[key]:
                tile(st.container(), m, f"{int(pts)} pts", f"value: {val}" if val else None)

    # ---- raw data: the evidence behind each criteria
    st.subheader(f"The data behind the score — customer {cid}")
    st.caption("Raw rows from the database for this customer, grouped by criteria. "
               "Name and national ID are hidden (personal data).")
    raw = load_customer(cid)
    prof = raw["profile"].iloc[0]
    age = int((pd.Timestamp.today() - pd.Timestamp(prof["date_of_birth"])).days // 365.25)
    apps = raw["applications"]
    latest_app = apps.iloc[0] if not apps.empty else None
    total_income = metrics["income"]["total_monthly_income"].get(cid)

    t_pay, t_inc, t_tx, t_acc, t_dem = st.tabs(
        [f"{lbl} ({row[c]:.0f} pts)" if pd.notna(row[c]) else f"{lbl} (not scored)" for _, lbl, c in CRITERIA])

    with t_pay:
        pay, dq = raw["payments"], raw["delinquency"]
        if raw["loans"].empty:
            st.info("No loan with the bank yet, so there is no repayment record. Payment Behaviour is not scored "
                    "and its 35% weight is shared across the other criteria.")
        else:
            run_date = pd.Timestamp(row["calculated_date"]).tz_localize(None).normalize()
            pay = pay.assign(due_by_run=pd.to_datetime(pay["due_date"]) <= run_date)
            n_future = int((~pay["due_by_run"]).sum())
            on_time = int((pay["status"] == "on_time").sum())
            if dq.empty:
                dq_text = "no delinquency events ever recorded."
            else:
                worst = SEVERITY_NAME.get(int(dq["event_type"].map(SEVERITY_RANK).max()), "?")
                dq_text = f"{len(dq)} delinquency event(s), worst: **{worst}**."
            st.markdown(f"**What it shows:** {on_time} of {len(pay)} installments paid on time "
                        f"({on_time / max(len(pay), 1):.0%}); {dq_text}")
            if n_future:
                st.warning(f"Data note: {n_future} of {len(pay)} installments are dated after the scoring run "
                           f"({run_date:%d %b %Y}) but are already marked paid — a limitation of the mock data "
                           "generator. The scorecard currently counts them.")
            k = st.columns(3)
            tile(k[0], "On time", on_time)
            tile(k[1], "Late", int((pay["status"] == "late").sum()))
            tile(k[2], "Missed", int((pay["status"] == "missed").sum()))
            st.markdown("**Loans with the bank**")
            st.dataframe(raw["loans"].rename(columns={
                "loan_account_id": "Loan", "product_name": "Product", "principal_amount": "Principal",
                "disbursement_date": "Disbursed", "outstanding_balance": "Outstanding", "status": "Status"}),
                hide_index=True, width="stretch")
            st.markdown("**Installment history**")
            st.dataframe(pay.rename(columns={"due_date": "Due date", "amount_due": "Amount due",
                                             "amount_paid": "Amount paid", "status": "Status",
                                             "due_by_run": "Due by scoring date"}),
                         hide_index=True, width="stretch")
            if not dq.empty:
                st.markdown("**Delinquency events**")
                st.dataframe(dq.rename(columns={"event_date": "Date", "event_type": "Event",
                                                "days_past_due": "Days past due"}),
                             hide_index=True, width="stretch")

    with t_inc:
        inc = raw["income"]
        pct = share_below(metrics["income"]["total_monthly_income"], total_income)
        line = (f"**What it shows:** {inc['income_type'].nunique()} income type(s), "
                f"{money(total_income)} per month in total — higher than **{pct:.0%}** of customers.")
        if latest_app is not None and total_income:
            dti = latest_app["requested_amount"] / total_income
            dti_pct = share_below(metrics["income"]["amount_to_income_ratio"], dti)
            line += (f" Latest application asks for {money(latest_app['requested_amount'])} = "
                     f"**{dti:.2f}×** monthly income (a smaller burden than {1 - dti_pct:.0%} of applicants).")
        else:
            line += " No loan application on file, so debt-to-income gets the neutral 55 points."
        st.markdown(line)
        st.markdown("**Declared income sources**")
        st.dataframe(inc.rename(columns={"income_type": "Type", "monthly_income": "Monthly income",
                                         "effective_date": "Since"}), hide_index=True, width="stretch")
        st.markdown("**Loan applications**")
        if apps.empty:
            st.caption("None.")
        else:
            st.dataframe(apps.rename(columns={
                "application_date": "Date", "product_name": "Product", "requested_amount": "Requested",
                "min_amount": "Product min", "max_amount": "Product max", "tenor_months": "Months",
                "status": "Status"}), hide_index=True, width="stretch")

    with t_tx:
        mon, bal = raw["monthly"], raw["balance"]
        tot_in, tot_out = mon["income"].sum(), mon["spending"].sum()
        ratio = tot_out / tot_in if tot_in else float("nan")
        r_pct = share_below(metrics["transaction"]["spend_to_income_ratio"], ratio)
        start_bal = bal["balance"].iloc[0] if len(bal) else None
        end_bal = bal["balance"].iloc[-1] if len(bal) else None
        trend = "rising" if len(bal) > 1 and end_bal > start_bal else "falling"
        ratio_text = (f"spends **{ratio:.2f}×** what comes in — a lower ratio than {1 - r_pct:.0%} of customers"
                      if pd.notna(ratio) else "no income transactions recorded")
        st.markdown(f"**What it shows:** over {len(mon)} months, money in {money(tot_in)} vs spending "
                    f"{money(tot_out)} — {ratio_text}. Total balance went from {money(start_bal)} to "
                    f"{money(end_bal)} (**{trend}**).")
        c1, c2 = st.columns(2)
        with c1:
            st.markdown("**Money in vs spending per month**")
            long_m = mon.melt(id_vars=["month"], value_vars=["income", "spending"], var_name="flow", value_name="amount")
            long_m["flow"] = long_m["flow"].map({"income": "Money in", "spending": "Spending"})
            flows = ["Money in", "Spending"]
            ch = alt.Chart(long_m).mark_bar(cornerRadiusTopLeft=3, cornerRadiusTopRight=3).encode(
                x=alt.X("yearmonth(month):O", title=None, axis=alt.Axis(format="%b %y", labelAngle=0)),
                xOffset=alt.XOffset("flow:N", sort=flows),
                y=alt.Y("amount:Q", title="Amount"),
                color=alt.Color("flow:N", sort=flows,
                                scale=alt.Scale(domain=flows, range=[APPROVE_COLOR, SPEND_COLOR]),
                                legend=alt.Legend(title=None, orient="top")),
                tooltip=[alt.Tooltip("yearmonth(month):O", title="Month", format="%b %Y"),
                         alt.Tooltip("flow:N", title="Flow"),
                         alt.Tooltip("amount:Q", title="Amount", format=",.0f")],
            ).properties(height=280)
            st.altair_chart(ch, width="stretch")
        with c2:
            st.markdown("**Total balance, weekly snapshots**")
            line_c = alt.Chart(bal).mark_line(strokeWidth=2, color=APPROVE_COLOR,
                                              point=alt.OverlayMarkDef(size=40, color=APPROVE_COLOR)).encode(
                x=alt.X("snapshot_date:T", title=None, axis=alt.Axis(format="%b %y", tickCount="month")),
                y=alt.Y("balance:Q", title="Balance", scale=alt.Scale(zero=False)),
                tooltip=[alt.Tooltip("snapshot_date:T", title="Week of", format="%d %b %Y"),
                         alt.Tooltip("balance:Q", title="Balance", format=",.0f")],
            ).properties(height=280)
            st.altair_chart(line_c, width="stretch")
        with st.expander("Spending by category"):
            st.dataframe(raw["categories"].rename(columns={"category": "Category", "total": "Total spent",
                                                           "transactions": "Transactions"}),
                         hide_index=True, width="stretch")

    with t_acc:
        acc = raw["accounts"]
        oldest = pd.Timestamp(acc["open_date"].min())
        years = (pd.Timestamp.today() - oldest).days / 365.25
        ten_pct = share_below(metrics["account"]["tenure_years"], metrics["account"]["tenure_years"].get(cid))
        st.markdown(f"**What it shows:** {len(acc)} account(s), the oldest opened {oldest:%b %Y} "
                    f"({years:.1f} years — longer than {ten_pct:.0%} of customers); "
                    f"{int((acc['status'] == 'active').sum())} of {len(acc)} active.")
        st.dataframe(acc.rename(columns={"account_id": "Account", "account_type": "Type", "open_date": "Opened",
                                         "status": "Status"}), hide_index=True, width="stretch")

    with t_dem:
        line = f"**What it shows:** age **{age}** ({abs(age - 42)} years from 42, the lowest-default age)."
        if latest_app is not None:
            rng = latest_app["max_amount"] - latest_app["min_amount"]
            used = (latest_app["requested_amount"] - latest_app["min_amount"]) / rng if rng else float("nan")
            line += (f" Asked for {money(latest_app['requested_amount'])} on **{latest_app['product_name']}** "
                     f"(allowed {money(latest_app['min_amount'])}–{money(latest_app['max_amount'])}) = "
                     f"**{used:.0%}** of the product's range.")
        else:
            line += " No loan application, so amount-vs-range gets the neutral 55 points."
        st.markdown(line)
        k = st.columns(3)
        tile(k[0], "Age", age)
        tile(k[1], "Customer since", f"{pd.Timestamp(prof['customer_since_date']):%b %Y}")
        tile(k[2], "Loan applications", len(apps))
