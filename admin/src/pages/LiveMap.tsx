import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MlMap, Marker } from "maplibre-gl";
import { io, type Socket } from "socket.io-client";
import { api, session } from "../api";
import { useT } from "../i18n";

interface LiveDriver {
  driverId: string;
  name?: string;
  vehicleType: "MOTO" | "TRUCK";
  lat: number;
  lng: number;
}

// Keyless OSM raster style; replace with a branded Mapbox/MapTiler style URL
// via VITE_MAP_STYLE_URL for the custom "Meshily" look in production.
const MAP_STYLE: maplibregl.StyleSpecification | string =
  (import.meta.env.VITE_MAP_STYLE_URL as string | undefined) ?? {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  };

const NOUAKCHOTT: [number, number] = [-15.9582, 18.0858];

function markerEl(vehicleType: "MOTO" | "TRUCK") {
  const el = document.createElement("div");
  el.textContent = vehicleType === "MOTO" ? "🛵" : "🚚";
  el.style.cssText =
    "font-size:22px;filter:drop-shadow(0 2px 3px rgb(0 0 0/.4));transition:transform .2s;cursor:pointer";
  return el;
}

export default function LiveMap() {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markersRef = useRef(new Map<string, Marker>());
  const [driverCount, setDriverCount] = useState(0);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: MAP_STYLE,
      center: NOUAKCHOTT,
      zoom: 12,
    });
    map.addControl(new maplibregl.NavigationControl());
    mapRef.current = map;

    const upsert = (d: LiveDriver) => {
      const existing = markersRef.current.get(d.driverId);
      if (existing) {
        // Smooth interpolation instead of jumping.
        existing.setLngLat([d.lng, d.lat]);
      } else {
        const m = new Marker({ element: markerEl(d.vehicleType) })
          .setLngLat([d.lng, d.lat])
          .setPopup(new maplibregl.Popup({ offset: 12 }).setText(d.name ?? d.driverId))
          .addTo(map);
        markersRef.current.set(d.driverId, m);
      }
      setDriverCount(markersRef.current.size);
    };

    // Initial snapshot, then live socket updates.
    api<{ drivers: (LiveDriver & { lat: number | null })[] }>("/admin/live")
      .then(({ drivers }) => drivers.forEach((d) => d.lat != null && upsert(d as LiveDriver)))
      .catch(console.error);

    let socket: Socket | null = null;
    if (session.access) {
      socket = io("/", { auth: { token: session.access } });
      socket.on("driver:location", upsert);
    }

    return () => {
      socket?.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      map.remove();
    };
  }, []);

  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <span className="badge green">
          {t("onlineDrivers")}: {driverCount}
        </span>
      </div>
      <div className="map-container" ref={containerRef} />
    </>
  );
}
