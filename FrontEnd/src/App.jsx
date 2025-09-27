import React, { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import Supercluster from "supercluster";


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

// --------------------------- Deterministic helpers --------------------------
function jitter(seed, scale = 0.02) {
  const a = (seed * 9301 + 49297) % 233280;
  const r = a / 233280; // 0..1
  return (r - 0.5) * scale; // symmetric
}

function genNearbyJobs({ baseId, center, count, title, company, category, city, state, salaryBase, urlBase, startDay = 10 }) {
  const jobs = [];
  for (let i = 0; i < count; i++) {
    const dx = jitter(i, 0.025);
    const dy = jitter(i + 7, 0.025);
    jobs.push({
      id: `${baseId}-${i + 1}`,
      title,
      company,
      category,
      salary: salaryBase + i * 500,
      location: { city, state },
      coordinates: [center[0] + dx, center[1] + dy],
      url: `${urlBase}/${i + 1}`,
      postedAt: `2025-09-${String((startDay + (i % 10))).padStart(2, "0")}`,
    });
  }
  return jobs;
}

function addCity(center, city, state) {
  return [
    ...genNearbyJobs({ baseId: `${city}-se`, center, count: 80, title: "Software Engineer", company: "ManyCo", category: "Software", city, state, salaryBase: 140000, urlBase: `https://example.com/${city}/se`, startDay: 3 }),
    ...genNearbyJobs({ baseId: `${city}-devops`, center, count: 40, title: "DevOps Engineer", company: "CloudOps", category: "DevOps", city, state, salaryBase: 135000, urlBase: `https://example.com/${city}/devops`, startDay: 5 }),
    ...genNearbyJobs({ baseId: `${city}-ml`, center, count: 32, title: "Machine Learning Engineer", company: "AICorp", category: "AI/ML", city, state, salaryBase: 165000, urlBase: `https://example.com/${city}/ml`, startDay: 7 }),
    ...genNearbyJobs({ baseId: `${city}-data`, center, count: 28, title: "Data Engineer", company: "DataWorks", category: "Data", city, state, salaryBase: 150000, urlBase: `https://example.com/${city}/data`, startDay: 9 }),
  ];
}

// ------------------------------- Seed data ----------------------------------
const NYC = [-73.9851, 40.7589];    // Times Square
const SF = [-122.4194, 37.7749];    // San Francisco
const ATX = [-97.7431, 30.2672];    // Austin
const SEA = [-122.3321, 47.6062];   // Seattle
const CHI = [-87.6298, 41.8781];    // Chicago
const BOS = [-71.0589, 42.3601];    // Boston
const MIA = [-80.1918, 25.7617];    // Miami
const LA  = [-118.2437, 34.0522];   // Los Angeles
const DEN = [-104.9903, 39.7392];   // Denver
const PHX = [-112.0740, 33.4484];   // Phoenix
const DAL = [-96.7970, 32.7767];    // Dallas
const DC  = [-77.0369, 38.9072];    // Washington, DC

const SAMPLE_JOBS = [
  ...addCity(NYC, "NewYork", "NY"),
  ...addCity(SF, "SanFrancisco", "CA"),
  ...addCity(ATX, "Austin", "TX"),
  ...addCity(SEA, "Seattle", "WA"),
  ...addCity(CHI, "Chicago", "IL"),
  ...addCity(BOS, "Boston", "MA"),
  ...addCity(MIA, "Miami", "FL"),
  ...addCity(LA,  "LosAngeles", "CA"),
  ...addCity(DEN, "Denver", "CO"),
  ...addCity(PHX, "Phoenix", "AZ"),
  ...addCity(DAL, "Dallas", "TX"),
  ...addCity(DC,  "WashingtonDC", "DC"),
];

// ------------------------------ GeoJSON utils -------------------------------
const toGeoJSON = (jobs) => ({
  type: "FeatureCollection",
  features: jobs.map((j) => ({
    type: "Feature", geometry: { type: "Point", coordinates: j.coordinates },
    properties: { ...j },
  })),
});

function topTitleFromCounts(counts) {
  let top = ""; let best = -1;
  for (const [k, v] of Object.entries(counts || {})) { if (v > best) { best = v; top = k; } }
  return top || "Jobs";
}

const sortCounts = (counts) => Object.entries(counts || {}).sort((a, b) => b[1] - a[1]);

// ------------------------------- Component ----------------------------------
export default function USJobMapClusterStats() {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const clusterMarkersRef = useRef([]); // HTML label markers
  const popupRef = useRef(null);

  const pointsFC = useMemo(() => toGeoJSON(SAMPLE_JOBS), []);

  // Supercluster index for all jobs
  const index = useMemo(() => {
    const sc = new Supercluster({
      radius: 80, // strong clustering
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
      `<div style="font: 12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; min-width: 220px">`,
      `<div style="font-weight:600; margin-bottom:6px">Cluster stats</div>`,
      `<div style="margin-bottom:6px">Total jobs: <b>${total}</b></div>`,
      `<ol style="padding-left:16px; margin:0 0 6px 0">`,
      ...top.map(([t, c]) => `<li>${t} <span style=\"color:#4b5563\">(${c})</span></li>`),
      `</ol>`,
      `<button id="zoom-in-btn" style="padding:6px 8px; border:1px solid #e5e7eb; border-radius:8px; background:#fff; cursor:pointer">Zoom in</button>`,
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
    const html = `<div style=\"font: 12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; min-width:200px\">`
      + `<div style=\"font-weight:600\">${p.title}</div>`
      + `<div style=\"color:#4b5563\">${p.company}</div>`
      + `<div style=\"color:#4b5563\">${p.location?.city || ""}, ${p.location?.state || ""}</div>`
      + (p.salary ? `<div>$${Number(p.salary).toLocaleString()}</div>` : "")
      + (p.url ? `<div style=\"margin-top:6px\"><a href=\"${p.url}\" target=\"_blank\" rel=\"noreferrer\">View job</a></div>` : "")
      + `</div>`;
    popupRef.current?.remove();
    popupRef.current = new maplibregl.Popup({ closeButton: true })
      .setLngLat(feature.geometry.coordinates)
      .setHTML(html)
      .addTo(map);
  };

  useEffect(() => {
  // If a previous instance exists (e.g., StrictMode remount), remove it first
  if (mapRef.current) {
    try { mapRef.current.remove(); } catch (_) {}
    mapRef.current = null;
  }

  if (!containerRef.current) return;

  const map = new maplibregl.Map({
    container: containerRef.current,
    style: OSM_RASTER_STYLE,
    center: [-98.5795, 39.8283],
    zoom: 3.5,
    attributionControl: true,
  });
  mapRef.current = map;

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

  const onLoad = () => {
    map.addSource("jobs", { type: "geojson", data: { type: "FeatureCollection", features: [] } });

    map.addLayer({
      id: "cluster-circles", type: "circle", source: "jobs",
      filter: ["has", "cluster"],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 5, 14, 50, 22, 200, 32],
        "circle-color": ["step", ["get", "point_count"], "#93c5fd", 20, "#60a5fa", 50, "#3b82f6", 150, "#1d4ed8"],
        "circle-stroke-color": "#ffffff", "circle-stroke-width": 2, "circle-opacity": 0.9
      }
    });

    map.addLayer({
      id: "job-points", type: "circle", source: "jobs",
      filter: ["!", ["has", "cluster"]],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 4, 12, 8],
        "circle-color": "#22c55e", "circle-stroke-color": "#0f172a", "circle-stroke-width": 1.5
      }
    });

    // Clicks
    map.on("click", "cluster-circles", (e) => { const f = e.features?.[0]; if (f) showClusterPopup(f); });
    map.on("click", "job-points", (e) => { const f = e.features?.[0]; if (f) showPointPopup(f); });

    const update = () => {
      const z = map.getZoom();
      const features = getClustersForZoom(z);
      const src = map.getSource("jobs");
      if (src && "setData" in src) {
        src.setData({ type: "FeatureCollection", features });
      }
      renderClusterHTMLLabels(features);
    };

    map.on("moveend", update);
    map.on("zoomend", update);
    map.on("resize", update);
    update();
  };

  if (map.loaded()) onLoad(); else map.on("load", onLoad);

  return () => {
    clearClusterMarkers();
    popupRef.current?.remove();
    try { map.remove(); } catch (_) {}
    mapRef.current = null; // <-- IMPORTANT: clear the ref so we re-init next mount
  };
}, [index]); // or [] is fine if index is stable
}
