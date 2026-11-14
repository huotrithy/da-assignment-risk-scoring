# Stage 2 archive (synthetic data)

Kept for the record. Stage 2 scored synthetic customers produced by `generate_data.js` (Faker plus
bootstrap samples of the UCI Statlog German Credit data in `bootstrap/`), using SQL scripts
`scripts/00–07` and the 13-table schema in `01_schema.sql`. The documents in `docs/` describe that
version. Its database tables are still in the public schema of the project database.

Stage 3 replaced it with the real Berka bank data — see `scripts/berka/README.md` and
`docs/Scoring_Methodology.md` at the repository root.
