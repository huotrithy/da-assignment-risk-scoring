# Credit Risk Scorecard dashboard (Streamlit)

Five tabs over the scorecard in schema `berka` (real Berka bank loans, built by `npm run scorecard` — see new_version_berka/scripts/README.md):

- **Portfolio** — loans scored, approval rate, default rate approved vs rejected, test Gini; loans per grade; the real default rate per grade on train and test; score histogram with the thresholds.
- **Evidence** — strength (Gini) of every candidate metric and why it was kept or dropped; default rate across each metric's value groups; correlation between metrics (duplicates); weights from each metric's strength; checks on unseen, finished and older loans; short-history check.
- **Criteria by grade** — heatmap of average criterion points per grade.
- **Loan drill-down** — pick a loan: value → bucket → points → weight for each metric, the 12 months of money in/out and balance before the loan, warning-sign transactions, then what really happened.
- **Export data** — download the scorecard tables as CSV files (loan scores, metrics per loan, points, buckets, weights, evidence, results by grade). Raw transactions and personal fields are not included.

## Run with Docker (port 8502)

From the repo root, with `DATABASE_URL` in `.env`:

```
docker compose up -d --build
```

Open http://localhost:8502. The container must be able to reach the Postgres host in `DATABASE_URL`.

Without compose:

```
docker build -f new_version_berka/dashboard/Dockerfile -t credit-risk-dashboard .
docker run -d -p 8502:8502 -e DATABASE_URL="postgresql://user:pass@host:5432/db" credit-risk-dashboard
```

## Run locally

```
pip install -r new_version_berka/dashboard/requirements.txt
DATABASE_URL="postgresql://..." streamlit run new_version_berka/dashboard/app.py
```

The dashboard only reads stored tables. Run `npm run scorecard` to refresh them.

## Smoke test (inside the image)

```
docker run --rm --env-file .env -v "$PWD/new_version_berka/tests:/tests" data-analytic-assignment-dashboard sh -c "pip install -q pytest && python -m pytest -q /tests/dashboard_smoke.py"
```
