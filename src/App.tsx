import { useMemo, useState } from "react";
import {
  LayoutDashboard, KanbanSquare, Table2, AlertOctagon, Inbox, Users,
  Plus, LogOut, RotateCcw, Cloud, HardDrive, Eye,
} from "lucide-react";
import type { Person, ViewKey } from "./types";
import { useProjects, resetDemo } from "./store";
import { isCloud, daysBetween, overdueInfo } from "./lib";
import { PEOPLE_BY_ID } from "./people";
import { useCloudAuth, signOutCloud } from "./auth";
import { TEAMS, STAGE_BY_ID, aging } from "./workflow";
import { can, isMine, isReadOnly, homeView, navFor, visibleProjects, visibleTo, openLeadershipNote } from "./roles";
import { Avatar } from "./ui";
import { GyftrLogo } from "./GyftrLogo";
import { Login } from "./views/Login";
import { CloudLogin, CloudLoginLoading, CloudNoAccess } from "./views/CloudLogin";
import { MyQueue } from "./views/MyQueue";
import { Board } from "./views/Board";
import { Dashboard } from "./views/Dashboard";
import { TableView } from "./views/TableView";
import { Escalations } from "./views/Escalations";
import { Drawer } from "./views/Drawer";
import { CreateModal } from "./views/CreateModal";
import { FilterBar, EMPTY_FILTERS, applyFilters, type Filters } from "./views/FilterBar";

const META: Record<ViewKey, { label: string; Icon: typeof Inbox; h: string; s: string }> = {
  queue:       { label: "My Queue",     Icon: Inbox,          h: "My Queue",     s: "Everything waiting in your court, most urgent first" },
  team:        { label: "My Team",      Icon: Users,          h: "My Team",      s: "Projects your team is involved in" },
  overview:    { label: "Overview",     Icon: LayoutDashboard, h: "Overview",    s: "Portfolio health, ownership and ageing at a glance" },
  board:       { label: "Flow Board",   Icon: KanbanSquare,   h: "Flow Board",   s: "The whole pipeline — drag a project to move it along" },
  list:        { label: "All Projects", Icon: Table2,         h: "All Projects", s: "Every project, filterable" },
  escalations: { label: "Escalations",  Icon: AlertOctagon,   h: "Escalations",  s: "Blocked, overdue and SLA-breaching — who to chase" },
};

