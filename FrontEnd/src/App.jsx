import React, { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import Supercluster from "supercluster";
import Papa from "papaparse";

/* ----------------------- OSM Raster Style (no API key) -------------------- */
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

/* --------------------------- Simple geocoding helpers --------------------- */
const STATE_CENTROIDS = {
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
const CITY_CENTROIDS = {
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
  const str = String(seed ?? "");
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}
function coordsForRow(row) {
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

/* ------------------------------ GeoJSON utils ----------------------------- */
const toGeoJSON = (rows) => ({
  type: "FeatureCollection",
  features: rows
    .map((r) => {
      const c = coordsForRow(r);
      if (!c || isNaN(c[0]) || isNaN(c[1])) return null;
      return { type: "Feature", geometry: { type: "Point", coordinates: c }, properties: { ...r } };
    })
    .filter(Boolean),
});
const topTitleFromCounts = (counts) => {
  let top = "", best = -1;
  for (const [k, v] of Object.entries(counts || {})) if (v > best) { best = v; top = k; }
  return top || "Jobs";
};
const sortCounts = (counts) => Object.entries(counts || {}).sort((a, b) => b[1] - a[1]);

/* -------------------------------- Component ------------------------------- */
export default function App() {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const clusterMarkersRef = useRef([]);
  const popupRef = useRef(null);

  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);

  /* --------- Global CSS (wrap long titles, prevent overflow in popups) ---- */
  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = `
      .maplibregl-popup-content, .maplibregl-popup, .cluster-list {
        max-width: 300px !important;
        white-space: normal !important;
        overflow-wrap: anywhere !important;
        word-break: break-word !important;
      }
      .cluster-list { list-style:none; padding:0; margin:0; max-height:300px; overflow:auto; }
      .cluster-list li { padding-right: 6px; border-bottom:1px solid #eef2f7; }
      .job-link { display:block; color:#0b1021; text-decoration:none; }
      .job-title { font-weight:600; font-size:12px; }
      .job-sub { color:#4b5563; font-size:11px; }
      .btn {
        padding:6px 10px; border:1px solid #e5e7eb; border-radius:8px; background:#fff;
      }
      .btn[disabled] { opacity:.5; cursor:default; }
    `;
    document.head.appendChild(style);
    return () => { try { document.head.removeChild(style); } catch {} };
  }, []);

  /* ---------------- Build features + cluster index; keep latest in ref ---- */
  const pointsFC = useMemo(() => toGeoJSON(rows), [rows]);
  const index = useMemo(() => {
    const sc = new Supercluster({
      radius: 80,
      maxZoom: 16,
      map: (p) => ({ titleCounts: { [p.title || "Job"]: 1 } }),
      reduce: (acc, p) => { for (const [t, c] of Object.entries(p.titleCounts)) acc.titleCounts[t] = (acc.titleCounts[t] || 0) + c; },
    });
    sc.load(pointsFC.features);
    return sc;
  }, [pointsFC]);
  const indexRef = useRef(index);
  useEffect(() => { indexRef.current = index; }, [index]);

  const getClustersForZoom = (z) => {
    const sc = indexRef.current;
    const feats = sc.getClusters([-180, -85, 180, 85], Math.max(0, Math.floor(z)));
    return feats.map((f) =>
      f.properties?.cluster
        ? { ...f, properties: { ...f.properties, topTitle: topTitleFromCounts(f.properties.titleCounts) } }
        : f
    );
  };

  const clearClusterMarkers = () => {
    clusterMarkersRef.current.forEach((m) => m.remove());
    clusterMarkersRef.current = [];
  };

  const renderClusterHTMLLabels = (feats) => {
    const map = mapRef.current; if (!map) return;
    clearClusterMarkers();
    for (const f of feats) {
      if (!f.properties?.cluster) continue;
      const el = document.createElement("div");
      el.setAttribute("aria-hidden", "true");
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
      el.textContent = `${f.properties.topTitle || "Jobs"} (${f.properties.point_count || 0})`;
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat(f.geometry.coordinates)
        .addTo(map);
      clusterMarkersRef.current.push(marker);
    }
  };

  const showPointPopup = (feature) => {
    const map = mapRef.current; if (!map) return;
    const p = feature.properties || {};
    const html = `<div style="font:12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; min-width:240px;">
      <div style="font-weight:600">${p.title || "Job"}</div>
      <div class="job-sub">${p.company_name || ""}</div>
      <div class="job-sub">${p.location || ""}</div>
      ${p.normalized_salary ? `<div>$${Number(p.normalized_salary).toLocaleString()}</div>` : ""}
      ${p.formatted_work_type ? `<div>${p.formatted_work_type}</div>` : ""}
      ${p.formatted_experience_level ? `<div>Level: ${p.formatted_experience_level}</div>` : ""}
      ${p.original_listed_time ? `<div>Listed: ${new Date(Number(p.original_listed_time)).toLocaleDateString()}</div>` : ""}
      ${String(p.remote_allowed).trim() === "1" ? `<div>Remote allowed</div>` : ""}
    </div>`;
    popupRef.current?.remove();
    popupRef.current = new maplibregl.Popup({ 
      //maxWidth: '480px',
      closeButton: true })
      .setLngLat(feature.geometry.coordinates)
      .setHTML(html)
      .addTo(map);
  };

  /* ------------- Cluster menu (stale-id–proof + deterministic wiring) ----- */
  const CLUSTER_PAGE_SIZE = 15;

  function nearestLiveClusterAtZoom(targetLngLat, zoom) {
    const sc = indexRef.current;
    const z = Math.max(0, Math.floor(zoom || 0));
    const all = sc.getClusters([-180, -85, 180, 85], z).filter(
      (f) => f.properties && f.properties.cluster
    );
    if (!all.length) return null;
    const [cx, cy] = targetLngLat;
    let best = Infinity, winner = null;
    for (const c of all) {
      const [x, y] = c.geometry.coordinates;
      const dx = x - cx, dy = y - cy;
      const d2 = dx * dx + dy * dy; // correct squared distance
      if (d2 < best) { best = d2; winner = c; }
    }
    return winner;
  }

  const showClusterMenu = (clusterFeature, offset = 0) => {
    const map = mapRef.current; if (!map) return;
    const sc = indexRef.current;

    let baseFeature = clusterFeature;
    let cid = clusterFeature?.properties?.cluster_id;
    let total = clusterFeature?.properties?.point_count || 0;

    const ensureLeaves = () => {
      try {
        return sc.getLeaves(cid, CLUSTER_PAGE_SIZE, offset);
      } catch {
        const near = nearestLiveClusterAtZoom(clusterFeature.geometry.coordinates, map.getZoom());
        if (!near) return [];
        baseFeature = near;
        cid = near.properties.cluster_id;
        total = near.properties.point_count || 0;
        return sc.getLeaves(cid, CLUSTER_PAGE_SIZE, offset);
      }
    };

    const leaves = ensureLeaves();
    const items = leaves.map((leaf, i) => {
      const p = leaf.properties || {};
      const title = p.title || "Job";
      const company = p.company_name || p.company || "";
      const loc = p.location || "";
      const [lon, lat] = leaf.geometry.coordinates;
      return `<li>
        <a href="#" class="job-link" data-i="${i}" data-lon="${lon}" data-lat="${lat}">
          <div class="job-title">${title}</div>
          <div class="job-sub">${company}${loc ? " • " + loc : ""}</div>
        </a>
      </li>`;
    }).join("");

    const hasPrev = offset > 0;
    const hasNext = offset + CLUSTER_PAGE_SIZE < total;

    const html = `
      <div class="cluster-popup" style="font:12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; min-width:280px;">
        <div style="font-weight:700; margin-bottom:6px">Jobs in cluster (${total})</div>
        <ol class="cluster-list">
          ${items || `<li style="padding:6px 0; color:#64748b">No jobs found.</li>`}
        </ol>
        <div style="display:flex; gap:8px; justify-content:space-between; margin-top:8px; flex-wrap:wrap">
          <button class="btn" data-btn="prev" ${hasPrev ? "" : "disabled"}>Prev</button>
          <div style="flex:1; text-align:center; color:#64748b; font-size:11px">${Math.floor(offset/CLUSTER_PAGE_SIZE)+1} / ${Math.max(1, Math.ceil(total/CLUSTER_PAGE_SIZE))}</div>
          <button class="btn" data-btn="next" ${hasNext ? "" : "disabled"}>Next</button>
          <button class="btn" data-btn="zoom">Zoom to cluster</button>
          <button class="btn" data-btn="close">Close</button>
        </div>
      </div>
    `;

    popupRef.current?.remove();
    const popup = new maplibregl.Popup({
      //maxWidth: '480px',
      closeButton: false })
      .setLngLat(baseFeature.geometry.coordinates)
      .setHTML(html)
      .addTo(map);
    popupRef.current = popup;

    // Deterministic wiring: on "open" and next frame (covers timing races)
    const wire = () => {
      const root = popup.getElement();
      if (!root || !root.isConnected) return;

      // Job links
      root.querySelectorAll(".job-link").forEach((a, i) => {
        a.addEventListener("click", (e) => {
          e.preventDefault(); e.stopPropagation();
          const leaf = leaves[i]; if (!leaf) return;
          map.easeTo({ center: leaf.geometry.coordinates, zoom: Math.max(map.getZoom(), 8), duration: 400 });
          showPointPopup(leaf);
        }, { passive: false });
      });

      // Buttons
      const on = (sel, fn) => {
        const b = root.querySelector(sel);
        if (b) b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false });
      };
      on('button[data-btn="prev"]', () => showClusterMenu(baseFeature, Math.max(0, offset - CLUSTER_PAGE_SIZE)));
      on('button[data-btn="next"]', () => showClusterMenu(baseFeature, offset + CLUSTER_PAGE_SIZE));
      on('button[data-btn="zoom"]', () => {
        let z;
        try { z = Math.min(indexRef.current.getClusterExpansionZoom(cid), 12); }
        catch { z = Math.max(map.getZoom(), 7); }
        map.easeTo({ center: baseFeature.geometry.coordinates, zoom: z + 0.5, duration: 500 });
      });
      on('button[data-btn="close"]', () => popup.remove());
    };
    popup.on("open", wire);
    requestAnimationFrame(wire);
  };

  /* ----------------------------- Map lifecycle ---------------------------- */
  useEffect(() => {
    if (mapRef.current) { try { mapRef.current.remove(); } catch {} mapRef.current = null; }
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

      // Visible layers
      map.addLayer({
        id: "cluster-circles", type: "circle", source: "jobs", filter: ["has", "cluster"],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 5, 16, 50, 24, 200, 34],
          "circle-color": ["step", ["get", "point_count"], "#93c5fd", 20, "#60a5fa", 50, "#3b82f6", 150, "#1d4ed8"],
          "circle-stroke-color": "#ffffff", "circle-stroke-width": 2, "circle-opacity": 0.95
        }
      });
      map.addLayer({
        id: "job-points", type: "circle", source: "jobs", filter: ["!", ["has", "cluster"]],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 4, 12, 8],
          "circle-color": "#22c55e", "circle-stroke-color": "#0f172a", "circle-stroke-width": 1.5
        }
      });

      // Transparent hit layers (larger radius) for reliable clicks
      map.addLayer({
        id: "cluster-hit", type: "circle", source: "jobs", filter: ["has", "cluster"],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 5, 28, 50, 36, 200, 44],
          "circle-color": "rgba(0,0,0,0.01)", "circle-opacity": 0.01
        }
      });
      map.addLayer({
        id: "job-hit", type: "circle", source: "jobs", filter: ["!", ["has", "cluster"]],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 14, 12, 22],
          "circle-color": "rgba(0,0,0,0.01)", "circle-opacity": 0.01
        }
      });

      // Click handlers on hit layers
      map.on("click", "cluster-hit", (e) => {
        const f = e.features?.[0]; if (!f) return;
        e.preventDefault();
        showClusterMenu(f, 0);
      });
      map.on("click", "job-hit", (e) => {
        const f = e.features?.[0]; if (!f) return;
        e.preventDefault();
        showPointPopup(f);
      });

      // Cursor
      const hover = (on) => () => { map.getCanvas().style.cursor = on ? "pointer" : ""; };
      map.on("mouseenter", "cluster-hit", hover(true));
      map.on("mouseleave", "cluster-hit", hover(false));
      map.on("mouseenter", "job-hit", hover(true));
      map.on("mouseleave", "job-hit", hover(false));
    };

    if (map.loaded()) onLoad(); else map.on("load", onLoad);

    return () => {
      clearClusterMarkers();
      popupRef.current?.remove();
      try { map.remove(); } catch {}
      mapRef.current = null;
    };
  }, []);

  // Update visible clusters on index changes (e.g., after CSV load)
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const src = map.getSource("jobs"); if (!src || !("setData" in src)) return;
    const feats = getClustersForZoom(map.getZoom() || 3.5);
    src.setData({ type: "FeatureCollection", features: feats });
    renderClusterHTMLLabels(feats);
  }, [index]);

  // Live updates on pan/zoom
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const update = () => {
      const z = map.getZoom();
      const feats = getClustersForZoom(z);
      const src = map.getSource("jobs");
      if (src && "setData" in src) src.setData({ type: "FeatureCollection", features: feats });
      renderClusterHTMLLabels(feats);
    };
    map.on("moveend", update);
    map.on("zoomend", update);
    map.on("resize", update);
    update();
    return () => {
      map.off("moveend", update);
      map.off("zoomend", update);
      map.off("resize", update);
    };
  }, []); // uses indexRef internally

  /* ------------------------------- CSV Loader UI --------------------------- */
  const onCSVFile = (file) => {
    setError(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (res) => {
        const data = (res.data || []).filter((row) => row && (row.job_id || row.title));
        if (!data.length) setError("No valid rows found. Check headers and data.");
        setRows(data);

        // Fit to data
        const feats = toGeoJSON(data).features;
        const map = mapRef.current;
        if (map && feats.length) {
          const b = new maplibregl.LngLatBounds();
          for (const f of feats) b.extend(f.geometry.coordinates);
          map.fitBounds(b, { padding: 60, duration: 600, maxZoom: 8 });
        }
      },
      error: (err) => setError(err?.message || "Failed to parse CSV"),
    });
  };

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <div style={{
        position: "absolute", top: 12, left: 12, zIndex: 10,
        background: "rgba(255,255,255,0.95)", border: "1px solid #e5e7eb",
        borderRadius: 12, padding: "10px 12px",
        font: "13px/18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        color: "#0b1021", boxShadow: "0 6px 18px rgba(0,0,0,0.08)"
      }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>US Job Map</div>
        <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>Load your CSV to populate the map.</div>
        <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onCSVFile(e.target.files[0])} />
        {error && <div style={{ color: "#b91c1c", marginTop: 8, maxWidth: 320 }}>{error}</div>}
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 8, maxWidth: 360 }}>
          Supported columns: <code>job_id, company_name, title, description, location, formatted_work_type, original_listed_time, remote_allowed, formatted_experience_level, skills_desc, normalized_salary, zip_code, lat, lon/long</code>.
        </div>
      </div>
    </div>
  );
}
