# Gyftr Tech Portal — Knowledge Transfer / Maintenance Guide

> Handover document for the tech team. Everything you need to run, change, and
> extend the portal is in this file plus the codebase itself. Last updated: 13 Jul 2026.

---

## 1. What this is

A **project status & handoff tracker** ("Jira-lite") for the Gyftr/Vouchagram tech org.
It replaces the *PM Activity List* Google Sheet. Core idea: every project always sits
in exactly **one team's court** (Business → Product → Tech SPOC → Development → QA →
UAT → Pending Deploy → Live), every handoff is timestamped, and delay is attributable.

- **Live app:** https://gyftr-tech-portal.vercel.app
- **GitHub:** https://github.com/yashtahlyani8-ui/Gyftr-Tech-portal (branch `main`)
- **Supabase project:** ref `jrujrhjxuikdsrblsbur`, region `ap-southeast-2`, Postgres 17
- **Vercel project:** `gyftr-tech-portal` (team `yashs-projects-f39fe601`, Hobby plan)

## 2. ⚠️ Accounts & access — DO THIS FIRST

Everything currently lives under **personal accounts**. Before the current owner
leaves, transfer:

| Asset | Where it lives now | Action |
|---|---|---|
| GitHub repo | `yashtahlyani8-ui/Gyftr-Tech-portal` | Transfer repo to the company GitHub org |
| Vercel project | personal Vercel account | Transfer project to a company Vercel team, or re-link a fresh project to the repo (5 min: `npx vercel link`, set the 2 env vars, deploy) |
| Supabase project | personal Supabase org | Transfer org ownership, or invite company admins to the org (Dashboard → Settings → Team) |
| Secrets | local `.env` / `.env.local` (gitignored), Vercel env vars, Supabase dashboard | **Rotate everything** after handover: Supabase anon + service-role keys (Dashboard → Settings → API), any Vercel tokens, any Supabase access tokens |

Secrets are deliberately **not** in this document or the repo. The app only needs two
values at build time (see §10); the service-role key is only ever used for manual
admin scripts and must never reach the client bundle.

## 3. Tech stack

| Layer | Tech | Notes |
|---|---|---|
| Frontend | **React 19 + TypeScript 5.7 + Vite 8** | SPA, no SSR. Vite dev server on port 5174 |
| Charts | **Recharts 3** | Overview dashboard only |
| Icons | **lucide-react** | |
| Fonts | @fontsource-variable (Bricolage Grotesque, Hanken Grotesk, JetBrains Mono) | bundled, no CDN |
| Styling | **Plain CSS** in `src/index.css` (CSS variables design system) + inline styles | No Tailwind/CSS-in-JS |
| Backend | **Supabase** (Postgres 17, Auth, Realtime, Row-Level Security) | There is **no custom server** — the DB *is* the backend; permissions are enforced by RLS |
| Hosting | **Vercel** (static build output) | `npm run build` → `dist/` |
| State | Hand-rolled store (pub/sub + `useState` bump), no Redux/Zustand | `src/store.ts` dispatches to cloud or local implementation |

## 4. Repository map

```
src/
  main.tsx          entry; mounts <App/>
  App.tsx           shell: sidebar nav, role-scoped views, profile-switch reset, toasts
  index.css         entire design system (CSS variables at top)
  types.ts          all domain types (Project, Person, StageId, StatusId, SubTask…)
  workflow.ts       ★ THE state machine: stages, statuses, SLAs, legal transitions, teams
  roles.ts          ★ client-side permission model (mirrors RLS — keep in sync, see §8)
  store.ts          dispatcher: picks cloudStore or localStore by env
  cloudStore.ts     Supabase reads/writes, realtime subscription, optimistic updates
  localStore.ts     localStorage fallback (demo mode without env vars)
  auth.ts           profile-switch auth (real Supabase sessions under the hood)
  people.ts         org directory: live `people` table in cloud mode, seed in local
  seed.ts           demo data (mirrors the real PM sheet rows) + PEOPLE list for local mode
  lib.ts            helpers + the Supabase client (null in local mode)
  toast.ts          failure-toast bus (failed writes are never silent)
  ui.tsx            shared primitives: Avatar, StatusPill, AgingChip, OverdueTag…
  views/
    Login.tsx        local-mode profile picker
    CloudLogin.tsx   cloud-mode profile picker (signs into real Supabase sessions)
    MyQueue.tsx      "in my court" action list
    Board.tsx        kanban (drag = transition, permission-gated)
    TableView.tsx    ★ sheet-style All Projects table + CSV export
    Dashboard.tsx    leadership overview (KPIs, pipeline, whose-court, watchlist)
    Escalations.tsx  blocked / overdue / SLA-breach chase list
    Drawer.tsx       ★ full project page (ownership, transitions, subtasks, comments, details rail)
    CreateModal.tsx  new-project form
    FilterBar.tsx    search + LOB/partner/priority/status/owner filters
supabase/
  schema.sql        ★ full DB schema: tables, triggers, RLS policies. Source of truth.
```

★ = the files you'll touch most.

## 5. How it runs

