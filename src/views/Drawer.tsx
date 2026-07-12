import { useState } from "react";
import {
  ArrowLeft, ArrowRight, Send, CheckCircle2, Circle, Ban, MessageSquare,
  Paperclip, Plus, Lock, CornerUpLeft, RotateCcw, Hand, Star, ExternalLink, Check, X,
} from "lucide-react";
import type { Person, Project, StatusId, DocKind, TeamId, SubTask } from "../types";
import {
  STAGES, STAGE_BY_ID, STAGE_ORDER, STATUSES, statusesForStage, TEAMS, TRANSITIONS,
  type TransitionSpec,
} from "../workflow";
import {
  transition, setStatus, setBlock, addComment, toggleSubtask, addSubtask, removeSubtask, reassignSubtask,
  reassign, addAttachment, resolveNote,
} from "../store";
import { can, canPerformTransition, isOverseer, ownerTeam, ownerForTransition } from "../roles";
import { PEOPLE, PEOPLE_BY_ID } from "../people";
import { daysBetween, relTime, fmtDate } from "../lib";
import { Avatar, StatusPill, PriorityChip, AgingChip, OverdueTag } from "../ui";

const DOC_KINDS: DocKind[] = ["BRD", "PRD", "Figma", "HTML", "Doc"];
const kindIcon = (k: string) => (k === "forward" ? Hand : k === "reopen" ? RotateCcw : CornerUpLeft);

/** A transition action paired with an explicit "who exactly is this for" picker,
 *  scoped to the receiving team — beats silently auto-assigning to a guessed lead. */
