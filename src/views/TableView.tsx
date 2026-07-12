import { useMemo } from "react";
import { SearchX, Download } from "lucide-react";
import type { Project } from "../types";
import { STAGE_BY_ID, STATUSES, PRIORITY_META } from "../workflow";
import { fmtDate, daysBetween } from "../lib";
import { PEOPLE_BY_ID } from "../people";
import { Avatar, StatusPill, PriorityChip, AgingChip, OverdueTag } from "../ui";

const personName = (id: string | null | undefined) => (id ? PEOPLE_BY_ID[id]?.name ?? "" : "");

/* The columns of the PM Activity List sheet this table replaces — exported
   verbatim so anyone still needing "the Excel" can regenerate it on demand. */
function exportCsv(rows: Project[]) {
  const headers = [
    "Code", "Line of Business", "Partner", "Description", "Priority", "VG SPOC", "Priority Month",
    "Stage", "Status", "Target Go Live (Biz)", "Timeline ETA", "Target Go Live (Sacrosanct)",
    "Reason For Delay", "Estimated Dev Efforts (days)", "Final Go Live Date", "Tech Bifurcation",
    "Product SPOC", "Tech Lead", "Current Owner", "Days In Stage", "Blocked", "Risk / Challenge",
  ];
  const cell = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((p) => [
    p.code, p.lob, p.partner, p.title, p.priority, personName(p.businessOwnerId), p.priorityMonth ?? "",
    STAGE_BY_ID[p.stage].label, STATUSES[p.status].label, p.targetGoLive ?? "", p.timelineEta ?? "", p.sacrosanctGoLive ?? "",
    p.reasonForDelay ?? "", p.devEffortDays ?? "", p.finalGoLive ?? "", p.bifurcation,
    personName(p.productSpocId), personName(p.techLeadId), personName(p.ownerId),
    p.stage === "live" ? "" : daysBetween(p.stageEnteredAt), p.blocked ? "Yes" : "", p.blockReason ?? "",
  ].map(cell).join(","));
  const csv = [headers.map(cell).join(","), ...lines].join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `gyftr-tech-portal-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function TableView({ projects, onOpen }: { projects: Project[]; onOpen: (id: string) => void }) {
  const rows = useMemo(
    () => [...projects].sort((a, b) => (PRIORITY_META[b.priority].rank - PRIORITY_META[a.priority].rank) || a.code.localeCompare(b.code)),
    [projects]
  );

  if (rows.length === 0) {
    return (
      <div className="empty fade">
        <SearchX size={38} />
        <h3 style={{ marginBottom: 4 }}>No projects match</h3>
        <div style={{ fontSize: 13 }}>Try clearing a filter or two.</div>
      </div>
    );
  }

  return (
    <div className="fade">
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button className="btn sm" onClick={() => exportCsv(rows)} title="Download these rows in the old PM Activity List format">
          <Download size={13} /> Export CSV
        </button>
      </div>
      <div className="tablewrap">
        <div style={{ overflow: "auto", maxHeight: "calc(100vh - 250px)" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Code</th><th>Project</th><th>Partner</th><th>LOB</th><th>Pri</th><th>Month</th>
                <th>Stage</th><th>Status</th><th>Owner</th><th>Target</th><th>ETA</th><th>Sacrosanct</th>
                <th>Effort</th><th>Final</th><th>B2B/C</th><th>Product SPOC</th><th>Tech Lead</th><th>Ageing</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} onClick={() => onOpen(p.id)}>
                  <td className="mono" style={{ color: "var(--ink-mute)", fontSize: 11, fontWeight: 600 }}>{p.code}</td>
                  <td style={{ fontWeight: 600, maxWidth: 240, minWidth: 160 }}>{p.title}</td>
                  <td><span className="chip">{p.partner}</span></td>
                  <td style={{ color: "var(--ink-soft)", whiteSpace: "nowrap" }}>{p.lob}</td>
                  <td><PriorityChip p={p.priority} /></td>
                  <td className="mono" style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>{p.priorityMonth ?? "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{STAGE_BY_ID[p.stage].label}</td>
                  <td><StatusPill status={p.status} /></td>
                  <td><div style={{ display: "flex", alignItems: "center", gap: 7 }}><Avatar id={p.ownerId} size={22} /><span style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{personName(p.ownerId)}</span></div></td>
                  <td className="mono" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{fmtDate(p.targetGoLive)}</td>
                  <td className="mono" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{fmtDate(p.timelineEta)}</td>
                  <td style={{ fontSize: 12 }}><div style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}><span className="mono">{fmtDate(p.sacrosanctGoLive)}</span><OverdueTag project={p} /></div></td>
                  <td className="mono" style={{ fontSize: 12 }}>{p.devEffortDays != null ? `${p.devEffortDays}d` : "—"}</td>
                  <td className="mono" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{fmtDate(p.finalGoLive)}</td>
                  <td><span className="chip">{p.bifurcation}</span></td>
                  <td style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{personName(p.productSpocId) || "—"}</td>
                  <td style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{personName(p.techLeadId) || "—"}</td>
                  <td><AgingChip project={p} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
