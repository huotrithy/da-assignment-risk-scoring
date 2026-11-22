# Previous version (synthetic data)

Kept for the record. The previous version scored synthetic customers produced by `generate_data.js`
(Faker plus bootstrap samples of the UCI Statlog German Credit data in `bootstrap/`), using the SQL scripts
in `scripts/` (00–07) and the 13-table schema in `01_schema.sql`. Metrics, weights and thresholds were set
by judgement, because synthetic data has no real loan outcomes to test them against.

| Path | Content |
|---|---|
| `generate_data.js`, `bootstrap/` | synthetic data generator and its UCI German Credit source sample |
| `01_schema.sql`, `scripts/` | database schema and the scoring SQL of the previous version |
| `credit_risk.db`, `postgres_export.sql` | the generated data (SQLite file and PostgreSQL dump) |
| `docs/` | data model, data quality and scoring method of the previous version |
| `presentations/Previous_Presentation.pptx` | the deck presented at the previous review |

The new version replaced the synthetic data with the real Berka bank data: see `../new_version_berka/`
and the final report in `../docs/`.
