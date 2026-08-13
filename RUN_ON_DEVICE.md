# Run CallingApp on an Android phone (local dev)

End-to-end: local PostgreSQL → backend API → Flutter app on your phone.
Your Mac's LAN IP (detected): **192.168.31.202**. Phone and Mac must be on the **same Wi-Fi**.

---

## 1. PostgreSQL (one-time)

Install **Postgres.app** → https://postgresapp.com (no admin needed). Open it and click **Initialize/Start**.

Add its CLI tools to your PATH (one time), then create the app's role + database:

```bash
export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"
psql postgres -c "CREATE ROLE callingapp LOGIN PASSWORD 'callingapp' CREATEDB;"
psql postgres -c "CREATE DATABASE callingapp OWNER callingapp;"
```

This matches the default `backend/.env` (`postgresql://callingapp:callingapp@localhost:5432/callingapp`).

## 2. Backend (migrate + seed + run)

```bash
cd backend
npm install                 # if not already
npm run db:migrate          # creates all tables (incl. notifications)
npm run db:seed             # demo admin/manager/agents + leads + calls
npm run dev                 # listens on 0.0.0.0:4000 (reachable from the phone)
```

Verify from the Mac: open http://localhost:4000/health → `{"status":"ok"}`.

## 3. Android toolchain (one-time)

The Android SDK is present, but a **JDK** is missing. Easiest fix: install
**Android Studio** (https://developer.android.com/studio) — it bundles a JDK and the
command-line tools. After install, accept licenses:

```bash
flutter doctor --android-licenses     # press y to accept
flutter doctor                        # Android toolchain should be ✓
```

## 4. Connect the phone

1. On the phone: **Settings → About phone → tap Build number 7×** to enable Developer options.
2. **Developer options → enable USB debugging.**
3. Plug the phone into the Mac with a USB cable; tap **Allow** on the "Allow USB debugging?" prompt.
4. Confirm it's seen:

```bash
flutter devices        # your phone should be listed
```

## 5. Run the app (points at your Mac's backend)

```bash
cd mobile
flutter run --dart-define=API_BASE=http://192.168.31.202:4000/api
```

Log in with a seeded agent: **agent1@callingapp.local / Password@123**.

> The app uses cleartext HTTP to your LAN IP (already enabled in the manifest for dev).
> If your Mac's IP changes (new network), re-run with the new `API_BASE`.

---

## Try the full flow

Dial a number on the **Dial Pad** → if it's a seeded lead you'll see the contact card →
tap **Call** (places a real SIM call via the native dialer) → return to the app →
the outcome is read from the **device call log** → fill **disposition + remark** →
optionally schedule a **follow-up**. Then check **Call History**, and watch the numbers
update on the **Dashboard** and in the **Web CRM** (`cd web-crm && npm run dev`).

## Troubleshooting

- **App can't reach server:** confirm phone + Mac on same Wi-Fi; `curl http://192.168.31.202:4000/health` from another device; make sure the backend is running.
- **`flutter run` fails on Java:** JDK not found — install Android Studio or set `JAVA_HOME`.
- **Permissions:** the app requests Phone permission on first call; also grant **Call logs** access in the phone's app settings (needed to capture call status/duration).
