import { normalizeLocationPoint } from "./model.js";

// Local WGS84 -> GCJ-02 fallback when AMap's converter cannot answer.
// It is approximate; the user can always correct their start by clicking the map.
export function gpsToAmapPoint(raw) {
  const point = normalizeLocationPoint(raw);
  if (!point) return null;
  const { lng, lat } = point;
  if (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271) return point;

  const pi = Math.PI;
  const a = 6378245;
  const eccentricity = 0.006693421622965943;
  const x = lng - 105, y = lat - 35;
  let deltaLat = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  deltaLat += (20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2 / 3;
  deltaLat += (20 * Math.sin(y * pi) + 40 * Math.sin(y / 3 * pi)) * 2 / 3;
  deltaLat += (160 * Math.sin(y / 12 * pi) + 320 * Math.sin(y * pi / 30)) * 2 / 3;
  let deltaLng = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  deltaLng += (20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2 / 3;
  deltaLng += (20 * Math.sin(x * pi) + 40 * Math.sin(x / 3 * pi)) * 2 / 3;
  deltaLng += (150 * Math.sin(x / 12 * pi) + 300 * Math.sin(x / 30 * pi)) * 2 / 3;
  const radLat = lat / 180 * pi;
  const magic = 1 - eccentricity * Math.sin(radLat) ** 2;
  const root = Math.sqrt(magic);
  deltaLat = deltaLat * 180 / ((a * (1 - eccentricity)) / (magic * root) * pi);
  deltaLng = deltaLng * 180 / (a / root * Math.cos(radLat) * pi);
  return normalizeLocationPoint({ lng: lng + deltaLng, lat: lat + deltaLat });
}
