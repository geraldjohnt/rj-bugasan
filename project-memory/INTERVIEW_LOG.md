# Interview Log

## Interview plan (rounds)
| Round | Topics | Status |
|---|---|---|
| 1 | Business operations, users, devices, internet, current process, priorities | Answered 2026-11-25 |
| 2 | Inventory rules, KG/Sack units, quantity precision, pricing, cost | Answered 2026-11-25 |
| 3 | Customers, alternate contacts, sales transactions, Sale ID format, discounts | Answered 2026-11-25 |
| 4 | Payment methods, installments, due-date rules, partial/advance/over-payments, rescheduling | Answered 2026-11-25 |
| 5 | Collections, calendar, deliveries, restocking, suppliers, purchase orders | Answered 2026-11-25 |
| 6 | Reports, dashboard, profitability definitions | Answered 2026-11-25 |
| 7 | Authentication, users/roles, security, backup & recovery | Answered 2026-11-25 |
| 8 | Offline/online behavior, Firebase decisions, appearance, future expansion | Answered 2026-11-25 |

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

---

## Round 4 — Installments and payments (asked & answered 2026-11-25)

| ID | Question | Answer | Resulting requirement / decision |
|---|---|---|---|
| R4-Q1 | Payment frequency | Chosen per sale: Monthly 15th, Monthly end-of-month, or Semi-monthly (15th + end of month). | RQ-024 |
| R4-Q2 | First due date | Next qualifying date at least 7 days after sale (gap configurable in Settings); owner can edit any date. | RQ-025 |
| R4-Q3 | Down payment | Optional. | RQ-026 |
| R4-Q4 | Rounding | Whole pesos; remainder added to last installment. | RQ-027 |
| R4-Q5 | Overpayment | Applied to oldest unpaid installments in order; nothing beyond full balance is stored (returned as change). | RQ-028 |
| R4-Q6 | Late fees | None; overdue flagged only. | RQ-029 |
| R4-Q7 | Rescheduling | Due dates and unpaid amounts may be changed; total unchanged; old values + reason kept. | RQ-030 |
| R4-Q8 | Interest/markup | None; installment total = sale total. | RQ-031 |

Installment count 3/4/5 (max 5) is taken from the original brief (confirmed requirement).

---

## Round 5 — Restocking, collections, calendar (asked & answered 2026-11-25)

| ID | Question | Answer | Resulting requirement / decision |
|---|---|---|---|
| R5-Q1 | Purchasing scope | Suppliers + restock records (Ordered -> Received, partial receipts; stock increases only on receipt). No formal POs. | RQ-032 |
| R5-Q2 | Item cost update on receipt | Prompt "Update item cost?" pre-checked with new cost; owner confirms. (Resolves R5-pending.) | RQ-033 |
| R5-Q3 | Collection help | Collections screen (due today / this week / overdue) with customer + alternate contacts and copyable reminder message; dashboard alert. | RQ-034 |
| R5-Q4 | Calendar views | Month + Agenda list, filters, owner-created custom events. Week/Day views deferred. | RQ-035 |

---

## Round 6 — Reports and profit (asked & answered 2026-11-25)

| ID | Question | Answer | Resulting requirement / decision |
|---|---|---|---|
| R6-Q1 | Profit timing for installments | Profit recognized at sale date; separate "Cash collected" figure. | RQ-036, D-010 |
| R6-Q2 | Expense tracking | Yes, simple expenses (category, amount, date, note); Gross and Net profit. | RQ-037 |
| R6-Q3 | Reports | Sales, Receivables aging, Profit by item & period, Customer statement, Inventory & restock. | RQ-038 |
| R6-Q4 | Export | Print/PDF and CSV. | RQ-039 |

---

## Round 7 — Login, security, backup (asked & answered 2026-11-25)

| ID | Question | Answer | Resulting requirement / decision |
|---|---|---|---|
| R7-Q1 | Sign-in method | Username + password (Claude had recommended email). | RQ-040, D-011 |
| R7-Q2 | Session duration | Stay signed in until logout, with idle lock requiring password. | RQ-041 |
| R7-Q3 | Backup | One-click export file + weekly reminder; owner-only restore with confirmation. | RQ-042 |
| R7-Q4 | Activity log | Yes, owner-only, read-only, searchable. | RQ-043 |

## Round 8 — Offline, appearance, future, locale, Firebase (asked & answered 2026-11-25)

| ID | Question | Answer | Resulting requirement / decision |
|---|---|---|---|
| R8-Q1 | Password recovery with username login | Hidden recovery email behind the username; "Forgot password" sends reset link there. | RQ-040, D-011 |
| R8-Q2 | Offline behavior | View-only with Offline banner; saving disabled until reconnected. | RQ-044, D-012 |
| R8-Q3 | Default color direction | Navy blue (Claude had recommended deep green). | RQ-045 |
| R8-Q4 | Future expansion to design for | Staff accounts & roles only. | RQ-046 |
| R8-Q5 | Locale | PHP, Asia/Manila, format "Nov 25, 2026". (Confirms A-001..A-003.) | RQ-047 |
| R8-Q6 | Interface language | English. | RQ-047 |
| R8-Q7 | Firebase project | User creates it following a written guide (FIREBASE_SETUP.md). | D-013 |

