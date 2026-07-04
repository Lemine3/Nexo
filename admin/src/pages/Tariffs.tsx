import { useEffect, useState } from "react";
import { api } from "../api";
import { useT } from "../i18n";

interface Tariff {
  id: string;
  vehicleType: "MOTO" | "TRUCK";
  name: string;
  baseFare: number;
  perKm: number;
  minFare: number;
  commissionPct: number;
  active: boolean;
}

export default function Tariffs() {
  const t = useT();
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [saved, setSaved] = useState<string | null>(null);

  const load = () =>
    api<{ tariffs: Tariff[] }>("/admin/tariffs").then((r) => setTariffs(r.tariffs)).catch(console.error);
  useEffect(() => {
    load();
  }, []);

  function update(id: string, patch: Partial<Tariff>) {
    setTariffs((ts) => ts.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  async function save(tf: Tariff) {
    await api(`/admin/tariffs/${tf.id}`, {
      method: "PUT",
      body: {
        name: tf.name,
        baseFare: Number(tf.baseFare),
        perKm: Number(tf.perKm),
        minFare: Number(tf.minFare),
        commissionPct: Number(tf.commissionPct),
        active: tf.active,
      },
    });
    setSaved(tf.id);
    setTimeout(() => setSaved(null), 1500);
  }

  return (
    <>
      {tariffs.map((tf) => (
        <div className="panel" key={tf.id}>
          <div className="panel-head">
            {tf.vehicleType === "MOTO" ? `🛵 ${t("moto")}` : `🚚 ${t("truck")}`} — {tf.name}
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400, fontSize: 14 }}>
              <input
                type="checkbox"
                style={{ width: "auto" }}
                checked={tf.active}
                onChange={(e) => update(tf.id, { active: e.target.checked })}
              />
              active
            </label>
          </div>
          <div className="panel-body">
            <div className="form-grid">
              {(
                [
                  ["baseFare", t("baseFare")],
                  ["perKm", t("perKm")],
                  ["minFare", t("minFare")],
                  ["commissionPct", t("commissionPct")],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label style={{ fontSize: 13, color: "var(--muted)" }}>{label}</label>
                  <input
                    type="number"
                    value={tf[key]}
                    onChange={(e) => update(tf.id, { [key]: Number(e.target.value) } as Partial<Tariff>)}
                  />
                </div>
              ))}
              <button className="btn" onClick={() => save(tf)}>
                {saved === tf.id ? "✔" : t("save")}
              </button>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
