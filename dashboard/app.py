"""Credit risk scorecard dashboard — Stage 3 (real bank data: Berka / PKDD'99).

Reads only stored tables in schema `berka` (built by scripts/berka/run_all.js):
loan_score, loan_metric_points, loan_features, metric_evidence, metric_correlation,
scorecard_band, scorecard_weight, criterion_weight, scorecard_param and the validation views.

Run locally:  DATABASE_URL=postgresql://... streamlit run dashboard/app.py --server.port 8502
"""
import os

import altair as alt
import pandas as pd
import psycopg
from psycopg.conninfo import conninfo_to_dict
import streamlit as st

st.set_page_config(page_title="Credit Risk Scorecard", page_icon="📊", layout="wide")

# --------------------------------------------------------------------------- constants
GRADES = ["A", "B", "C", "D", "E"]
CRITERIA = {  # key -> label
    "payment": "Payment behaviour",
    "income": "Income & capacity",
    "balance": "Balance behaviour",
    "relationship": "Account relationship",
    "demographics": "Demographics",
}
METRIC_LABEL = {
    "penalty_events": "Penalty interest charges",
    "negative_balance_events": "Overdraft (negative balance) events",
    "dti": "Loan payment ÷ monthly income",
    "income_sources": "Number of income sources",
    "monthly_inflow": "Monthly money in",
    "balance_volatility": "Balance volatility",
    "min_balance": "Lowest balance",
    "balance_trend": "Balance trend",
    "spend_to_income": "Spend ÷ income",
    "history_months": "Account age (months)",
    "has_card": "Has a card",
    "joint_account": "Joint account (2 users)",
    "age_at_loan": "Age",
    "district_unemployment": "District unemployment",
}
VERDICT_LABEL = {
    "kept": "Kept",
    "dropped_weak": "Dropped: weak",
    "dropped_duplicate": "Dropped: duplicate",
    "dropped_no_added_value": "Dropped: no added value",
}

# Colour = decision (validated colour-blind-safe pair); grade letters are always labelled.
APPROVE_COLOR, REJECT_COLOR = "#2a78d6", "#e34948"
DECISION_SCALE = alt.Scale(domain=["Approve", "Reject"], range=[APPROVE_COLOR, REJECT_COLOR])
OUT_COLOR = "#eb6834"      # categorical slot 2 — pairs with blue (validated)
MUTED = "#a3a29c"          # dropped metrics (recessive)
BLUE_RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"]
DIVERGING = alt.Scale(domain=[-1, 0, 1], range=["#256abf", "#f0efec", "#e34948"], interpolate="rgb")
DASHBOARD_NOTE = "Colour shows the decision: blue = approve (A–C), red = reject (D–E)."


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
        try:
            cur.execute(sql, params)
        except psycopg.errors.UndefinedTable:
            st.error("The scorecard tables are missing. Run `npm run scorecard` (scripts/berka/README.md) first.")
            st.stop()
        cols = [c.name for c in cur.description]
        df = pd.DataFrame(cur.fetchall(), columns=cols)
    for c in df.columns:  # NUMERIC comes back as Decimal
        if df[c].map(lambda v: v.__class__.__name__ == "Decimal").any():
            df[c] = pd.to_numeric(df[c])
    return df


@st.cache_data(ttl=600, show_spinner="Loading scorecard…")
def load_all() -> dict:
    d = {
        "scores": query("""SELECT s.*, f.loan_date, f.amount, f.duration_months, f.monthly_payment,
                                  f.history_months, f.months_observed
                           FROM berka.loan_score s JOIN berka.loan_features f USING (loan_id)
                           ORDER BY s.loan_id"""),
        "evidence": query("SELECT * FROM berka.metric_evidence"),
        "corr": query("SELECT * FROM berka.metric_correlation"),
        "weights": query("SELECT * FROM berka.scorecard_weight ORDER BY weight DESC"),
        "crit_w": query("SELECT * FROM berka.criterion_weight"),
        "bands": query("SELECT * FROM berka.scorecard_band ORDER BY metric, band"),
        "params": query("SELECT * FROM berka.scorecard_param"),
        "summary": query("SELECT * FROM berka.validation_summary"),
        "by_grade": query("SELECT * FROM berka.validation_by_grade"),
        "finished": query("SELECT * FROM berka.validation_finished"),
        "history": query("SELECT * FROM berka.validation_history"),
    }
    d["scores"]["decision"] = d["scores"]["approved"].map({True: "Approve", False: "Reject"})
    d["scores"]["outcome"] = d["scores"]["is_bad"].map({True: "Bad", False: "Good"})
    d["param"] = dict(zip(d["params"]["name"], d["params"]["value"]))
    return d


