# Business Rules

**Status:** Draft for approval (2026-11-25). Source references point to INTERVIEW_LOG / REQUIREMENTS.

## 0. Numbers and dates
- BR-001 Money is stored as **integer centavos**. No floating-point money anywhere.
- BR-002 Quantities are stored as **integer hundredths of the unit** (`qtyH`). 1 sack = 100; 2.75 kg = 275. Sack quantities must be multiples of 100 (whole sacks); KG allows any integer hundredth (0.01 kg).
- BR-003 Business dates (sale date, due date, payment date, expense date, expected delivery) are stored as `YYYY-MM-DD` strings in Asia/Manila. Audit timestamps (`createdAt`) are server timestamps.
- BR-004 Rounding to the centavo uses round-half-up on integers. Line total = round(qtyH × unitPriceCentavos / 100).

## 1. Items and stock
- BR-010 Sack and KG are separate items (RQ-009). A Sack item has `sackWeightKg`. A KG item may link to one Sack item.
- BR-011 Item quantity changes **only** through an inventory movement written in the same transaction. Movements are immutable.
- BR-012 Movement types: OPENING, SALE, SALE_CANCEL, RESTOCK_RECEIPT, ADJUSTMENT, COUNT_ADJUSTMENT, SACK_OPEN_OUT, SACK_OPEN_IN.
- BR-013 Every ADJUSTMENT requires a reason: Spillage, Spoilage/Pests, Count correction, Damaged sack, Personal use, Other (note required for Other).
- BR-014 Stock may never go negative. Sales, adjustments and sack opening are rejected if they would.
- BR-015 Low stock: `quantity <= minStock`. Stock value = quantity × current cost price.
- BR-016 **Open sack**: choose N whole sacks (≤ sack stock). In one transaction: sack item −N, linked KG item +N × sackWeightKg, two movements sharing a `groupId`. KG cost defaults to round(sack cost ÷ sack weight) and may be overridden; the KG item's cost price is set to the confirmed value (RQ-013).
- BR-017 **Stock count**: owner enters counted quantities; on finalize, each difference becomes a COUNT_ADJUSTMENT movement. A finalized count is read-only.
- BR-018 Archived items cannot be sold or restocked but keep all history. Items with history are never deleted.
- BR-019 Editing price or cost affects only future transactions; every change is written to the activity log.

## 2. Customers
- BR-020 One customer per sale. A built-in **Walk-in** customer exists and cannot be edited or archived.
- BR-021 Walk-in sales must be paid in full at the time of sale. Any balance requires a registered customer.
- BR-022 Alternate contacts belong to their customer (embedded); they are not customers.
- BR-023 Customer summary fields (outstanding balance, total purchases, last sale, reliability counters) are updated in the same transaction as the sale/payment that changes them.
- BR-024 Credit limit (optional): if outstanding + new balance would exceed it, show a warning; owner may proceed; the override is logged. *(Assumption A-006: warn, not block.)*
- BR-025 Reliability = share of fully-paid installments that were paid on or before their due date. Good ≥ 90%, Fair 70–89%, Poor < 70%, "New" with fewer than 3 paid installments. *(Assumption A-007.)*
- BR-026 Customers with an outstanding balance cannot be archived.

## 3. Sales
- BR-030 Sale ID = `{prefix}{YYYY}-{NNNNN}` (default prefix `RJ-`), YYYY = year of sale date, sequence resets yearly. Generated inside the sale transaction from a counter document and used as the Firestore document ID, so a duplicate is impossible.
- BR-031 Quantity > 0; sacks whole; KG in 0.01 steps. The total requested quantity of an item across all lines must not exceed available stock — checked live in the form and re-checked inside the transaction.
- BR-032 Each line snapshots item name, unit, sack weight, list price, unit price (may be overridden), and **unit cost** (RQ-012). Price below cost shows a warning.
- BR-032a (D-046) List price depends on the terms: **Full** → item cash price (`priceC`); **Open balance** / **Installment** → item payday price (`installmentPriceC`, falls back to the cash price). The owner may still override a line price.
- BR-033 Discount is on the whole sale only: percentage (0–100, up to 2 decimals) or fixed (≤ subtotal). Total = subtotal − discount ≥ 0.
- BR-034 Payment terms: **Full** (Cash/Bank/E-Wallet, paid = total), **Open balance** (Cash/Bank/E-Wallet, paid < total, optional due date), **Installment**.
- BR-035 Saved sales are locked. Allowed later changes: delivery status, notes, payments, schedule revisions, cancellation.
- BR-036 **Cancel**: reason required. In one transaction: status CANCELLED, stock returned (SALE_CANCEL movements), all active payments voided as "refunded — sale cancelled", open installment rows cancelled, customer summary updated, activity logged. *(Assumption A-005: cancellation implies refund of payments; partial returns are not supported in v1 — cancel and re-create.)*
- BR-037 Delivery status: Pending / Delivered / Picked up, with optional delivery date shown on the calendar.
- BR-038 Cancelled sales are excluded from revenue, profit and stock-out figures but remain visible.

