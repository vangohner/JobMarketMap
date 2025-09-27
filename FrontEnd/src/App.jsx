import React, { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import Supercluster from "supercluster";
import Papa from "papaparse";

/**
 * Us Job Map — CSV-Driven (OSM Tiles + HTML Cluster Labels)
 * ---------------------------------------------------------------------------
 * Requirements satisfied:
 *  - Load job data from a CSV file with the given columns
 *  - Keep clustering via Supercluster
 *  - Render cluster labels using HTML <div> markers (NOT map glyph text)
 *  - Click cluster → popup with stats & most popular titles + Zoom button
 *  - Click job → popup with details
 *  - Plain JavaScript (no TypeScript)
 *
 * CSV columns expected (headers must match):
 * ['job_id','company_name','title','description','location','formatted_work_type',
 *  'original_listed_time','remote_allowed','formatted_experience_level',
 *  'skills_desc','normalized_salary','zip_code']
 *
 * Coordinate derivation strategy (no external geocoding calls):
 *  - If the CSV includes columns `lat` and `lon` (optional), use them.
 *  - Else, parse `location` into City, ST. If city centroid known (limited table), use it.
 *  - Else, fall back to state centroid + deterministic jitter based on job_id/zip to spread points.
 *    This preserves spatial clustering patterns without network calls.
 */

// ----------------------- OSM Raster Style (no API key) ----------------------
const OSM_RASTER_STYLE = {
  version: 8,
  name: "OSM Raster",
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#eef2f7" } },
    { id: "osm", type: "raster", source: "osm" },
  ],
};

// --------------------------- Simple geocoding helpers -----------------------
const STATE_CENTROIDS = {
  AL: [-86.9023, 32.3182], AK: [-152.4044, 64.2008], AZ: [-111.0937, 34.0489],
  AR: [-92.3731, 35.2010], CA: [-119.4179, 36.7783], CO: [-105.7821, 39.5501],
  CT: [-72.6978, 41.6032], DE: [-75.5277, 38.9108], FL: [-81.5158, 27.6648],
  GA: [-82.9001, 32.1656], HI: [-155.5828, 19.8968], IA: [-93.0977, 41.8780],
  ID: [-114.7420, 44.0682], IL: [-89.3985, 40.6331], IN: [-86.1349, 40.2672],
  KS: [-98.4842, 39.0119], KY: [-84.2700, 37.8393], LA: [-91.9623, 30.9843],
  MA: [-71.3824, 42.4072], MD: [-76.6413, 39.0458], ME: [-69.4455, 45.2538],
  MI: [-85.6024, 44.3148], MN: [-94.6859, 46.7296], MO: [-91.8318, 37.9643],
  MS: [-89.3985, 32.3547], MT: [-110.3626, 46.8797], NC: [-79.0193, 35.7596],
  ND: [-101.0020, 47.5515], NE: [-99.9018, 41.4925], NH: [-71.5724, 43.1939],
  NJ: [-74.4057, 40.0583], NM: [-105.8701, 34.5199], NV: [-116.4194, 38.8026],
  NY: [-75.0000, 43.0000], OH: [-82.9071, 40.4173], OK: [-97.0929, 35.0078],
  OR: [-120.5542, 43.8041], PA: [-77.1945, 41.2033], RI: [-71.4774, 41.5801],
  SC: [-81.1637, 33.8361], SD: [-99.9018, 43.9695], TN: [-86.5804, 35.5175],
  TX: [-99.9018, 31.9686], UT: [-111.0937, 39.3210], VA: [-78.6569, 37.4316],
  VT: [-72.5778, 44.5588], WA: [-120.7401, 47.7511], WI: [-89.6165, 43.7844],
  WV: [-80.4549, 38.5976], WY: [-107.2903, 43.0759], DC: [-77.0369, 38.9072],
};

