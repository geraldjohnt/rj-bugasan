# Project Overview — RJ Inventory and Sales Management System

**Status:** Draft for approval (2026-11-25)

## Business
A single rice store in the Philippines (PHP, Asia/Manila). Sells rice only, by the sack and by the kilo, to a mix
of households, sari-sari stores, carinderias and resellers. Sales are cash, bank transfer, e-wallet, open balance
(pay later) or formal installment (2–5 payments). Some orders are delivered. Records are currently kept in Excel.

## Users
v1: one Owner account, used from a PC and a phone, possibly at the same time. Restricted staff accounts are a
planned future addition (the design accommodates them now).

## Goals (owner's priorities, R1-Q8)
1. **No forgotten collections** — every peso owed has a due date, shows up on time, and is easy to chase.
2. **Stock matches the bodega** — every stock change is traceable and explained; physical counts reconcile.
3. **Real profit** — revenue, cash collected, receivables, gross profit and net profit are separate and correct.

## Modules (v1)
Login & session · Dashboard · Sales (incl. receipts, delivery status, cancellation) · Collections ·
Installments & payments · Customers (incl. alternate contacts) · Inventory (items, sack/kg linking, open sack,
movements, adjustments, stock count) · Restocking & suppliers · Expenses · Calendar · Reports · Activity log ·
Backup & restore · Settings.

## Delivery
A folder opened by double-clicking `index.html`. React UMD + pre-compiled JavaScript, all files local.
Data in Firebase Firestore (internet required to save; view-only when offline). See SYSTEM_ARCHITECTURE.md.
