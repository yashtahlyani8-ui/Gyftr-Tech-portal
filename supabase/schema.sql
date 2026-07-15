-- ══════════════════════════════════════════════════════════════
-- Gyftr Tech Portal — Postgres schema + REAL row-level security
-- The DB enforces the same rules the app does, so nothing leaks even
-- if a client is compromised. Run in the Supabase SQL editor.
-- ══════════════════════════════════════════════════════════════

create type team_id  as enum ('business','product','tech_spoc','development','design','qa','partner','leadership');
create type role_id  as enum ('member','lead','pmo','leadership');
create type stage_id as enum ('intake','scoping','to_be_picked','development','qa','uat','pre_prod','live');
create type priority as enum ('P0','P1','P2');

-- ── Directory: links a Supabase Auth user to a team + role ──
create table people (
  id      uuid primary key default gen_random_uuid(),
  auth_id uuid unique references auth.users(id) on delete cascade,
  name    text not null,
  email   text unique not null,
  team    team_id not null,
  role    role_id not null default 'member'
);

-- ── Identity helpers (SECURITY DEFINER so RLS policies can call them) ──
create or replace function my_team() returns team_id language sql stable security definer as $$
  select team from people where auth_id = auth.uid();
$$;
create or replace function my_role() returns role_id language sql stable security definer as $$
  select role from people where auth_id = auth.uid();
$$;
create or replace function is_overseer() returns boolean language sql stable security definer as $$
  select coalesce(my_role() in ('pmo','leadership'), false);
$$;
create or replace function is_pmo() returns boolean language sql stable security definer as $$
  select coalesce(my_role() = 'pmo', false);
$$;

-- Which team owns the ball while a project sits in a given stage.
create or replace function stage_owner(s stage_id) returns team_id language sql immutable as $$
  select case s
    when 'intake' then 'business' when 'scoping' then 'product'
    when 'to_be_picked' then 'tech_spoc' when 'development' then 'development'
    when 'qa' then 'qa' when 'uat' then 'business' when 'pre_prod' then 'development'
    else 'leadership' end::team_id;
$$;

create sequence projects_code_seq;

create table projects (
  id                 uuid primary key default gen_random_uuid(),
  code               text unique not null default ('TP-' || lpad(nextval('projects_code_seq')::text, 3, '0')),
  title              text not null,
  brd                text default '',
  partner            text not null,
  lob                text,
  priority           priority not null default 'P1',
  bifurcation        text check (bifurcation in ('B2B','B2C')) default 'B2C',
  stage              stage_id not null default 'intake',
  status             text not null,
  owner_id           uuid references people(id),
  business_owner_id  uuid references people(id),
  blocked            boolean not null default false,
  block_reason       text,
  -- denormalised for RLS — maintained by trigger below:
  owner_team         team_id not null default 'business',
  involved_teams     team_id[] not null default '{business}',
  stage_entered_at   timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  target_go_live     date,
  sacrosanct_go_live date,
  -- PM Activity List sheet parity:
  priority_month     text,
  timeline_eta       date,
  dev_effort_days    int,
  reason_for_delay   text,
  product_spoc_id    uuid references people(id),
  tech_lead_id       uuid references people(id),
  final_go_live      date  -- stamped automatically by trg_scope on going live
);
create index on projects (stage);
create index on projects using gin (involved_teams);

-- Keep owner_team + involved_teams correct on every write → RLS stays accurate.
-- Folds in my_team() (the acting user's own team), not just the new owner:
-- without it, e.g. Product creating a project on Business's behalf sets
-- involved_teams to {business} only, and the creator can't even SELECT the
-- row they just inserted back (RETURNING is itself subject to the SELECT
-- policy) — Postgres reports that identically to a WITH CHECK failure.
create or replace function sync_project_scope() returns trigger language plpgsql as $$
begin
  new.owner_team := stage_owner(new.stage);
  -- Final go-live stamps itself the moment a project reaches Live.
  if new.stage = 'live' and new.final_go_live is null then
    new.final_go_live := current_date;
  end if;
  new.involved_teams := (
    select array(select distinct unnest(
      coalesce(old.involved_teams, array['business']::team_id[])
      || new.owner_team || 'business'::team_id || coalesce(my_team(), new.owner_team)))
  );
  return new;
end;
$$;
create trigger trg_scope before insert or update of stage on projects
  for each row execute function sync_project_scope();

create table subtasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text not null, team team_id not null, assignee_id uuid references people(id),
  done boolean not null default false, created_at timestamptz not null default now()
);

-- Assigning a sub-task to a team makes the project visible to that team
-- (e.g. a Design sub-task on a Dev-stage project lets Design see it at all).
-- SECURITY DEFINER so the scope-sync write itself never trips projects RLS.
create or replace function sync_subtask_scope() returns trigger language plpgsql security definer as $$
begin
  update projects
     set involved_teams = (select array(select distinct unnest(involved_teams || new.team)))
   where id = new.project_id and not (new.team = any(involved_teams));
  return new;
end;
$$;
create trigger trg_subtask_scope after insert or update of team on subtasks
  for each row execute function sync_subtask_scope();

create table stage_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  at timestamptz not null default now(), by_id uuid references people(id),
  from_stage stage_id, to_stage stage_id not null,
  from_status text, to_status text not null, note text
);
create table comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  at timestamptz not null default now(), by_id uuid references people(id),
  text text not null, pinned boolean not null default false, resolved boolean not null default false
);
create table attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  name text not null, kind text not null, url text,
  by_id uuid references people(id), at timestamptz not null default now()
);

