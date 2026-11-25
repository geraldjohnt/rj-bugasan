# UI / UX Guidelines — Design System

**Status:** Draft for approval (2026-11-25). Visual direction: calm, dense, data-first business software.
Navy default palette (R8-Q3). No gradients, no glassmorphism, no emoji icons, no oversized stat cards.

## 1. Typography
- Font: **Inter** (vendored woff2), fallback `system-ui, "Segoe UI", Roboto, Arial, sans-serif`.
- Numbers: `font-variant-numeric: tabular-nums` everywhere money or quantity appears.
- Base size 14px (business density). Scale:

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| display | 24 / 32 | 600 | Page titles |
| title | 18 / 26 | 600 | Section / dialog titles |
| subtitle | 15 / 22 | 600 | Card/panel headers |
| body | 14 / 20 | 400 | Default |
| body-strong | 14 / 20 | 500 | Emphasis, table key column |
| small | 13 / 18 | 400 | Table headers, helper text |
| caption | 12 / 16 | 500 | Badges, meta |
| kpi | 22 / 28 | 600 | Dashboard figures (deliberately modest) |

## 2. Color system (CSS custom properties, `src/styles/tokens.css`)
Semantic tokens only in components (`--color-primary`, never raw hex).

| Token | Light (Navy) | Dark (Navy) |
|---|---|---|
| --bg | #F5F6F8 | #0E131A |
| --surface | #FFFFFF | #151B24 |
| --surface-2 (headers, subtle fills) | #F0F2F5 | #1B2330 |
| --border | #DCE0E6 | #283240 |
| --border-strong | #C3CAD3 | #364254 |
| --text | #18202C | #E5E9EF |
| --text-muted | #566070 | #A1AAB7 |
| --text-subtle | #868F9C | #758093 |
| --primary | #1F3B60 | #86A8D8 |
| --primary-hover | #182F4D | #A2BDE3 |
| --primary-subtle (selected row, active nav) | #E7EDF5 | #1D2B40 |
| --on-primary | #FFFFFF | #0E131A |
| --success / subtle | #1E7547 / #E6F2EB | #5CC28C / #15291F |
| --warning / subtle | #A15C00 / #FBF0DF | #E3A54B / #2D2313 |
| --danger / subtle | #B3261E / #FBE9E8 | #F0857E / #301918 |
| --info / subtle | #1F5FA8 / #E6EFF9 | #7DB0EA / #142538 |

Predefined palettes (swap the `--primary*` set; neutrals stay): **Navy** (default), **Forest** #23563F, **Graphite** #3A4452,
**Burgundy** #6B2537, **Teal** #155B63. Custom primary color allowed only if it passes WCAG AA (4.5:1) against white text;
otherwise the picker warns and suggests the nearest passing shade. Theme: Light / Dark / Match system.

Status colors: Paid=success, Partial=info, Pending=neutral, Overdue=danger, Cancelled=neutral strikethrough-free muted,
Low stock=warning. Badges always include text, never color alone.

## 3. Spacing, radius, elevation
- 4px grid: 4, 8, 12, 16, 20, 24, 32, 40, 48.
- Radius: 4px controls, 6px panels, 8px dialogs. No pill-shaped cards.
- Elevation: borders do the separating. Shadow only for floating layers (menus, dialogs, toasts): `0 4px 16px rgba(16,24,40,.12)`.
- Density setting: Comfortable (row 40px, control 36px) / Compact (row 32px, control 30px).

## 4. Layout & navigation
- Desktop ≥ 1280: left sidebar 232px (collapsible to 64px icon rail) + top bar 56px (global search, online status, user menu).
- Tablet 768–1279: sidebar collapsed by default.
- Phone < 768: top bar with menu button → drawer; key screens (New Sale, Collections, Record Payment, Customer) have phone layouts; tables become stacked rows showing 3–4 key fields; forms get a sticky bottom action bar.
- Page header: title, short context line, primary action on the right (one primary button per page).
- Sidebar groups:
  - **Overview:** Dashboard, Calendar
  - **Sales:** New Sale, Sales, Collections, Customers
  - **Stock:** Items, Movements, Stock Count, Restocks, Suppliers
  - **Finance:** Expenses, Reports
  - **System:** Activity Log, Backup, Settings
- Offline banner: full-width, warning tone, under the top bar: "Offline — viewing saved data. Changes are disabled until the connection returns."
- Demo banner when running on Mock adapter.

## 5. Components
**Buttons:** Primary (filled), Secondary (outlined), Ghost (text), Danger (filled red, only for confirmed destructive actions).
Heights 30/36/44. Icon + label; icon-only buttons need a tooltip and aria-label. Loading state keeps width and shows a spinner.

**Forms:** Label above field; required marker "*"; helper text below; validation on blur and on submit; on submit with
errors, scroll to and focus the first error. Money input: "₱" prefix, right-aligned, 2 decimals. Quantity input: unit
suffix ("kg" / "sacks"), step 0.01 for kg, 1 for sacks. Dates: native date input with formatted display. Searchable
combobox for items (shows stock and price in each option) and customers (shows contact and outstanding balance).

**Tables:** Sticky header (surface-2, small/600, muted); numeric columns right-aligned; key column body-strong; row hover
surface-2; selected row primary-subtle; row actions in a "more" menu at the row end; toolbar above (search, filters as
chips, date range, export); pagination 25/50/100; column totals row where meaningful. No zebra striping.

**Dialogs:** sm 400 / md 560 / lg 800; phone = full-screen sheet. Destructive confirmations state the consequence
("Cancelling RJ-2026-00012 returns 3 sacks to stock and voids 2 payments totalling ₱1,500") and require a reason.

**Feedback:** Toasts (bottom-right, 4s, success/error) for completed actions; inline banners for page-level errors with
Retry; skeleton rows while loading lists; empty states with one sentence and the next action
("No customers yet. Add your first customer.").

**Icons:** Lucide, 18–20px, stroke 1.75, `currentColor`. One icon per concept, used consistently.

## 6. Key screen patterns
- **Dashboard:** row of 4 compact KPIs (Sales today, Cash collected today, Receivables, Overdue amount/count) →
  two-column: *Collections due next 7 days* (table) | *Low stock* (list) → *Revenue vs cash collected, last 12 months*
  (bar chart) | *Top items this month* (ranked list with inline bars) → *Recent activity*. Date-range selector for charts.
- **New Sale:** left = customer picker + line table with item combobox; right = sticky summary (subtotal, discount,
  total, terms, payment, live installment schedule preview with editable dates). Save button disabled when offline or invalid.
- **Collections:** tabs Overdue / Due today / This week / Upcoming; each row: customer, sale, installment no, due, amount
  remaining, days overdue, contact + "Copy reminder" + "Record payment".
- **Customer detail:** header with balance + reliability badge; tabs Summary, Sales, Payments, Schedule, Contacts.
- **Receipts:** print stylesheet (A4/Letter half-page), business header/logo, monochrome, tabular figures.

## 7. Accessibility
WCAG 2.1 AA contrast; visible 2px focus ring (`--primary`); full keyboard operation (combobox, dialogs trap focus, Esc closes);
labels bound to inputs; `aria-live` for toasts and validation summaries; touch targets ≥ 44px on phone.

## 8. Writing style
Plain English, sentence case, specific verbs ("Record payment", not "Submit"). Money always "₱1,234.50". Dates "Nov 25, 2026".
