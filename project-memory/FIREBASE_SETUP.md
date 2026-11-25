# Firebase Setup Guide (for the owner)

**Status:** Draft (2026-11-25). Free "Spark" plan is enough. Takes about 15 minutes.

1. Go to https://console.firebase.google.com and sign in with the business Google account.
2. **Add project** → name it e.g. `rj-bugasan` → Google Analytics: off → Create.
3. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable** (leave "Email link" off) → Save.
4. **Authentication → Users → Add user**: enter the **recovery email** you want for the owner and a strong password. Copy the **User UID** shown.
5. **Build → Firestore Database → Create database** → location **asia-southeast1 (Singapore)** (closest to PH; cannot be changed later) → start in **production mode**.
6. **Project settings (gear) → General → Your apps → Web (</>)** → nickname `rj-ims` → do **not** enable Hosting yet → Register. Copy the `firebaseConfig` block (apiKey, authDomain, projectId, …). This is not a password; it only identifies the project.
7. Send the developer: the `firebaseConfig` block, the owner UID, and the username you want (e.g. `rjowner`). **Never send the password.**
8. The developer will provide `firestore.rules` and `firestore.indexes.json` to paste/deploy, and a one-time setup page that creates the `users` and `usernames` records.

Optional (recommended for phone access, decision D-014): Firebase **Hosting** to open the app on a phone via an HTTPS link.