## Round 9 — Restock batches, oldest stock first (asked & answered 2026-11-27)

User request: "Restocking should have ID also. Since restocking might have different prices from time to time. But oldest stock comes first when someone buys."

| ID | Question | Answer | Resulting requirement / decision |
|---|---|---|---|
| R9-Q1 | Which price varies per restock? | On receiving, the user enters both the **cost price** and the **selling price** per batch. | D-050 |
| R9-Q2 | Oldest-first always automatic? | Automatic, **owner can override** the batch on a sale line. | D-050 |
| R9-Q3 | Batch ID format | `RJ-RS-<supplier_id>-0001`. | D-051 |
| R9-Q4 | Supplier code inside the ID | Auto number `SUP001`, `SUP002`… (existing suppliers too). | D-051 |
| R9-Q5 | Numbering scope | Counter per supplier, never resets; **one batch ID per delivery** (all items of one receipt share the ID; each item line inside keeps its own cost and price). | D-051 |
| R9-Q6 | Sale line spanning batches with different prices | Use the **weighted average** price (e.g. 2 × ₱1,500 + 3 × ₱1,550 = ₱7,650 ÷ 5 = ₱1,530/sack). User: "please note it so that we can just change it later on." | D-052 |
| R9-Q7 | Selling prices held by a batch | **Cash only.** The Payday price is set during the sale (trusted customers may get the cash price); it stays editable on the sale line. | D-052 |
| R9-Q8 | Stock already on hand at go-live | Owner enters old batches **by hand**. | D-053 |
| R9-Q9 | Stock not covered by any batch | **Block** selling that stock until batches cover it. | D-053 |
| R9-Q10 | Must hand-entered batches equal current stock? | They **can't exceed** current stock (may be entered a few at a time); they don't change the stock count. | D-053 |
| R9-Q11 | Price shown on Items / poster / new sale | **Oldest open batch's** cash price, with a hint when the next batch differs. | D-052 |

## Round 10 — Other charges on a sale (asked & answered 2026-11-27)

User request: "In sale, the user can add items like delivery fee, other fees, and more. Best if the user can just add the item name, and the price for that."

| ID | Question | Answer | Resulting requirement / decision |
|---|---|---|---|
| R10-Q1 | Reporting | Separate "Other charges" (in the sale total, zero cost, own line in reports). | D-054 |
| R10-Q2 | Discount | Applies to items only, not charges. | D-054 |
| R10-Q3 | Open balance / installment | Charges are part of the balance and split like the rest. | D-054 |
| R10-Q4 | Quick entry | Type freely; previously used names suggested with their last price. | D-054 |

## Round 11 — During the Phase 13 build (2026-11-27)

| ID | Question / instruction | Answer | Resulting decision |
|---|---|---|---|
| R11-Q1 | Approve the batch + charges design? | "Approved, start building Phase 13." | BQ-1, BQ-2 answered |
| R11-Q2 | (User, unprompted) Existing stock | "Just register the old stock to batches. Just assume that they belong to the first batch." Replaces R9-Q8/Q9/Q10. | D-055 |
| R11-Q3 | (User) Sample data button | "Remove the buttons Load sample data on all pages. It should only live in the settings but password protected." | D-057 |

## Round 12 — Restock expenses and quick item add (asked & answered 2026-11-28)

User request: "When restocking, there should be expenses to input in there … shipping fee, trucking, fuel, or labor … the user can input it freely … restocking 150 sacks of 2500 per sack. And the expenses total is 6000 … 40 additional to the price on each sack. But still there will be another additional to that including the profit … the user can also add an item inside adding a restock … these expenses can be saved to the expenses and be tracked connected to a restock. But expenses that are added directly in the expenses page might not be tagged in a restock and it's okay."

