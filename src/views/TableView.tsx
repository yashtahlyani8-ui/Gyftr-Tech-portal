import { useMemo } from "react";
import { SearchX } from "lucide-react";
import type { Project } from "../types";
import { STAGE_BY_ID, PRIORITY_META } from "../workflow";
import { fmtDate } from "../lib";
import { PEOPLE_BY_ID } from "../people";
import { Avatar, StatusPill, PriorityChip, AgingChip, OverdueTag } from "../ui";

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
    <div className="tablewrap fade">
      <div style={{ overflow: "auto", maxHeight: "calc(100vh - 210px)" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Code</th><th>Project</th><th>Partner</th><th>LOB</th><th>Pri</th>
              <th>Stage</th><th>Status</th><th>Owner</th><th>Ageing</th><th>Sacrosanct</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} onClick={() => onOpen(p.id)}>
                <td className="mono" style={{ color: "var(--ink-mute)", fontSize: 11, fontWeight: 600 }}>{p.code}</td>
                <td style={{ fontWeight: 600, maxWidth: 280 }}>{p.title}</td>
                <td><span className="chip">{p.partner}</span></td>
                <td style={{ color: "var(--ink-soft)" }}>{p.lob}</td>
                <td><PriorityChip p={p.priority} /></td>
                <td>{STAGE_BY_ID[p.stage].label}</td>
                <td><StatusPill status={p.status} /></td>
                <td><div style={{ display: "flex", alignItems: "center", gap: 7 }}><Avatar id={p.ownerId} size={22} /><span style={{ fontSize: 12.5 }}>{PEOPLE_BY_ID[p.ownerId]?.name}</span></div></td>
                <td><AgingChip project={p} /></td>
                <td style={{ fontSize: 12 }}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><span className="mono">{fmtDate(p.sacrosanctGoLive)}</span><OverdueTag project={p} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
