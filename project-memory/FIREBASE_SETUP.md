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
