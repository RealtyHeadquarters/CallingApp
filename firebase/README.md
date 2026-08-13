# CallingApp — Firebase Backend

The CallingApp backend on **Firestore + Cloud Functions** (Firebase-native), an alternative to the Node/Postgres backend. The entire REST API is served by a single HTTPS Function running an Express app, so the **React CRM and Flutter app keep calling the same endpoints** — only the base URL changes.

## Architecture

- **Firestore** — database (collections: `users`, `teams`, `clients`, `calls`, `followUps`, `notifications`, `counters`, `passwordResetTokens`, `auditLogs`).
- **Cloud Functions** — `api` (Express REST API, all `/auth /users /teams /leads /calls /follow-ups /dashboard /reports /notifications /exports /webhooks`) + `reminders` (scheduled: follow-up reminders, overdue alerts, mark-missed, daily summary).
- **Security Rules** — direct client Firestore access is **denied**; everything goes through the API (Admin SDK), so the same RBAC/validation applies from one place.
- **Auth** — JWT (bcrypt) issued by the API, same as before. (Firebase Auth can be layered on later.)

## Layout

```
firebase/
├── firebase.json            emulator + deploy config
├── firestore.rules          deny-all direct client access
├── firestore.indexes.json   composite indexes
└── functions/
    ├── index.js             exports: api (https), reminders (scheduled)
    └── src/
        ├── admin.js         firebase-admin + Firestore init, collection names
        ├── app.js           Express app assembling all routers
        ├── auth.js          JWT + RBAC middleware
        ├── notifier.js  scheduler.js  seed.js
        ├── lib/             repo, list, stats, ids, exporter, enums, framework
        └── routes/          auth, users, teams, leads, calls, followups,
                             dashboard, reports, notifications, exports, webhooks
```

## Run locally (emulator)

Requires a JDK (the Firestore emulator needs Java). On this machine, Android Studio's bundled JDK works:

```bash
export JAVA_HOME="$HOME/Applications/Android Studio.app/Contents/jbr/Contents/Home"
cd firebase/functions && npm install

# Terminal 1 — Firestore + Functions emulators
npm run emulators        # or: firebase emulators:start --only firestore,functions

# Terminal 2 — seed demo data into the emulator
FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=callingapp-dev npm run seed
```

The API is then at `http://localhost:5001/callingapp-dev/us-central1/api` (Functions emulator).
Seed logins (password `Password@123`): `admin@`, `manager@`, `agent1@`…`agent3@` `callingapp.local`.

## Point the apps at Firebase

- **Web CRM:** set `VITE_API_BASE` to the functions URL (emulator or deployed), e.g.
  `VITE_API_BASE=http://localhost:5001/callingapp-dev/us-central1/api`. CORS is enabled on the function.
- **Flutter:** `flutter run --dart-define=API_BASE=https://us-central1-<project>.cloudfunctions.net/api`

## Deploy to production

Cloud Functions require the **Blaze** (pay-as-you-go) plan. Light usage is effectively free (generous free tier), but a card is required.

### 1. Prerequisites (you do these — they need your Google account/billing)

1. Create a project at https://console.firebase.google.com (note the **Project ID**).
2. In the console, upgrade the project to the **Blaze** plan.
3. Authenticate the CLI (interactive — opens a browser):
   ```bash
   cd firebase
   ../firebase/functions/node_modules/.bin/firebase login
   ```

### 2. Point the CLI at your project

```bash
cd firebase
./functions/node_modules/.bin/firebase use --add        # pick your Project ID, alias "default"
```
(Or edit `.firebaserc` → replace `callingapp-dev` with your Project ID.)

### 3. Set production secrets

```bash
cd firebase/functions
node_modules/.bin/firebase functions:secrets:set JWT_SECRET              # paste a long random string
node_modules/.bin/firebase functions:secrets:set TELEPHONY_WEBHOOK_SECRET # any value (unused for SIM)
node_modules/.bin/firebase functions:secrets:set SETUP_KEY               # a one-time bootstrap key
```

### 4. Deploy

```bash
cd firebase
./functions/node_modules/.bin/firebase deploy --only firestore,functions
```
This deploys Firestore **rules + indexes**, the `api` HTTPS function, and the `reminders` schedule.
Your API base becomes: `https://us-central1-<PROJECT_ID>.cloudfunctions.net/api`

> If a query needs a composite index, the first call logs an error with a one-click link to create it — or run `firebase deploy --only firestore:indexes` after adding it to `firestore.indexes.json`.

### 5. Create the first admin (empty prod DB)

```bash
curl -X POST "https://us-central1-<PROJECT_ID>.cloudfunctions.net/api/setup/init" \
  -H "Content-Type: application/json" \
  -d '{"name":"Owner","email":"you@company.com","mobile":"9000000000","password":"<strong-pw>","setupKey":"<SETUP_KEY>"}'
```
`/setup/init` self-disables once any user exists. Log in, then create teams/users/leads from the CRM.

### 6. Point the apps at production

- **Web CRM:** set `VITE_API_BASE=https://us-central1-<PROJECT_ID>.cloudfunctions.net/api`, then `npm run build` and host `web-crm/dist` (e.g. `firebase deploy --only hosting`, Netlify, Vercel…).
- **Flutter:** `flutter build apk --release --dart-define=API_BASE=https://us-central1-<PROJECT_ID>.cloudfunctions.net/api`

### Known production gap

`forgot-password` issues a reset token but there is **no email/SMS delivery** wired yet, so in production the token isn't sent to the user. Until an email provider is added, admins reset passwords via the CRM (Users → Edit). Everything else runs fully in production.

## Verified

The full API was tested end-to-end against the Firestore emulator (login → dashboard KPIs → contact lookup → initiate/complete/disposition call flow → history → admin dashboard → reports → CSV export → RBAC → forgot-password). **12/12 checks passed.**

## Tradeoffs vs Postgres

Firestore has no JOINs or GROUP BY, so reports/dashboards read the relevant docs and aggregate in JS (fine at SMB scale; for very large datasets, maintain rollup docs via triggers). Substring search is done in-memory over a capped scoped set. Names are denormalized onto call docs for list display.
