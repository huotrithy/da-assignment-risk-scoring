# Part 1: Conceptual Business Model — Retail Credit Risk Scoring

## 1. Overview

This business model outlines the structure of a retail bank that evaluates
the creditworthiness of its customers, both when they actively apply for a
loan and proactively by scanning its existing customer base for candidates
who may qualify for a loan offer.

The model draws entirely on data the bank already holds internally about its
own customers — account activity, transaction/spending behavior, employment
and income, and prior loan performance — rather than external credit bureau
data. A **Risk Score** is the central analytical output: it can be triggered
either by a customer submitting a **Loan Application**, or by a periodic
batch scan of existing customers that produces a **Loan Offer** for those who
qualify.

## 2. Core Entities

### 2.1 Customer
The account holder in the bank's retail ecosystem. Every other entity in this
model ultimately traces back to a Customer. A Customer:
- Holds one or more deposit/transaction Accounts.
- Has one or more Income Source records used to assess repayment capacity.
- May submit one or more Loan Applications over time.
- May receive one or more proactive Loan Offers.

### 2.2 Account
A deposit or transaction account held by the customer at the bank (savings,
current, etc.). This is the source of the behavioral data used in scoring —
without an account relationship, the bank has no internal signal to score the
customer on.

### 2.3 Transaction
Individual transaction records against an Account: deposits, withdrawals,
spending by category, recurring payments, etc. Aggregated over time, these
form the "spending habit" signal used as an input to the Risk Score (e.g.,
average balance, income regularity, spending-to-income ratio).

### 2.4 Income Source
A declared or verified source of income belonging to the customer —
salary/employment, business ownership, rental income, or other. Modeled as
one row per income source per point in time (not a single overwritten
field), so:
- A customer can have **multiple concurrent** income sources (e.g., a salary
  plus rental income).
- A business owner with no formal employer simply has a record with
  `income_type = business` instead of forcing an employer field.
- History is preserved as income changes over time (new record added, not
  overwritten), since risk scoring depends on current repayment capacity but
  trend/stability also matters.

### 2.5 Account Balance History
An end-of-day (EOD) balance snapshot for an account, captured once per day
(or per month-end, depending on granularity chosen). Distinct from
Transaction — Transaction records individual movements, while this entity
captures the *resulting daily position*, which is what a 3-6 month average
balance / stability feature is actually computed from.

### 2.6 Loan Product
The catalog of loan products the bank offers (e.g., personal loan, auto
loan, home improvement loan), each with its own terms — interest rate,
tenor, minimum/maximum amount, and eligibility rules.

### 2.7 Loan Offer
A proactive, bank-initiated offer of a specific Loan Product to a specific
Customer, generated when a periodic scan finds the customer's score
qualifies them — without the customer having applied. This is the bridge
entity that connects Customer and Loan Product in a many-to-many fashion:
one customer can receive multiple offers (for different products), and one
product can be offered to many customers.

### 2.8 Loan Application
A formal request by a Customer for a specific Loan Product — either
self-initiated or converted from a Loan Offer the customer accepted. This is
the event that (in the reactive case) triggers a Risk Score calculation and
an approve/reject/price decision.

### 2.9 Risk Score
The output of the credit risk scoring process: a numeric score and/or risk
grade (e.g., A–E) computed from the customer's account behavior, income, and
prior loan history. A Risk Score is always tied to one Customer, and may
optionally be tied to the specific Loan Application that triggered it (for
application-time scores) or stand alone (for periodic/batch scores used to
generate Loan Offers).

### 2.10 Loan Account
Once a Loan Application is approved and disbursed, it becomes an active Loan
Account — the servicing record tracking principal, outstanding balance,
disbursement date, and status (current, closed, written off, etc.).

### 2.11 Payment History
The record of each installment payment made against a Loan Account: due
date, amount due, amount paid, payment date, and status (on-time, late,
missed). This is both an operational record and a key input back into future
Risk Scores for repeat borrowers.

### 2.12 Delinquency / Default Event
A record raised when a Loan Account misses a payment threshold or is
classified as delinquent/default (e.g., 30/60/90 days past due, write-off).
Tracked separately from routine Payment History because it drives
collections workflows and materially affects future risk scoring.

### 2.13 Collateral (optional)
For secured loan products, the asset(s) pledged against a Loan Account
(e.g., property, vehicle). Included if you want to model secured lending;
can be dropped to keep the model smaller.

## 3. Relationships

1. **Customer *owns* Account** — One-to-Many. A customer can hold multiple
   accounts; each account belongs to one customer.
2. **Account *generates* Transaction** — One-to-Many. An account generates
   many transactions; each transaction belongs to one account.
3. **Account *records* Account Balance History** — One-to-Many. An account
   accumulates a daily/EOD balance snapshot each day; each snapshot belongs
   to one account.
4. **Customer *declares* Income Source** — One-to-Many. A customer can have
   multiple income sources (salary, business, rental, etc.), including
   concurrently; each income source record belongs to one customer.
5. **Customer *is targeted by* Loan Offer, which *promotes* Loan Product**
   (Customer ↔ Loan Product) — Many-to-Many. A customer can be offered many
   loan products; a loan product can be offered to many customers.
   **Loan Offer** is the associative entity resolving this.
6. **Customer *receives* Loan Offer** — One-to-Many. A customer can receive
   multiple offers; each offer targets one customer.
7. **Loan Offer *references* Loan Product** — Many-to-One. Many offers can
   reference the same loan product.
8. **Customer *submits* Loan Application** — One-to-Many. A customer can
   submit multiple applications over time; each application belongs to one
   customer.
9. **Loan Application *is for* Loan Product** — Many-to-One. Many
   applications can be for the same loan product.
10. **Loan Application *triggers* Risk Score** — One-to-One. Each
    application triggers exactly one risk score at decision time.
11. **Customer *accumulates* Risk Score** — One-to-Many. A customer
    accumulates multiple risk scores over time (application-triggered or
    periodic batch scores); each score belongs to one customer.
12. **Loan Application *becomes* Loan Account** — One-to-One. An approved
    application becomes exactly one loan account.
13. **Loan Account *tracks* Payment History** — One-to-Many. A loan account
    has many scheduled/actual payments; each payment record belongs to one
    loan account.
14. **Loan Account *raises* Delinquency Event** — One-to-Many. A loan
    account can have multiple delinquency events over its life; each event
    belongs to one loan account.
15. **Loan Account *is secured by* Collateral** — One-to-Many (optional). A
    loan account may be secured by one or more collateral items.

## 4. Diagram (to be drawn)

The relationships above should be drawn as a bubble/node diagram (like the
airline example in the assignment brief), with arrows showing direction and
cardinality:

- Solid single-headed arrow = "one" side
- Solid double/crow's-foot arrow = "many" side
- The Customer ↔ Loan Product connection should visually pass through the
  Loan Offer bubble to show the many-to-many resolution.

Suggested layout: put **Customer** near the center, with **Account →
Transaction / Account Balance History** branching one direction, **Income
Source** branching another, and **Loan Application/Loan Offer → Loan
Product**, **Risk Score**, **Loan Account → Payment History/Delinquency
Event/Collateral** branching out the other side — mirroring how the sample
diagram fans concepts out from a central "Customer" node.

A ready-made version of this diagram is available as
`CreditRiskScoring_ConceptualModel.drawio` — open it in draw.io/diagrams.net,
adjust as needed, and export to PNG/SVG for your slide.
