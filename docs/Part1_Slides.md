---
SLIDE: Title
---
Retail Credit Risk Scoring
Conceptual Business Model — Part 1

---
SLIDE: Business Overview
---
Who we are:
- A retail bank offering personal loan products to individual customers

What we're trying to achieve:
- Make faster, more consistent decisions on incoming loan applications
- Proactively identify existing customers creditworthy enough to offer a loan
  before they even ask
- Build a credit risk scoring capability using data we already hold
  internally — account activity, spending behavior, income, and past loan
  repayment performance

---
SLIDE: Customer
---
Represents an individual retail customer of the bank.

Key attributes:
- customer_id
- full_name
- date_of_birth
- national_id
- customer_since_date

---
SLIDE: Account
---
A deposit/transaction account held by the customer.

Key attributes:
- account_id
- customer_id (FK)
- account_type
- open_date
- status

---
SLIDE: Transaction
---
Individual transaction activity on an account — source of spending/behavior signal.

Key attributes:
- transaction_id
- account_id (FK)
- transaction_date
- amount
- category (e.g., spending type)

---
SLIDE: Account Balance History
---
Daily/EOD balance snapshot per account — distinct from individual
Transactions, used to compute 3-6 month average balance/stability features.

Key attributes:
- balance_history_id
- account_id (FK)
- snapshot_date
- closing_balance

---
SLIDE: Income Source
---
Customer's declared income source(s). Supports multiple concurrent sources
(salary, business, rental) and preserves history over time.

Key attributes:
- income_id
- customer_id (FK)
- income_type (salary / business / rental / other)
- monthly_income
- effective_date

---
SLIDE: Loan Product
---
Catalog of loan products the bank offers.

Key attributes:
- product_id
- product_name
- interest_rate
- min_amount / max_amount
- tenor_months

---
SLIDE: Loan Offer
---
Proactive, bank-initiated offer of a product to a customer (no application yet).
Bridges Customer and Loan Product (many-to-many).

Key attributes:
- offer_id
- customer_id (FK)
- product_id (FK)
- offer_date
- status

---
SLIDE: Loan Application
---
A formal request by a customer for a specific loan product.

Key attributes:
- application_id
- customer_id (FK)
- product_id (FK)
- application_date
- requested_amount
- status

---
SLIDE: Risk Score
---
Output of the scoring process — numeric score and/or risk grade.
Tied to a customer; optionally tied to the application that triggered it.

Key attributes:
- score_id
- customer_id (FK)
- application_id (FK, nullable)
- score_value
- risk_grade
- score_date

---
SLIDE: Loan Account
---
An approved and disbursed application becomes an active loan account.

Key attributes:
- loan_account_id
- application_id (FK)
- principal_amount
- disbursement_date
- outstanding_balance
- status

---
SLIDE: Payment History
---
Record of each installment payment made against a loan account.

Key attributes:
- payment_id
- loan_account_id (FK)
- due_date
- amount_due
- amount_paid
- status (on-time / late / missed)

---
SLIDE: Delinquency / Default Event
---
Raised when a loan account crosses a missed-payment threshold.

Key attributes:
- event_id
- loan_account_id (FK)
- event_date
- days_past_due
- event_type

---
SLIDE: Collateral (optional)
---
Asset pledged against a loan account for secured products. Drop if out of scope.

Key attributes:
- collateral_id
- loan_account_id (FK)
- collateral_type
- estimated_value

---
SLIDE: Relationships Summary
---
- Customer *owns* Account: 1-to-many
- Account *generates* Transaction: 1-to-many
- Account *records* Account Balance History: 1-to-many
- Customer *declares* Income Source: 1-to-many
- Customer ↔ Loan Product (via Loan Offer): many-to-many
- Customer *receives* Loan Offer: 1-to-many
- Loan Offer *references* Loan Product: many-to-1
- Customer *submits* Loan Application: 1-to-many
- Loan Application *is for* Loan Product: many-to-1
- Loan Application *triggers* Risk Score: 1-to-1
- Customer *accumulates* Risk Score: 1-to-many
- Loan Application *becomes* Loan Account: 1-to-1
- Loan Account *tracks* Payment History: 1-to-many
- Loan Account *raises* Delinquency Event: 1-to-many
- Loan Account *is secured by* Collateral: 1-to-many (optional)

---
SLIDE: Conceptual Diagram
---
[Insert exported PNG/SVG from CreditRiskScoring_ConceptualModel.drawio here]
- Customer at center
- Account → Transaction / Account Balance History branch
- Income Source branch
- Loan Offer/Loan Application → Loan Product branch
- Risk Score branch
- Loan Account → Payment History / Delinquency Event / Collateral branch
