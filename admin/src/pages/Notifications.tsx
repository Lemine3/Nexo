import { FormEvent, useState } from "react";
import { api } from "../api";
import { useT } from "../i18n";

export default function Notifications() {
  const t = useT();
  const [audience, setAudience] = useState("ALL");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isPromo, setIsPromo] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    await api("/admin/notifications/broadcast", {
      method: "POST",
      body: { audience, title, body, isPromo },
    });
    setDone(true);
    setTitle("");
    setBody("");
    setTimeout(() => setDone(false), 2000);
  }

  return (
    <div className="panel" style={{ maxWidth: 640 }}>
      <div className="panel-head">{t("notifications")}</div>
      <form className="panel-body" onSubmit={submit}>
        <div className="field">
          <label>{t("audience")}</label>
          <select value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option value="ALL">{t("everyone")}</option>
            <option value="CUSTOMERS">{t("customersOnly")}</option>
            <option value="DRIVERS">{t("driversOnly")}</option>
          </select>
        </div>
        <div className="field">
          <label>{t("titleField")}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
        </div>
        <div className="field">
          <label>{t("bodyField")}</label>
          <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} required maxLength={500} />
        </div>
        <div className="field">
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" style={{ width: "auto" }} checked={isPromo} onChange={(e) => setIsPromo(e.target.checked)} />
            {t("promo")}
          </label>
        </div>
        <button className="btn">{done ? t("sent") : t("send")}</button>
      </form>
    </div>
  );
}
