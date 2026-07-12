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

## Run it

```bash
npm install
npm run dev        # http://localhost:5174
```

Runs in **local demo mode** out of the box — seeded with real Gyftr partners, data
persists in your browser. Pick a user on the login screen; actions are logged against you.

## Go multi-user (Supabase)

1. Create a Supabase project, run [`supabase/schema.sql`](supabase/schema.sql).
2. Copy `.env.example` → `.env` and fill `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
3. Swap the localStorage internals in `src/store.ts` for Supabase queries (client is
   already wired in `src/lib.ts`, and realtime mirrors the marketing portal's pattern).

## Roadmap

- **Phase 1 (this):** data model, one Task ID + sub-tasks, board, statuses, leadership dashboard.
- **Phase 2:** enforce workflow transitions (state machine), SLA breach alerts via
  Edge Function → email / Slack, Google Workspace SSO.