**Dual mode**, decided once at page load in `lib.ts`:
- `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` set → **cloud mode** (shared, multi-user).
- Not set → **local demo mode** (localStorage, seeded, cross-tab sync). Useful for
  offline demos and for developing UI without touching prod data.

**Cloud data flow:** `cloudStore.ts` loads all visible projects in one query
(`projects` + nested `subtasks`, `stage_history`, `comments`, `attachments`),
subscribes to Postgres realtime on all five tables, and refetches on any change —
so every open browser updates live. Writes are **optimistic**: UI updates instantly,
and if Supabase rejects the write (RLS/network) a toast appears and state resyncs
(`writeFailed()` in cloudStore). RLS UPDATE rejections come back as *0 rows, no
error* — that's why every mutation either checks the returned row or relies on
refetch; keep that pattern.

**Visibility:** what a user can *see* is decided by the DB (`involved_teams` array
on each project row + RLS `p_sel`). The client never receives rows it shouldn't see.
`involved_teams` is maintained by triggers: grows when the ball moves to a new team
and when a sub-task is assigned to a team. It never shrinks.

## 6. Data model (Postgres)

Tables (all with RLS enabled, all in the realtime publication):

- **people** — org directory. `auth_id` links to Supabase Auth; starts null and is
  claimed on first login by `claim_person()` (matches on email from the verified JWT).
  `team` (enum) + `role` (member/lead/pmo/leadership) drive every permission.
- **projects** — the core row. Notable columns:
  - `code` — human id `TP-###`, auto-generated by sequence `projects_code_seq`.
  - `stage` (enum, the pipeline lane) + `status` (text, the fine-grained state).
  - `owner_id` — the person currently holding it (always on the court team).
  - `owner_team`, `involved_teams` — **denormalized for RLS**, maintained by trigger
    `sync_project_scope()` (fires before insert/update-of-stage). Never write them by hand.
  - Sheet-parity fields: `priority_month`, `timeline_eta`, `dev_effort_days`,
    `reason_for_delay`, `product_spoc_id`, `tech_lead_id`, `final_go_live`.
  - `final_go_live` **stamps itself** in the trigger when stage becomes `live`.
  - Date naming in the UI: *Expected* = `target_go_live`, *Promised* = `sacrosanct_go_live`,
    *Go Live Date* = `final_go_live`.
- **subtasks** — per-project checklist; `team` + optional `assignee_id`. Trigger
  `sync_subtask_scope()` folds the subtask's team into the project's `involved_teams`.
- **stage_history** — the immutable handoff ledger (who moved what, when, why).
- **comments** — `pinned` = leadership/PMO priority note (surfaces on cards + escalations
  until `resolved`).
- **attachments** — name + kind (BRD/PRD/Figma/HTML/Doc/Link) + URL. Links only, no file storage.

Enums: `team_id`, `stage_id`, `role_id`, `priority`. **Adding an enum value requires
`alter type … add value`** (a migration), see cookbook §12.

## 7. Auth (current state: demo-grade — read this)

Login screen is a **profile picker**: clicking a name performs a real
`signInWithPassword` using a **shared demo password** (ask the previous owner or
reset it — see cookbook). Every RLS check runs against the real session's
`auth.uid()`, so permissions are genuinely enforced server-side; the picker is only
a UX shortcut over real auth.

**Consequences:** anyone with the URL can act as anyone. Fine for demo, **not for
real rollout**. To productionize (pick one):
1. Per-user passwords: create users via Supabase Dashboard → Auth, delete the picker
   (`CloudLogin.tsx`) in favor of an email+password form (one existed at commit
   `4ab17a9` — you can largely restore it), or
2. Google Workspace SSO: enable the Google provider in Supabase Auth, restrict to
   the company domain, swap the picker for `signInWithOAuth`.

Access gate: signing in is necessary but not sufficient — a user with no matching
`people` row sees "No portal access" and owns zero rows (all policies key off
`my_team()`, which is null for them). Provisioning someone = inserting a `people`
row + creating their auth user.

## 8. Permissions — the one rule that keeps this codebase sane

Permissions exist **twice**, on purpose:
- **Client:** `src/roles.ts` (`can()`, `isMine()`, `canPerformTransition()`, `visibleTo()`) — decides which buttons render.
- **Server:** RLS policies in `supabase/schema.sql` — decides what actually persists.

