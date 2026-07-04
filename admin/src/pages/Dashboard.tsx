import { useEffect, useState } from "react";
import { api } from "../api";
import { useT } from "../i18n";

interface Stats {
  customers: number;
  drivers: number;
  pendingDrivers: number;
  ordersToday: number;
  ordersMonth: number;
  activeOrders: number;
  revenueMonth: number;
  commissionMonth: number;
  pendingWithdrawals: number;
  topAreas: { address: string; count: number }[];
}

export default function Dashboard() {
  const t = useT();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api<Stats>("/admin/stats").then(setStats).catch(console.error);
  }, []);

  if (!stats) {
    return (
      <div className="cards">
        {Array.from({ length: 8 }).map((_, i) => (
          <div className="card" key={i}>
            <div className="skeleton" style={{ width: "60%" }} />
            <div className="skeleton" style={{ width: "40%", marginTop: 12, height: 28 }} />
          </div>
        ))}
      </div>
    );
  }

  const cards: [string, number, boolean?][] = [
    [t("ordersToday"), stats.ordersToday, true],
    [t("activeOrders"), stats.activeOrders, true],
    [t("revenueMonth"), stats.revenueMonth],
    [t("commissionMonth"), stats.commissionMonth],
    [t("customersCount"), stats.customers],
    [t("driversCount"), stats.drivers],
    [t("pendingDrivers"), stats.pendingDrivers],
    [t("pendingWithdrawals"), stats.pendingWithdrawals],
  ];

  return (
    <>
      <div className="cards">
        {cards.map(([label, value, accent]) => (
          <div className={`card${accent ? " accent" : ""}`} key={label}>
            <div className="label">{label}</div>
            <div className="value">{value.toLocaleString()}</div>
          </div>
        ))}
      </div>
      <div className="panel">
        <div className="panel-head">{t("topAreas")}</div>
        <table>
          <tbody>
            {stats.topAreas.map((a) => (
              <tr key={a.address}>
                <td>{a.address}</td>
                <td style={{ width: 120, fontWeight: 700 }}>{a.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
