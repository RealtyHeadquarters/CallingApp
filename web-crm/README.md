# CallingApp — Web CRM

React (Vite) admin/manager CRM for the CallingApp platform. Talks to the backend API.

## Setup

```bash
cd web-crm
cp .env.example .env      # VITE_API_BASE=/api (uses the Vite dev proxy → :4000)
npm install
npm run dev               # http://localhost:5173
```

The backend must be running on `http://localhost:4000` (the dev server proxies `/api` there). Log in with a seed account, e.g. `admin@callingapp.local` / `Password@123`.

## Scripts

| Script            | Purpose                     |
|-------------------|-----------------------------|
| `npm run dev`     | Vite dev server (HMR)       |
| `npm run build`   | Production build → `dist/`  |
| `npm run preview` | Preview the production build |

## Pages (spec §43)

- **Dashboard** — role-aware KPIs (org stats for admin/manager, today's performance for agents) + follow-up counts + target progress.
- **Leads / Clients** — searchable/filterable list, create, **bulk CSV import** (dedupes by mobile), and a detail view with the full **client timeline**, calling summary, and assign/reassign.
- **Calls** — call report with status/disposition/date-range/search filters + pagination.
- **Follow-ups** — today / upcoming / overdue / completed / missed views; mark done.
- **Analytics** — call volume, answer-rate trend, disposition breakdown, lead-conversion pie, and the **agent performance** table (admin/manager).
- **Users** — user management + create (admin), presence & status (admin/manager).

## Stack

React 18 · React Router 6 · Axios (JWT interceptor) · Recharts · hand-rolled CSS design system (`src/index.css`). Auth token in `localStorage`; 401s bounce to `/login`.
