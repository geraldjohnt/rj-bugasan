# Data Dictionary

**Status:** Draft for approval (2026-11-25). Conventions: money `…C` = integer centavos; quantity `qtyH` = integer
hundredths of unit; business dates `YYYY-MM-DD`; `createdAt/updatedAt` server timestamps; `createdBy` = uid.
All main docs carry `createdAt, createdBy, updatedAt, updatedBy` (not repeated below).

## users/{uid}
| Field | Type | Notes |
|---|---|---|
| username | string | lower-case, unique (mirrors usernames doc) |
| displayName | string | |
| role | `owner` \| `staff` | v1 only owner |
| active | bool | rules deny inactive users |
| preferences | map | theme, palette, density, sidebarCollapsed |

## usernames/{username}
| email | string | recovery + sign-in email |
| uid | string | |

## settings/general · sales · appearance · backup
general: businessName, address, contactNumber, email, logoDataUrl (small, ≤ 200 KB), currency `PHP`, dateFormat, timeZone `Asia/Manila`, idleLockMinutes (30).
sales: saleIdPrefix `RJ-` (D-035), sequenceDigits 5, defaultInstallmentCount (2; was 3 until 2026-11-25), defaultFrequency, firstDueGapDays (7), reminderTemplate, receiptFooter, adjustmentReasons[], expenseCategories[], customerTypes[].
appearance (business defaults): defaultTheme, defaultPalette `navy`.
backup: lastBackupAt, reminderDays (7).

## counters/{name}
| next | int | next sequence number |

## items/{id}
| Field | Type | Notes |
|---|---|---|
| name | string | e.g. "Dinorado 50kg Sack" — required, unique among active items |
| nameLower | string | search |
| variety | string | e.g. "Dinorado" — groups sack & kg items |
| category | string | e.g. Premium, Regular, Well-milled, Glutinous, Brown |
| unit | `SACK` \| `KG` | |
| sackWeightKg | number | SACK only, > 0 |
| linkedSackItemId / linkedKgItemId | string? | pair link |
| sku | string? | optional |
| qtyH | int ≥ 0 | current stock |
| priceC | int ≥ 0 | cash selling price per unit |
| installmentPriceC | int ≥ 0 or null | payday / installment price per unit (D-046); null = same as cash |
| costC | int ≥ 0 | current cost per unit |
| minStockH | int ≥ 0 | low-stock threshold |
| supplierId | string? | preferred supplier |
| description | string? | |
| status | `ACTIVE` \| `ARCHIVED` | |

## inventoryMovements/{id}
| itemId, itemName, unit | | snapshot |
| type | enum | BR-012 |
| qtyDeltaH | int | + in / − out |
| qtyBeforeH, qtyAfterH | int | |
| unitCostC | int | cost at movement time |
| reason, note | string? | required for ADJUSTMENT |
| refType, refId | string? | SALE / RESTOCK / STOCK_COUNT / SACK_OPEN |
| groupId | string? | links SACK_OPEN pair |
| businessDate | date | |

## stockCounts/{id}
date, status `DRAFT`\|`FINALIZED`, note, lines[{itemId, itemName, unit, systemQtyH, countedQtyH, diffH}], finalizedAt.

## customers/{id}
| Field | Type | Notes |
|---|---|---|
| name, nameLower | string | required |
| type | string | Household / Store / Reseller / Carinderia / Other |
| address, contactNumber, email, facebook, notes | string? | contactNumber required for registered customers *(A-008)* |
| creditLimitC | int? | optional |
| alternateContacts | array | {id, name, relationship, address, contactNumber, email, facebook, notes, isPrimary} |
| outstandingC | int | denormalized |
| totalPurchasesC | int | non-cancelled sales |
| lastSaleDate | date? | |
| paidInstallments, paidOnTime | int | reliability (BR-025) |
| status | `ACTIVE` \| `ARCHIVED` | `WALK_IN` is system |
| system | bool | true only for the built-in `WALK_IN` document (D-029) |