| ID | Question | Answer | Resulting decision |
|---|---|---|---|
| R12-Q1 | When are restock expenses entered? | **At receiving** (per delivery), because costs can change (e.g. supplier changes the agreed 2,500). Everything stays **editable after receiving**, including the individual item lines. | D-060, D-063 |
| R12-Q2 | What happens to the per-unit share (6,000 ÷ 150 = 40)? | **Show only.** Batch cost stays the supplier unit cost (2,500); the expenses reduce profit through the Expenses total. | D-061 |
| R12-Q3 | Split across several items | **By value** (line qty × unit cost). | D-061 |
| R12-Q4 | How they appear on the Expenses page | New category **"Restock"**; the typed name (Trucking, Fuel…) is the description; linked to the restock. | D-062 |
| R12-Q5 | What is editable after receiving | **Unit cost, selling price and expense lines.** Quantity is not (fix with a stock adjustment). A cost change updates the batch cost for stock on hand and for profit on sales already made from that batch. | D-063 |
| R12-Q6 | "It doesn't need to be saved" meant? | The lines **are saved** to the Expenses page. User first meant "not saved as a future suggestion", then changed their mind: **save the names as suggestions** (search "trucking", "fuel", "labor"…), and a new name can still be typed without setting anything up. | D-062 |
| R12-Q7 | Where to add a brand-new item | **On the restock order form** (New/Edit restock), not in the Receive dialog. | D-064 |
| R12-Q8 | Fields of that quick new-item dialog | **The full item form** (same as Items → Add item). | D-064 |
| R12-Q9 | Where to show cost incl. expenses | **Receive dialog** only. | D-061 |
| R12-Q10 | Help with the profit on top? | **No** — owner types the selling price; the app shows profit per unit (price − cost incl. expenses). | D-061 |
| R12-Q11 | Editing a linked expense after receiving | **Update the Expenses entry in place**, old/new amounts in the Activity log; removing a line voids its expense. | D-062 |
| R12-Q12 | Void/edit a linked expense from the Expenses page? | **Only from the restock**; the Expenses page shows "Restock RS-… · Trucking" with a link. | D-062 |
| R12-Q13 | Approve the design (EQ-1)? | "Approve, build Phase 14." | D-060 … D-064 |

## Round 13 — Item expense & credit price at receiving, SKU, promised payment dates (asked & answered 2026-11-28)

User request: "In receiving the restock, the user wants to input the Received, Unit Cost, Expense, Cash Price, and Credit Price … separate expenses on each item … Keep the Expenses line below the items … when adding a sale … paylater price … default value of the credit price … editable. … check what we are using as SKU … searchable … displayed when adding item in the restock or anywhere … plan what to use and the prefix. … a customer can sometimes just pay partial amount … promises to pay another time … the user can set another due date … additional and should not replace the first payment nor the next one … also reflect on the calendar … if the next promised date is the same as the next due date … the notification in the calendar is now 2 … purpose … track down the collection date of each due."

Findings shown to the user before asking: the sale form already fills the Payday price for pay-later terms and lets it be edited (D-046); the Receive dialog had Received / Unit cost / Cash price + delivery expense lines (D-060/D-061); SKU was an optional free-text field, already searchable on Items, never auto-filled, not shown in pickers; partial payments already worked (row PARTIAL, stays due on its date) but no promised date existed.

| ID | Question | Answer | Resulting decision |
|---|---|---|---|
| R13-Q1 | Per-item "Expense" amount at receiving means | **Total for that line** (app shows the per-unit share) | D-065 |
| R13-Q2 | How the per-item expense counts | **Like the other restock expenses**: in cost incl. expenses and profit per unit; saved on the Expenses page as "Restock"; batch cost unchanged | D-065 |
| R13-Q3 | Where the Credit price typed at receiving is saved | **On the item only** (updates the item's single credit price) | D-066 |
| R13-Q4 | Name of the second price | **"Credit price"** everywhere (replaces "Payday price") | D-066 |
| R13-Q5 | How SKUs are created | **Automatic, editable**; existing items without an SKU get one; typed SKUs are kept; must be unique | D-067 |
| R13-Q6 | SKU format | **RJ-<first 3 letters of variety>-NNN**, e.g. RJ-DIN-001 | D-067 |
| R13-Q7 | Item without a variety | **Use the first 3 letters of the item name** | D-067 |
| R13-Q8 | Where SKU is shown/searchable | **Item pickers** (New sale, restock order, Receive, Edit delivery), **lists & details** (Items list, restock/sale lines, movements, batches, reports, CSV), **printed receipts**. Not on the price poster | D-067 |
| R13-Q9 | Promised date on a partial payment | **Required** | D-068 |
| R13-Q10 | When it is required | Only when, after the payment, an installment **due today or overdue** is still not fully paid (early partial payments need none) | D-068 |
| R13-Q11 | Which sales | **All with a balance** (installments, open balance, opening balances) | D-068 |
| R13-Q12 | Promise amount | **The unpaid rest of that installment** (automatic) | D-068 |
| R13-Q13 | Promised date after the next due date | **Allowed with a warning** | D-068 |
| R13-Q14 | Missed promise | Installment stays **overdue from its original due date**; promise flagged **missed**; a new promise can be added; all promises kept as history | D-069 |
| R13-Q15 | When a promise is kept | Remainder **fully paid on or before the promised date** | D-069 |
| R13-Q16 | Reliability ("paid on time") | **A kept promise counts as on time** | D-069 |
| R13-Q17 | Where promises show | **Calendar** (own entry, so same date as a due date = 2 entries), **Collections**, **Sale detail** schedule, **Customer statement**. Not the Dashboard | D-069 |
| R13-Q18 | Edit delivery (D-063) | Also edits the **per-item expense** (updates its linked expense) and **Credit price** (updates the item) | D-065, D-066 |
| R13-Q19 | Approve the design (FQ-1)? | "Approve, build Phase 15." | D-065 … D-069 |
