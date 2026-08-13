# CallingApp — Mobile (Flutter)

The agent-facing **calling application**. Places calls through the device SIM via the native dialer and captures real status/duration from the device **Call Log** (RUNO model, spec §8/§10). No calls are simulated.

> **Platform note:** SIM call-log capture works on **Android** (needs `READ_CALL_LOG`). iOS does not allow reading the call log, so on iOS the outcome is entered manually in the disposition screen.

## Setup

```bash
cd mobile
flutter pub get
# Point at your backend. Android emulator reaches the host via 10.0.2.2 (default).
flutter run --dart-define=API_BASE=http://10.0.2.2:4000/api
# Physical device: use your machine's LAN IP, e.g.
# flutter run --dart-define=API_BASE=http://192.168.1.20:4000/api
```

Log in with a seed agent: `agent1@callingapp.local` / `Password@123`.

## Flow (spec §18)

Login → Dashboard → **Dial Pad** → enter number → **contact lookup** (§7) → CALL
→ native dialer places the SIM call → return to app → **call log captured** (status + duration)
→ **Disposition + mandatory remark** (§14/15) → optional **Follow-up** (quick options or custom, §16/17) → saved to CRM.

## Screens

- **Login** — JWT auth (mobile or email).
- **Dashboard** — today's KPIs (§5), pull-to-refresh.
- **Dial Pad** — keypad, live contact lookup, one-tap SIM call.
- **My Leads** — assigned leads with click-to-call (§39).
- **Call History** — recent calls with status/duration/remark (§12).
- **Follow-ups** — today / upcoming / overdue / completed; mark done (§32).
- **Presence** — Available / Away / Offline in the app bar; auto On-Call during a call (§37).

## Structure

```
lib/
├── config.dart            API base URL (--dart-define=API_BASE)
├── theme/                 brand theme
├── models/                API response models
├── services/              api_client (Dio+JWT), call_service (SIM + call log)
├── state/                 auth_state (Provider)
├── widgets/               KPI card, status badge
└── screens/               login, home, dashboard, dialpad, disposition,
                           leads, call_history, followups, call_flow (shared mixin)
```

## Key packages

`dio` (HTTP) · `provider` (state) · `shared_preferences` (token) · `url_launcher` (native dialer) · `call_log` (device call log, Android) · `permission_handler` · `intl`.

Verified with `flutter analyze` (no issues) and `flutter test`. A full APK build additionally needs a Java/Android SDK toolchain.