export default function App() {
  const [meId, setMeId] = useState<string | null>(() => localStorage.getItem("gtp_me"));
  const cloudAuth = useCloudAuth();
  const projects = useProjects();
  const me: Person | null = isCloud
    ? (cloudAuth.status === "signed_in" ? cloudAuth.me : null)
    : (meId ? PEOPLE_BY_ID[meId] : null);

  const [view, setView] = useState<ViewKey>(() => {
    const id = localStorage.getItem("gtp_me");
    return id && PEOPLE_BY_ID[id] ? homeView(PEOPLE_BY_ID[id]) : "queue";
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const lobs = useMemo(() => [...new Set(projects.map((p) => p.lob))].sort(), [projects]);
  const myCount = useMemo(() => (me ? projects.filter((p) => isMine(me, p)).length : 0), [projects, me]);
  const escCount = useMemo(() => projects.filter((p) =>
    p.stage !== "live" && (openLeadershipNote(p) || p.blocked || overdueInfo(p.sacrosanctGoLive, p.targetGoLive, false).overdue ||
      aging(daysBetween(p.stageEnteredAt), STAGE_BY_ID[p.stage].slaDays) === "breach")).length, [projects]);

  if (!me) {
    if (isCloud) {
      if (cloudAuth.status === "no_access") return <CloudNoAccess email={cloudAuth.email} />;
      if (cloudAuth.status === "loading") return <CloudLoginLoading />;
      return <CloudLogin />;
    }
    return <Login onPick={(id) => { setMeId(id); localStorage.setItem("gtp_me", id); setView(homeView(PEOPLE_BY_ID[id])); }} />;
  }

  const nav = navFor(me);
  const active = nav.includes(view) ? view : homeView(me);
  const m = META[active];
  const openCandidate = openId ? projects.find((p) => p.id === openId) : null;
  const open = openCandidate && visibleTo(me, openCandidate) ? openCandidate : null;  // RLS guard: never open what you can't see
  const showFilters = active === "board" || active === "list" || active === "team";

  // base data set per view (role scoping happens HERE)
  const base = active === "team" ? visibleProjects(me, projects) : projects;
  const filtered = applyFilters(base, filters);

  const badge = (k: ViewKey) => (k === "queue" ? myCount : k === "escalations" ? escCount : 0);
  const myFlagged = me ? projects.some((p) => isMine(me, p) && openLeadershipNote(p)) : false;
  const hotBadge = (k: ViewKey) => (k === "escalations" && escCount > 0) || (k === "queue" && myFlagged);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand" style={{ flexDirection: "column", alignItems: "flex-start", gap: 5 }}>
          <GyftrLogo h={22} />
          <span style={{ fontSize: 10.5, color: "var(--ink-mute)", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", paddingLeft: 2 }}>Tech · Project Flow</span>
        </div>

        {nav.map((k) => {
          const it = META[k]; const b = badge(k);
          return (
            <button key={k} className={`nav-item ${active === k ? "on" : ""}`} onClick={() => { setView(k); setFilters(EMPTY_FILTERS); }}>
              <it.Icon size={17} /> {it.label}
              {b ? <span className={`badge ${hotBadge(k) ? "hot" : ""}`}>{b}</span> : null}
            </button>
          );
        })}

        <div className="nav-sep">Data</div>
        <div className="nav-item" style={{ cursor: "default" }}>
          {isCloud ? <Cloud size={16} /> : <HardDrive size={16} />} {isCloud ? "Supabase" : "Local demo"}
        </div>
        {!isCloud && (
          <button className="nav-item" onClick={() => { if (confirm("Reset demo data?")) resetDemo(); }}>
            <RotateCcw size={16} /> Reset demo
          </button>
        )}

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 11px", borderTop: "1px solid var(--line)", marginTop: 6 }}>
          <Avatar id={me.id} size={32} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{me.name}</div>
            <div style={{ fontSize: 11, color: "var(--ink-mute)" }}>{TEAMS[me.team].label} · {me.role}</div>
          </div>
          <button className="icon-btn" style={{ width: 30, height: 30 }} title={isCloud ? "Sign out" : "Switch user"}
            onClick={() => { if (isCloud) { signOutCloud(); } else { setMeId(null); localStorage.removeItem("gtp_me"); } }}>
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <div className="crumb">Gyftr Tech Portal · {TEAMS[me.team].label}</div>
            <h1>{active === "team" ? `My Team · ${TEAMS[me.team].label}` : m.h}</h1>
            <div className="sub">{m.s}</div>
          </div>
          <div className="spacer" />
          {isReadOnly(me) && <span className="chip"><Eye size={12} /> Read-only observer</span>}
          {can("create", me) && <button className="btn primary" onClick={() => setCreating(true)}><Plus size={15} /> New project</button>}
        </div>

        {showFilters && <FilterBar filters={filters} setFilters={setFilters} lobs={lobs} />}

        <div className="content">
          {active === "queue" && <MyQueue projects={projects} me={me} onOpen={setOpenId} />}
          {active === "team" && <Board projects={filtered} me={me} onOpen={setOpenId} />}
          {active === "overview" && <Dashboard projects={projects} onOpen={setOpenId} />}
          {active === "board" && <Board projects={filtered} me={me} onOpen={setOpenId} />}
          {active === "list" && <TableView projects={filtered} onOpen={setOpenId} />}
          {active === "escalations" && <Escalations projects={projects} onOpen={setOpenId} />}
        </div>
      </main>

      {open && <Drawer project={open} me={me} onClose={() => setOpenId(null)} />}
      {creating && <CreateModal meId={me.id} onClose={(id) => { setCreating(false); if (id) setOpenId(id); }} />}
    </div>
  );
}
