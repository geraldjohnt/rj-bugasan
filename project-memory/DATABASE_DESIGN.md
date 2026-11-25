# Database Design (Firestore)

**Status:** Draft for approval (2026-11-25). Field-level detail in DATA_DICTIONARY.md.

## 1. Logical model
```
User 1─* ActivityLog
Customer 1─* AlternateContact (embedded)
Customer 1─* Sale 1─* SaleLine (embedded)
Sale 1─* Installment (receivable rows)      Sale 1─* Payment *─* Installment (via allocations)
Item 1─* InventoryMovement *─1 (Sale | Restock | Adjustment | StockCount | SackOpen)
Item(KG) *─1 Item(Sack) (link)
Supplier 1─* Restock 1─* RestockLine (embedded) ; Restock 1─* Receipt (embedded)
Expense ; CalendarEvent (custom only) ; Settings ; Counter
```

## 2. Collections
| Collection | Doc ID | Embedded | Why separate / embedded |
|---|---|---|---|
| `users` | Auth uid | preferences | Role & active flag read by rules |
| `usernames` | lower-case username | — | Pre-login lookup → email (get only, no list) |
| `settings` | `general`, `sales`, `appearance`, `backup` | — | Small singletons |
| `counters` | e.g. `sale-2026`, `payment-2026`, `restock-2026`, `ob-2026` | — | Atomic sequence inside transactions |
| `items` | auto | — | Updated by many transactions |
| `inventoryMovements` | auto | — | Unbounded history; queried per item and per date |
| `stockCounts` | auto | lines[] | Bounded (number of items); read as a whole |
| `customers` | auto; `WALK_IN` reserved | alternateContacts[] | Contacts are few, always shown with customer |
| `sales` | Sale ID (e.g. `RJ-2026-00001`) | lines[], plan{}, cancel{} | Lines are immutable and bounded; ID as key prevents duplicates |
| `installments` | `{saleId}-{n}` | revisions[] | Must be queried across sales by due date/status (Collections, Calendar, Aging) |
| `payments` | Payment no (e.g. `PAY-2026-00001`) | allocations[] | Cash-collected queries by date; immutable except void |
| `suppliers` | auto | — | |
| `restocks` | Restock no (`RS-2026-00001`) | lines[], receipts[] | Bounded per order |
| `expenses` | auto | — | Queried by date |
| `calendarEvents` | auto | — | Custom events only; others derived from sales/installments/restocks |
| `activityLogs` | auto | — | Append-only |

Document size: the largest docs (sales with many lines, restocks) stay far below the 1 MiB limit.

## 3. Key transactions (all-or-nothing)
| Operation | Reads | Writes |
|---|---|---|
| Create sale | counter, items in sale, customer | counter, sale, items (qty), movements, installments, payment(s), customer summary, activity log |
| Record payment | sale, its open installments, customer, counter | payment, installments, sale (paid/balance), customer summary, activity log |
| Void payment | payment, its installments, sale, customer | payment (void), installments, sale, customer, activity log |
| Cancel sale | sale, items, installments, active payments, customer | sale, items, movements, installments, payments (void), customer, activity log |
| Reschedule | sale, installments | installments (+revision), activity log |
| Open sack | sack item, kg item | both items, 2 movements, activity log |
| Adjust / finalize count | items | items, movements, stockCount, activity log |
| Receive restock | restock, items | restock, items, movements, activity log |

Firestore limits respected: all reads before writes; < 500 writes per transaction; transactions retry on contention
(this is what prevents two devices from overselling the same stock).

## 4. Composite indexes (`firebase/firestore.indexes.json`)
| Collection | Fields | Used by |
|---|---|---|
| installments | status ASC, dueDate ASC | Collections, Calendar, Dashboard, Aging |
| installments | customerId ASC, dueDate ASC | Customer account |
| sales | customerId ASC, saleDate DESC | Customer sales history |
| sales | status ASC, saleDate DESC | Sales list, reports |
| payments | customerId ASC, date DESC | Customer payments |
| payments | saleId ASC, date ASC | Sale detail |
| payments | status ASC, date ASC | Cash collected report |
| inventoryMovements | itemId ASC, createdAt DESC | Item history |
| inventoryMovements | type ASC, createdAt DESC | Losses / restock reports |
| restocks | status ASC, expectedDate ASC | Calendar, restock list |
| expenses | status ASC, date ASC | Net profit |
| activityLogs | entityType ASC, at DESC | Activity log filter |

## 5. Security rules outline (`firebase/firestore.rules`)
```
isActive()  = signedIn && get(users/uid).active == true
isOwner()   = isActive() && get(users/uid).role == 'owner'
usernames/{u}:             get: true (lookup before login); list/write: false (owner via setup only)
settings, items, customers, suppliers, sales, installments, restocks, expenses, calendarEvents, counters:
                           read: isActive(); create/update: isOwner() + shape checks; delete: false
                           (calendarEvents delete: isOwner())
inventoryMovements:        read: isActive(); create: isOwner(); update/delete: false
payments:                  read: isActive(); create: isOwner(); update: isOwner() && only void fields change; delete: false
activityLogs:              read: isOwner(); create: isActive(); update/delete: false
items invariant:           request.resource.data.qtyH >= 0
```

## 6. Backup format
A single JSON file: `{ app: "rj-ims", schemaVersion, exportedAt, collections: { name: [ {id, data} ] } }`.
Timestamps serialized as ISO strings. Restore writes in batches of ≤ 500 (not one atomic operation — documented in KI-005).
