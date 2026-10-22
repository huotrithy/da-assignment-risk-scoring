"""Data-driven risk scorecard on the Berka dataset.

Reads berkadb.dev, builds pre-loan features per loan (nothing dated on/after the
loan date), derives metric points and criteria weights from the data, validates
with repeated stratified CV, and writes:
    output/loan_features.csv     one row per loan, all features + target
    output/metric_iv.csv         Information Value per metric (+ permutation noise floor)
    output/scorecard.csv         final per-loan score and grade
    output/summary.json          weights, CV results, grade table
and a `berka_scorecard` table inside berkadb.dev.

Run:  .venv/bin/python build_scorecard.py
"""
import json
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, roc_curve
from sklearn.model_selection import RepeatedStratifiedKFold

HERE = Path(__file__).resolve().parent
DB = HERE / "berkadb.dev"
OUT = HERE / "output"
OUT.mkdir(exist_ok=True)

WINDOW_MONTHS = 12
N_BINS = 5
PDO = 50          # points that double the good:bad odds
ANCHOR_SCORE = 600
ANCHOR_ODDS = 20  # good:bad odds at the anchor score
OLD_WEIGHTS = {"Payment Behavior": .35, "Income & Capacity": .25, "Transaction Behavior": .20,
               "Account Relationship": .10, "Demographics & Loan Context": .10}

# metric -> criteria (same five criteria as docs/Scoring_Methodology.md)
CRITERIA = {
    "Payment Behavior": ["sanction_count", "neg_balance_share", "months_with_neg_balance"],
    "Income & Capacity": ["inflow_per_month", "payment_to_inflow", "amount_to_annual_inflow", "income_source_types"],
    "Transaction Behavior": ["txn_per_month", "avg_balance", "min_balance", "balance_slope", "outflow_to_inflow", "cash_share"],
    "Account Relationship": ["tenure_months", "has_card", "n_disponents", "monthly_statement"],
    "Demographics & Loan Context": ["age", "is_female", "loan_amount", "loan_duration", "district_salary",
                                    "district_unemployment", "district_urban_ratio"],
}
METRICS = [m for ms in CRITERIA.values() for m in ms]
METRIC_CRITERIA = {m: c for c, ms in CRITERIA.items() for m in ms}


