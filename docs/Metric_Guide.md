# Metric Guide

What each candidate metric means, how it is calculated, and what happened to it in the scorecard.
The calculations are in `scripts/berka/10_features.sql`. Numbers are from the run of 2026-11-14.

## 1. Rules that apply to every metric

- **One number per loan.** Each metric is a single value for each loan, calculated once.
- **Window.** Only transactions from the 12 months (365 days) before the loan start date are used.
  Nothing on or after the loan start date is used.
- **Shorter accounts.** If the account was opened less than 12 months before the loan, the metric uses
  the months that exist. "Months observed" = the time from the later of the account opening date or
  365 days before the loan, up to the loan start date.
- **Month-end balance.** The balance after the last transaction of each calendar month in the window.
  An account with a full window has about 12 of these.
- **Currency.** Amounts are in Czech koruna (CZK).
- **Strength.** The result of the pair test on the 477 training loans (Gini). "Pairs right" is the share
  of repaid–defaulted pairs in which the metric points at the defaulted loan.

## 2. Summary

| Metric | Criterion | Riskier when | Pairs right | Strength | Result |
|---|---|---|---|---|---|
| Balance volatility | Balance behaviour | higher | 78% | 0.56 | kept, weight 32.4% |
| Lowest balance | Balance behaviour | lower | 76% | 0.51 | dropped: duplicate of balance volatility |
| Overdraft events | Payment behaviour | higher | 66% | 0.31 | kept, weight 18.0% |
| Penalty-interest charges | Payment behaviour | higher | 65% | 0.29 | dropped: duplicate of overdraft events |
| Joint account | Account relationship | no second user | 63% | 0.25 | kept, weight 14.6% |
| Loan payment ÷ income | Income & capacity | higher | 62% | 0.25 | kept, weight 14.3% |
| Balance trend | Balance behaviour | lower | 59% | 0.19 | kept, weight 10.8% |
| Number of income sources | Income & capacity | none | 59% | 0.17 | kept, weight 9.8% |
| Account age | Account relationship | lower | 55% | 0.10 | dropped: duplicate of balance trend |
| Spend ÷ income | Balance behaviour | higher | 54% | 0.07 | dropped: weak |
| Has a card | Account relationship | no card | 52% | 0.04 | dropped: weak |
| Monthly money in | Income & capacity | lower | 52% | 0.04 | dropped: weak |
| District unemployment | Demographics | higher | 52% | 0.04 | dropped: weak |
| Age at loan start | Demographics | higher | 52% | 0.03 | dropped: weak |

## 3. Balance behaviour

### 3.1 Balance volatility (kept)

**Meaning.** How much the balance swings from month to month, compared with its usual level.
A steady balance gives a low value; a balance that jumps up and down gives a high value.

**Why it can signal risk.** Large swings point to irregular income or spending, which makes a fixed
monthly loan payment harder to plan for.

**Calculation.**

    balance volatility = standard deviation of the month-end balances ÷ average of the month-end balances

The standard deviation measures how far the month-end balances are, on average, from their mean.
Dividing by the average makes accounts of different sizes comparable: a swing of 5,000 is large for an
account that holds 10,000 and small for one that holds 200,000.

**Example.** Two customers, six month-end balances each, both with an average of 20,000.

| | Month-end balances | Average | Standard deviation | Volatility |
|---|---|---|---|---|
| Steady customer | 19,000 · 20,000 · 21,000 · 20,000 · 19,000 · 21,000 | 20,000 | 894 | 894 ÷ 20,000 = **0.04** |
| Swinging customer | 10,000 · 20,000 · 30,000 · 20,000 · 10,000 · 30,000 | 20,000 | 8,944 | 8,944 ÷ 20,000 = **0.45** |

Standard deviation for the swinging customer, step by step:

1. Distance of each balance from the average: −10,000, 0, +10,000, 0, −10,000, +10,000.
2. Square each distance and add them up: 400,000,000.
3. Divide by the number of months minus one (6 − 1 = 5): 80,000,000.
4. Take the square root: 8,944.

A value of 0.45 means the balance is typically 45% away from its average.

**Buckets and points.**

| Balance volatility | Points | Training loans that defaulted |
|---|---|---|
| ≤ 0.29 | 100 | 4.2% |
| > 0.29 to ≤ 0.41 | 70 | 7.6% |
| > 0.41 to ≤ 0.54 | 40 | 9.2% |
| > 0.54 | 10 | 33.1% |

The steady customer (0.04) gets 100 points; the swinging customer (0.45) gets 40.

**Notes.**

- If the average month-end balance is zero or negative, the metric has no value and the loan is placed
  in the riskiest bucket.
- If the window holds only one month-end balance, there is no swing to measure and the value is 0.
  The short-history rule then pulls the points toward the average (Scoring Methodology, section 6).

### 3.2 Lowest balance (dropped: duplicate)

**Meaning.** The lowest point the balance reached in the window. It shows how close the customer came
to running out of money. A negative value means the account was overdrawn.

**Calculation.**

    lowest balance = the smallest balance after any transaction in the window

It uses the balance after every transaction, not only the month-end balances, so a dip in the middle of
a month is counted. It is an amount in CZK, not a ratio.

**Example.** Balances after each transaction over the window: 18,000 → 25,000 → 6,500 → 900 → 14,000 →
22,000. Lowest balance = **900**.

