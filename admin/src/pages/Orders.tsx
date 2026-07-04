import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useT } from "../i18n";

interface OrderRow {
  id: string;
  code: string;
  status: string;
  vehicleType: "MOTO" | "TRUCK";
  pickupAddress: string;
  dropoffAddress: string;
  price: number;
  paymentMethod: string;
  createdAt: string;
  customer: { name: string; phone: string };
  driver?: { name: string; phone: string } | null;
}

const STATUS_BADGE: Record<string, string> = {
  PENDING: "orange",
  ACCEPTED: "blue",
  ARRIVED_PICKUP: "blue",
  PICKED_UP: "blue",
  IN_TRANSIT: "blue",
  DELIVERED: "green",
  CANCELLED: "red",
};

const STATUSES = ["", "PENDING", "ACCEPTED", "PICKED_UP", "IN_TRANSIT", "DELIVERED", "CANCELLED"];

export default function Orders() {
  const t = useT();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [status, setStatus] = useState("");

  const load = useCallback(() => {
    api<{ orders: OrderRow[] }>(`/admin/orders${status ? `?status=${status}` : ""}`)
      .then((r) => setOrders(r.orders))
      .catch(console.error);
  }, [status]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000); // refresh the operations view
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="panel">
      <div className="panel-head">
        {t("orders")}
        <select style={{ width: 190 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s || t("all")}
            </option>
          ))}
        </select>
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>{t("customer")}</th>
            <th>{t("driver")}</th>
            <th>{t("from")}</th>
            <th>{t("to")}</th>
            <th>{t("vehicle")}</th>
            <th>{t("price")}</th>
            <th>{t("status")}</th>
            <th>{t("actions")}</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                {o.code}
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{new Date(o.createdAt).toLocaleString()}</div>
              </td>
              <td>{o.customer.name}</td>
              <td>{o.driver?.name ?? "—"}</td>
              <td>{o.pickupAddress}</td>
              <td>{o.dropoffAddress}</td>
              <td>{o.vehicleType === "MOTO" ? "🛵" : "🚚"}</td>
              <td>
                {o.price} MRU
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{o.paymentMethod}</div>
              </td>
              <td>
                <span className={`badge ${STATUS_BADGE[o.status] ?? "gray"}`}>{o.status}</span>
              </td>
              <td>
                {["PENDING", "ACCEPTED", "ARRIVED_PICKUP"].includes(o.status) && (
                  <button
                    className="btn danger sm"
                    onClick={async () => {
                      await api(`/orders/${o.id}/cancel`, { method: "POST", body: { reason: "Cancelled by admin" } });
                      load();
                    }}
                  >
                    {t("cancel")}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
