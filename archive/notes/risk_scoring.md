Why do banks bother?
Two reasons:
- Protect themselves — every loan that defaults is money the bank loses. Scoring filters out the riskiest applicants (or prices them higher to compensate for the risk).
- Do it consistently and fast — a human reviewing every application by hand is slow and inconsistent (two officers might decide differently on the same customer). A score-based system applies the same rules to everyone and can approve/reject in seconds.

What goes into the score? (the inputs)
The idea is: past behavior and current financial capacity predict future repayment. So the bank looks at things like:
- Can they afford it? → income vs. requested loan amount/monthly installment
- Do they manage money responsibly? → spending habits, account balance trends, overdrafts
- Have they paid back loans before, and did they pay on time? → their own history with this bank (or, in a fuller model, other banks via a credit bureau — but we're skipping that, internal-only)
- How stable is their situation? → employment status, how long they've banked with you

How does the number come out? (the "how")
Simplest version, and the one I'd suggest for your assignment: a scorecard. Each factor above gets assigned points depending on how good/bad it looks (e.g., income comfortably covers the loan → +30 points; had 2 late payments last year → -10 points). Add up the points → total score → map that score to a risk grade (like A, B, C, D, E, similar to a school grade, where A = safest, E = riskiest).

What happens with the score?
- If a customer applied for a loan: the score decides approve / reject, and can also decide the interest rate (riskier customers pay a higher rate to offset the bank's risk).
- If the bank is proactively scanning existing customers: only the good scores (e.g., grade A/B) get sent a loan offer.

That's the whole concept — everything else in our data model (Account, Transaction, Employment/Income, Payment History) exists specifically to feed this scoring calculation, and Loan Application/Loan Offer/Loan Account exist to act on the result.

Does that make sense as the foundation? Happy to go deeper on any one part — e.g., how the points get assigned, or a worked example with fake numbers.