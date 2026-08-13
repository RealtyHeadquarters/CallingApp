# CallingApp — Business Calling + CRM Platform

A RUNO-inspired **Business Calling Application + Web CRM** for sales/calling teams. Agents call clients through the app; every call automatically becomes a CRM activity (client + agent + status + duration + talk time + disposition + remark + follow-up + lead status). Admins and managers monitor, manage, analyze, and report from a web CRM.

> Original branding, UI/UX, codebase, and business logic. Inspired by modern business-calling platforms in workflow only — no proprietary assets copied.

## Architecture

```
 ┌──────────────────┐      ┌──────────────────┐
 │  Flutter Calling │      │   React Web CRM  │
 │   App (agents)   │      │ (admin/managers) │
 └────────┬─────────┘      └─────────┬────────┘
          │        HTTPS / JWT       │
          └───────────┬──────────────┘
                      ▼
            ┌───────────────────┐        ┌──────────────────────────┐
            │  Node.js / Express│◄───────┤  Telephony webhooks       │
            │     REST API      │  HMAC  │  (future cloud provider)  │
            └─────────┬─────────┘        └──────────────────────────┘
                      ▼
            ┌───────────────────┐
            │  PostgreSQL (Prisma)
            └───────────────────┘
```

**Telephony model — SIM-based (RUNO-style):** the Flutter app places calls via the device's native dialer and reads the device **Call Log** to capture real status & duration, then posts them to the backend. No calls are simulated. A signed **webhook** layer is already built so a cloud provider (Twilio/Exotel) — enabling recording & live monitoring — can be added later with no schema change.

## Tech stack

| Tier            | Choice                                             |
|-----------------|----------------------------------------------------|
| Calling app     | Flutter (Android/iOS), SIM-based calling + call log |
| Backend / API   | Node.js + Express, Prisma ORM                      |
| Database        | PostgreSQL                                          |
| Web CRM         | React (Vite) + a component/chart library           |
| Auth            | JWT + bcrypt, role-based access control            |

## Modules (mapped to the spec)

Roles & auth (§3–4) · Agent dashboard (§5) · Dial pad & contact lookup (§6–7) · Calling + status + duration + talk time (§8–11) · Call history/details (§12–13) · Disposition & remark (§14–15) · Follow-ups + quick options + reminders (§16–17, §32–33) · Client profile & timeline (§19–20) · Lead management, assignment, bulk import, search (§21–24) · Web CRM dashboard & navigation (§25–26, §43) · User/team performance & targets (§27–29) · Reports, filters, export (§30–31, §46) · Analytics (§34) · Recording & live monitoring (future, §35–36) · Agent presence (§37) · Call queue (§38) · Click-to-call (§39) · Call IDs (§40) · Database (§41) · Formulas (§42) · Notifications (§45) · Security (§47) · Scalability (§48) · Webhooks (§49).

## Data model (ER overview)

```
Team 1──* User          User 1──* Call          Client 1──* Call
Team 1──* Client        User 1──* FollowUp       Client 1──* FollowUp
User (manager) 1──* Team Call 1──* FollowUp      User *──1 Team
```

Core tables: `users`, `teams`, `clients` (leads), `calls`, `follow_ups`, `audit_logs`, plus a `counters` table for generating human-readable `CALL-YYYYMMDD-000001` and `LEAD-000123` IDs. Full definition: [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma).

## Repository layout

```
CallingApp/
├── backend/        Node.js + Express + Prisma API   ← implemented
│   ├── prisma/     schema + seed
│   └── src/        config, lib, middleware, utils, modules/{auth,users,teams,
│                   leads,calls,followups,dashboard,reports,webhooks}
├── web-crm/        React (Vite) admin CRM            ← implemented
│   └── src/        api, auth, components, lib, pages
└── mobile/         Flutter calling app               ← implemented
    └── lib/        config, theme, models, services, state, widgets, screens
```

## Getting started

The backend is ready to run — see **[backend/README.md](backend/README.md)** for setup, seed logins, and the full API reference.

```bash
cd backend
cp .env.example .env
npm install
npm run db:migrate && npm run db:seed
npm run dev            # http://localhost:4000
```

## Roadmap

- [x] **Phase 1 — Backend + DB foundation** *(done)*: schema, auth + RBAC, users/teams/leads/calls/follow-ups, dashboards, reports/analytics, bulk import, webhooks, seed data. All KPIs computed from real records.
- [x] **Phase 2 — Web CRM (React)** *(done)*: JWT login, role-aware dashboard, leads list/detail with timeline + assign + bulk CSV import, call report with filters, follow-up board, users management, analytics charts + agent performance.
- [x] **Phase 3 — Flutter calling app** *(done)*: login, dashboard, dial pad + contact lookup, SIM call + call-log capture, disposition/remark/follow-up flow, my leads, call history, follow-ups, presence. Passes `flutter analyze`.
- [x] **Phase 4 — Notifications & reminders** *(done)*: in-app notifications, background reminder scheduler (follow-up reminders + overdue), lead-assignment alerts, surfaced via a notification bell in both the web CRM and the Flutter app. (Push/FCM + daily summaries still open.)
- [x] **Phase 5 — Reporting & admin gaps** *(mostly done)*: report **export (CSV / Excel / PDF)** for calls, leads & agent performance; **Teams** management page; per-agent **targets** config; real **forgot/reset-password** flow; admin **daily summary + missed-follow-up** notifications. (Heavy-report background jobs, caching & load testing still open.)
- [ ] **Phase 6 — Optional telephony provider:** wire Twilio/Exotel for recording & live monitoring via the existing webhook layer.

## Security & scalability

RBAC on every route, agents scoped to their own data, bcrypt hashing, JWT auth, Zod input validation, Prisma (parameterized — SQL-injection safe), helmet, CORS allow-list, rate limiting, HMAC-verified webhooks. Server-side pagination + filtering and DB indexes throughout; designed for hundreds of agents and 100k+ call records.
