import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { Person, Project } from "../types";
import { STAGE_BY_ID, forwardOf, PRIORITY_META } from "../workflow";
import { isMine, canPerformTransition, ownerForTransition, openLeadershipNote } from "../roles";
import { transition } from "../store";
import { daysBetween } from "../lib";
import { Avatar, StatusPill, PriorityChip, AgingChip, OverdueTag, CeoNote } from "../ui";

export function MyQueue({ projects, me, onOpen }: { projects: Project[]; me: Person; onOpen: (id: string) => void }) {
  const mine = projects
    .filter((p) => isMine(me, p))
    .sort((a, b) =>
      (Number(openLeadershipNote(b)) - Number(openLeadershipNote(a))) ||
      (PRIORITY_META[b.priority].rank - PRIORITY_META[a.priority].rank) ||
      (daysBetween(b.stageEnteredAt) - daysBetween(a.stageEnteredAt))
    );

  const blocked = mine.filter((p) => p.blocked).length;

  if (mine.length === 0) {
    return (
      <div className="empty fade">
        <CheckCircle2 size={40} />
        <h3 style={{ marginBottom: 4 }}>You're all clear</h3>
        <div style={{ fontSize: 13 }}>Nothing is waiting in your court right now.</div>
      </div>
    );
  }

  return (
    <div className="fade">
      <div style={{ display: "flex", gap: 18, marginBottom: 16, alignItems: "baseline" }}>
        <div><b style={{ fontFamily: "var(--font-d)", fontSize: 15 }}>{mine.length}</b> <span style={{ color: "var(--ink-soft)", fontSize: 13 }}>items need your action</span></div>
        {blocked > 0 && <div style={{ color: "var(--rose-fg)", fontSize: 13, fontWeight: 600 }}>{blocked} blocked</div>}
      </div>

      <div className="grid stagger" style={{ gridTemplateColumns: "1fr" }}>
        {mine.map((p) => {
          const fwd = forwardOf(p.stage);
          const canFwd = !!fwd && canPerformTransition(me, p, fwd);
          return (
            <div key={p.id} className="panel" style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", cursor: "pointer" }} onClick={() => onOpen(p.id)}>
              <span className="col-accent" style={{ background: STAGE_BY_ID[p.stage].color, height: 34, width: 4 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <span className="card-code">{p.code}</span>
                  <PriorityChip p={p.priority} />
                  <span style={{ fontWeight: 650, fontSize: 14 }}>{p.title}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span className="chip">{p.partner}</span>
                  <StatusPill status={p.status} />
                  <AgingChip project={p} />
                  <OverdueTag project={p} />
                  <CeoNote project={p} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                {canFwd && fwd && (
                  <button className="btn subtle sm" onClick={() => transition(p.id, me.id, fwd, ownerForTransition(fwd, me))}>
                    {fwd.label} <ArrowRight size={13} />
                  </button>
                )}
                <button className="btn sm" onClick={() => onOpen(p.id)}>Open</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
