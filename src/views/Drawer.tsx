import { useState } from "react";
import {
  X, ArrowRight, Send, CheckCircle2, Circle, Ban, MessageSquare,
  Paperclip, Plus, Lock, CornerUpLeft, RotateCcw, Hand, Star, ExternalLink, Check,
} from "lucide-react";
import type { Person, Project, StatusId, DocKind } from "../types";
import {
  STAGES, STAGE_BY_ID, STAGE_ORDER, STATUSES, statusesForStage, TEAMS, TRANSITIONS,
  type TransitionSpec,
} from "../workflow";
import {
  transition, setStatus, setBlock, addComment, toggleSubtask, reassign, addAttachment, resolveNote,
} from "../store";
import { can, isMine, isOverseer, ownerTeam, ownerForTransition } from "../roles";
import { PEOPLE, PEOPLE_BY_ID } from "../people";
import { daysBetween, relTime, fmtDate } from "../lib";
import { Avatar, StatusPill, PriorityChip, AgingChip, OverdueTag } from "../ui";

const DOC_KINDS: DocKind[] = ["BRD", "PRD", "Figma", "HTML", "Doc"];
const kindIcon = (k: string) => (k === "forward" ? Hand : k === "reopen" ? RotateCcw : CornerUpLeft);

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

  const specs = TRANSITIONS[project.stage];
  const forward = specs.find((t) => t.kind === "forward");
  const backs = specs.filter((t) => t.kind !== "forward");
  const canForward = !!forward && (project.stage === "to_be_picked" ? can("pickup", me, project) : can("advance", me, project));
  const canBack = can("advance", me, project);
  const canEdit = can("status", me, project);
  const anyAction = canForward || canBack || canEdit;

  const doTransition = (spec: TransitionSpec) => {
    transition(project.id, me.id, spec, ownerForTransition(spec, me));
    if (reason.trim() && spec.kind !== "forward") addComment(project.id, me.id, `[${spec.label}] ${reason.trim()}`);
    setReason("");
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span className="card-code">{project.code}</span>
            <PriorityChip p={project.priority} />
            <span className="chip">{project.bifurcation}</span>
            {!anyAction && <span className="chip"><Lock size={11} /> view only</span>}
            <button className="icon-btn" style={{ marginLeft: "auto", width: 32, height: 32 }} onClick={onClose}><X size={16} /></button>
          </div>
          <h2 style={{ margin: "10px 0 6px", fontSize: 18 }}>{project.title}</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="chip">{project.partner}</span>
            <span className="chip">{project.lob}</span>
            <StatusPill status={project.status} />
            <AgingChip project={project} />
            <OverdueTag project={project} />
          </div>
        </div>

        <div className="drawer-body">
          {/* Ownership + primary action */}
          <div className="panel" style={{ padding: 14, background: "var(--surface-2)", boxShadow: "none" }}>
            <div className="section-title">Ball is currently with</div>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <Avatar id={project.ownerId} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{owner?.name}</div>
                <div style={{ fontSize: 12, color: "var(--ink-mute)" }}>{TEAMS[oTeam].label} · {daysBetween(project.stageEnteredAt)}d in {STAGE_BY_ID[project.stage].label}</div>
              </div>
              {canForward && forward && (
                <button className="btn primary" onClick={() => doTransition(forward)}>
                  {forward.label} <ArrowRight size={14} />
                </button>
              )}
            </div>
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

          {/* Stepper */}
          <div>
            <div className="section-title">Pipeline</div>
            <div className="stepper">
              {STAGES.map((s, i) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center" }}>
                  <div className={`step ${i < idx ? "done" : i === idx ? "current" : ""}`}>
                    <span className="node">{i < idx ? "✓" : i + 1}</span>
                    <span style={{ display: i === idx ? "inline" : "none" }}>{s.label}</span>
                  </div>
                  {i < STAGES.length - 1 && <span className="step-line" />}
                </div>
              ))}
            </div>
          </div>

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
                {canBack && backs.map((t) => {
                  const Icon = kindIcon(t.kind);
                  return (
                    <button key={t.to + t.kind} className={`btn sm ${t.kind === "reject" || t.kind === "reopen" ? "danger" : ""}`} onClick={() => doTransition(t)}>
                      <Icon size={14} /> {t.label}
                    </button>
                  );
                })}
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

          {/* BRD + dates */}
          <div>
            <div className="section-title">Requirement (BRD)</div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.55 }}>{project.brd || "—"}</p>
            <div style={{ display: "flex", gap: 18, marginTop: 12, fontSize: 12, color: "var(--ink-mute)", flexWrap: "wrap" }}>
              <span>Raised by <b style={{ color: "var(--ink-soft)" }}>{PEOPLE_BY_ID[project.businessOwnerId]?.name}</b></span>
              <span>Target <b className="mono" style={{ color: "var(--ink-soft)" }}>{fmtDate(project.targetGoLive)}</b></span>
              <span>Sacrosanct <b className="mono" style={{ color: "var(--ink-soft)" }}>{fmtDate(project.sacrosanctGoLive)}</b></span>
            </div>
          </div>

          {/* Attachments */}
          <div>
            <div className="section-title"><Paperclip size={11} style={{ verticalAlign: -1 }} /> Documents · {project.attachments.length}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {project.attachments.map((a) => {
                const inner = (
                  <>
                    <span className="pill" style={{ background: "var(--pop-soft)", color: "var(--pop-deep)" }}>{a.kind}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, flex: 1, color: a.url ? "var(--pop-deep)" : "var(--ink)" }}>{a.name}</span>
                    {a.url && <ExternalLink size={13} color="var(--ink-mute)" />}
                    <span style={{ fontSize: 11, color: "var(--ink-mute)" }}>{PEOPLE_BY_ID[a.byId]?.name}</span>
                  </>
                );
                return a.url
                  ? <a className="attach" key={a.id} href={a.url} target="_blank" rel="noreferrer">{inner}</a>
                  : <div className="attach" key={a.id}>{inner}</div>;
              })}
              {project.attachments.length === 0 && <div style={{ fontSize: 12.5, color: "var(--ink-mute)" }}>No documents attached yet.</div>}
            </div>
            {can("comment", me, project) && (
              <div style={{ display: "flex", gap: 8, marginTop: 9, flexWrap: "wrap" }}>
                <select className="select" style={{ maxWidth: 96 }} value={attachKind} onChange={(e) => setAttachKind(e.target.value as DocKind)}>
                  {DOC_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                <input className="input" style={{ flex: 1, minWidth: 120 }} placeholder="Label (e.g. Godrej PRD)…" value={attachName} onChange={(e) => setAttachName(e.target.value)} />
                <input className="input" style={{ flex: 1, minWidth: 140 }} placeholder="https://link…" value={attachUrl} onChange={(e) => setAttachUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addDoc()} />
                <button className="btn sm" onClick={addDoc}><Plus size={14} /></button>
              </div>
            )}
          </div>

          {/* Sub-tasks */}
          {project.subtasks.length > 0 && (
            <div>
              <div className="section-title">Sub-tasks · {done}/{project.subtasks.length}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {project.subtasks.map((s) => (
                  <button key={s.id} disabled={!can("advance", me, project)} onClick={() => toggleSubtask(project.id, s.id)}
                    style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 9px", borderRadius: 9, textAlign: "left", width: "100%" }}>
                    {s.done ? <CheckCircle2 size={16} color="var(--pop)" /> : <Circle size={16} color="var(--ink-mute)" />}
                    <span style={{ fontSize: 13, textDecoration: s.done ? "line-through" : "none", color: s.done ? "var(--ink-mute)" : "var(--ink)", flex: 1 }}>{s.title}</span>
                    <span className="chip" style={{ fontSize: 10 }}>{TEAMS[s.team].short}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* History */}
          <div>
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
      </div>
    </div>
  );
}