@st.cache_data(ttl=600, show_spinner="Loading loan data…")
def load_loan(loan_id: int) -> dict:
    """Everything the bank could see before this loan: the 12-month window. No personal data shown."""
    q = {
        "points": """SELECT p.metric, p.raw_value, p.band, p.band_points, p.points, w.weight, w.criterion,
                            b.lower, b.upper
                     FROM berka.loan_metric_points p
                     JOIN berka.scorecard_weight w USING (metric)
                     JOIN berka.scorecard_band b ON b.metric = p.metric AND b.band = p.band
                     WHERE p.loan_id = %(l)s ORDER BY w.weight DESC""",
        "monthly": """SELECT date_trunc('month', t.trans_date)::date AS month,
                             COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'credit'), 0)     AS money_in,
                             COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'withdrawal'), 0) AS money_out,
                             COUNT(*) AS transactions
                      FROM berka.trans t JOIN berka.loan l USING (account_id)
                      WHERE l.loan_id = %(l)s AND t.trans_date < l.loan_date AND t.trans_date >= l.loan_date - 365
                      GROUP BY 1 ORDER BY 1""",
        "balance": """SELECT DISTINCT ON (date_trunc('month', t.trans_date))
                             date_trunc('month', t.trans_date)::date AS month, t.balance
                      FROM berka.trans t JOIN berka.loan l USING (account_id)
                      WHERE l.loan_id = %(l)s AND t.trans_date < l.loan_date AND t.trans_date >= l.loan_date - 365
                      ORDER BY date_trunc('month', t.trans_date), t.trans_date DESC, t.trans_id DESC""",
        "events": """SELECT t.trans_date, t.k_symbol, t.amount, t.balance
                     FROM berka.trans t JOIN berka.loan l USING (account_id)
                     WHERE l.loan_id = %(l)s AND t.trans_date < l.loan_date AND t.trans_date >= l.loan_date - 365
                       AND (t.k_symbol = 'penalty_interest' OR t.balance < 0)
                     ORDER BY t.trans_date""",
        "loan": """SELECT l.loan_date, l.amount, l.duration_months, l.monthly_payment, l.status,
                          a.open_date, a.frequency
                   FROM berka.loan l JOIN berka.account a USING (account_id) WHERE l.loan_id = %(l)s""",
    }
    return {k: query(sql, {"l": int(loan_id)}) for k, sql in q.items()}


def tile(col, label, value, note=None):
    with col:
        st.metric(label, value)
        if note:
            st.caption(note)


def pct(v, digits=1) -> str:
    return "—" if v is None or pd.isna(v) else f"{100 * v:.{digits}f}%"


def band_text(lower, upper, metric) -> str:
    if metric in ("has_card", "joint_account"):
        return "yes" if lower is not None and not pd.isna(lower) else "no"
    fmt = (lambda v: f"{v:,.2f}") if metric in ("dti", "balance_volatility", "balance_trend", "spend_to_income") else (lambda v: f"{v:,.0f}")
    lo = None if lower is None or pd.isna(lower) else fmt(lower)
    hi = None if upper is None or pd.isna(upper) else fmt(upper)
    if lo is None and hi is None:
        return "any value"
    if lo is None:
        return f"≤ {hi}"
    if hi is None:
        return f"> {lo}"
    return f"> {lo} and ≤ {hi}"


data = load_all()
scores, P = data["scores"], data["param"]
summ = data["summary"].set_index("split")

# --------------------------------------------------------------------------- header
st.title("Credit Risk Scorecard")
st.caption(
    f"{len(scores):,} real loans (Berka Czech bank data, 1993–1998), each scored with only the 12 months of "
    "account history before the loan date. Weights, bands and cut-offs were learned on the earliest 70% of loans "
    f"(train) and checked on the latest 30% (test). {DASHBOARD_NOTE}"
)

tab_port, tab_ev, tab_crit, tab_loan = st.tabs(["Portfolio", "Evidence", "Criteria by grade", "Loan drill-down"])

