import { useEffect, useState } from "react";
import { api } from "../api";
import { useT } from "../i18n";

interface LogRow {
  id: string;
  action: string;
  entity?: string;
  entityId?: string;
  ip?: string;
  createdAt: string;
  actor?: { name: string; role: string } | null;
  meta?: unknown;
}

export default function AuditLog() {
  const t = useT();
  const [logs, setLogs] = useState<LogRow[]>([]);

  useEffect(() => {
    api<{ logs: LogRow[] }>("/admin/audit-log").then((r) => setLogs(r.logs)).catch(console.error);
  }, []);

  return (
    <div className="panel">
      <div className="panel-head">{t("auditLog")}</div>
      <table>
        <thead>
          <tr>
            <th>{t("date")}</th>
            <th>{t("actor")}</th>
            <th>{t("action")}</th>
            <th>Entity</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td>{new Date(l.createdAt).toLocaleString()}</td>
              <td>
                {l.actor?.name ?? "—"}
                {l.actor && <span className="badge gray" style={{ marginInlineStart: 6 }}>{l.actor.role}</span>}
              </td>
              <td>
                <code>{l.action}</code>
              </td>
              <td>
                {l.entity} {l.entityId && <span style={{ color: "var(--muted)", fontSize: 12 }}>{l.entityId.slice(0, 10)}…</span>}
              </td>
              <td dir="ltr">{l.ip ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
