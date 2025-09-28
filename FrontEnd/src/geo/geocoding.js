// src/geo/geocoding.js
export const STATE_CENTROIDS = {
  AL: [-86.9023, 32.3182], AK: [-152.4044, 64.2008], AZ: [-111.0937, 34.0489],
  AR: [-92.3731, 35.201], CA: [-119.4179, 36.7783], CO: [-105.7821, 39.5501],
  CT: [-72.6978, 41.6032], DE: [-75.5277, 38.9108], FL: [-81.5158, 27.6648],
  GA: [-82.9001, 32.1656], HI: [-155.5828, 19.8968], IA: [-93.0977, 41.878],
  ID: [-114.742, 44.0682], IL: [-89.3985, 40.6331], IN: [-86.1349, 40.2672],
  KS: [-98.4842, 39.0119], KY: [-84.27, 37.8393], LA: [-91.9623, 30.9843],
  MA: [-71.3824, 42.4072], MD: [-76.6413, 39.0458], ME: [-69.4455, 45.2538],
  MI: [-85.6024, 44.3148], MN: [-94.6859, 46.7296], MO: [-91.8318, 37.9643],
  MS: [-89.3985, 32.3547], MT: [-110.3626, 46.8797], NC: [-79.0193, 35.7596],
  ND: [-101.002, 47.5515], NE: [-99.9018, 41.4925], NH: [-71.5724, 43.1939],
  NJ: [-74.4057, 40.0583], NM: [-105.8701, 34.5199], NV: [-116.4194, 38.8026],
  NY: [-75, 43], OH: [-82.9071, 40.4173], OK: [-97.0929, 35.0078],
  OR: [-120.5542, 43.8041], PA: [-77.1945, 41.2033], RI: [-71.4774, 41.5801],
  SC: [-81.1637, 33.8361], SD: [-99.9018, 43.9695], TN: [-86.5804, 35.5175],
  TX: [-99.9018, 31.9686], UT: [-111.0937, 39.321], VA: [-78.6569, 37.4316],
  VT: [-72.5778, 44.5588], WA: [-120.7401, 47.7511], WI: [-89.6165, 43.7844],
  WV: [-80.4549, 38.5976], WY: [-107.2903, 43.0759], DC: [-77.0369, 38.9072],
};

export const CITY_CENTROIDS = {
  "New York, NY": [-74.006, 40.7128], "Los Angeles, CA": [-118.2437, 34.0522],
  "Chicago, IL": [-87.6298, 41.8781], "Houston, TX": [-95.3698, 29.7604],
  "Phoenix, AZ": [-112.074, 33.4484], "Philadelphia, PA": [-75.1652, 39.9526],
  "San Antonio, TX": [-98.4936, 29.4241], "San Diego, CA": [-117.1611, 32.7157],
  "Dallas, TX": [-96.797, 32.7767], "San Jose, CA": [-121.8863, 37.3382],
  "Austin, TX": [-97.7431, 30.2672], "San Francisco, CA": [-122.4194, 37.7749],
  "Seattle, WA": [-122.3321, 47.6062], "Boston, MA": [-71.0589, 42.3601],
  "Miami, FL": [-80.1918, 25.7617], "Denver, CO": [-104.9903, 39.7392],
  "Cleveland, OH": [-81.6944, 41.4993],
};

export function parseCityState(s) {
  if (!s || typeof s !== "string") return { city: null, state: null, key: null };
  const parts = s.split(",").map((x) => x.trim());
  if (parts.length >= 2) {
    const city = parts[0];
    const state = parts[1].slice(0, 2).toUpperCase();
    return { city, state, key: `${city}, ${state}` };
  }
  return { city: null, state: null, key: null };
}

export function hashToUnit(seed) {
  const str = String(seed ?? "");
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}

export function coordsForRow(row) {
  if (row.lat != null && (row.lon != null || row.long != null)) {
    const lon = row.lon ?? row.long;
    if (!Number.isNaN(row.lat) && !Number.isNaN(lon)) return [Number(lon), Number(row.lat)];
  }
  const { city, state, key } = parseCityState(row.location);
  if (key && CITY_CENTROIDS[key]) return CITY_CENTROIDS[key];
  const base = state && STATE_CENTROIDS[state] ? STATE_CENTROIDS[state] : [-98.5795, 39.8283];
  const seed = row.job_id || row.zip_code || `${city || ""}${state || ""}`;
  const r1 = hashToUnit(seed), r2 = hashToUnit(String(seed) + "x");
  const dx = (r1 - 0.5) * 1.2, dy = (r2 - 0.5) * 0.8;
  return [base[0] + dx, base[1] + dy];
}
