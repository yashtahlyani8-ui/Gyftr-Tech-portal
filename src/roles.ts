/* ─── Roles, visibility scoping & permissions ─── */
import type { Person, Project, TeamId, ViewKey } from "./types";
import { STAGES, STAGE_ORDER, STAGE_BY_ID, type TransitionSpec } from "./workflow";
import { PEOPLE } from "./people";

export type Action =
  | "create" | "pickup" | "advance" | "status" | "block"
  | "clarify" | "reopen" | "assign" | "comment" | "subtask";

export const isOverseer = (p: Person) => p.role === "pmo" || p.role === "leadership";
/** Leadership is a pure read-only observer — full visibility, zero edits. */
export const isReadOnly = (p: Person) => p.role === "leadership";

/** Team currently holding the ball. */
export function ownerTeam(p: Project): TeamId {
  return STAGE_BY_ID[p.stage].owner;
}

/** In *my* court right now — my team holds the ball (or it's personally assigned to me). */
export function isMine(me: Person, proj: Project): boolean {
  if (proj.stage === "live") return false;
  return proj.ownerId === me.id || ownerTeam(proj) === me.team;
}

/** Every team that has been (or is) part of a project's journey. Monotonic:
 *  a project at stage N has passed through every stage 0..N. */
export function teamsInvolved(proj: Project): Set<TeamId> {
  const idx = STAGE_ORDER.indexOf(proj.stage);
  const teams = new Set<TeamId>(STAGES.slice(0, idx + 1).map((s) => s.owner));
  proj.subtasks.forEach((st) => teams.add(st.team));
  if (idx >= STAGE_ORDER.indexOf("development")) teams.add("design");
  return teams;
}

/** Can this person even see this project? */
export function visibleTo(me: Person, proj: Project): boolean {
  if (isOverseer(me)) return true;
  if (proj.businessOwnerId === me.id || proj.ownerId === me.id) return true;
  return teamsInvolved(proj).has(me.team);
}

export function visibleProjects(me: Person, projects: Project[]): Project[] {
  return projects.filter((p) => visibleTo(me, p));
}

/** Navigation is role-specific — contributors and overseers get different apps. */
export function navFor(me: Person): ViewKey[] {
  return isOverseer(me) ? ["overview", "board", "list", "escalations"] : ["queue", "team"];
}

export function homeView(me: Person): ViewKey {
  return isOverseer(me) ? "overview" : "queue";
}

/** An open (unresolved) leadership/PMO note pins a project to the top of attention. */
export const openLeadershipNote = (p: Project) => p.comments.some((c) => c.pinned && !c.resolved);
export const pinnedNotes = (p: Project) => p.comments.filter((c) => c.pinned);

export function can(action: Action, me: Person, proj?: Project): boolean {
  if (action === "comment") return true;            // everyone — incl. leadership — can leave notes
  if (isReadOnly(me)) return false;                 // leadership otherwise never writes
  if (action === "create") return ["business", "product", "tech_spoc"].includes(me.team) || me.role === "pmo";
  if (!proj) return me.role === "pmo";
  if (me.role === "pmo") return true;               // PMO is the process owner
  if (action === "pickup")
    return proj.stage === "to_be_picked" && ["tech_spoc", "development"].includes(me.team);
  return isMine(me, proj);                           // otherwise: only the team in-court acts
}

/** Lead (or any member) of a team, to hand the ball to. */
export function leadOf(team: string): string {
  const lead = PEOPLE.find((p) => p.team === team && p.role === "lead");
  return (lead ?? PEOPLE.find((p) => p.team === team) ?? PEOPLE[0]).id;
}

/** Who owns the ball after a transition — the picker keeps dev pickups, else the target lead. */
export function ownerForTransition(spec: TransitionSpec, me: Person): string {
  if (spec.kind === "forward" && spec.to === "development" && me.team === "development") return me.id;
  return leadOf(spec.ownerTeam);
}
