# Credit Risk Scorecard dashboard (Streamlit)

Three tabs over the stored scorecard in `calculated_risk_score`:

- **Portfolio overview** — customers scored, average score, approvals, grade distribution, score histogram with the grade cut-offs.
- **Criteria by grade** — heatmap of average criteria points per grade.
- **Customer drill-down** — pick a customer: metric points (re-run from `scripts/01–05`), weights, contribution, score and grade.

## Run with Docker (port 8502)

From the repo root, with `DATABASE_URL` in `.env`:

```
docker compose up -d --build
```

Open http://localhost:8502. The container must be able to reach the Postgres host in `DATABASE_URL`.

Without compose:

```
docker build -f dashboard/Dockerfile -t credit-risk-dashboard .
docker run -d -p 8502:8502 -e DATABASE_URL="postgresql://user:pass@host:5432/db" credit-risk-dashboard
```

## Run locally

```
pip install -r dashboard/requirements.txt
DATABASE_URL="postgresql://..." streamlit run dashboard/app.py
```

The dashboard only reads data. Re-run `scripts/06_calculate_and_store_scorecard.sql` to refresh the stored scores.
