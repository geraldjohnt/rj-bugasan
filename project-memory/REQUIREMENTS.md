# Requirements

## Confirmed (from interview)
| ID | Requirement | Source |
|---|---|---|
| RQ-001 | Products are rice only. | R1-Q1 |
| RQ-002 | Customers are a mix of types; both registered and walk-in sales allowed; registered preferred. | R1-Q1, R1-Q6 |
| RQ-003 | v1 has a single Owner user; restricted users may be added later. | R1-Q2 |
| RQ-004 | Usable on phone and PC, possibly several devices at once, with shared live data. | R1-Q3 |
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

## Proposed / Deferred / Rejected
_None yet._
