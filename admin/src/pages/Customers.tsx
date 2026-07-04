import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useT } from "../i18n";

interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  email?: string;
  status: string;
  walletBalance: number;
  createdAt: string;
  _count: { customerOrders: number };
}

export default function Customers() {
  const t = useT();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    api<{ customers: CustomerRow[] }>(`/admin/customers?q=${encodeURIComponent(q)}`)
      .then((r) => setCustomers(r.customers))
      .catch(console.error);
  }, [q]);

  useEffect(() => {
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
  }, [load]);

  return (
    <div className="panel">
      <div className="panel-head">
        {t("customers")}
        <input style={{ width: 240 }} placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <table>
        <thead>
          <tr>
            <th>{t("name")}</th>
            <th>{t("phone")}</th>
            <th>{t("ordersCount")}</th>
            <th>{t("walletBalance")}</th>
            <th>{t("status")}</th>
            <th>{t("actions")}</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td dir="ltr">{c.phone}</td>
              <td>{c._count.customerOrders}</td>
              <td>{c.walletBalance} MRU</td>
              <td>
                <span className={`badge ${c.status === "ACTIVE" ? "green" : c.status === "BLOCKED" ? "red" : "gray"}`}>
                  {c.status}
                </span>
              </td>
              <td>
                <button
                  className={`btn sm ${c.status === "BLOCKED" ? "secondary" : "danger"}`}
                  onClick={async () => {
                    await api(`/admin/users/${c.id}/block`, {
                      method: "POST",
                      body: { blocked: c.status !== "BLOCKED" },
                    });
                    load();
                  }}
                >
                  {c.status === "BLOCKED" ? t("unblock") : t("block")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