**Evidence.** Default rate by quarter of the training loans, from the lowest values to the highest:
26.2% → 13.8% → 12.1% → 0.8%. A lower lowest balance goes with more defaults.

**Why it was dropped.** It is strong on its own (0.51), but its rank correlation with balance volatility
is −0.58: an account that swings a lot also dips low. The two metrics describe the same behaviour, so
only the stronger one, balance volatility (0.56), is kept.

### 3.3 Balance trend (kept)

**Meaning.** Whether the balance is growing or shrinking over the window. Positive = growing,
negative = shrinking.

**Calculation.**

    balance trend = average change in the month-end balance per month ÷ average month-end balance

The average change per month is the slope of a straight line fitted through all the month-end balances,
so every month counts and one unusual month at the start or end does not decide the result.

**Example.** Month-end balances rise from 20,000 to 25,000 in steps of 1,000 over six months.
Average change = +1,000 per month; average balance = 22,500. Balance trend = 1,000 ÷ 22,500 = **+0.04**:
the balance grows by about 4% of its usual level each month.

**Buckets and points.**

| Balance trend | Points | Training loans that defaulted |
|---|---|---|
| ≤ −0.025 (shrinking by more than 2.5% a month) | 10 | 24.2% |
| > −0.025 | 100 | 9.8% |

### 3.4 Spend ÷ income (dropped: weak)

**Meaning.** The share of the money coming in that goes out again.

**Calculation.** Total withdrawals in the window ÷ total money in during the window.

**Example.** 180,000 in and 171,000 out → 0.95.

**Why it was dropped.** Strength 0.07, below the limit of 0.10. It also overlaps with balance trend
(rank correlation −0.71).

## 4. Payment behaviour

### 4.1 Overdraft events (kept)

**Meaning.** How many times the account went below zero.

**Calculation.** The number of transactions in the window that left a negative balance.

**Example.** Balance 500, then a withdrawal of 2,000 leaves −1,500: one event.

**Buckets and points.**

| Overdraft events | Points | Training loans that defaulted |
|---|---|---|
| 0 | 100 | 9.6% |
| 1 or more | 10 | 100% (20 loans) |

### 4.2 Penalty-interest charges (dropped: duplicate)

**Meaning.** How many times the bank charged penalty interest for a negative balance.

**Calculation.** The number of transactions in the window marked as penalty interest.

**Why it was dropped.** Rank correlation 0.92 with overdraft events: the bank charges the penalty
because the account went negative. Overdraft events is slightly stronger (0.31 against 0.29).

## 5. Income & capacity

### 5.1 Loan payment ÷ income (kept)

**Meaning.** The share of monthly income that the loan payment would take.

**Calculation.**

    loan payment ÷ income = monthly loan payment ÷ (total money in during the window ÷ months observed)

**Example.** Monthly payment 2,000; money in 180,000 over 12 months = 15,000 per month.
2,000 ÷ 15,000 = **0.13**.

**Buckets and points.**

| Loan payment ÷ income | Points | Training loans that defaulted |
|---|---|---|
| ≤ 0.09 | 100 | 7.5% |
| > 0.09 to ≤ 0.17 | 55 | 11.8% |
| > 0.17 | 10 | 22.7% |

### 5.2 Number of income sources (kept)

**Meaning.** How many different accounts send money in by bank transfer.

**Calculation.** The number of different sender accounts among incoming bank transfers in the window.
Cash deposits have no sender account and are not counted.

**Buckets and points.**

| Income sources | Points | Training loans that defaulted |
|---|---|---|
| 0 (no incoming transfers) | 10 | 16.3% |
| 1 or more | 100 | 6.9% |

### 5.3 Monthly money in (dropped: weak)

**Meaning.** Average money coming in per month.

**Calculation.** Total money in during the window ÷ months observed.

**Why it was dropped.** Strength 0.04. The amount of income alone does not separate repaid from
defaulted loans; the loan payment compared with income (5.1) does.

## 6. Account relationship

### 6.1 Joint account (kept)

**Meaning.** Whether a second person is allowed to use the account.

**Calculation.** 1 if the account has more than one registered user, otherwise 0.

**Buckets and points.**

| Joint account | Points | Training loans that defaulted |
|---|---|---|
| No | 10 | 17.2% |
| Yes | 100 | 0.0% (105 loans) |

The data has no date for when the second user joined the account.

### 6.2 Account age (dropped: duplicate)

**Meaning.** How long the customer has had the account.

**Calculation.** Days from the account opening date to the loan start date ÷ 30.44.

**Why it was dropped.** Rank correlation −0.50 with balance trend, exactly at the limit, and balance
trend is stronger (0.19 against 0.10).

### 6.3 Has a card (dropped: weak)

**Meaning.** Whether the account owner had a bank card before the loan.

**Calculation.** 1 if a card was issued to the owner before the loan start date, otherwise 0.

**Why it was dropped.** Strength 0.04.

## 7. Demographics

### 7.1 Age at loan start (dropped: weak)

**Calculation.** Full years from the owner's date of birth to the loan start date. Strength 0.03.

### 7.2 District unemployment (dropped: weak)

**Calculation.** The 1996 unemployment rate of the owner's district (the 1995 rate if 1996 is missing).
Strength 0.04.
