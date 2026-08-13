# CallingApp — Backend API

Node.js + Express + PostgreSQL (Prisma) backend for the RUNO-inspired Business Calling + CRM platform. Serves both the **Flutter calling app** (agents) and the **React web CRM** (admin/managers).

## Stack

- **Runtime:** Node.js 20+ (ESM)
- **Framework:** Express 4
- **ORM:** Prisma 5 → PostgreSQL 16
- **Auth:** JWT (Bearer) + bcrypt password hashing
- **Validation:** Zod
- **Security:** helmet, CORS allow-list, express-rate-limit, HMAC-verified webhooks

## Prerequisites

- Node.js 20+
- A PostgreSQL 16 database. Options:
  - **Docker:** `docker compose up -d` (uses `docker-compose.yml`)
  - **Postgres.app** / Homebrew Postgres locally
  - Any hosted Postgres (Neon, Supabase, RDS…) — just set `DATABASE_URL`

## Setup

```bash
cd backend
cp .env.example .env            # then edit JWT_SECRET etc.
npm install
npm run db:migrate              # creates tables (needs DATABASE_URL reachable)
npm run db:seed                 # demo org: admin/manager/3 agents + leads + calls
npm run dev                     # http://localhost:4000
```

Health check: `GET http://localhost:4000/health`

### Seed logins (password `Password@123`)

| Role    | Email                       |
|---------|-----------------------------|
| Admin   | admin@callingapp.local      |
| Manager | manager@callingapp.local    |
| Agent   | agent1@callingapp.local … agent3 |

## Environment

See `.env.example`. Key vars: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `TELEPHONY_WEBHOOK_SECRET`.

## Scripts

| Script              | Purpose                          |
|---------------------|----------------------------------|
| `npm run dev`       | Watch-mode server                |
| `npm start`         | Production server                |
| `npm run db:migrate`| Create/apply dev migration       |
| `npm run db:deploy` | Apply migrations (prod)          |
| `npm run db:seed`   | Seed demo data                   |
| `npm run db:studio` | Prisma Studio (DB GUI)           |
| `npm run db:reset`  | Drop + recreate + seed           |

## API

Base path: `/api`. All routes except `/auth/login`, `/auth/forgot-password`, and `/webhooks/*` require `Authorization: Bearer <token>`.

### Auth
| Method | Path                    | Role | Notes |
|--------|-------------------------|------|-------|
| POST   | `/auth/login`           | —    | `{ identifier, password }` (mobile or email) |
| POST   | `/auth/forgot-password` | —    | Always 200 (no account enumeration) |
| GET    | `/auth/me`              | any  | Current user |
| POST   | `/auth/change-password` | any  | `{ currentPassword, newPassword }` |

### Users (spec §3, §37)
| Method | Path                | Role          |
|--------|---------------------|---------------|
| GET    | `/users`            | Admin/Manager |
| GET    | `/users/:id`        | Admin/Manager |
| POST   | `/users`            | Admin         |
| PATCH  | `/users/:id`        | Admin         |
| DELETE | `/users/:id`        | Admin (soft — deactivate) |
| PATCH  | `/users/me`         | any (self profile) |
| PATCH  | `/users/me/status`  | any (agent presence) |

### Teams
`GET /teams`, `GET /teams/:id` (Admin/Manager) · `POST/PATCH /teams/:id` (Admin)

### Leads / Clients (spec §7, §19–24, §38)
| Method | Path                  | Notes |
|--------|-----------------------|-------|
| GET    | `/leads/lookup?number=` | Contact lookup by phone |
| GET    | `/leads/queue`        | "Call Next" queue (agent) |
| GET    | `/leads`              | List + filters + search |
| GET    | `/leads/:id`          | Profile + call timeline |
| POST   | `/leads`              | Admin/Manager |
| POST   | `/leads/import`       | CSV upload (`file`) or `{ rows }`; dedupes by mobile |
| PATCH  | `/leads/:id`          | Update |
| PATCH  | `/leads/:id/assign`   | Assign to agent (Admin/Manager) |

### Calls (spec §8–15, §30, §40)
| Method | Path                     | Notes |
|--------|--------------------------|-------|
| GET    | `/calls`                 | History + filters (status, disposition, date presets, search) |
| GET    | `/calls/:id`             | Full call details |
| POST   | `/calls`                 | Initiate — creates Call ID, sets agent ON_CALL |
| POST   | `/calls/log`             | One-shot log from device call log (SIM flow) |
| PATCH  | `/calls/:id/complete`    | Record outcome (status, duration); sets agent AVAILABLE |
| PATCH  | `/calls/:id/disposition` | Disposition + **mandatory** remark; optional lead status |

### Follow-ups (spec §16, §17, §32)
| Method | Path             | Notes |
|--------|------------------|-------|
| GET    | `/follow-ups?scope=` | scope: today/upcoming/overdue/completed/missed/all |
| POST   | `/follow-ups`    | `{ clientId, followupAt | quick, followupType, note }` |
| PATCH  | `/follow-ups/:id`| Complete / reschedule / cancel |

Quick options: `1hour`, `today`, `tomorrow`, `2days`, `nextweek`.

### Dashboards (spec §5, §26)
`GET /dashboard/agent` · `GET /dashboard/admin` (Admin/Manager)

### Reports & Analytics (spec §27, §28, §34)
`GET /reports/user-performance` · `/reports/team-performance` · `/reports/analytics`
All accept `?datePreset=today|yesterday|last7|last30|thisMonth|custom&startDate&endDate`.

### Webhooks (spec §49)
`POST /webhooks/telephony` — HMAC-SHA256 signed (`x-webhook-signature`). Reconciles provider events against `call_id`. Ready for a future cloud provider; unused in the SIM-based flow.

## Telephony model

The chosen model is **SIM-based (RUNO-style)**: the Flutter app places calls through the device's native dialer and reads the device Call Log to capture real status/duration, then posts them via `POST /calls/log` (or `initiate` → `complete`). No calls are simulated. The webhook layer exists so a cloud provider (Twilio/Exotel) can be added later without schema changes.

## Reporting formulas (spec §42)

All computed from real `Call` rows in `src/utils/stats.js`:
- Answered = `callStatus = ANSWERED`
- Answer Rate = answered / total × 100
- Talk Time = Σ `durationSeconds` where answered (unanswered never contribute)
- Avg Talk Time = Talk Time / answered
