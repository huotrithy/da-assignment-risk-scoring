# Scripts

- `berka/` — **Stage 3 pipeline** on the real Berka bank data: load, features, fit, score, validate.
  See `berka/README.md`. Run everything with `npm run scorecard`.
- `run_query.js` — ad-hoc query runner: `node scripts/run_query.js -e "SELECT ..."` or a `.sql` file.

The Stage 2 pipeline (synthetic data generator and SQL scripts 00–07) is kept in `archive/stage2/`.