## 4. Installments and balances
- BR-040 Receivable rows (`installments` collection) exist for every sale with a balance: N rows for an installment plan, 1 row for an open balance.
- BR-041 Plan options: count 2, 3, 4 or 5 (default 2 — D-043); frequency Monthly-15th, Monthly-end-of-month, or Semi-monthly (15th and end of month); optional down payment.
- BR-042 First due date = first candidate date ≥ sale date + gap days (default 7). Following dates = next candidates. Example: sale Nov 12, Monthly-15th → Dec 15, Jan 15, … Sale Nov 12, Semi-monthly → Nov 30, Dec 15, Dec 31, … End of month respects month length (Feb 28/29).
- BR-043 Amount financed = total − down payment. Each installment = floor(financed ÷ count) to whole pesos; the last installment takes the remainder (including centavos). The sum always equals the amount financed exactly. Example: ₱2,500 / 3 → 833, 833, 834. A plan whose regular installment would be below ₱1 is rejected.
- BR-044 Installment status stored: PENDING, PARTIAL, PAID, CANCELLED. **Overdue is derived** (due date < today and not PAID), so it is always current without a background job.
- BR-045 Owner may change due dates of unpaid installments and redistribute unpaid amounts. A partially paid installment cannot go below what is already paid. The total must remain equal. Each revision stores old values, new values, reason, who and when.
- BR-046 No interest or late fees. *(Superseded in part by D-046: an item may have a higher payday price for pay-later sales.)*

## 5. Payments
- BR-050 Each payment has its own number `PAY-{YYYY}-{NNNNN}`, date, amount, method (Cash/Bank/E-Wallet), optional reference no.
- BR-051 Allocation: oldest unpaid installment first; excess flows to the next ones. A payment may not exceed the sale's outstanding balance; any surplus is handed back as change (not stored).
- BR-052 Payments are never edited or deleted. Mistakes are corrected by **voiding** (reason required), which reverses the allocations in one transaction; then a correct payment is recorded.
- BR-053 Down payment and amount paid at sale are recorded as payments, so cash collected always comes from the payments collection.
- BR-054 Receipts can be printed for any sale or payment.

## 6. Restocking, suppliers, expenses
- BR-060 Restock status: ORDERED → PARTIALLY_RECEIVED → RECEIVED, or CANCELLED (only if nothing received). Stock increases only on receipt.
- BR-061 Each receipt records date and received quantities per line (≤ remaining ordered; owner may edit the order line first). Each received line creates a RESTOCK_RECEIPT movement.
- BR-062 If received unit cost differs from item cost, a pre-checked "Update item cost" option is shown (RQ-033).
- BR-063 Expenses: date, category (Delivery/Fuel, Rent, Wages, Utilities, Supplies, Other), amount, note (required for Other — D-039). Corrected by voiding, not deleting.
- BR-064 A partially received order whose remainder will not arrive may be **closed** with a reason (status RECEIVED, received stock kept) — D-038.

## 7. Reporting definitions (RQ-036)
- **Revenue** = Σ totals of non-cancelled sales by sale date (opening-balance entries excluded).
- **Cash collected** = Σ non-voided payments by payment date.
- **Receivables** = Σ unpaid amounts of open installment rows (as of now or a chosen date).
- **COGS** = Σ (qtyH × unitCost / 100) of non-cancelled sale lines by sale date.
- **Gross profit** = Revenue − COGS. **Net profit** = Gross profit − non-voided expenses in the period.
- Aging buckets by days past due: Current (not yet due), 1–30, 31–60, 61+.

## 8. Opening balances (RQ-007)
- BR-080 Opening stock is entered as OPENING movements.
- BR-081 Existing installment accounts from Excel are entered as **Opening balance** entries (`OB-{YYYY}-{NNNNN}`): customer, original date, description, remaining balance and remaining schedule. They create receivable rows but no stock movement and no revenue/profit. Stored as a `sales` document of kind `OPENING_BALANCE` with no lines (D-045); 1 row (plain balance, due date optional) or 2–5 installments; not added to the customer's total purchases. Payments, reschedule and cancel use the normal sale rules.

## 9. Sessions, security, backup
- BR-090 All data operations require an authenticated, active user. Authorization is enforced by Firestore Security Rules, not by hidden UI.
- BR-091 Idle lock after N minutes (default 30) — re-enter password to continue.
- BR-092 All writes require a connection; offline = read-only with banner.
- BR-093 Activity log entries are written with the action they describe and are never editable or deletable.
- BR-094 Backup reminder when the last backup is older than 7 days. Restore requires typing `RESTORE` and is logged.