**If you change one, change the other.** A client-only change shows buttons that
silently fail (you'll see the rollback toast); a server-only change hides nothing.

Current model:

| Who | Can |
|---|---|
| Team currently holding the court | change status, move forward/back, take/reassign within team, subtasks, block/unblock, edit planning details |
| Any involved team (worked on it before) | see it, comment, attach documents |
| Product leads | additionally edit the date fields on any project |
| PMO (`role='pmo'`) | everything, everywhere — process owner — **except** clicking "Mark Live" (that's the deploying team's call) |
| Leadership (`role='leadership'`) | read-only observer + can post **pinned priority notes** |
| Dev team | may also pick up directly from Tech SPOC's `to_be_picked` queue |

## 9. Workflow — changing stages/statuses/transitions

All in `src/workflow.ts`:
- `STAGES` — the lanes, their owning team, and **SLA day budgets** (drives amber/red ageing).
- `STATUSES` — fine-grained statuses, each mapped to its home stage + `kind`
  (`active`/`blocked`/`done`). `blocked` statuses set the project's blocked flag.
- `TRANSITIONS` — the only legal moves out of each stage (label + destination +
  receiving team + kind). A stage may have **multiple forwards** (e.g. Scoping →
  SPOC queue *or* straight to Dev); the UI merges them into one "who's this for" picker.

**Trap:** the DB has its own copy of stage→team mapping in the SQL function
`stage_owner(stage_id)` (schema.sql). If you add/rename a stage or change which team
owns one, update **both** `workflow.ts` and `stage_owner()` (+ the `stage_id` enum
if it's a new stage), or RLS and the UI will disagree.

## 10. Environments & deployment

App needs exactly two env vars (Vercel → Project → Settings → Environment Variables,
already set for Production/Preview/Development; locally in `.env`):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>          # public by design; RLS is the security boundary
```

Deploy:

```bash
npx vercel deploy --prod --yes             # from repo root (project is linked via .vercel/)
```

**Known gap:** the GitHub→Vercel auto-deploy webhook has never fired — pushing to
`main` does NOT deploy. Either fix it (GitHub → Settings → Applications → Vercel →
Configure → grant this repo) or keep deploying via CLI after each push. Check what's
live vs. what's committed if things look stale.

DB changes: there is no migration tool wired up. `supabase/schema.sql` is the source
of truth for a fresh install; live changes are applied manually:

```bash
npx supabase login          # needs a Supabase access token
npx supabase link --project-ref jrujrhjxuikdsrblsbur
npx supabase db query --linked --file path/to/change.sql
```

(Or paste SQL into the Supabase Dashboard SQL editor.) **Keep `schema.sql` updated
in the same commit as any live migration.**

## 11. Local development

```bash
npm install
npm run dev        # http://localhost:5174
npm run build      # tsc -b && vite build  → dist/
```

With `.env` present you develop against the **live shared DB** (careful — it's the
demo/prod data). Without it, local demo mode: isolated, seeded from `seed.ts`,
reset via the sidebar's "Reset demo".

## 12. Maintenance cookbook

**Add a person** (SQL editor or `db query`):
```sql
insert into people (name, team, role, email) values ('New Dev','development','member','new.dev@gyftr.net');
-- then create the matching auth user:
--   Dashboard → Authentication → Add user (email + the shared password, "auto-confirm" on)
-- Their people row is claimed automatically on first login (claim_person()).
```
Also add them to `PEOPLE` in `src/seed.ts` if you care about local demo parity, and
note `CloudLogin.tsx` lists profiles from `seed.ts` — add them there for the picker.

**Rotate the shared demo password:** Dashboard → Auth → users (bulk via admin API),
and update `DEMO_PASSWORD` in `src/auth.ts`. (Or better: kill the picker, see §7.)

**Change an SLA:** edit `slaDays` in `STAGES` (`workflow.ts`). Pure client — ship it.

**Add a status:** add to `StatusId` (`types.ts`) + `STATUSES` (`workflow.ts`).
Status is TEXT in the DB — no migration needed.

**Add a stage:** enum migration `alter type stage_id add value 'x' …` + `STAGES`,
`TRANSITIONS`, `stage_owner()` in SQL, and check `statusesForStage`. Test thoroughly.

**Fix bad data / bulk edits:** service-role SQL bypasses RLS. The invariants you
must preserve: owner on court team; `status` legal for `stage`; `blocked` flag
matching blocked-kind statuses; `involved_teams` containing the court team.

**Backups:** Supabase Dashboard → Database → Backups (daily on paid; on free tier,
run `npx supabase db dump` periodically). CSV export in the UI covers business-level reporting.

## 13. Known limitations / suggested Phase 2

1. **Shared demo password** — replace before real rollout (§7). Highest priority.
2. **Attachments are links only** — Supabase Storage is the natural upgrade (bucket + RLS mirroring `can_see`).
3. **No email/Slack notifications** — planned as a scheduled Edge Function scanning
   `stage_entered_at` vs SLA and pinned unresolved comments.
4. **Auto-deploy off** (§10).
5. **State machine not enforced in SQL** — an in-court user *could* set an arbitrary
   stage via the API (UI only offers legal moves). Encoding `TRANSITIONS` into a
   DB trigger would close it.
6. **No tests** — the permission matrix in §8 is the thing most worth locking in
   (it was verified manually via API; a small vitest suite against a Supabase branch
   database would prevent regressions).

## 14. Glossary

- **Court / ball** — the team currently responsible; the project's `stage` decides it.
- **Expected / Promised / Go Live Date** — target (biz ask) / sacrosanct (commitment,
  PMO-edited) / actual (auto-stamped).
- **Pinned note** — leadership/PMO comment that flags the project everywhere until the
  owning team resolves it.
- **Ageing / SLA breach** — days in current stage vs the stage's `slaDays` budget (ok → warn at 60% → breach).
- **Overseer** — PMO + Leadership: see everything; PMO acts, Leadership observes.
