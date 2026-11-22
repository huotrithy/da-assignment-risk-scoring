# Retail Credit Risk Scoring

An evidence-based credit risk scorecard built on real bank data (the Berka / PKDD'99 Czech bank dataset).
Each loan gets a score out of 100 and a risk grade from A to E. Every metric, weight and threshold is
tested against the real outcome of 682 loans.

- Repository: https://github.com/huotrithy/da-assignment-risk-scoring
- Live dashboard: https://da-assignment.iamrithy.com/

## Folders

| Folder | Content |
|---|---|
| `docs/` | Hand-in documents (see below) |
| `v2_risk_scoring_berka/` | The scorecard on real Berka data: SQL and Node.js pipeline, Streamlit dashboard, tests |
| `archive_v1_risk_scoring_synthetic_data/` | The previous version on synthetic data, kept for comparison |

## Documents (`docs/`)

| File | Content |
|---|---|
| `Final_Report.docx` | Final report: data, data model, method, evidence, scorecard, results, SQL |
| `Final_Presentation.pptx` | Final presentation |
| `Business_Requirements_and_Analytical_Questions.docx` | Business requirements and analytical questions |
| `Part1_Conceptual_Business_Model.md`, `CreditRiskScoring_ConceptualModel.drawio` | Conceptual business model and its diagram |
| `Metric_Guide.md` | What each of the 14 candidate metrics means and how it is calculated |
| `img/` | Charts and icons used by the report and the presentation |

## How to run

Needs Node.js, PostgreSQL and Docker. Put the database connection in `.env` as `DATABASE_URL=postgresql://...`.

```bash
npm install
node v2_risk_scoring_berka/scripts/run_all.js --reload   # download and load the data, then build the scorecard
npm test                                             # unit tests
docker compose up -d --build                         # dashboard on http://localhost:8502
```

Details: `v2_risk_scoring_berka/README.md` (pipeline) and `v2_risk_scoring_berka/dashboard/README.md` (dashboard).