// A few major city centroids to improve placement when available
const CITY_CENTROIDS = {
  "New York, NY": [-74.006, 40.7128], "Los Angeles, CA": [-118.2437, 34.0522],
  "Chicago, IL": [-87.6298, 41.8781], "Houston, TX": [-95.3698, 29.7604],
  "Phoenix, AZ": [-112.0740, 33.4484], "Philadelphia, PA": [-75.1652, 39.9526],
  "San Antonio, TX": [-98.4936, 29.4241], "San Diego, CA": [-117.1611, 32.7157],
  "Dallas, TX": [-96.7970, 32.7767], "San Jose, CA": [-121.8863, 37.3382],
  "Austin, TX": [-97.7431, 30.2672], "San Francisco, CA": [-122.4194, 37.7749],
  "Seattle, WA": [-122.3321, 47.6062], "Boston, MA": [-71.0589, 42.3601],
  "Miami, FL": [-80.1918, 25.7617], "Denver, CO": [-104.9903, 39.7392],
  "Cleveland, OH": [-81.6944, 41.4993],
};

function parseCityState(s) {
  if (!s || typeof s !== "string") return { city: null, state: null, key: null };
  const parts = s.split(",").map((x) => x.trim());
  if (parts.length >= 2) {
    const city = parts[0];
    const state = parts[1].slice(0, 2).toUpperCase();
    return { city, state, key: `${city}, ${state}` };
  }
  return { city: null, state: null, key: null };
}

function hashToUnit(seed) {
  // produce deterministic 0..1 from a string/number seed
  const str = String(seed ?? "");
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function coordsForRow(row) {
  // 1) Use explicit lat/lon if present
  if (row.lat != null && row.long != null && !Number.isNaN(row.lat) && !Number.isNaN(row.long)) {
    return [Number(row.long), Number(row.lat)];
  }
  // 2) City centroid if known
  const { city, state, key } = parseCityState(row.location);
  if (key && CITY_CENTROIDS[key]) return CITY_CENTROIDS[key];
  // 3) State centroid + tiny jitter based on job_id/zip to avoid exact overlaps
  const st = state && STATE_CENTROIDS[state] ? state : null;
  const base = st ? STATE_CENTROIDS[st] : [-98.5795, 39.8283]; // US centroid fallback
  const seed = row.job_id || row.zip_code || `${city || ""}${state || ""}`;
  const r1 = hashToUnit(seed);
  const r2 = hashToUnit(String(seed) + "x");
  const dx = (r1 - 0.5) * 1.2; // up to ~1.2° lon shift
  const dy = (r2 - 0.5) * 0.8; // up to ~0.8° lat shift
  return [base[0] + dx, base[1] + dy];
}

// ------------------------------ GeoJSON utils -------------------------------
const toGeoJSON = (rows) => ({
  type: "FeatureCollection",
  features: rows
    .map((r) => {
      const coords = coordsForRow(r);
      if (!coords || isNaN(coords[0]) || isNaN(coords[1])) return null;
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: coords },
        properties: { ...r },
      };
    })
    .filter(Boolean),
});

function topTitleFromCounts(counts) {
  let top = ""; let best = -1;
  for (const [k, v] of Object.entries(counts || {})) { if (v > best) { best = v; top = k; } }
  return top || "Jobs";
}

const sortCounts = (counts) => Object.entries(counts || {}).sort((a, b) => b[1] - a[1]);

