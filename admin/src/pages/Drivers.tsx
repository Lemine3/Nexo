import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useT } from "../i18n";

interface DriverRow {
  userId: string;
  vehicleType: "MOTO" | "TRUCK";
  plateNumber: string;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  online: boolean;
  ratingAvg: number;
  ratingCount: number;
  licenseImageUrl?: string;
  idCardImageUrl?: string;
  vehicleImageUrl?: string;
  user: { id: string; name: string; phone: string; status: string };
}

const badge: Record<string, string> = { PENDING: "orange", APPROVED: "green", REJECTED: "red" };

export default function Drivers() {
  const t = useT();
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [filter, setFilter] = useState("");

  const load = useCallback(() => {
    api<{ drivers: DriverRow[] }>(`/admin/drivers${filter ? `?approval=${filter}` : ""}`)
      .then((r) => setDrivers(r.drivers))
      .catch(console.error);
  }, [filter]);

  useEffect(load, [load]);

  async function act(path: string, body?: unknown) {
    await api(path, { method: "POST", body });
    load();
  }

  return (
    <div className="panel">
      <div className="panel-head">
        {t("drivers")}
        <select style={{ width: 180 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">{t("all")}</option>
          <option value="PENDING">{t("pending")}</option>
          <option value="APPROVED">{t("approved")}</option>
          <option value="REJECTED">{t("rejected")}</option>
        </select>
      </div>
      <table>
        <thead>
          <tr>
            <th>{t("name")}</th>
            <th>{t("phone")}</th>
            <th>{t("vehicle")}</th>
            <th>{t("plate")}</th>
            <th>{t("rating")}</th>
            <th>{t("status")}</th>
            <th>{t("docs")}</th>
            <th>{t("actions")}</th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((d) => (
            <tr key={d.userId}>
              <td>
                {d.user.name} {d.online && <span className="badge green">●</span>}
              </td>
              <td dir="ltr">{d.user.phone}</td>
              <td>{d.vehicleType === "MOTO" ? t("moto") : t("truck")}</td>
              <td>{d.plateNumber}</td>
              <td>
                ⭐ {d.ratingAvg} ({d.ratingCount})
              </td>
              <td>
                <span className={`badge ${badge[d.approvalStatus]}`}>{d.approvalStatus}</span>
              </td>
              <td>
                {[d.licenseImageUrl, d.idCardImageUrl, d.vehicleImageUrl].filter(Boolean).map((u, i) => (
                  <a key={i} href={u} target="_blank" rel="noreferrer" style={{ marginInlineEnd: 6 }}>
                    📄
                  </a>
                ))}
              </td>
              <td>
                <div className="row-actions">
                  {d.approvalStatus !== "APPROVED" && (
                    <button className="btn success sm" onClick={() => act(`/admin/drivers/${d.userId}/approve`)}>
                      {t("approve")}
                    </button>
                  )}
                  {d.approvalStatus === "PENDING" && (
                    <button
                      className="btn danger sm"
                      onClick={() => {
                        const reason = prompt(t("rejectReason"));
                        if (reason) act(`/admin/drivers/${d.userId}/reject`, { reason });
                      }}
                    >
                      {t("reject")}
                    </button>
                  )}
                  {d.user.status !== "BLOCKED" ? (
                    <button className="btn secondary sm" onClick={() => act(`/admin/drivers/${d.userId}/disable`)}>
                      {t("disable")}
                    </button>
                  ) : (
                    <button className="btn secondary sm" onClick={() => act(`/admin/users/${d.userId}/block`, { blocked: false })}>
                      {t("unblock")}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