function TransitionButton({
  spec, me, primary, danger, onFire,
}: { spec: TransitionSpec; me: Person; primary?: boolean; danger?: boolean; onFire: (spec: TransitionSpec, ownerId: string) => void }) {
  const candidates = PEOPLE.filter((p) => p.team === spec.ownerTeam);
  const [to, setTo] = useState(() => ownerForTransition(spec, me));
  const Icon = kindIcon(spec.kind);
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {candidates.length > 1 && (
        <select
          className={`select ${primary ? "" : "sm"}`} style={{ maxWidth: primary ? undefined : 130, flex: primary ? 1 : undefined, minWidth: 0 }}
          value={to} onChange={(e) => setTo(e.target.value)} title={`Who on ${TEAMS[spec.ownerTeam].label} is this for?`}
        >
          {candidates.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      <button className={`btn ${primary ? "primary" : "sm"} ${danger ? "danger" : ""}`} style={{ flex: "none" }} onClick={() => onFire(spec, to)}>
        {primary ? <>{spec.label} <ArrowRight size={14} /></> : <><Icon size={14} /> {spec.label}</>}
      </button>
    </div>
  );
}

/** One sub-task row: toggle done, reassign to anyone (not just its own team), remove. */
function SubtaskRow({ s, project, me }: { s: SubTask; project: Project; me: Person }) {
  const [reassigning, setReassigning] = useState(false);
  const assignee = s.assigneeId ? PEOPLE_BY_ID[s.assigneeId] : undefined;
  const editable = can("advance", me, project);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", borderRadius: 9 }}>
      <button disabled={!editable} onClick={() => toggleSubtask(project.id, s.id)}
        style={{ display: "flex", alignItems: "center", gap: 9, flex: 1, minWidth: 0, textAlign: "left" }}>
        {s.done ? <CheckCircle2 size={16} color="var(--pop)" /> : <Circle size={16} color="var(--ink-mute)" />}
        <span style={{ fontSize: 13, textDecoration: s.done ? "line-through" : "none", color: s.done ? "var(--ink-mute)" : "var(--ink)", flex: 1, minWidth: 0 }}>{s.title}</span>
      </button>
      {s.createdAt && <span style={{ fontSize: 10.5, color: "var(--ink-mute)", flex: "none" }}>{relTime(s.createdAt)}</span>}
      {reassigning ? (
        <select
          className="select sm" autoFocus style={{ maxWidth: 130 }} value={s.assigneeId ?? ""}
          onChange={(e) => { reassignSubtask(project.id, s.id, e.target.value || undefined); setReassigning(false); }}
          onBlur={() => setReassigning(false)}
        >
          <option value="">Unassigned</option>
          {PEOPLE.filter((p) => p.role !== "leadership").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      ) : (
        <button disabled={!editable} onClick={() => setReassigning(true)} title={assignee ? assignee.name : "Unassigned — click to assign"} style={{ display: "flex", flex: "none" }}>
          {assignee ? <Avatar id={assignee.id} size={20} /> : <span className="chip" style={{ fontSize: 10 }}>{TEAMS[s.team].short}</span>}
        </button>
      )}
      {editable && (
        <button className="icon-btn" style={{ width: 24, height: 24, flex: "none" }} title="Remove sub-task" onClick={() => removeSubtask(project.id, s.id)}>
          <X size={12} />
        </button>
      )}
    </div>
  );
}

export function Drawer({ project, me, onClose }: { project: Project; me: Person; onClose: () => void }) {
  const [comment, setComment] = useState("");
  const [reason, setReason] = useState("");
  const [attachName, setAttachName] = useState("");
  const [attachUrl, setAttachUrl] = useState("");
  const [attachKind, setAttachKind] = useState<DocKind>("Link");
  const overseer = isOverseer(me);
  const [pinNote, setPinNote] = useState(overseer);
  const pins = project.comments.filter((c) => c.pinned);
  const canResolve = can("advance", me, project) || me.role === "pmo";

  const submitComment = () => {
    if (!comment.trim()) return;
    addComment(project.id, me.id, comment.trim(), overseer && pinNote);
    setComment("");
  };
  const addDoc = () => {
    if (!attachName.trim()) return;
    addAttachment(project.id, me.id, attachName.trim(), attachKind, attachUrl.trim() || undefined);
    setAttachName(""); setAttachUrl("");
  };

  const idx = STAGE_ORDER.indexOf(project.stage);
  const owner = PEOPLE_BY_ID[project.ownerId];
  const oTeam = ownerTeam(project);
  const done = project.subtasks.filter((s) => s.done).length;
  const subtaskPct = project.subtasks.length ? Math.round((done / project.subtasks.length) * 100) : 0;
  const sortedSubtasks = [...project.subtasks].sort((a, b) => Number(a.done) - Number(b.done) || (a.createdAt ?? 0) - (b.createdAt ?? 0));

  const specs = TRANSITIONS[project.stage];
  // Some stages have more than one legitimate forward path (e.g. Product can
  // route to Tech SPOC's queue, or straight to Dev if they already know who's
  // picking it up) — show every one you're allowed to fire, not just the first.
  const forwards = specs.filter((t) => t.kind === "forward");
  const backs = specs.filter((t) => t.kind !== "forward");
  const availableForwards = forwards.filter((f) => canPerformTransition(me, project, f));
  const canBack = can("advance", me, project);
  const canEdit = can("status", me, project);
  const anyAction = availableForwards.length > 0 || canBack || canEdit;

  const doTransition = (spec: TransitionSpec, ownerId: string) => {
    transition(project.id, me.id, spec, ownerId);
    if (reason.trim() && spec.kind !== "forward") addComment(project.id, me.id, `[${spec.label}] ${reason.trim()}`);
    setReason("");
  };

  // Add sub-task form
  const [subTitle, setSubTitle] = useState("");
  const [subTeam, setSubTeam] = useState<TeamId>(oTeam);
  const subCandidates = PEOPLE.filter((p) => p.team === subTeam);
  const [subAssignee, setSubAssignee] = useState<string>("");
  const addSub = () => {
    if (!subTitle.trim()) return;
    const sub: Omit<SubTask, "id"> = { title: subTitle.trim(), team: subTeam, assigneeId: subAssignee || undefined, done: false };
    addSubtask(project.id, sub);
    setSubTitle(""); setSubAssignee("");
  };

  return (
    <div className="project-page">
      <div className="project-page-head">
        <button className="btn ghost sm" onClick={onClose} style={{ marginBottom: 12 }}><ArrowLeft size={14} /> Back</button>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span className="card-code">{project.code}</span>
          <PriorityChip p={project.priority} />
          <span className="chip">{project.bifurcation}</span>
          {!anyAction && <span className="chip"><Lock size={11} /> view only</span>}
        </div>
        <h1 style={{ margin: "9px 0 8px", fontSize: 21, fontFamily: "var(--font-d)", letterSpacing: "-.01em" }}>{project.title}</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="chip">{project.partner}</span>
          <span className="chip">{project.lob}</span>
          <StatusPill status={project.status} />
          <AgingChip project={project} />
          <OverdueTag project={project} />
        </div>
      </div>

      <div className="project-page-body">
        <div className="project-main">
          {/* Ownership + primary action */}
          <div className="panel" style={{ padding: 14, background: "var(--surface-2)", boxShadow: "none" }}>
            <div className="section-title">Ball is currently with</div>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <Avatar id={project.ownerId} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{owner?.name}</div>
                <div style={{ fontSize: 12, color: "var(--ink-mute)" }}>{TEAMS[oTeam].label} · assigned {relTime(project.stageEnteredAt)} · {daysBetween(project.stageEnteredAt)}d in {STAGE_BY_ID[project.stage].label}</div>
              </div>
            </div>
            {availableForwards.length > 0 && (
              <div style={{ marginTop: 11, display: "flex", flexDirection: "column", gap: 8 }}>
                {availableForwards.map((f) => (
                  <TransitionButton key={f.to + f.kind} spec={f} me={me} primary onFire={doTransition} />
                ))}
              </div>
            )}
            {!anyAction && (
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--ink-mute)" }}>
                This is in <b style={{ color: "var(--ink-soft)" }}>{TEAMS[oTeam].label}</b>'s court — you can comment, but only they can move it.
              </div>
            )}
            {can("assign", me, project) && (
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>Assigned to</span>
                <select className="select" style={{ maxWidth: 220 }} value={project.ownerId} onChange={(e) => reassign(project.id, e.target.value)}>
                  {PEOPLE.filter((p) => p.team === oTeam || p.id === project.ownerId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Leadership priority notes — pinned to the top */}
          {pins.length > 0 && (
            <div className="note-pin">
              <div className="head"><Star size={12} fill="currentColor" /> Priority note{pins.length > 1 ? "s" : ""} from leadership</div>
              {pins.map((c) => (
                <div key={c.id} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "5px 0", opacity: c.resolved ? 0.55 : 1 }}>
                  <Avatar id={c.byId} size={24} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, marginBottom: 2 }}><b>{PEOPLE_BY_ID[c.byId]?.name}</b><span style={{ color: "var(--ink-mute)" }}> · {relTime(c.at)}</span></div>
                    <div style={{ fontSize: 13, color: "var(--ink)", textDecoration: c.resolved ? "line-through" : "none" }}>{c.text}</div>
                  </div>
                  {c.resolved ? (
                    <span className="chip" style={{ background: "var(--pop-soft)", color: "var(--pop-deep)", border: "none" }}><Check size={11} /> Resolved</span>
                  ) : canResolve ? (
                    <button className="btn sm" onClick={() => resolveNote(project.id, c.id)}><Check size={13} /> Resolve</button>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {/* Secondary actions (send back / reject / reopen) + status + block */}
          {anyAction && (
            <div>
              <div className="section-title">Actions</div>
              {canEdit && (
                <div className="field" style={{ marginBottom: 12 }}>
                  <label>Update status (within {STAGE_BY_ID[project.stage].label})</label>
                  <select className="select" value={project.status} onChange={(e) => setStatus(project.id, e.target.value as StatusId, me.id)}>
                    {statusesForStage(project.stage).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
              )}
              {canBack && backs.length > 0 && (
                <input className="input" style={{ marginBottom: 9 }} placeholder="Reason for sending back / rejecting (optional)…" value={reason} onChange={(e) => setReason(e.target.value)} />
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {canBack && backs.map((t) => (
                  <TransitionButton key={t.to + t.kind} spec={t} me={me} danger={t.kind === "reject" || t.kind === "reopen"} onFire={doTransition} />
                ))}
                {can("block", me, project) && (
                  <button className="btn sm" onClick={() => setBlock(project.id, !project.blocked, project.blocked ? undefined : "Blocked — reason pending")}>
                    <Ban size={14} /> {project.blocked ? "Clear block" : "Mark blocked"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Blocker banner */}
          {project.blocked && (
            <div className="panel" style={{ padding: 13, borderColor: "var(--rose-fg)", boxShadow: "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Ban size={15} color="var(--rose-fg)" /><b style={{ fontSize: 13 }}>Blocked</b>
              </div>
              <textarea className="input" value={project.blockReason ?? ""} disabled={!can("block", me, project)} onChange={(e) => setBlock(project.id, true, e.target.value)} placeholder="What's blocking this and who owes the answer?" />
            </div>
          )}

          {/* BRD */}
          <div>
            <div className="section-title">Requirement (BRD)</div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.55 }}>{project.brd || "—"}</p>
          </div>

          {/* Sub-tasks */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
              <div className="section-title" style={{ marginBottom: 0 }}>Sub-tasks {project.subtasks.length > 0 ? `· ${done}/${project.subtasks.length}` : ""}</div>
              {project.subtasks.length > 0 && (
                <div className="progressbar" style={{ maxWidth: 120 }}><i style={{ width: `${subtaskPct}%` }} /></div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {sortedSubtasks.map((s) => <SubtaskRow key={s.id} s={s} project={project} me={me} />)}
              {project.subtasks.length === 0 && <div style={{ fontSize: 12.5, color: "var(--ink-mute)" }}>No sub-tasks yet.</div>}
            </div>
            {can("advance", me, project) && (
              <div style={{ display: "flex", gap: 8, marginTop: 9, flexWrap: "wrap" }}>
                <input className="input" style={{ flex: 1, minWidth: 140 }} placeholder="New sub-task…" value={subTitle} onChange={(e) => setSubTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSub()} />
                <select className="select" style={{ maxWidth: 130 }} value={subTeam} onChange={(e) => { setSubTeam(e.target.value as TeamId); setSubAssignee(""); }}>
                  {Object.values(TEAMS).filter((t) => t.id !== "leadership" && t.id !== "partner").map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <select className="select" style={{ maxWidth: 140 }} value={subAssignee} onChange={(e) => setSubAssignee(e.target.value)}>
                  <option value="">Unassigned</option>
                  {subCandidates.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button className="btn sm" onClick={addSub}><Plus size={14} /></button>
              </div>
            )}
          </div>

          {/* Comments */}
          <div>
            <div className="section-title"><MessageSquare size={11} style={{ verticalAlign: -1 }} /> Comments · {project.comments.length}</div>
            {project.comments.map((c) => (
              <div className="comment" key={c.id}>
                <Avatar id={c.byId} size={28} />
                <div className="body">
                  <div style={{ fontSize: 12, marginBottom: 3 }}><b>{PEOPLE_BY_ID[c.byId]?.name}</b><span style={{ color: "var(--ink-mute)" }}> · {relTime(c.at)}</span></div>
                  <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>{c.text}</div>
                </div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input className="input" placeholder={overseer ? "Leave a note for the team…" : "Add a comment…"} value={comment} onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitComment(); }} />
              <button className="btn primary" onClick={submitComment}><Send size={14} /></button>
            </div>
            {overseer && (
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, color: "var(--ink-soft)", cursor: "pointer" }}>
                <input type="checkbox" checked={pinNote} onChange={(e) => setPinNote(e.target.checked)} />
                <Star size={12} fill={pinNote ? "var(--gold)" : "none"} color="var(--gold-fg)" /> Pin as priority note (flags it for the owning team)
              </label>
            )}
          </div>
        </div>

        <div className="project-rail">
          {/* Stepper */}
          <div className="panel" style={{ boxShadow: "none" }}>
            <div className="section-title">Pipeline</div>
            <div className="stepper" style={{ flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
              {STAGES.map((s, i) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`node ${i < idx ? "done" : i === idx ? "current" : ""}`}
                    style={{
                      width: 22, height: 22, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 9.5,
                      fontFamily: "var(--font-m)", flex: "none", border: "2px solid var(--line-strong)", background: "var(--surface)",
                      ...(i < idx ? { background: "var(--pop)", borderColor: "var(--pop)", color: "#fff" } : {}),
                      ...(i === idx ? { background: "var(--pop-deep)", borderColor: "var(--pop-deep)", color: "#fff", boxShadow: "0 0 0 3px var(--pop-ring)" } : {}),
                    }}>
                    {i < idx ? "✓" : i + 1}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: i === idx ? 700 : 550, color: i === idx ? "var(--ink)" : "var(--ink-mute)" }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Details / dates */}
          <div className="panel" style={{ boxShadow: "none" }}>
            <div className="section-title">Details</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 12.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ color: "var(--ink-mute)" }}>Raised by</span>
                <b style={{ color: "var(--ink-soft)" }}>{PEOPLE_BY_ID[project.businessOwnerId]?.name}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ color: "var(--ink-mute)" }}>Target go-live</span>
                <b className="mono" style={{ color: "var(--ink-soft)" }}>{fmtDate(project.targetGoLive)}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ color: "var(--ink-mute)" }}>Sacrosanct</span>
                <b className="mono" style={{ color: "var(--ink-soft)" }}>{fmtDate(project.sacrosanctGoLive)}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ color: "var(--ink-mute)" }}>Created</span>
                <b style={{ color: "var(--ink-soft)" }}>{relTime(project.createdAt)}</b>
              </div>
            </div>
          </div>

          {/* Attachments */}
          <div className="panel" style={{ boxShadow: "none" }}>
            <div className="section-title"><Paperclip size={11} style={{ verticalAlign: -1 }} /> Documents · {project.attachments.length}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {project.attachments.map((a) => {
                const inner = (
                  <>
                    <span className="pill" style={{ background: "var(--pop-soft)", color: "var(--pop-deep)" }}>{a.kind}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1, color: a.url ? "var(--pop-deep)" : "var(--ink)" }}>{a.name}</span>
                    {a.url && <ExternalLink size={13} color="var(--ink-mute)" />}
                  </>
                );
                return a.url
                  ? <a className="attach" key={a.id} href={a.url} target="_blank" rel="noreferrer">{inner}</a>
                  : <div className="attach" key={a.id}>{inner}</div>;
              })}
              {project.attachments.length === 0 && <div style={{ fontSize: 12.5, color: "var(--ink-mute)" }}>No documents attached yet.</div>}
            </div>
            {can("comment", me, project) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 9 }}>
                <select className="select sm" value={attachKind} onChange={(e) => setAttachKind(e.target.value as DocKind)}>
                  {DOC_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                <input className="input" placeholder="Label (e.g. Godrej PRD)…" value={attachName} onChange={(e) => setAttachName(e.target.value)} />
                <input className="input" placeholder="https://link…" value={attachUrl} onChange={(e) => setAttachUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addDoc()} />
                <button className="btn sm" style={{ justifyContent: "center" }} onClick={addDoc}><Plus size={14} /> Add document</button>
              </div>
            )}
          </div>

          {/* History */}
          <div className="panel" style={{ boxShadow: "none" }}>
            <div className="section-title">Handoff history</div>
            <div className="timeline">
              {[...project.history].reverse().map((h, i, arr) => (
                <div className="tl-item" key={h.id}>
                  <div className="tl-rail">
                    <div className="tl-dot" style={{ background: STAGE_BY_ID[h.toStage].color }} />
                    {i < arr.length - 1 && <div className="tl-bar" />}
                  </div>
                  <div className="tl-body">
                    <div className="t">{h.fromStage ? `${STAGE_BY_ID[h.fromStage].label} → ` : ""}{STAGE_BY_ID[h.toStage].label}
                      <span style={{ fontWeight: 500, color: "var(--ink-mute)" }}> · {STATUSES[h.toStatus].label}</span></div>
                    <div className="m">{PEOPLE_BY_ID[h.byId]?.name ?? "system"} · {relTime(h.at)}{h.note ? ` · ${h.note}` : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
