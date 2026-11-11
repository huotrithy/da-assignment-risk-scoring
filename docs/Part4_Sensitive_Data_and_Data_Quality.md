# Part 4: Sensitive Data & Data Quality — Retail Credit Risk Scoring (Stage 3, Berka data)

## 1. Sensitive data

The Berka data is already anonymised: no names, addresses or real account numbers. Some fields are
still sensitive and are handled as follows.

| Field | Why sensitive | Handling |
|---|---|---|
| `client.birth_date` | personal data; combined with district it narrows down a person | used only to compute age at loan; never shown in the dashboard |
| `client.gender` | protected characteristic | decoded but **never used for scoring** (fairness), even though available |
| `trans.partner_account`, `bank` | identifies third parties | used only to count distinct income sources; not displayed |
| `trans.amount`, `balance` | financial data | shown in the dashboard only as monthly totals for the selected loan |
| `district` | location | used only as a candidate metric (unemployment); dropped as weak |

## 2. Data quality issues found and how they were handled

| Issue | Size | Handling |
|---|---|---|
| Czech codes (`PRIJEM`, `SANKC. UROK`, `POPLATEK MESICNE` …) | all coded fields | translated to English in the loader (`scripts/berka/lib/parse.js`) |
| Dates stored as `YYMMDD` text | all date fields | converted to `DATE` (all years are 19xx) |
| Gender hidden in the birth number (month + 50 for women) | 5,369 clients | decoded into `birth_date` and `gender` |
| Files in latin-1 encoding, `;`-separated, quoted | 8 files | read as latin-1 |
| Missing transaction operation | 183,114 rows (interest credits) | kept as NULL; not needed by any metric |
| Missing purpose (`k_symbol`) — empty or a single space | 535,314 rows | normalised to NULL |
| No partner bank/account | 782,812 rows (cash, fees, interest) | NULL; income sources counted only from incoming transfers |
| `?` in district statistics (unemployment '95, crimes '95) | 1 district | NULL; unemployment falls back to 1996 |
| Statement frequency differs (monthly / weekly / after each transaction) | 333 accounts not monthly | metrics use month-end balances from transactions, not statements |
| Short history before some loans | 3.4–22.9 months (median 13) | metrics are per month; window metrics shrunk toward the average (see Scoring_Methodology §6) |
| Cards issued after the loan date | most cards | only cards issued **before** the loan count (36 loans), so no future information leaks into the score |
| Running loans may still go bad (status C) | 403 loans | extra checks on finished loans and on loans at least a year old |
| Few bad loans | 76 (12 in the test set) | caveat stated with every test result |

## 3. Point-in-time rule

Every metric uses only transactions dated in the 12 months **before** the loan date. A check
(`scripts/berka/checks/10_features_check.sql`) confirms that no loan's features use a transaction on
or after its loan date. Using later data would make the score look better than it could be in real use.
