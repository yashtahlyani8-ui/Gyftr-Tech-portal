import { useState } from "react";
import { LogIn, ShieldAlert, Loader2 } from "lucide-react";
import { GyftrLogo } from "../GyftrLogo";
import { signInWithPassword, signOutCloud } from "../auth";

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
          You're signed in, but this email isn't provisioned in the org directory yet.
          Ask PMO to add you to <code>people</code>.
        </p>
        <button className="btn sm" onClick={() => signOutCloud()}>Sign out</button>
      </div>
    </Shell>
  );
}

export function CloudLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password || busy) return;
    setError(null);
    setBusy(true);
    const res = await signInWithPassword(email, password);
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Something went wrong.");
  };

  return (
    <Shell>
      <p style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: "3px 0 18px" }}>
        Project flow · one source of truth. Sign in with your Gyftr account.
      </p>
      <div className="field">
        <label>Work email</label>
        <input
          className="input" type="email" placeholder="you@gyftr.net" value={email} autoFocus
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
      </div>
      <div className="field">
        <label>Password</label>
        <input
          className="input" type="password" placeholder="••••••••" value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
      </div>
      {error && <div style={{ fontSize: 12, color: "var(--rose-fg)", marginBottom: 10 }}>{error}</div>}
      <button className="btn primary" style={{ width: "100%", justifyContent: "center" }} disabled={!email.trim() || !password || busy} onClick={submit}>
        {busy ? <Loader2 size={14} className="spin" /> : <LogIn size={14} />} Sign in
      </button>
      <p style={{ fontSize: 11, color: "var(--ink-mute)", marginTop: 14, textAlign: "center" }}>
        Forgot your password? Ask PMO to reset it.
      </p>
    </Shell>
  );
}
