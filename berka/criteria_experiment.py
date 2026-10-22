"""Which criteria earn their place? Leave-one-out and add-a-criterion tests, same CV as build_scorecard.py.

Run: .venv/bin/python criteria_experiment.py   -> output/criteria_experiment.json
"""
import json
import sqlite3
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import RepeatedStratifiedKFold
import build_scorecard as bs

df = bs.build_features()

# ---- candidate NEW criteria, built only from pre-loan data ----
con = sqlite3.connect(bs.DB)
t = pd.read_sql("select t.account_id, t.date, t.type, t.amount, t.balance from trans t join loan l on l.account_id=t.account_id", con)
orders = pd.read_sql('select account_id, amount, k_symbol from "order"', con)
con.close()
t["tdate"] = bs.to_date(t["date"])
t = t.merge(df[["loan_id", "account_id", "loan_date"]], on="account_id")
t = t[(t.tdate < t.loan_date) & (t.tdate >= t.loan_date - pd.DateOffset(months=bs.WINDOW_MONTHS))].copy()
t["ym"] = t.tdate.dt.year * 12 + t.tdate.dt.month
t["credit"] = np.where(t.type == "PRIJEM", t.amount, 0.0)
m = t.groupby(["loan_id", "ym"]).agg(credit=("credit", "sum")).reset_index()
vol = m.groupby("loan_id").credit.agg(lambda s: s.std() / s.mean() if len(s) >= 3 and s.mean() > 0 else np.nan).rename("inflow_volatility")
active = m[m.credit > 0].groupby("loan_id").ym.nunique().rename("months_with_inflow")
df = df.merge(vol, left_on="loan_id", right_index=True, how="left").merge(active, left_on="loan_id", right_index=True, how="left")
df["months_with_inflow"] = df.months_with_inflow.fillna(0)
monthly_out = (df.debit / df.months_hist).replace(0, np.nan)
df["liquidity_months"] = df.avg_balance / monthly_out   # how many months of spending the balance covers

# standing orders EXCLUDING the loan's own payment order (UVER): undated, so treated as a weaker, 'current commitments' signal
o = orders[orders.k_symbol.fillna("") != "UVER"].groupby("account_id").agg(n_orders=("amount", "size"), orders_amount=("amount", "sum"))
df = df.merge(o, left_on="account_id", right_index=True, how="left").fillna({"n_orders": 0, "orders_amount": 0})
df["orders_to_inflow"] = df.orders_amount / df.inflow_per_month.replace(0, np.nan)

# ---- evaluation: bins/noise filter/weights refit on training folds only ----
BASE = {c: list(ms) for c, ms in bs.CRITERIA.items()}
NEW = {
    "Cash-flow Stability & Liquidity": ["inflow_volatility", "months_with_inflow", "liquidity_months"],
    "Existing Commitments": ["n_orders", "orders_amount", "orders_to_inflow"],
}

def cv_auc(criteria, n_repeats=20):
    bs.CRITERIA = criteria
    bs.METRICS = [x for ms in criteria.values() for x in ms]
    bs.METRIC_CRITERIA = {x: c for c, ms in criteria.items() for x in ms}
    y = df.bad.to_numpy()
    rs = RepeatedStratifiedKFold(n_splits=5, n_repeats=n_repeats, random_state=7)
    out = []
    for tr, te in rs.split(df, y):
        b, iv, w, kept = bs.fit_scorecard(df.iloc[tr])
        S = bs.composite(bs.criteria_scores(df.iloc[te], b, kept), w)
        out.append(roc_auc_score(df.bad.iloc[te], -S))
    return np.array(out)

base = cv_auc(BASE)
def vs_base(a):  # paired on identical folds: mean change, and share of folds where the variant is better
    d = a - base
    return [float(a.mean()), float(d.mean()), float((d > 0).mean())]
res = {"baseline": [float(base.mean()), float(base.std())], "drop": {}, "add": {}}
for c in BASE:
    res["drop"][c] = vs_base(cv_auc({k: v for k, v in BASE.items() if k != c}))
for name, ms in NEW.items():
    res["add"][name] = vs_base(cv_auc({**BASE, name: ms}))
res["add"]["both new"] = vs_base(cv_auc({**BASE, **NEW}))

# IV of the candidate metrics vs their noise threshold
bs.CRITERIA = {**BASE, **NEW}; bs.METRICS = [x for ms in bs.CRITERIA.values() for x in ms]
nm, nt = bs.noise_floor(df, 100)
res["candidate_iv"] = {x: {"iv": bs.Binner().fit(df[x], df.bad.to_numpy()).iv, "noise_threshold": nt[x]} for ms in NEW.values() for x in ms}
json.dump(res, open(bs.OUT / "criteria_experiment.json", "w"), indent=2)

b = res["baseline"]
print(f"baseline (5 criteria): {b[0]:.3f} ± {b[1]:.3f}")
for k, v in res["drop"].items(): print(f"  drop {k:<32} AUC {v[0]:.3f}  change {v[1]:+.3f}  better in {v[2]:.0%} of folds")
for k, v in res["add"].items(): print(f"  add  {k:<32} AUC {v[0]:.3f}  change {v[1]:+.3f}  better in {v[2]:.0%} of folds")
for k, v in res["candidate_iv"].items(): print(f"  {k:<22} IV {v['iv']:.3f}  noise thr {v['noise_threshold']:.3f}  {'KEEP' if v['iv']>v['noise_threshold'] else 'noise'}")
