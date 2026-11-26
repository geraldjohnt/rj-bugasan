# Requirements

## Confirmed (from interview)
| ID | Requirement | Source |
|---|---|---|
| RQ-001 | Products are rice only. | R1-Q1 |
| RQ-002 | Customers are a mix of types; both registered and walk-in sales allowed; registered preferred. | R1-Q1, R1-Q6 |
| RQ-003 | v1 has a single Owner user; restricted users may be added later. | R1-Q2 |
| RQ-004 | Usable on PC, possibly several devices at once, with shared live data. Phone access deferred (D-014, DF-007); layouts remain responsive. | R1-Q3, D-014 |
| RQ-005 | Single store location. | R1-Q4 |
| RQ-006 | Delivery tracked per sale as Pending / Delivered / Picked up only. | R1-Q6 |
| RQ-007 | Owner enters existing Excel data manually (opening stock, customers, open installments). | R1-Q7 |
| RQ-008 | v1 priorities: collections never forgotten; stock matches physical count; real profit visible. | R1-Q8 |
| RQ-009 | Sack and KG are separate inventory items (e.g., "Dinorado 50kg Sack", "Dinorado per KG"). | R2-Q1 |
| RQ-010 | Each Sack item stores its own sack weight in kg. | R2-Q2 |
| RQ-011 | KG quantities allow 2 decimals (0.01 kg); Sack quantities are whole numbers. | R2-Q3 |
| RQ-012 | Each sale line snapshots the item's current cost price; profit = line revenue - snapshot cost. Later cost edits never change past sales. | R2-Q4 |
| RQ-013 | A KG item can be linked to a Sack item. "Open sack" converts N sacks to N x sack weight kg in one atomic action, logged as two linked movements. Default kg cost = sack cost / sack weight; owner may override. | R2-Q5 |
| RQ-014 | One selling price per item; pre-filled in sale; editable per line; overrides recorded. | R2-Q6 |
| RQ-015 | Every stock adjustment requires a reason (predefined list + Other with note). Stock Count screen records counted vs system quantity and creates adjustment movements for the differences. | R2-Q7 |
| RQ-016 | Sale ID = {prefix}{YYYY}-{5-digit sequence}, e.g., RJ-2026-00001; sequence resets each year; prefix configurable (default "RJ-"); generated atomically, never duplicated. | R3-Q1 |
| RQ-017 | Discount applies to the whole sale, as % or fixed amount; cannot make the total negative. | R3-Q2 |
| RQ-018 | Exactly one customer per sale. Built-in Walk-in customer allowed only for fully paid sales. | R3-Q3 |
| RQ-019 | Customer has: type tag (Household/Store/Reseller/Carinderia/Other), optional credit limit (warn when exceeded), payment reliability indicator derived from payment history. | R3-Q4 |
| RQ-020 | Saved sales cannot be edited. Correction = cancel with reason (reverses stock and payments, all logged) and create a new sale. | R3-Q5 |
| RQ-021 | Cash / Bank Transfer / E-Wallet sales may be partially paid; remainder is an outstanding balance with optional due date; later payments can be recorded. | R3-Q6 |
| RQ-022 | Customers have 0..n alternate contacts: name, address, contact number, email, Facebook, relationship, primary flag, notes. | R3-Q7 |
| RQ-023 | Printable sale and payment receipts for standard printers; PDF via browser print. | R3-Q8 |
| RQ-048 | Business rules A-005..A-009 confirmed: cancellation refunds payments, no partial returns; credit limit warns; reliability thresholds; contact number required; opening-balance entries. | AQ-4 |
| RQ-024 | Installment frequency chosen per sale: Monthly on 15th, Monthly on last day of month, or Semi-monthly (15th and last day). Installment count 2, 3, 4 or 5 (max 5); **default 2** (user request 2026-11-25, D-043; originally 3–5). | R4-Q1, brief, 2026-11-25 |
| RQ-025 | First due date = first qualifying date at least N days after sale date (N default 7, configurable). Each due date editable. | R4-Q2 |
| RQ-026 | Optional down payment; remainder split into installments. | R4-Q3 |
| RQ-027 | Installment amounts in whole pesos; remainder (including centavos) on the last installment; sum always equals the amount financed exactly. | R4-Q4 |
| RQ-028 | Payments apply to the oldest unpaid installment first; excess flows to subsequent installments; payment cannot exceed total outstanding (excess returned as change). | R4-Q5 |
| RQ-029 | No late fees; installments past due and not fully paid are marked Overdue. | R4-Q6 |
| RQ-030 | Owner may reschedule unpaid installments (dates and amounts) if the total remains equal; history and reason recorded. | R4-Q7 |
| RQ-031 | No interest or markup on installment sales. | R4-Q8 |
| RQ-032 | Supplier management; restock records with supplier, items, quantity, unit cost, expected date; status Ordered / Partially Received / Received / Cancelled; stock-in movements only on receipt. | R5-Q1 |
| RQ-033 | On receiving stock at a different cost, prompt to update item cost price (pre-checked). | R5-Q2 |
| RQ-034 | Collections screen: due today, due this week, overdue; shows contact and alternate contacts; one-click copy of a reminder message (template in Settings). | R5-Q3 |
| RQ-035 | Calendar: Month and Agenda views; filters (Sales, Payment due, Overdue, Restocking, Deliveries, Other); custom events; clicking an entry shows its details in a modal, with an optional button to open the source record (D-049). | R5-Q4 |
| RQ-036 | Reports distinguish Revenue (sales at sale date), Cash collected (payments by payment date), Receivables (outstanding), Gross profit (revenue - snapshot cost, at sale date). Cancelled sales excluded. | R6-Q1 |
| RQ-037 | Expenses module: category, amount, date, note; Net profit = Gross profit - expenses for the period. | R6-Q2 |
| RQ-038 | Reports: Sales; Receivables aging (Current/1-30/31-60/60+); Profit by item and period; Customer statement (printable); Inventory valuation, movements, losses and restocks by supplier. All filterable by date range. | R6-Q3 |
| RQ-039 | Reports printable / PDF and exportable to CSV. | R6-Q4 |
| RQ-040 | Login with username + password via Firebase Authentication; each username is tied to a recovery email used for "Forgot password". Passwords are never stored by the app. Owner can change password in Settings. | R7-Q1, R8-Q1 |
| RQ-041 | Session persists across app restarts until logout (Firebase Auth persistence, not a localStorage flag). Idle lock after N minutes (default 30, configurable) requires password. Unauthenticated users see only the login page. | R7-Q2 |
| RQ-042 | One-click full backup export to a file; reminder when last backup is older than 7 days; owner-only restore with typed confirmation. | R7-Q3 |
| RQ-043 | Append-only activity log of significant actions; owner-only searchable screen. | R7-Q4 |
| RQ-044 | When offline: app opens, shows cached data read-only, shows an Offline banner, disables all saving. | R8-Q2 |
| RQ-045 | Light and dark themes; predefined palettes; default palette Navy. | R8-Q3 |
| RQ-046 | Data model and security rules allow adding restricted staff users later. | R8-Q4 |
| RQ-047 | Currency PHP (₱), time zone Asia/Manila, date format "MMM D, YYYY" (configurable), English UI. | R8-Q5, R8-Q6 |

## Deferred
| ID | Requirement | Reason |
|---|---|---|
| DF-001 | Calendar Week and Day views | User chose Month + Agenda for v1 (R5-Q4) |
| DF-002 | Formal purchase orders | Not needed for single store (R5-Q1) |
| DF-003 | Thermal receipt layout | Not selected (R3-Q8) |
| DF-004 | Staff accounts & roles UI | Future (R8-Q4); model prepared now |
| DF-005 | SMS sending, barcode/scale hardware, multiple branches | Not selected for future planning (R8-Q4) |
| DF-006 | Automatic cloud backups (Blaze plan) | Manual export chosen (R7-Q3) |
| DF-007 | Phone access via Firebase Hosting | PC only for now (D-014) |

## Rejected
| ID | Requirement | Reason |
|---|---|---|
| RJ-001 | Late payment fees | R4-Q6 |
| RJ-002 | Installment interest/markup | R4-Q8 |
| RJ-003 | Editing saved sales | Cancel & re-create instead (R3-Q5) |
| RJ-004 | Offline sale queuing | Risk of overselling across devices (R8-Q2) |
| RJ-005 | Language switching | English only (R8-Q6) |
