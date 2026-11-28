# Firebase Setup Guide (for the owner)

**Status:** Draft (2026-11-25). Free "Spark" plan is enough. Takes about 15 minutes.

1. Go to https://console.firebase.google.com and sign in with the business Google account.
2. **Add project** → name it e.g. `rj-bugasan` → Google Analytics: off → Create.
3. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable** (leave "Email link" off) → Save.
4. **Authentication → Users → Add user**: enter the **recovery email** you want for the owner and a strong password. Copy the **User UID** shown.
5. **Build → Firestore Database → Create database** → location **asia-southeast1 (Singapore)** (closest to PH; cannot be changed later) → start in **production mode**.
6. **Project settings (gear) → General → Your apps → Web (</>)** → nickname `rj-ims` → do **not** enable Hosting yet → Register. Copy the `firebaseConfig` block (apiKey, authDomain, projectId, …). This is not a password; it only identifies the project.
7. Send the developer: the `firebaseConfig` block, the owner UID, and the username you want (e.g. `rjowner`). **Never send the password.**
8. **Temporary, for the compatibility test only:** Firestore → Rules → replace with the rules below → Publish.
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /_spike/{doc} { allow read, write: if request.auth != null; }
     }
   }
   ```
   Then the developer opens `build/spike.html` by double-click, signs in, and records the results.
   These rules are replaced by the real rules before go-live.
9. The developer will provide `firestore.rules` and `firestore.indexes.json` to paste/deploy, and a one-time setup page that creates the `users` and `usernames` records.

Optional (recommended for phone access, decision D-014): Firebase **Hosting** to open the app on a phone via an HTTPS link.

## Phase 2 — go-live of login (do these in order, right after each other)
1. **Publish the real rules:** Firestore Database → Rules → replace everything with the contents of `firebase/firestore.rules` → Publish.
   (This also removes the temporary `_spike` rule.)
2. **Create the owner account:** open the app (`dist/index.html`) → the sign-in page shows "No owner account yet" → **Set up** →
   enter your name, a username that is not easy to guess, the recovery email, and a password (8+ characters).
3. **Close public sign-up:** Authentication → Settings → User actions → untick **Enable create (sign-up)** → Save. (KI-010, KI-011)
4. Optional clean-up: Authentication → Users → delete any leftover `spike-…@rj-bugasan-test.com` user (the spike already deleted its own).

Do steps 1–3 in one sitting: until the owner exists, the first person to complete setup becomes the owner (KI-011).

## Phase 4 — inventory on the real database
1. **Re-publish the rules:** Firestore Database → Rules → replace everything with the current `firebase/firestore.rules` → Publish.
   (Phase 4 adds rules for items, movements, stock counts and the activity log; without them those screens show a permission error.)
2. **Create the indexes** (Firestore Database → Indexes → Composite → Create index), from `firebase/firestore.indexes.json`:
   - Collection `inventoryMovements`: `itemId` Ascending, `createdAt` Descending (item stock history)
   - Collection `inventoryMovements`: `type` Ascending, `createdAt` Descending (Movements page filtered by type)
   Alternatively a developer with the Firebase CLI runs `firebase deploy --only firestore:rules,firestore:indexes`.
   An index takes a few minutes to build; until then the affected list shows "The database needs an index".
3. Optional: Settings → System → **Load sample data** to try the inventory screens (writes sample records to the real database).

## Phase 5 — customers on the real database
1. **Re-publish the rules:** Firestore Database → Rules → replace everything with the current `firebase/firestore.rules` → Publish.
   (Phase 5 adds rules for `customers`; without them the Customers screen shows a permission error.) No new indexes are needed.
2. Open **Customers** once while online: the built-in **Walk-in** customer is created automatically.
3. Optional: Settings → System → **Load sample data** adds 5 sample customers with alternate contacts (and the sample items if missing).

## Phases 6–7 — sales, payments and collections on the real database
1. **Re-publish the rules:** Firestore Database → Rules → replace everything with the current `firebase/firestore.rules` → Publish.
   (Phases 6–7 add rules for `counters`, `sales`, `installments` and `payments`; without them New sale, Sales and Collections show a permission error.)
   No new composite indexes are needed (every new list uses a single-field filter or sort).
2. Optional: Settings → **Sales** — check the Sale ID prefix (default `RJ-`), first-due-date gap, installment defaults, reminder message and receipt footer.
3. Optional: Settings → System → **Load sample data** adds 7 sample sales (installments, open balances, a voided payment and a cancelled sale) when the sample items and customers are loaded for the first time.

## Phases 8–10 — restocks, suppliers, expenses, calendar, dashboard and reports on the real database
1. **Re-publish the rules:** Firestore Database → Rules → replace everything with the current `firebase/firestore.rules` → Publish.
   (Phase 8 adds rules for `suppliers`, `restocks`, `expenses` and the `restock-YYYY` counter; Phase 9 for `calendarEvents`.
   Without them those screens, the Calendar and the Dashboard show a permission error.) **No new indexes** are needed (D-041).
2. Optional: Settings → System → **Load sample data** adds 3 suppliers, 5 restocks, 11 expenses and 2 calendar reminders on a first, complete load.
3. Try Reports → **Export CSV** and **Print / PDF** once on the store PC (KI-015, KI-019).

## Phases 11–12 — go-live checklist (owner)
1. **Publish rules and indexes.** Either Firestore Database → Rules → paste the current `firebase/firestore.rules` → Publish, and
   Indexes → Composite → create `activityLogs`: `entityType` Ascending, `at` Descending (plus the two `inventoryMovements` indexes from Phase 4);
   or, on a PC with the Firebase CLI and access to the project: `npm run deploy:rules`.
2. **Owner account:** open the app (`index.html` or the GitHub Pages address), complete the one-time setup (`#/setup`) with your username, name and recovery email.
3. **Close public sign-up** right after (Authentication → Settings → User actions → untick "Enable create (sign-up)") — KI-011.
4. **Business details:** Settings → General and Settings → Sales (default installments is now 2).
5. **Enter your records:** items with opening stock, customers, then **Opening balances** for everyone who still owes from Excel.
6. **First backup:** System → Backup → Download backup; keep the file on a USB drive. Repeat weekly (the dashboard reminds you).
7. **Check on the store PC** (Edge/Chrome/Firefox): sign in, one sale, one receipt print, one CSV export, one backup download (KI-009, KI-015, KI-019, KI-021).
8. Hand the client the `/dist` folder (zip) or the GitHub Pages link, plus `guide.html` (also in the app's user menu → User guide).

## Phase 14 — restock expenses (owner)
1. Re-publish the rules once this is released: `npm run deploy:rules` (or paste `firebase/firestore.rules` into Firestore → Rules → Publish). No new indexes (single-field queries only).
2. Receive one delivery with an expense (e.g. Trucking) and check it appears on the Expenses page as "Restock RS-…"; edit the delivery once.

## Phase 13 — batches and other charges on the real database (owner)
1. Re-publish the rules once this is released: `npm run deploy:rules` (or paste `firebase/firestore.rules` into Firestore → Rules → Publish). No new indexes.
2. Open **Items** once while online: stock from before batches is registered as each item's first batch (`RJ-RS-OLD-…`) automatically. Open **Suppliers** once: existing suppliers get codes SUP001, SUP002 …
3. Optional: on each item page check the first batch's cost and cash price (Batches → Edit) if older stock cost something else.
