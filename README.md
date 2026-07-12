# Gyftr Tech Portal — Project Flow

A Jira-lite **project status & handoff tracker** for the Gyftr / Vouchagram tech org.
Replaces the long PM Activity Excel with one source of truth that answers the two
questions the Excel can't: **whose court is the ball in, and how long has it been there.**

Built on the same stack as the marketing portal: **React 19 + Vite + TypeScript +
Supabase + Recharts**, deployed on Vercel.

## The model

A project flows through eight owned stages:

```
Business Intake → Product Scoping → To Be Picked → Development → QA → UAT → Pending Deploy → Live
   (Business)       (Product)        (Tech SPOC)     (Dev/Design)  (QA)  (Biz)   (Dev)
```

- **Every project always has exactly one owner** (the ball holder). Handoffs are timestamped in `stage_history` — that ledger is what ends the blame game.
- **Ageing / SLA** — each stage has a day budget; cards turn amber then red as they overstay, so delay is attributable.
- **Statuses** (Scoping, In Dev, Need Bug Fixing, UAT, Blocked, On Hold, …) map to the deck's workflow schema.
- **Leadership View** — KPIs, pipeline distribution, "whose court" split, and an ageing watchlist = the CEO's one-glance replacement for the Excel.

## Live

Production: **https://gyftr-tech-portal.vercel.app** — multi-user, realtime-synced
Supabase backend with row-level security enforcing per-team permissions server-side.
Pick a profile on the login screen (real auth session under the hood); every action
is logged against that person.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5174
```

With `.env` filled (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`) it talks to the
live backend; with them blank it falls back to **local demo mode** (seeded data,
persists in your browser, cross-tab sync).

## Architecture

- `src/workflow.ts` — the state machine: stages, statuses, SLAs, legal transitions.
- `src/roles.ts` — client-side permission model (mirrored server-side by RLS).
- `src/store.ts` — dispatcher; `cloudStore.ts` (Supabase + realtime + optimistic
  writes with visible rollback on failure) or `localStore.ts` (localStorage).
- [`supabase/schema.sql`](supabase/schema.sql) — full schema, triggers, and the
  RLS policies that make the DB enforce the same rules the UI shows.

## Roadmap

- **Phase 1 (shipped):** data model, sub-tasks with assignees, flow board,
  role-scoped views, leadership dashboard, escalations, priority notes.
- **Phase 2:** SLA breach alerts via Edge Function → email / Slack, per-user
  passwords or Google Workspace SSO, file uploads to Supabase Storage.