## sales/{saleId}
| Field | Type | Notes |
|---|---|---|
| saleNo | string | = doc ID |
| kind | `SALE` \| `OPENING_BALANCE` | |
| saleDate | date | |
| customerId, customerName, customerContact | | snapshot |
| lines | array | {itemId, itemName, unit, sackWeightKg, qtyH, listPriceC, unitPriceC, priceOverridden, unitCostC, lineTotalC} |
| subtotalC, discountType (`NONE`\|`PERCENT`\|`FIXED`), discountValue, discountC, totalC | | discountValue: hundredths of a percent (PERCENT) or centavos (FIXED) |
| costC | int | Σ snapshot line cost (COGS of this sale) |
| terms | `FULL` \| `OPEN_BALANCE` \| `INSTALLMENT` | |
| paymentMethod | `CASH` \| `BANK` \| `EWALLET` \| `INSTALLMENT` | as chosen on the form |
| plan | map? | {count, frequency, downPaymentC, firstDueGapDays} |
| paidC, balanceC | int | denormalized |
| paymentStatus | `UNPAID` \| `PARTIAL` \| `PAID` | |
| status | `ACTIVE` \| `CANCELLED` | |
| fulfillment | `PENDING` \| `DELIVERED` \| `PICKED_UP` | |
| deliveryDate | date? | |
| notes | string? | |
| cancel | map? | {reason, at, by} |
| creditLimitOverride | bool | logged when warning bypassed |
| paymentIds | string[] | every payment of this sale (D-033) |
| installmentCount | int | number of receivable rows `{saleId}-1 … -n` (D-033) |
| cancel | map? | {reason, at, by, refundedC} |

## installments/{saleId}-{n}
saleId, customerId, customerName, saleDate, kind (`INSTALLMENT`\|`OPEN_BALANCE`), no, count, dueDate (date?, optional for open balance),
amountC, paidC, status (`PENDING`\|`PARTIAL`\|`PAID`\|`CANCELLED`), paidDate (date when fully paid), revisions[{at, by, reason, from{dueDate, amountC}, to{…}}].

## payments/{paymentNo}
saleId, customerId, customerName, date, amountC, method (`CASH`\|`BANK`\|`EWALLET`), reference, note, allocations[{installmentId, amountC}],
isDownPayment (bool), atSale (bool, taken when the sale was saved — D-032), status (`ACTIVE`\|`VOIDED`), void {reason, at, by, refund (true when voided by a sale cancellation)}.
Payment numbers use the year of the payment date (`payment-YYYY` counter).

## suppliers/{id}
name, contactPerson, contactNumber, email, address, notes, status.

## restocks/{restockNo}
restockNo (= doc ID, `RS-YYYY-NNNNN`, counter `restock-YYYY`, year of the order date), supplierId, supplierName, orderDate, expectedDate (date?), status (`ORDERED`\|`PARTIALLY_RECEIVED`\|`RECEIVED`\|`CANCELLED`),
lines[{itemId, itemName, unit, qtyOrderedH, qtyReceivedH, unitCostC}], receipts[{date, lines[{itemId, itemName, unit, qtyH, unitCostC}], by, byName, at (ISO)}], totalCostC (Σ ordered × cost), notes,
cancel {reason, at, by}?, closed {reason, at, by, short[{itemId, qtyH}]}? (D-038).

## expenses/{id}
date, category (BR-063 list), amountC > 0, note (required for Other — D-039), status (`ACTIVE`\|`VOIDED`), void{reason, at, by}.

## calendarEvents/{id}
title (≤ 120), date, time (`HH:MM` or ''), note, category `OTHER` (only custom events are stored — D-040).

## activityLogs/{id}
at, by, byName, action (e.g. `SALE_CREATE`, `SALE_CANCEL`, `PAYMENT_VOID`, `ITEM_PRICE_CHANGE`, `STOCK_ADJUST`, `SCHEDULE_REVISE`, `RESTORE`), entityType, entityId, summary, changes (small map of before/after).

## Phase 11 additions (2026-11-25)
- `sales` kind `OPENING_BALANCE` (id `OB-YYYY-NNNNN`, counter `ob-YYYY`): `lines: []`, `description` (required, ≤ 200), `totalC = balanceC` at creation, `paidC 0`, `terms` OPEN_BALANCE (1 row) or INSTALLMENT (2–5 rows), `paymentMethod 'OPENING'`, `plan null`, `fulfillment 'PICKED_UP'` (unused), `costC 0`.
- `installments.openingBalance: true` on rows of an opening balance.
- `settings/backup`: `lastBackupAt` (ISO string), `lastBackupBy`, `lastBackupByName`, `lastBackupRecords`.
- `settings/restore`: `active` (bool — opens the restore window in the rules), `startedAt`, `finishedAt`, `by`, `byName`, `backupExportedAt`, `written`, `deleted`.
- activityLogs actions added: `OPENING_BALANCE_CREATE`, `BACKUP_EXPORT`, `BACKUP_RESTORE` (entityType `backup`).
