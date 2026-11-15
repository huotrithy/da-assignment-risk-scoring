# Previous version archive (synthetic data)

Kept for the record. The previous version scored synthetic customers produced by `generate_data.js`
(Faker plus bootstrap samples of the UCI Statlog German Credit data in `bootstrap/`), using SQL scripts
`scripts/00–07` and the 13-table schema in `01_schema.sql`. The documents in `docs/` describe that
version. Its database tables are still in the public schema of the project database.

`presentations/`:

- `Previous_Presentation.pptx` — the deck as presented at the previous review (hand-edited).
- `Previous_Presentation_generated.pptx` — the generated deck it was edited from.
- `Interim_Presentation_Berka.pptx` — first deck on the Berka data, superseded by
  `docs/Final_Presentation.pptx`.

The new version replaced the synthetic data with the real Berka bank data — see
`scripts/berka/README.md` and `docs/Scoring_Methodology.md` at the repository root.
