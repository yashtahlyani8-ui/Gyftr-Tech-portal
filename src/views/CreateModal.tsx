import { useState } from "react";
import { X } from "lucide-react";
import type { Priority } from "../types";
import { createProject } from "../store";
import { PEOPLE } from "../people";

export function CreateModal({ meId, onClose }: { meId: string; onClose: (createdId?: string) => void }) {
  const [title, setTitle] = useState("");
  const [brd, setBrd] = useState("");
  const [partner, setPartner] = useState("");
  const [lob, setLob] = useState("Channel Program");
  const [priority, setPriority] = useState<Priority>("P1");
  const [bifurcation, setBifurcation] = useState<"B2B" | "B2C">("B2C");
  const [target, setTarget] = useState("");
  const [priorityMonth, setPriorityMonth] = useState("");
  const [effort, setEffort] = useState("");
  const [productSpocId, setProductSpocId] = useState("");
  const [techLeadId, setTechLeadId] = useState("");

  const businessPeople = PEOPLE.filter((p) => p.team === "business" || p.team === "product");
  const productPeople = PEOPLE.filter((p) => p.team === "product" || p.team === "tech_spoc");
  const techPeople = PEOPLE.filter((p) => p.team === "development");
  // Default to whoever's actually logged in if they're eligible to be "raised by";
  // otherwise fall back to the first business/product person rather than a dead id.
  const [businessOwnerId, setBusinessOwnerId] = useState(
    () => (businessPeople.some((p) => p.id === meId) ? meId : businessPeople[0]?.id ?? meId)
  );
  const valid = title.trim() && partner.trim();

  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const p = await createProject({
        title: title.trim(), brd: brd.trim(), partner: partner.trim(), lob,
        priority, bifurcation, businessOwnerId, ownerId: businessOwnerId,
        stage: "intake", status: "business_clarification", blocked: false,
        targetGoLive: target || null, sacrosanctGoLive: null,
        priorityMonth: priorityMonth.trim() || null, timelineEta: null,
        devEffortDays: effort ? Number(effort) : null, reasonForDelay: null,
        productSpocId: productSpocId || null, techLeadId: techLeadId || null,
      });
      onClose(p.id);
    } catch (err) {
      setSaving(false);
      alert(err instanceof Error ? err.message : "Failed to create project.");
    }
  }

  return (
    <div className="modal-wrap" onClick={() => onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", padding: "18px 20px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16 }}>New project</h2>
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>Business raises the requirement — it enters at Intake.</div>
          </div>
          <button className="icon-btn" style={{ marginLeft: "auto", width: 32, height: 32 }} onClick={() => onClose()}><X size={16} /></button>
        </div>
        <div style={{ padding: 20 }}>
          <div className="field">
            <label>Title *</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Addition of Bill Payments to Godrej catalogue" autoFocus />
          </div>
          <div className="field">
            <label>Requirement / BRD</label>
            <textarea className="input" value={brd} onChange={(e) => setBrd(e.target.value)} placeholder="What does the business need and why?" />
          </div>
          <div className="row">
            <div className="field">
              <label>Partner / Brand *</label>
              <input className="input" value={partner} onChange={(e) => setPartner(e.target.value)} placeholder="Godrej" />
            </div>
            <div className="field">
              <label>Line of Business</label>
              <select className="select" value={lob} onChange={(e) => setLob(e.target.value)}>
                {["Channel Program", "Banking", "LLC", "Aggregators", "Other"].map((x) => <option key={x}>{x}</option>)}
              </select>
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Priority</label>
              <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                <option value="P0">P0</option><option value="P1">P1</option><option value="P2">P2</option>
              </select>
            </div>
            <div className="field">
              <label>Bifurcation</label>
              <select className="select" value={bifurcation} onChange={(e) => setBifurcation(e.target.value as any)}>
                <option value="B2C">B2C</option><option value="B2B">B2B</option>
              </select>
            </div>
            <div className="field">
              <label>Target go-live</label>
              <input className="input" type="date" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Priority month</label>
              <input className="input" value={priorityMonth} onChange={(e) => setPriorityMonth(e.target.value)} placeholder="e.g. Aug'26" />
            </div>
            <div className="field">
              <label>Est. dev effort (days)</label>
              <input className="input" type="number" min="0" value={effort} onChange={(e) => setEffort(e.target.value)} placeholder="10" />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Product SPOC</label>
              <select className="select" value={productSpocId} onChange={(e) => setProductSpocId(e.target.value)}>
                <option value="">—</option>
                {productPeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Tech lead</label>
              <select className="select" value={techLeadId} onChange={(e) => setTechLeadId(e.target.value)}>
                <option value="">—</option>
                {techPeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Raised by</label>
            <select className="select" value={businessOwnerId} onChange={(e) => setBusinessOwnerId(e.target.value)}>
              {businessPeople.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.team}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button className="btn" onClick={() => onClose()}>Cancel</button>
            <button className="btn primary" disabled={!valid || saving} style={{ opacity: valid && !saving ? 1 : .5 }} onClick={submit}>{saving ? "Creating…" : "Create project"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