// ------------------------------- Component ----------------------------------
export default function JobMapCSV() {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const clusterMarkersRef = useRef([]); // HTML label markers
  const popupRef = useRef(null);

  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);

  // Build Supercluster index when rows change
  const pointsFC = useMemo(() => toGeoJSON(rows), [rows]);
  const index = useMemo(() => {
    const sc = new Supercluster({
      radius: 80,
      maxZoom: 16,
      map: (p) => ({ titleCounts: { [p.title]: 1 } }),
      reduce: (acc, p) => { for (const [t, c] of Object.entries(p.titleCounts)) acc.titleCounts[t] = (acc.titleCounts[t] || 0) + c; },
    });
    sc.load(pointsFC.features);
    return sc;
  }, [pointsFC]);

  const getClustersForZoom = (z) => {
    const feats = index.getClusters([-180, -85, 180, 85], Math.max(0, Math.floor(z)));
    return feats.map((f) => f.properties?.cluster
      ? { ...f, properties: { ...f.properties, topTitle: topTitleFromCounts(f.properties.titleCounts) } }
      : f
    );
  };

  const clearClusterMarkers = () => { clusterMarkersRef.current.forEach((m) => m.remove()); clusterMarkersRef.current = []; };

  const renderClusterHTMLLabels = (features) => {
    const map = mapRef.current; if (!map) return;
    clearClusterMarkers();
    for (const f of features) {
      if (!f.properties?.cluster) continue;
      const el = document.createElement("div");
      el.style.cssText = [
        "transform: translate(-50%, -100%)",
        "background: rgba(255,255,255,0.96)",
        "border: 1px solid #e5e7eb",
        "border-radius: 10px",
        "box-shadow: 0 6px 18px rgba(0,0,0,0.08)",
        "padding: 4px 8px",
        "font: 11px/16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        "color: #0b1021",
        "white-space: nowrap",
        "pointer-events: none",
      ].join(";");
      const title = f.properties.topTitle || "Jobs";
      const count = f.properties.point_count || 0;
      el.textContent = `${title} (${count})`;
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat(f.geometry.coordinates)
        .addTo(map);
      clusterMarkersRef.current.push(marker);
    }
  };

  const showClusterPopup = (feature) => {
    const map = mapRef.current; if (!map) return;
    const counts = feature.properties?.titleCounts || {};
    const top = sortCounts(counts).slice(0, 5);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const html = [
      `<div style=\"font: 12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; min-width: 240px\">`,
      `<div style=\"font-weight:600; margin-bottom:6px\">Cluster stats</div>`,
      `<div style=\"margin-bottom:6px\">Total jobs: <b>${total}</b></div>`,
      `<ol style=\"padding-left:16px; margin:0 0 6px 0\">`,
      ...top.map(([t, c]) => `<li>${t} <span style=\"color:#4b5563\">(${c})</span></li>`),
      `</ol>`,
      `<button id=\"zoom-in-btn\" style=\"padding:6px 8px; border:1px solid #e5e7eb; border-radius:8px; background:#fff; cursor:pointer\">Zoom in</button>`,
      `</div>`,
    ].join("");

    popupRef.current?.remove();
    const popup = new maplibregl.Popup({ closeButton: true })
      .setLngLat(feature.geometry.coordinates)
      .setHTML(html)
      .addTo(map);
    popupRef.current = popup;

    popup.on("open", () => {
      const btn = document.getElementById("zoom-in-btn");
      if (btn) {
        btn.onclick = () => {
          const z = Math.min(index.getClusterExpansionZoom(feature.properties.cluster_id), 12);
          map.easeTo({ center: feature.geometry.coordinates, zoom: z + 0.5, duration: 500 });
        };
      }
    });
  };

  const showPointPopup = (feature) => {
    const map = mapRef.current; if (!map) return;
    const p = feature.properties;
    const { city, state } = parseCityState(p.location);
    const html = `<div style=\"font: 12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; min-width:220px\">`
      + `<div style=\"font-weight:600\">${p.title || "Job"}</div>`
      + `<div style=\"color:#4b5563\">${p.company_name || ""}</div>`
      + `<div style=\"color:#4b5563\">${city || ""}${state ? ", " + state : ""}</div>`
      + (p.normalized_salary ? `<div>$${Number(p.normalized_salary).toLocaleString()}</div>` : "")
      + (p.formatted_work_type ? `<div>${p.formatted_work_type}</div>` : "")
      + (p.original_listed_time ? `<div>Listed: ${new Date(Number(p.original_listed_time)).toLocaleDateString()}</div>` : "")
      + `</div>`;
    popupRef.current?.remove();
    popupRef.current = new maplibregl.Popup({ closeButton: true })
      .setLngLat(feature.geometry.coordinates)
      .setHTML(html)
      .addTo(map);
  };

  // ----------------------------- Map lifecycle ------------------------------
  useEffect(() => {
    if (mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_RASTER_STYLE,
      center: [-98.5795, 39.8283],
      zoom: 3.5,
      attributionControl: true,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      map.addSource("jobs", { type: "geojson", data: { type: "FeatureCollection", features: [] } });

      map.addLayer({ id: "cluster-circles", type: "circle", source: "jobs", filter: ["has", "cluster"], paint: {
        "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 5, 14, 50, 22, 200, 32],
        "circle-color": ["step", ["get", "point_count"], "#93c5fd", 20, "#60a5fa", 50, "#3b82f6", 150, "#1d4ed8"],
        "circle-stroke-color": "#ffffff", "circle-stroke-width": 2, "circle-opacity": 0.9 } });

      map.addLayer({ id: "job-points", type: "circle", source: "jobs", filter: ["!", ["has", "cluster"]], paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 4, 12, 8], "circle-color": "#22c55e", "circle-stroke-color": "#0f172a", "circle-stroke-width": 1.5 } });

      // Click handlers
      map.on("click", "cluster-circles", (e) => { const f = e.features?.[0]; if (f) showClusterPopup(f); });
      map.on("click", "job-points", (e) => { const f = e.features?.[0]; if (f) showPointPopup(f); });

      // Initial draw empty
      const src = map.getSource("jobs");
      src.setData({ type: "FeatureCollection", features: [] });
    });

    return () => { clusterMarkersRef.current.forEach((m) => m.remove()); popupRef.current?.remove(); map.remove(); };
  }, []);

  // Update map source & labels whenever clustering index changes
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const src = map.getSource("jobs"); if (!src) return;
    const features = getClustersForZoom(map.getZoom() || 3.5);
    src.setData({ type: "FeatureCollection", features });
    renderClusterHTMLLabels(features);
  }, [index]);

  // Live updates on map move/zoom
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const update = () => {
      const features = getClustersForZoom(map.getZoom());
      const src = map.getSource("jobs");
      src.setData({ type: "FeatureCollection", features });
      renderClusterHTMLLabels(features);
    };
    map.on("moveend", update);
    map.on("zoomend", update);
    map.on("resize", update);
    return () => { map.off("moveend", update); map.off("zoomend", update); map.off("resize", update); };
  }, []);

  // ------------------------------- CSV Loader UI ----------------------------
  const onCSVFile = (file) => {
    setError(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (res) => {
        const data = (res.data || []).filter((row) => row && row.job_id && row.title);
        if (!data.length) {
          setError("No valid rows found. Ensure headers match and file has data.");
        }
        setRows(data);
      },
      error: (err) => setError(err?.message || "Failed to parse CSV"),
    });
  };

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Top-left controls */}
      <div style={{ position: "absolute", top: 12, left: 12, background: "rgba(255,255,255,0.95)", border: "1px solid #e5e7eb", borderRadius: 12, padding: "10px 12px", font: "13px/18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: "#0b1021", boxShadow: "0 6px 18px rgba(0,0,0,0.08)" }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>US Job Map</div>
        <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>Load your CSV to populate the map.</div>
        <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onCSVFile(e.target.files[0])} />
        {error && <div style={{ color: "#b91c1c", marginTop: 8 }}>{error}</div>}
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 8 }}>
          Tips: Provide 'lat' and 'lon' columns for precise mapping; otherwise we approximate from city/state.
        </div>
      </div>
    </div>
  );
}
