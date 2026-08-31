# Reference Dataset Attribution

**Dataset:** Statlog (German Credit Data)
**Source:** UCI Machine Learning Repository
**URL:** https://archive.ics.uci.edu/ml/machine-learning-databases/statlog/german/german.data
**Original contributor:** Prof. Dr. Hans Hofmann, Universität Hamburg

## What it contains
1000 real historical German credit applications, 20 attributes each (checking
account status, loan duration, credit history, purpose, credit amount,
savings, employment length, age, housing, job, etc.) plus a binary label:
`1 = good credit`, `2 = bad credit` (~700 good / ~300 bad — a 30% "bad" rate,
intentionally oversampled relative to real-world portfolios so both classes
are well represented for teaching/modeling purposes).

## How it's used in this project
This dataset does **not** match our relational schema (it's a single flat
table, our model has 13 normalized entities), so it is not imported directly.
Instead, `generate_data.js` **bootstrap-samples** individual fields from it —
real ages, real loan amounts, real loan durations, and the real good/bad
label — to drive our synthetic Loan Application / Risk Score / Loan Account
generation, so those values are statistically grounded in a real dataset
rather than arbitrary made-up ranges. Everything else (customers, accounts,
transactions, balance history) is fully synthetic, since German Credit Data
has no equivalent fields for those.