# =========================================================================== portfolio
with tab_port:
    n, n_bad = len(scores), int(scores["is_bad"].sum())
    c1, c2, c3, c4 = st.columns(4)
    tile(c1, "Loans scored", f"{n:,}", f"{n_bad} went bad ({n_bad / n:.1%}) · score 0–100")
    tile(c2, "Would be approved (A–C)", pct(scores["approved"].mean(), 0),
         f"approve when score ≥ {P['approve_cutoff']:.1f}")
    tile(c3, "Bad rate: approved vs rejected",
         f"{pct(scores.loc[scores.approved, 'is_bad'].mean())} vs {pct(scores.loc[~scores.approved, 'is_bad'].mean())}",
         "share of loans that really went bad")
    tile(c4, "Gini on unseen loans (test)", f"{summ.loc['test', 'gini']:.2f}",
         f"train {summ.loc['train', 'gini']:.2f} · test has only {int(summ.loc['test', 'n_bad'])} bad loans")

    left, right = st.columns(2)
    with left:
        st.subheader("Loans per grade")
        g = scores.groupby(["grade", "decision"]).size().reset_index(name="loans")
        base = alt.Chart(g).encode(x=alt.X("grade:N", sort=GRADES, title="Grade", axis=alt.Axis(labelAngle=0)))
        bars = base.mark_bar(cornerRadiusTopLeft=4, cornerRadiusTopRight=4, size=56).encode(
            y=alt.Y("loans:Q", title="Loans"),
            color=alt.Color("decision:N", scale=DECISION_SCALE, legend=alt.Legend(title=None, orient="top")),
            tooltip=[alt.Tooltip("grade:N", title="Grade"), alt.Tooltip("loans:Q", title="Loans"),
                     alt.Tooltip("decision:N", title="Decision")])
        st.altair_chart((bars + base.mark_text(dy=-8, fontSize=13).encode(y="loans:Q", text="loans:Q"))
                        .properties(height=320), width="stretch")

    with right:
        st.subheader("What really happened, by grade")
        bg = data["by_grade"].copy()
        bg["decision"] = bg["grade"].map(lambda x: "Approve" if x in "ABC" else "Reject")
        bg["split_label"] = bg["split"].map({"train": "Train (learned from)", "test": "Test (unseen)"})
        bg["label"] = bg["bad_rate"].map(lambda v: f"{100 * v:.0f}%")
        base = alt.Chart(bg).encode(x=alt.X("grade:N", sort=GRADES, title=None, axis=alt.Axis(labelAngle=0)))
        bars = base.mark_bar(cornerRadiusTopLeft=4, cornerRadiusTopRight=4, size=34).encode(
            y=alt.Y("bad_rate:Q", title="Share of loans that went bad", axis=alt.Axis(format="%")),
            color=alt.Color("decision:N", scale=DECISION_SCALE, legend=None),
            tooltip=[alt.Tooltip("split_label:N", title="Set"), alt.Tooltip("grade:N", title="Grade"),
                     alt.Tooltip("n:Q", title="Loans"), alt.Tooltip("n_bad:Q", title="Went bad"),
                     alt.Tooltip("bad_rate:Q", title="Bad rate", format=".1%")])
        chart = (bars + base.mark_text(dy=-8, fontSize=12).encode(y="bad_rate:Q", text="label:N")) \
            .properties(height=280, width=230).facet(column=alt.Column("split_label:N", title=None, sort="descending"))
        st.altair_chart(chart)
        st.caption("Bad rate rises from A to E on both sets — the grades sort real risk. "
                   f"Test numbers rest on {int(summ.loc['test', 'n_bad'])} bad loans, so read them as a direction, not a precise rate.")

    st.subheader("Score distribution")
    h = scores[["score", "grade", "decision"]].copy()
    h["score_from"] = (h["score"] // 5) * 5
    h = h.groupby(["score_from", "decision"]).size().reset_index(name="loans")
    h["score_to"] = h["score_from"] + 5
    h["score_bin"] = h["score_from"].map(lambda b: f"{b:.0f}–{b + 5:.0f}")
    hist = alt.Chart(h).mark_bar(stroke="white", strokeWidth=1).encode(  # no cornerRadius: hides binned bars
        x=alt.X("score_from:Q", bin="binned", title="Score (0–100, bins of 5)", scale=alt.Scale(domain=[0, 100])),
        x2="score_to:Q", y=alt.Y("loans:Q", title="Loans"),
        color=alt.Color("decision:N", scale=DECISION_SCALE, legend=None),
        tooltip=[alt.Tooltip("score_bin:N", title="Score"), alt.Tooltip("loans:Q", title="Loans")])
    cut = pd.DataFrame({"score": [P["grade_D"], P["grade_C"], P["grade_B"], P["grade_A"]],
                        "label": ["D | E", "C | D (approve line)", "B | C", "A | B"]})
    rules = alt.Chart(cut).mark_rule(strokeDash=[4, 3], color="#8c8c8c").encode(
        x="score:Q", tooltip=[alt.Tooltip("label:N", title="Grade cut-off"), alt.Tooltip("score:Q", title="Score", format=".1f")])
    st.altair_chart((hist + rules).properties(height=260), width="stretch")
    st.caption(f"Dashed lines are the grade cut-offs: A ≥ {P['grade_A']:.1f}, B ≥ {P['grade_B']:.1f}, "
               f"C ≥ {P['grade_C']:.1f}, D ≥ {P['grade_D']:.1f}. The approve line is where a score decile's real bad rate "
               f"stops being below the average ({P['portfolio_bad_rate']:.1%}).")

# =========================================================================== evidence
with tab_ev:
    ev = data["evidence"].copy()
    ev["Metric"] = ev["metric"].map(METRIC_LABEL)
    ev["Criterion"] = ev["criterion"].map(CRITERIA)
    ev["strength"] = ev["gini_train"].abs()
    ev["Verdict"] = ev["verdict"].map(VERDICT_LABEL)
    ev["status"] = ev["verdict"].map(lambda v: "Kept" if v == "kept" else "Dropped")

    st.subheader("1 · Does each metric separate good loans from bad ones?")
    st.caption("Strength = |Gini| on the training loans: 0 = no better than a coin flip, 1 = perfect. "
               "Metrics under 0.10 were dropped as weak.")
    order = ev.sort_values("strength", ascending=False)["Metric"].tolist()
    bars = alt.Chart(ev).mark_bar(cornerRadiusTopRight=4, cornerRadiusBottomRight=4, size=16).encode(
        y=alt.Y("Metric:N", sort=order, title=None, axis=alt.Axis(labelLimit=260)),
        x=alt.X("strength:Q", title="Strength (|Gini|, train)", scale=alt.Scale(domain=[0, 0.7])),
        color=alt.Color("status:N", scale=alt.Scale(domain=["Kept", "Dropped"], range=[APPROVE_COLOR, MUTED]),
                        legend=alt.Legend(title=None, orient="top")),
        tooltip=["Metric:N", "Criterion:N", alt.Tooltip("gini_train:Q", title="Gini (train)", format=".2f"),
                 "Verdict:N", alt.Tooltip("reason:N", title="Why")])
    rule = alt.Chart(pd.DataFrame({"x": [0.10]})).mark_rule(strokeDash=[4, 3], color="#8c8c8c").encode(x="x:Q")
    st.altair_chart((bars + rule).properties(height=420), width="stretch")

    st.subheader("2 · Bad rate across each metric's quartiles")
    st.caption("Training loans split into up to four groups of similar size by the metric's value (lowest → highest). "
               "Equal values stay in the same group, so a yes/no metric shows two groups (no, yes). "
               "A useful metric shows bad rate climbing or falling steadily.")
    q = ev.melt(id_vars=["Metric", "status"], value_vars=["bad_rate_q1", "bad_rate_q2", "bad_rate_q3", "bad_rate_q4"],
                var_name="quartile", value_name="bad_rate")
    q["quartile"] = q["quartile"].str[-2:].str.upper()
    q = q.dropna(subset=["bad_rate"])
    small = alt.Chart(q).mark_bar(cornerRadiusTopLeft=3, cornerRadiusTopRight=3).encode(
        x=alt.X("quartile:N", title=None, axis=alt.Axis(labelAngle=0)),
        y=alt.Y("bad_rate:Q", title=None, axis=alt.Axis(format="%", tickCount=3)),
        color=alt.Color("status:N", scale=alt.Scale(domain=["Kept", "Dropped"], range=[APPROVE_COLOR, MUTED]), legend=None),
        tooltip=["Metric:N", alt.Tooltip("quartile:N", title="Quartile"), alt.Tooltip("bad_rate:Q", title="Bad rate", format=".1%")]
    ).properties(width=150, height=110).facet(facet=alt.Facet("Metric:N", sort=order, title=None), columns=5)
    st.altair_chart(small)

    st.subheader("3 · Which metrics measure the same thing?")
    st.caption("Rank correlation between metrics on the training loans. |r| ≥ 0.5 counts as a duplicate: "
               "the weaker one is dropped so the same behaviour is not scored twice.")
    cr = data["corr"].copy()
    cr = pd.concat([cr, cr.rename(columns={"metric_a": "metric_b", "metric_b": "metric_a"})])
    cr["A"], cr["B"] = cr["metric_a"].map(METRIC_LABEL), cr["metric_b"].map(METRIC_LABEL)
    cr["txt"] = cr["spearman"].map(lambda v: f"{v:.2f}" if abs(v) >= 0.5 else "")
    heat = alt.Chart(cr).mark_rect(stroke="white", strokeWidth=2).encode(
        x=alt.X("A:N", sort=order, title=None, axis=alt.Axis(labelAngle=-40, labelLimit=220, labelOverlap=False)),
        y=alt.Y("B:N", sort=order, title=None, axis=alt.Axis(labelLimit=260)),
        color=alt.Color("spearman:Q", scale=DIVERGING, title="r"),
        tooltip=[alt.Tooltip("A:N", title="Metric"), alt.Tooltip("B:N", title="vs"), alt.Tooltip("spearman:Q", title="r", format=".2f")])
    st.altair_chart((heat + heat.mark_text(fontSize=11).encode(text="txt:N", color=alt.value("#1a1a19"))).properties(height=520),
                    width="stretch")

    st.subheader("4 · Weights learned from the data")
    st.caption(f"Logistic regression of 'went bad' on each kept metric's points (training loans, L2 = {P['l2']:.0f}). "
               "Weight = how much the metric moves the prediction × how much it varies, scaled to 100%.")
    w = data["weights"].copy()
    w["Metric"], w["Criterion"] = w["metric"].map(METRIC_LABEL), w["criterion"].map(CRITERIA)
    wl, wr = st.columns([3, 2])
    with wl:
        wb = alt.Chart(w).mark_bar(cornerRadiusTopRight=4, cornerRadiusBottomRight=4, size=18, color=APPROVE_COLOR).encode(
            y=alt.Y("Metric:N", sort="-x", title=None, axis=alt.Axis(labelLimit=260)), x=alt.X("weight:Q", title="Weight in score", axis=alt.Axis(format="%")),
            tooltip=["Metric:N", "Criterion:N", alt.Tooltip("weight:Q", format=".1%"), alt.Tooltip("coef:Q", title="Coefficient", format=".2f")])
        st.altair_chart((wb + wb.mark_text(align="left", dx=4).encode(text=alt.Text("weight:Q", format=".0%"), color=alt.value("#3d3d3a")))
                        .properties(height=240), width="stretch")
    with wr:
        cw = data["crit_w"].copy()
        cw["Criterion"] = cw["criterion"].map(CRITERIA)
        cw["Weight"] = cw["weight"].map(lambda v: f"{100 * v:.1f}%")
        st.dataframe(cw.sort_values("weight", ascending=False)[["Criterion", "Weight"]], hide_index=True, width="stretch")
        st.caption("Criterion weight = sum of its metrics' weights. Demographics ended at 0%: age and district did not predict bad loans.")

    st.subheader("5 · Checks on loans the model never saw")
    s = data["summary"].copy()
    s["Set"] = s["split"].map({"train": "Train", "test": "Test"})
    st.dataframe(pd.DataFrame({
        "Set": s["Set"], "Loans": s["n"], "Went bad": s["n_bad"], "Gini": s["gini"].round(2),
        "Approved": s["approval_rate"].map(pct), "Bad rate if approved": s["bad_rate_approved"].map(pct),
        "Bad rate if rejected": s["bad_rate_rejected"].map(pct)}).sort_values("Set", ascending=False),
        hide_index=True, width="stretch")
    f = data["finished"].copy()
    f["View"] = f["view_name"].map({"finished_A_vs_B": "Finished loans only (paid off vs defaulted)",
                                     "issued_12m_before_data_end": "Loans at least 12 months old"})
    st.dataframe(pd.DataFrame({"View": f["View"], "Set": f["split"].str.title(), "Loans": f["n"], "Went bad": f["n_bad"],
                               "Gini": f["gini"].map(lambda v: "— (no bad loans)" if pd.isna(v) else f"{v:.2f}")}),
                 hide_index=True, width="stretch")
    st.caption("Running loans may still go bad later, so the score is also checked on finished and older loans. "
               "The test set has very few finished loans — the main limitation of this check.")

    st.subheader("6 · Short history is not rewarded")
    hs = data["history"].copy()
    hs["order"] = hs["history_bucket"].map({"<6": 0, "6-12": 1, "12+": 2})
    st.dataframe(pd.DataFrame({"Account age at loan (months)": hs["history_bucket"], "Loans": hs["n"],
                               "Really went bad": hs["bad_rate"].map(pct), "Average score": hs["avg_score"],
                               "Approved": hs["approval_rate"].map(pct), "o": hs["order"]}).sort_values("o").drop(columns="o"),
                 hide_index=True, width="stretch")
    st.caption(f"Window metrics are pulled toward the average when few months were seen "
               f"(points = avg + (points − avg) × months ÷ (months + {P['shrink_k']:.0f})), so a short clean record cannot score 100.")

# =========================================================================== criteria by grade
with tab_crit:
    st.subheader("Average criterion points by grade")
    st.caption("Each cell is the average points (0–100) of loans in that grade — darker = higher. "
               "Criteria with no kept metric are not shown.")
    cols = {k: f"{k}_points" for k in CRITERIA}
    long = scores.melt(id_vars=["grade"], value_vars=[c for c in cols.values() if scores[c].notna().any()],
                       var_name="criterion", value_name="points")
    long["Criterion"] = long["criterion"].str.replace("_points", "").map(CRITERIA)
    hm = long.groupby(["grade", "Criterion"])["points"].mean().reset_index()
    base = alt.Chart(hm).encode(x=alt.X("grade:N", sort=GRADES, title="Grade", axis=alt.Axis(labelAngle=0)),
                                y=alt.Y("Criterion:N", title=None))
    rect = base.mark_rect(stroke="white", strokeWidth=2).encode(
        color=alt.Color("points:Q", scale=alt.Scale(range=BLUE_RAMP, domain=[0, 100]), title="Points"),
        tooltip=["Criterion:N", "grade:N", alt.Tooltip("points:Q", format=".1f")])
    text = base.mark_text(fontSize=13).encode(text=alt.Text("points:Q", format=".0f"),
                                              color=alt.condition("datum.points > 55", alt.value("white"), alt.value("#1a1a19")))
    st.altair_chart((rect + text).properties(height=260), width="stretch")

# =========================================================================== loan drill-down
with tab_loan:
    st.subheader("Why did this loan get its grade?")
    st.caption("Pick a loan. Everything below uses only what the bank could see before the loan date; "
               "the real outcome is shown last, after the score.")
    top = scores.sort_values("score", ascending=False)
    examples = {
        "A — highest score": int(top.iloc[0]["loan_id"]),
        "C — just approved": int(scores[scores.grade == "C"].sort_values("score").iloc[0]["loan_id"]),
        "E — lowest score": int(top.iloc[-1]["loan_id"]),
    }
    ec = st.columns(len(examples) + 1)
    for i, (label, lid) in enumerate(examples.items()):
        if ec[i].button(f"{label} · #{lid}", width="stretch"):
            st.session_state["loan_id"] = lid
    ids = scores["loan_id"].tolist()
    lid = st.selectbox("Loan", ids, index=ids.index(st.session_state.get("loan_id", examples["A — highest score"])),
                       key="loan_select")
    st.session_state["loan_id"] = lid
    row = scores.set_index("loan_id").loc[lid]
    L = load_loan(lid)
    ln = L["loan"].iloc[0]

    c1, c2, c3, c4 = st.columns(4)
    tile(c1, "Score", f"{row['score']:.1f}", f"out of 100 · {row['split']} loan")
    tile(c2, "Grade", row["grade"], "approve" if row["approved"] else "reject")
    tile(c3, "Loan", f"{ln['amount']:,.0f}", f"{ln['duration_months']} months × {ln['monthly_payment']:,.0f} · {ln['loan_date']:%d %b %Y}")
    tile(c4, "History seen", f"{row['months_observed']:.0f} months", f"account opened {ln['open_date']:%d %b %Y}")

    st.markdown("**How the score was built**")
    pts = L["points"].copy()
    pts["Metric"] = pts["metric"].map(METRIC_LABEL)
    pts["Criterion"] = pts["criterion"].map(CRITERIA)
    pts["Value"] = pts.apply(lambda r: "missing" if pd.isna(r["raw_value"]) else
                             (("yes" if r["raw_value"] else "no") if r["metric"] in ("has_card", "joint_account")
                              else f"{r['raw_value']:,.0f}" if float(r["raw_value"]).is_integer() or abs(r["raw_value"]) >= 10 else f"{r['raw_value']:,.2f}"), axis=1)
    pts["Band"] = pts.apply(lambda r: band_text(r["lower"], r["upper"], r["metric"]), axis=1)
    pts["Contribution"] = pts["weight"] * pts["points"]
    st.dataframe(pd.DataFrame({
        "Metric": pts["Metric"], "Criterion": pts["Criterion"], "Value": pts["Value"], "Band": pts["Band"],
        "Band points": pts["band_points"].round(1), "Points (after short-history adjustment)": pts["points"].round(1),
        "Weight": pts["weight"].map(lambda v: f"{100 * v:.1f}%"), "Adds to score": pts["Contribution"].round(2)}),
        hide_index=True, width="stretch")
    st.code(" + ".join(f"{w:.3f}×{p:.1f}" for w, p in zip(pts["weight"], pts["points"])) + f" = {row['score']:.2f}", language=None)

    left, right = st.columns(2)
    with left:
        st.markdown("**Money in vs money out, 12 months before the loan**")
        m = L["monthly"].melt(id_vars=["month"], value_vars=["money_in", "money_out"], var_name="flow", value_name="amount")
        m["flow"] = m["flow"].map({"money_in": "Money in", "money_out": "Money out"})
        st.altair_chart(alt.Chart(m).mark_line(point=alt.OverlayMarkDef(size=60), strokeWidth=2).encode(
            x=alt.X("month:T", title=None, axis=alt.Axis(format="%b %y")), y=alt.Y("amount:Q", title="Amount"),
            color=alt.Color("flow:N", scale=alt.Scale(domain=["Money in", "Money out"], range=[APPROVE_COLOR, OUT_COLOR]),
                            legend=alt.Legend(title=None, orient="top")),
            tooltip=[alt.Tooltip("month:T", format="%b %Y"), "flow:N", alt.Tooltip("amount:Q", format=",.0f")]
        ).properties(height=260), width="stretch")
    with right:
        st.markdown("**Month-end balance**")
        b = L["balance"]
        line = alt.Chart(b).mark_line(point=alt.OverlayMarkDef(size=60), strokeWidth=2, color=APPROVE_COLOR).encode(
            x=alt.X("month:T", title=None, axis=alt.Axis(format="%b %y")), y=alt.Y("balance:Q", title="Balance"),
            tooltip=[alt.Tooltip("month:T", format="%b %Y"), alt.Tooltip("balance:Q", format=",.0f")])
        zero = alt.Chart(pd.DataFrame({"y": [0]})).mark_rule(color="#8c8c8c", strokeDash=[4, 3]).encode(y="y:Q")
        st.altair_chart((line + zero).properties(height=260), width="stretch")

    evs = L["events"]
    if len(evs):
        st.markdown(f"**Warning signs before the loan: {len(evs)} transaction(s) with penalty interest or a negative balance**")
        st.dataframe(evs.rename(columns={"trans_date": "Date", "k_symbol": "Type", "amount": "Amount", "balance": "Balance after"}),
                     hide_index=True, width="stretch")
    else:
        st.markdown("**No penalty interest and no negative balance in the 12 months before the loan.**")

    outcome = {"A": "finished and fully paid", "B": "finished but NOT paid (bad)", "C": "still running, paying on time",
               "D": "still running, in debt (bad)"}[row["status"]]
    (st.error if row["is_bad"] else st.success)(f"**What really happened:** status {row['status']} — {outcome}.")
