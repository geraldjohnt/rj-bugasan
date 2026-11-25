# Interview Log

## Interview plan (rounds)
| Round | Topics | Status |
|---|---|---|
| 1 | Business operations, users, devices, internet, current process, priorities | Answered 2026-11-25 |
| 2 | Inventory rules, KG/Sack units, quantity precision, pricing, cost | Answered 2026-11-25 |
| 3 | Customers, alternate contacts, sales transactions, Sale ID format, discounts | Answered 2026-11-25 |
| 4 | Payment methods, installments, due-date rules, partial/advance/over-payments, rescheduling | Pending |
| 5 | Collections, calendar, deliveries, restocking, suppliers, purchase orders | Pending |
| 6 | Reports, dashboard, profitability definitions | Pending |
| 7 | Authentication, users/roles, security, backup & recovery | Pending |
| 8 | Offline/online behavior, Firebase decisions, appearance, future expansion | Pending |

---

## Round 1 — Business operations and environment (asked & answered 2026-11-25)

| ID | Question | Answer | Resulting requirement / decision |
|---|---|---|---|
| R1-Q1 | What does the business sell, and to whom? | Only rice. Buyers are a mix (households, stores, resellers, etc.). | Catalog = rice varieties only. Mixed customer types. |
| R1-Q2 | Who will use the system, and in what roles? | Just the owner for now; may add restricted users later. | v1: single Owner account. Design roles so restricted users can be added later. |
| R1-Q3 | How many devices, used at the same time, and is internet reliable? | Multiple devices possibly at once; phone and PC; internet is good. | Cloud database required (multi-device, real-time). Responsive UI for phone + PC. → D-004 |
| R1-Q4 | One location or several stores/warehouses? | One store only. | Single location; no multi-warehouse stock. |
| R1-Q5 | Typical volume (sales/day, products, customers)? | "Does it matter?" — Claude: only for Firestore free-tier sizing; small-store volume assumed. | Assume small volume (A-004). |
| R1-Q6 | Typical sale workflow; walk-in customers; deliveries? | Registered and walk-in customers; registered preferred. Delivery tracked only as Pending / Delivered / Picked up. | Walk-in allowed; registered encouraged. Simple fulfillment status per sale. |
| R1-Q7 | Current record-keeping and data to migrate? | Records are in Excel; owner will input existing data manually. | No import tool needed in v1; manual entry incl. opening stock and open installments. |
| R1-Q8 | Biggest pain points and first-version priorities? | Priorities: collections not forgotten, stock matching counts, knowing real profit. | v1 top priorities: (1) installment/collection tracking, (2) accurate stock, (3) accurate profit. |

**User preference (2026-11-25):** Present questions as selectable options with a recommended choice; avoid free-typing.

---

## Round 2 — Inventory, units, pricing, cost (asked & answered 2026-11-25)

| ID | Question | Answer | Resulting requirement / decision |
|---|---|---|---|
| R2-Q1 | How to track stock for rice sold by sack and by kg? | Separate Sack and KG items. Owner converts sacks to kg at his discretion. (Claude had recommended single KG stock; user chose separate items.) | RQ-009, D-006 |
| R2-Q2 | Sack weight | Set per item. | RQ-010 |
| R2-Q3 | KG precision | 2 decimals (0.01 kg). Sacks are whole numbers. | RQ-011 |
| R2-Q4 | Cost method for profit | "Just on how much is inputted." Confirmed in follow-up: snapshot the item's current cost price on each sale line; owner updates item cost when supplier prices change. | RQ-012, D-007 |
| R2-Q5 | Sack-to-KG conversion | Link KG item to its Sack item; one-click "Open sack". Default cost per kg = sack cost / sack weight, but the owner can override the per-kg cost. | RQ-013 |
| R2-Q6 | Price tiers | One selling price per item, pre-filled in the sale, editable per sale line (override logged). | RQ-014 |
| R2-Q7 | Stock corrections | Adjustments need a reason from a list (Spillage, Spoilage, Count correction, Other + note), plus a Stock Count screen that records differences. | RQ-015 |

---

## Round 3 — Customers, sales, Sale ID, discounts (asked & answered 2026-11-25)

| ID | Question | Answer | Resulting requirement / decision |
|---|---|---|---|
| R3-Q1 | Sale ID format | RJ-YYYY-NNNNN (e.g., RJ-2026-00001), sequence resets yearly; prefix configurable. | RQ-016, D-008 |
| R3-Q2 | Discount scope | Whole sale only (% or fixed amount). | RQ-017 |
| R3-Q3 | Customer per sale | One customer per sale. Built-in Walk-in customer for fully paid sales; registered customer required for installment/unpaid balances. | RQ-018 |
| R3-Q4 | Extra customer fields | Customer type tag; credit limit; payment reliability indicator. (Photo/ID not selected.) | RQ-019 |
| R3-Q5 | Editing saved sales | Saved sales are locked; fix by cancel (with reason; stock and payments reversed) and re-create. | RQ-020, D-009 |
| R3-Q6 | Partial payment on non-installment sales | Yes; remainder becomes an open balance with optional due date; registered customer required. | RQ-021 |
| R3-Q7 | Alternate contact extra fields | Relationship, Primary alternate flag, Notes. | RQ-022 |
| R3-Q8 | Receipts | Printable sale and payment receipts (normal printer), savable as PDF via print dialog. No thermal layout. | RQ-023 |
