import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, session, type AdminUser } from "../api";
import { useT } from "../i18n";

interface LoginResponse {
  user?: AdminUser;
  accessToken?: string;
  refreshToken?: string;
  requiresTotp?: boolean;
}

// Standard login form — identical for every user. The admin dashboard opens
// only when the DATABASE says the account's role is ADMIN / SUPER_ADMIN
// (no hardcoded credentials anywhere). Accounts with 2FA get a TOTP step.
export default function Login() {
  const t = useT();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password, ...(totp ? { totp } : {}) }),
      });
      const data = (await r.json()) as LoginResponse & { error?: string };
      if (!r.ok) throw new ApiError(r.status, data.error ?? t("loginError"));
      if (data.requiresTotp) {
        setNeedsTotp(true);
        return;
      }
      const user = data.user!;
      if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
        setError(t("notAdmin"));
        return;
      }
      session.save(user, data.accessToken!, data.refreshToken!);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loginError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>
          Meshily<span className="dot">•</span>
        </h1>
        <div className="sub">{t("appName")} — {t("login")}</div>
        <div className="field">
          <label>{t("identifier")}</label>
          <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label>{t("password")}</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {needsTotp && (
          <div className="field">
            <label>{t("totpCode")}</label>
            <input value={totp} onChange={(e) => setTotp(e.target.value)} maxLength={6} inputMode="numeric" required />
          </div>
        )}
        {error && <div className="error">{error}</div>}
        <button className="btn" style={{ width: "100%", padding: "11px" }} disabled={busy}>
          {t("signIn")}
        </button>
      </form>
    </div>
  );
}
