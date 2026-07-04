import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useT } from "../i18n";

interface Wd {
  id: string;
  amount: number;
  method: string;
  accountNumber: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "PAID";
  createdAt: string;
  driver: { name: string; phone: string; walletBalance: number };
}

const badge: Record<string, string> = { PENDING: "orange", APPROVED: "blue", REJECTED: "red", PAID: "green" };

export default function Withdrawals() {
  const t = useT();
  const [rows, setRows] = useState<Wd[]>([]);

  const load = useCallback(() => {
    api<{ withdrawals: Wd[] }>("/admin/withdrawals").then((r) => setRows(r.withdrawals)).catch(console.error);
  }, []);
  useEffect(load, [load]);

  async function decide(id: string, decision: string) {
    await api(`/admin/withdrawals/${id}/decide`, { method: "POST", body: { decision } });
    load();
  }

  return (
    <div className="panel">
      <div className="panel-head">{t("withdrawals")}</div>
      <table>
        <thead>
          <tr>
            <th>{t("driver")}</th>
            <th>{t("amount")}</th>
            <th>{t("walletBalance")}</th>
            <th>{t("method")}</th>
            <th>{t("account")}</th>
            <th>{t("date")}</th>
            <th>{t("status")}</th>
            <th>{t("actions")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => (
            <tr key={w.id}>
              <td>
                {w.driver.name}
                <div style={{ fontSize: 11, color: "var(--muted)" }} dir="ltr">
                  {w.driver.phone}
                </div>
              </td>
              <td style={{ fontWeight: 700 }}>{w.amount} MRU</td>
              <td>{w.driver.walletBalance} MRU</td>
              <td>{w.method}</td>
              <td dir="ltr">{w.accountNumber}</td>
              <td>{new Date(w.createdAt).toLocaleDateString()}</td>
              <td>
                <span className={`badge ${badge[w.status]}`}>{w.status}</span>
              </td>
              <td>
                {(w.status === "PENDING" || w.status === "APPROVED") && (
                  <div className="row-actions">
                    <button className="btn success sm" onClick={() => decide(w.id, "PAID")}>
                      {t("markPaid")}
                    </button>
                    {w.status === "PENDING" && (
                      <>
                        <button className="btn sm" onClick={() => decide(w.id, "APPROVED")}>
                          {t("approve")}
                        </button>
                        <button className="btn danger sm" onClick={() => decide(w.id, "REJECTED")}>
                          {t("reject")}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
