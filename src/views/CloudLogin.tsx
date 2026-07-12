import { useState } from "react";
import { ChevronRight, ShieldAlert, Loader2 } from "lucide-react";
import { GyftrLogo } from "../GyftrLogo";
import { PEOPLE as SEED_PEOPLE } from "../seed";
import { TEAMS } from "../workflow";
import { initials, colorFor } from "../lib";
import { switchProfile, signOutCloud } from "../auth";

/** Name-keyed avatar, not id-keyed — the live people directory isn't loaded
   yet at this point (it only loads post-auth), so PEOPLE_BY_ID is empty. */
function NameAvatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <div className="avatar" title={name} style={{ width: size, height: size, fontSize: size * 0.4, background: colorFor(name) }}>
      {initials(name)}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="login">
      <div className="login-card">
        <GyftrLogo h={30} />
        <div style={{ fontFamily: "var(--font-d)", fontSize: 17, fontWeight: 700, marginTop: 12, letterSpacing: "-.02em" }}>Tech Project Portal</div>
        {children}
      </div>
    </div>
  );
}

export function CloudLoginLoading() {
  return (
    <Shell>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 22, color: "var(--ink-mute)", fontSize: 13 }}>
        <Loader2 size={16} className="spin" /> Checking your session…
      </div>
    </Shell>
  );
}

export function CloudNoAccess({ email }: { email: string }) {
  return (
    <Shell>
      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
        <ShieldAlert size={30} color="var(--rose-fg)" />
        <div style={{ fontSize: 13.5, fontWeight: 650 }}>No portal access for {email}</div>
        <p style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: 0 }}>
          This account isn't provisioned in the org directory yet.
        </p>
        <button className="btn sm" onClick={() => signOutCloud()}>Back</button>
      </div>
    </Shell>
  );
}

/** Demo profile picker — real Supabase session under the hood (one shared
   demo password), so switching "who I am" is a single click. */
export function CloudLogin() {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (email: string) => {
    setError(null);
    setPending(email);
    const res = await switchProfile(email);
    setPending(null);
    if (!res.ok) setError(res.error ?? "Sign-in failed.");
  };

  return (
    <Shell>
      <p style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: "3px 0 18px" }}>
        Project flow · one source of truth. Pick who you are — every action is logged against you.
      </p>
      {SEED_PEOPLE.map((p) => (
        <button key={p.id} className="user-pick" disabled={!!pending} onClick={() => pick(p.email)}>
          <NameAvatar name={p.name} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 650, fontSize: 13 }}>{p.name}</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-mute)" }}>{TEAMS[p.team].label} · {p.role}</div>
          </div>
          {pending === p.email ? <Loader2 size={16} className="spin" color="var(--ink-mute)" /> : <ChevronRight size={16} color="var(--ink-mute)" />}
        </button>
      ))}
      {error && <div style={{ fontSize: 12, color: "var(--rose-fg)", marginTop: 10 }}>{error}</div>}
    </Shell>
  );
}
