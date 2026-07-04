// Geospatial helpers for Nouakchott operations.

const EARTH_RADIUS_KM = 6371;

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

// Urban roads are not straight lines: apply a route factor so distance-based
// pricing and ETA stay realistic without paying for a routing API call on
// every quote. The mobile apps draw the real route via Mapbox Directions.
const ROUTE_FACTOR = 1.35;

export function estimateRouteKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversineKm(lat1, lng1, lat2, lng2) * ROUTE_FACTOR;
}

// Average speed assumptions for Nouakchott traffic (km/h).
const AVG_SPEED = { MOTO: 28, TRUCK: 22 } as const;

export function estimateDurationMin(distanceKm: number, vehicleType: "MOTO" | "TRUCK"): number {
  return (distanceKm / AVG_SPEED[vehicleType]) * 60;
}

export function etaMinutes(fromLat: number, fromLng: number, toLat: number, toLng: number, vehicleType: "MOTO" | "TRUCK"): number {
  return Math.max(1, Math.round(estimateDurationMin(estimateRouteKm(fromLat, fromLng, toLat, toLng), vehicleType)));
}