-- Can the current user SEE this project? (their team is involved, or they oversee)
create or replace function can_see(pid uuid) returns boolean language sql stable security definer as $$
  select is_overseer() or exists (
    select 1 from projects p where p.id = pid and my_team() = any(p.involved_teams)
  );
$$;
-- Can they ACT on it? (their team currently holds the ball, or PMO)
create or replace function can_act(pid uuid) returns boolean language sql stable security definer as $$
  select is_pmo() or exists (
    select 1 from projects p where p.id = pid and my_team() = p.owner_team
  );
$$;

-- ── RLS ──
alter table projects      enable row level security;
alter table subtasks      enable row level security;
alter table stage_history enable row level security;
alter table comments      enable row level security;
alter table attachments   enable row level security;

-- projects: see if involved/overseer; create if business/product/spoc/pmo; update only in-court team or pmo
--
-- p_upd's WITH CHECK deliberately checks involved_teams, not "my_team() = the new owner":
-- a handoff (forward/back/reject) is written by the OUTGOING team, and after
-- sync_project_scope() recomputes owner_team to the INCOMING team, my_team() = owner_team
-- would never hold for the very update that performs the handoff. involved_teams only
-- grows, and the actor's team is already in it (added the moment they became owner), so
-- this still rejects teams that were never part of the project while allowing every
-- legitimate transition.
create policy p_sel on projects for select using ( is_overseer() or my_team() = any(involved_teams) );
create policy p_ins on projects for insert with check ( is_pmo() or my_team() in ('business','product','tech_spoc') );
create policy p_upd on projects for update
  using ( is_pmo() or my_team() = owner_team or (stage = 'to_be_picked' and my_team() = 'development') )
  with check ( is_pmo() or my_team() = any(involved_teams) );
create policy p_del on projects for delete using ( is_pmo() );

-- children: readable if the project is visible; writable only by in-court team / pmo
create policy s_sel on subtasks      for select using ( can_see(project_id) );
create policy s_wr  on subtasks      for all    using ( can_act(project_id) ) with check ( can_act(project_id) );
create policy h_sel on stage_history for select using ( can_see(project_id) );
create policy h_ins on stage_history for insert with check ( can_act(project_id) );

-- comments: anyone who can SEE the project may comment (incl. leadership); only in-court/pmo can resolve
create policy c_sel on comments for select using ( can_see(project_id) );
create policy c_ins on comments for insert with check ( can_see(project_id) );
create policy c_upd on comments for update using ( can_act(project_id) or by_id = (select id from people where auth_id = auth.uid()) );

-- attachments: involved teams (not pure observers) can add; anyone who sees the project can read
create policy a_sel on attachments for select using ( can_see(project_id) );
create policy a_ins on attachments for insert with check (
  can_act(project_id) or exists (
    select 1 from projects p where p.id = project_id and my_team() = any(p.involved_teams)
  )
);

-- Realtime so every logged-in client updates the instant anything changes.
alter publication supabase_realtime add table projects, subtasks, stage_history, comments, attachments;

-- ══════════════════════════════════════════════════════════════
-- Directory access + magic-link claim
-- People rows are pre-seeded by an admin script (service role key), one per
-- org member. auth_id starts null; the first successful login for that email
-- claims the row via claim_person(), driven by the verified JWT — never by
-- client-supplied input. Anyone who signs in but isn't in `people` yet is
-- authenticated (has a Supabase session) but owns zero rows anywhere else,
-- because every other RLS policy is keyed off my_team()/my_role(), which are
-- both null for them. That's the whole access gate for this internal tool.
-- ══════════════════════════════════════════════════════════════
alter table people enable row level security;
create policy people_sel on people for select using ( auth.role() = 'authenticated' );

create or replace function claim_person() returns people language plpgsql security definer as $$
declare rec people;
begin
  update people set auth_id = auth.uid()
    where email = lower(auth.jwt() ->> 'email') and auth_id is null
    returning * into rec;
  if rec.id is null then
    select * into rec from people where auth_id = auth.uid();
  end if;
  return rec;
end;
$$;

-- Phase 2 hook: a scheduled Edge Function scans stage_entered_at vs an SLA table and
-- emails/Slacks the current owner + PMO on breach; a trigger on `comments`
-- where pinned = true notifies the owning team of a leadership priority note.

-- ══════════════════════════════════════════════════════════════
-- Migration: subtask date + effort fields (run once on existing DBs)
-- ══════════════════════════════════════════════════════════════
-- alter table subtasks add column if not exists expected_date date;
-- alter table subtasks add column if not exists promised_date date;
-- alter table subtasks add column if not exists effort_days int;

-- Migration: role_id enum — add 'manager' if you want a distinct manager tier
-- (currently managers use 'lead' + team='tech_spoc'; this is optional)
-- alter type role_id add value if not exists 'manager';

-- Migration: RLS update for subtasks — allow assignees to update their own subtask dates/effort
-- drop policy if exists s_wr on subtasks;
-- create policy s_wr on subtasks for all
--   using (can_act(project_id) or assignee_id = (select id from people where auth_id = auth.uid()))
--   with check (can_act(project_id) or assignee_id = (select id from people where auth_id = auth.uid()));