# --------------------------------------------------------------------------- features
def to_date(s):
    s = s.astype(int)
    return pd.to_datetime(dict(year=1900 + s // 10000, month=(s // 100) % 100, day=s % 100))


def build_features() -> pd.DataFrame:
    con = sqlite3.connect(DB)
    loan = pd.read_sql("select * from loan", con)
    acct = pd.read_sql("select * from account", con)
    disp = pd.read_sql("select * from disp", con)
    client = pd.read_sql("select * from client", con)
    dist = pd.read_sql("select * from district", con)
    card = pd.read_sql("select card_id, disp_id, issued from card", con)
    trans = pd.read_sql(
        "select t.account_id, t.date, t.type, t.operation, t.amount, t.balance, t.k_symbol "
        "from trans t join loan l on l.account_id = t.account_id", con)
    con.close()

    loan["loan_date"] = to_date(loan["date"])
    loan["bad"] = loan["status"].isin(["B", "D"]).astype(int)
    acct["acct_open"] = to_date(acct["date"])
    card["issued"] = pd.to_datetime(card["issued"].str[:6], format="%y%m%d")

    owner = disp[disp.type == "OWNER"].merge(client, on="client_id")
    s = owner["birth_number"].astype(int).astype(str).str.zfill(6)
    mm = s.str[2:4].astype(int)
    owner["is_female"] = (mm > 50).astype(int)
    owner["birth"] = pd.to_datetime(dict(year=1900 + s.str[:2].astype(int),
                                         month=np.where(mm > 50, mm - 50, mm), day=s.str[4:6].astype(int)))
    n_disp = disp.groupby("account_id").size().rename("n_disponents")
    owner_card = owner.merge(card, on="disp_id", how="left")[["account_id", "issued"]]
    owner_card = owner_card.groupby("account_id")["issued"].min().rename("card_issued")
    dist = dist.rename(columns={"A1": "district_id", "A10": "district_urban_ratio", "A11": "district_salary",
                                "A12": "district_unemployment"})
    df = (loan.merge(acct[["account_id", "acct_open", "frequency"]], on="account_id")
          .merge(owner[["account_id", "birth", "is_female", "district_id"]], on="account_id")
          .merge(n_disp, on="account_id").merge(owner_card, on="account_id", how="left")
          .merge(dist[["district_id", "district_urban_ratio", "district_salary", "district_unemployment"]],
                 on="district_id"))

    # ---- transactions strictly before the loan date, last WINDOW_MONTHS months
    trans["tdate"] = to_date(trans["date"])
    t = trans.merge(df[["loan_id", "account_id", "loan_date", "acct_open"]], on="account_id")
    t = t[(t.tdate < t.loan_date) & (t.tdate >= t.loan_date - pd.DateOffset(months=WINDOW_MONTHS))].copy()
    t["ym"] = t.tdate.dt.year * 12 + t.tdate.dt.month
    t["credit"] = np.where((t.type == "PRIJEM") & (t.k_symbol != "UROK"), t.amount, 0.0)  # exclude credited interest
    t["debit"] = np.where(t.type != "PRIJEM", t.amount, 0.0)
    t["cash_out"] = np.where(t.operation.isin(["VYBER", "VYBER KARTOU"]) & (t.type != "PRIJEM"), t.amount, 0.0)
    t["is_neg"] = (t.balance < 0).astype(int)
    t["is_sanction"] = (t.k_symbol == "SANKC. UROK").astype(int)
    t["src"] = np.where(t.credit > 0, t.operation.fillna("") + "|" + t.k_symbol.fillna(""), None)

    g = t.groupby("loan_id")
    first = g.tdate.min()
    agg = pd.DataFrame({
        "n_txn": g.size(), "credit": g.credit.sum(), "debit": g.debit.sum(), "cash_out": g.cash_out.sum(),
        "avg_balance": g.balance.mean(), "min_balance": g.balance.min(), "neg_balance_share": g.is_neg.mean(),
        "sanction_count": g.is_sanction.sum(),
        "income_source_types": g.src.nunique(),
        "months_with_neg_balance": t[t.is_neg == 1].groupby("loan_id").ym.nunique(),
        "first_txn": first,
    })
    # month-end balance slope (needs >= 3 distinct months)
    me = t.sort_values(["loan_id", "tdate", "trans_id"] if "trans_id" in t else ["loan_id", "tdate"]) \
          .groupby(["loan_id", "ym"]).balance.last().reset_index()
    def slope(d):
        return np.polyfit(d.ym, d.balance, 1)[0] if len(d) >= 3 else np.nan
    agg["balance_slope"] = me.groupby("loan_id").apply(slope, include_groups=False)

    df = df.merge(agg, left_on="loan_id", right_index=True, how="left")
    hist_start = df[["first_txn", "acct_open"]].max(axis=1)  # months of observable history inside the window
    df["months_hist"] = ((df.loan_date - hist_start).dt.days / 30.44).clip(lower=1, upper=WINDOW_MONTHS)
    for c in ["n_txn", "credit", "debit", "cash_out", "sanction_count", "months_with_neg_balance", "income_source_types"]:
        df[c] = df[c].fillna(0)
    df["inflow_per_month"] = df.credit / df.months_hist
    df["txn_per_month"] = df.n_txn / df.months_hist
    df["payment_to_inflow"] = df.payments / df.inflow_per_month.replace(0, np.nan)
    df["amount_to_annual_inflow"] = df.amount / (df.inflow_per_month * 12).replace(0, np.nan)
    df["outflow_to_inflow"] = df.debit / df.credit.replace(0, np.nan)
    df["cash_share"] = df.cash_out / df.debit.replace(0, np.nan)
    df["tenure_months"] = (df.loan_date - df.acct_open).dt.days / 30.44
    df["has_card"] = (df.card_issued.notna() & (df.card_issued < df.loan_date)).astype(int)
    df["monthly_statement"] = (df.frequency == "POPLATEK MESICNE").astype(int)
    df["age"] = (df.loan_date - df.birth).dt.days / 365.25
    df["loan_amount"] = df.amount
    df["loan_duration"] = df.duration
    return df


# --------------------------------------------------------------------------- WoE / IV
class Binner:
    """Quantile bins (or raw categories if <= N_BINS distinct); NaN is its own bin.
    WoE = ln(share of goods / share of bads) with +0.5 smoothing: positive = safer."""

    def fit(self, x, y):
        x = pd.Series(x).reset_index(drop=True)
        y = np.asarray(y)
        vals = x.dropna().unique()
        self.cat = len(vals) <= N_BINS
        self.zero_bin = False
        if not self.cat:
            nz = x.dropna()
            self.zero_bin = (nz == 0).mean() > 1 / N_BINS  # zero-inflated: zeros get their own bin
            pos = nz[nz != 0] if self.zero_bin else nz
            self.edges = np.unique(np.quantile(pos, np.linspace(0, 1, N_BINS + 1)[1:-1])) if len(pos) else np.array([])
        b = self.assign(x)
        G, B = (y == 0).sum(), (y == 1).sum()
        self.woe, self.iv = {}, 0.0
        for k in np.unique(b):
            g, bd = ((y == 0) & (b == k)).sum(), ((y == 1) & (b == k)).sum()
            dg, db = (g + .5) / (G + .5), (bd + .5) / (B + .5)
            self.woe[k] = np.log(dg / db)
            self.iv += (dg - db) * self.woe[k]
        return self

    def assign(self, x):
        x = pd.Series(x).reset_index(drop=True)
        if self.cat:
            return x.fillna(-1e9).to_numpy()
        k = np.searchsorted(self.edges, x.fillna(0), side="right") + (1 if self.zero_bin else 0)
        if self.zero_bin:
            k = np.where(x == 0, 0, k)
        return np.where(x.isna(), -1, k)

    def transform(self, x):
        return np.array([self.woe.get(k, 0.0) for k in self.assign(x)])


def noise_floor(df, n_perm):
    """Per-metric IV a worthless metric earns by chance on this sample (shuffled labels):
    returns (mean, mean + 2 sd). Both depend only on sample size / class balance."""
    rng = np.random.default_rng(1)
    y = df.bad.to_numpy()
    out = np.array([[Binner().fit(df[m], rng.permutation(y)).iv for m in METRICS] for _ in range(n_perm)])
    return dict(zip(METRICS, out.mean(0))), dict(zip(METRICS, out.mean(0) + 2 * out.std(0)))


def fit_scorecard(df, n_perm=30):
    y = df.bad.to_numpy()
    binners = {m: Binner().fit(df[m], y) for m in METRICS}
    iv = {m: binners[m].iv for m in METRICS}
    nmean, nthr = noise_floor(df, n_perm)
    kept = {c: [m for m in ms if iv[m] > nthr[m]] for c, ms in CRITERIA.items()}
    # criterion strength = mean noise-adjusted IV of its kept metrics (0 if none survive)
    strength = {c: float(np.mean([iv[m] - nmean[m] for m in k])) if k else 0.0 for c, k in kept.items()}
    tot = sum(strength.values())
    weights = {c: v / tot for c, v in strength.items()}
    return binners, iv, weights, kept


def criteria_scores(df, binners, kept):
    return pd.DataFrame({c: np.mean([binners[m].transform(df[m]) for m in ms], axis=0) if ms else np.zeros(len(df))
                         for c, ms in kept.items()}, index=df.index)


def composite(cs, weights):
    return sum(cs[c] * w for c, w in weights.items())


def calibrate(S, y):
    lr = LogisticRegression(C=1e6).fit(np.asarray(S).reshape(-1, 1), y)
    return lr.intercept_[0], lr.coef_[0][0]  # log-odds(bad) = a + b*S


def to_score(S, a, b):
    log_odds_good = -(a + b * np.asarray(S))
    factor = PDO / np.log(2)
    offset = ANCHOR_SCORE - factor * np.log(ANCHOR_ODDS)
    return np.clip(np.round(offset + factor * log_odds_good), 300, 850)


def ks(y, s):
    fpr, tpr, _ = roc_curve(y, s)
    return float(np.max(tpr - fpr))


# --------------------------------------------------------------------------- validation
GRADE_BANDS = [(750, "A"), (680, "B"), (600, "C"), (500, "D"), (0, "E")]  # same bands as Scoring_Methodology.md


def grade_of(score):
    return np.select([score >= lo for lo, _ in GRADE_BANDS[:-1]], [g for _, g in GRADE_BANDS[:-1]], "E")


def cross_validate(df, n_splits=5, n_repeats=20):
    """Everything (bins, noise filter, weights) is re-fit on the training folds only."""
    y = df.bad.to_numpy()
    rskf = RepeatedStratifiedKFold(n_splits=n_splits, n_repeats=n_repeats, random_state=7)
    res = {k: [] for k in ["data_driven_weights", "judgment_35_25_20_10_10", "equal_weights", "logistic_on_woe", "best_single_metric"]}
    equal = {c: 1 / len(CRITERIA) for c in CRITERIA}
    all_metrics = {c: list(ms) for c, ms in CRITERIA.items()}
    oof_S, oof_n = np.zeros(len(df)), np.zeros(len(df))
    for i, (tr, te) in enumerate(rskf.split(df, y)):
        d_tr, d_te = df.iloc[tr], df.iloc[te]
        binners, iv, w, kept = fit_scorecard(d_tr)
        S_te = composite(criteria_scores(d_te, binners, kept), w)
        res["data_driven_weights"].append(roc_auc_score(d_te.bad, -S_te))
        cs_all = criteria_scores(d_te, binners, all_metrics)
        res["judgment_35_25_20_10_10"].append(roc_auc_score(d_te.bad, -composite(cs_all, OLD_WEIGHTS)))
        res["equal_weights"].append(roc_auc_score(d_te.bad, -composite(cs_all, equal)))
        X_tr = np.column_stack([binners[m].transform(d_tr[m]) for m in METRICS])
        X_te = np.column_stack([binners[m].transform(d_te[m]) for m in METRICS])
        lr = LogisticRegression(C=0.05, max_iter=2000).fit(X_tr, d_tr.bad)
        res["logistic_on_woe"].append(roc_auc_score(d_te.bad, lr.predict_proba(X_te)[:, 1]))
        best = max(iv, key=iv.get)
        res["best_single_metric"].append(roc_auc_score(d_te.bad, -binners[best].transform(d_te[best])))
        if i < n_splits:  # first repeat only: one out-of-fold composite per loan, for honest calibration
            oof_S[te], oof_n[te] = S_te, 1
    assert oof_n.all()
    return ({k: {"auc_mean": float(np.mean(v)), "auc_sd": float(np.std(v))} for k, v in res.items()}, oof_S)


# --------------------------------------------------------------------------- main
def run(df, tag, write=True):
    y = df.bad
    cv, oof_S = cross_validate(df)
    a, b = calibrate(oof_S, y)                       # calibrate on out-of-fold composites (honest, not overfit)
    oof_score = to_score(oof_S, a, b)

    binners, iv, weights, kept = fit_scorecard(df, n_perm=200)
    nmean, nthr = noise_floor(df, 200)
    cs = criteria_scores(df, binners, kept)
    S = composite(cs, weights)
    score = to_score(S, a, b)

    def table(sc):
        t = pd.DataFrame({"grade": grade_of(sc), "bad": y.values})
        return (t.groupby("grade").agg(loans=("bad", "size"), bad=("bad", "sum"), bad_rate=("bad", "mean"))
                .reindex(list("ABCDE")).fillna(0))
    g_oof, g_in = table(oof_score), table(score)
    print(f"\n===== {tag}: {len(df)} loans, {int(y.sum())} bad ({y.mean():.1%}) =====")
    print("Weights (data-derived vs judgment):")
    for c, w in weights.items():
        print(f"  {c:<30} {w:6.1%}   (was {OLD_WEIGHTS[c]:.0%})   kept: {', '.join(kept[c]) or '-'}")
    print("CV AUC:", {k: f"{v['auc_mean']:.3f}±{v['auc_sd']:.3f}" for k, v in cv.items()})
    print("Grades, out-of-fold (honest):\n", g_oof.round(3).to_string())
    print("Grades, in-sample:\n", g_in.round(3).to_string())
    iv_tbl = pd.DataFrame({"metric": METRICS, "criteria": [METRIC_CRITERIA[m] for m in METRICS],
                           "iv": [iv[m] for m in METRICS], "noise_mean": [nmean[m] for m in METRICS],
                           "noise_threshold": [nthr[m] for m in METRICS]})
    iv_tbl["signal"] = np.where(iv_tbl.iv > iv_tbl.noise_threshold, "above noise", "within noise")
    iv_tbl = iv_tbl.sort_values("iv", ascending=False)
    print(iv_tbl.round(3).to_string(index=False))
    if not write:
        return
    iv_tbl.to_csv(OUT / "metric_iv.csv", index=False)
    summary = {
        "n_loans": int(len(df)), "n_bad": int(y.sum()), "bad_rate": float(y.mean()),
        "criteria_weights": weights, "kept_metrics": kept, "cv_auc": cv,
        "in_sample_auc": float(roc_auc_score(y, -S)), "in_sample_ks": ks(y, -S),
        "oof_auc": float(roc_auc_score(y, -oof_S)), "oof_ks": ks(y, -oof_S),
        "scaling": {"pdo": PDO, "anchor_score": ANCHOR_SCORE, "anchor_odds_good_to_bad": ANCHOR_ODDS,
                    "platt_a": float(a), "platt_b": float(b)},
        "grades_out_of_fold": g_oof.reset_index().to_dict("records"),
        "grades_in_sample": g_in.reset_index().to_dict("records"),
        "woe_bins": {m: {str(k): float(v) for k, v in binners[m].woe.items()} for m in METRICS},
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2, default=float))
    out = pd.concat([df[["loan_id", "account_id", "status", "bad"]].reset_index(drop=True),
                     pd.DataFrame({"score": score, "grade": grade_of(score), "score_out_of_fold": oof_score,
                                   "grade_out_of_fold": grade_of(oof_score)}), cs.reset_index(drop=True).add_prefix("pts_")], axis=1)
    out.to_csv(OUT / "scorecard.csv", index=False)
    con = sqlite3.connect(DB)
    out.to_sql("berka_scorecard", con, if_exists="replace", index=False)
    con.close()


def main():
    df = build_features()
    df.drop(columns=["birth", "acct_open", "card_issued", "first_txn"]).to_csv(OUT / "loan_features.csv", index=False)
    run(df, "ALL LOANS")
    # 1998 loans are right-censored (bad rate 2.5% vs ~13% earlier): they haven't had time to default.
    run(df[df.loan_date < "1998-01-01"].reset_index(drop=True), "EXCLUDING 1998 (censoring check)", write=False)


if __name__ == "__main__":
    main()
