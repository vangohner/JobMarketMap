import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";

/* ----------------------- OSM Raster Style -------------------- */
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

/* ------------------------- Helpers --------------------------- */
// Keep topTitleFromCounts for cluster labels
function topTitleFromCounts(counts) {
  let top = "";
  let best = -1;
  for (const [k, v] of Object.entries(counts || {})) {
    if (v > best) {
      best = v;
      top = k;
    }
  }
  return top || "Jobs";
}

/* ------------------------- Component ------------------------- */
export default function App() {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const clusterMarkersRef = useRef([]);
  const popupRef = useRef(null);

  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);

  const clearClusterMarkers = () => {
    clusterMarkersRef.current.forEach((m) => m.remove());
    clusterMarkersRef.current = [];
  };

  const renderClusterHTMLLabels = (feats) => {
    const map = mapRef.current;
    if (!map) return;
    clearClusterMarkers();
    for (const f of feats) {
      if (!f.properties?.point_count) continue; // only clusters
      const el = document.createElement("div");
      el.setAttribute("aria-hidden", "true");
      el.style.cssText = `
        transform: translate(-50%, -100%);
        background: rgba(255,255,255,0.96);
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        box-shadow: 0 6px 18px rgba(0,0,0,0.08);
        padding: 4px 8px;
        font: 11px/16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        color: #0b1021;
        white-space: nowrap;
        pointer-events: none;
      `;
      el.textContent = `${f.properties.topTitle || topTitleFromCounts(f.properties.titleCounts)} (${f.properties.point_count || 0})`;
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat(f.geometry.coordinates)
        .addTo(map);
      clusterMarkersRef.current.push(marker);
    }
  };

  const showPointPopup = (feature) => {
    const map = mapRef.current;
    if (!map) return;
    const p = feature.properties || {};
    const html = `
      <div style="font:12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; min-width:240px;">
        <div style="font-weight:600">${p.title || "Job"}</div>
        <div class="job-sub">${p.company_name || ""}</div>
        <div class="job-sub">${p.location || ""}</div>
        ${p.normalized_salary ? `<div>$${Number(p.normalized_salary).toLocaleString()}</div>` : ""}
        ${p.formatted_work_type ? `<div>${p.formatted_work_type}</div>` : ""}
        ${p.formatted_experience_level ? `<div>Level: ${p.formatted_experience_level}</div>` : ""}
        ${p.original_listed_time ? `<div>Listed: ${new Date(Number(p.original_listed_time)).toLocaleDateString()}</div>` : ""}
        ${String(p.remote_allowed).trim() === "1" ? "<div>Remote allowed</div>" : ""}
      </div>`;
    popupRef.current?.remove();
    popupRef.current = new maplibregl.Popup({ closeButton: true })
      .setLngLat(feature.geometry.coordinates)
      .setHTML(html)
      .addTo(map);
  };

  /* ----------------- Map lifecycle ----------------- */
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
      // Add layers / click handlers as in original code
    };

    if (map.loaded()) onLoad();
    else map.on("load", onLoad);

    return () => {
      clearClusterMarkers();
      popupRef.current?.remove();
      try { map.remove(); } catch {}
      mapRef.current = null;
    };
  }, []);

  /* ------------------ Fetch jobs from API ------------------ */
  useEffect(() => {
    const fetchJobs = async () => {
      const map = mapRef.current;
      if (!map) return;

      const bounds = map.getBounds();
      try {
        const res = await fetch(
          `/api/jobs/bbox?lat_min=${bounds.getSouth()}&lat_max=${bounds.getNorth()}&lon_min=${bounds.getWest()}&lon_max=${bounds.getEast()}&zoom=${Math.floor(map.getZoom())}`
        );
        if (!res.ok) throw new Error("Failed to fetch jobs");

        const data = await res.json();
        setRows(Array.isArray(data.results) ? data.results : []);
      } catch (err) {
        setError(err.message || "Fetch failed");
        setRows([]);
      }
    };

    fetchJobs();
    const map = mapRef.current;
    if (!map) return;
    const onMoveEnd = () => fetchJobs();
    map.on("moveend", onMoveEnd);
    map.on("zoomend", onMoveEnd);
    return () => {
      map.off("moveend", onMoveEnd);
      map.off("zoomend", onMoveEnd);
    };
  }, []);

  const renderClusters = () => {
    const map = mapRef.current;
    if (!map) return;
    clearClusterMarkers();

    for (const f of rows) {
      const el = document.createElement("div");
      el.setAttribute("aria-hidden", "true");
      el.style.cssText = `
        transform: translate(-50%, -50%);
        background: rgba(255,255,255,0.95);
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        padding: 4px 8px;
        font: 11px/16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        color: #0b1021;
        pointer-events: none;
      `;
      el.textContent = f.count
        ? `${f.top_title || "Jobs"} (${f.count})`
        : f.title || "Job";

      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([f.longitude || f.long, f.latitude || f.lat])
        .addTo(map);

      clusterMarkersRef.current.push(marker);
    }
  };

  useEffect(() => {
    renderClusters();
  }, [rows]);

  /* ----------------- Update clusters when rows change ----------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("jobs");
    if (!src || !("setData" in src)) return;

    src.setData({ type: "FeatureCollection", features: rows });
    renderClusterHTMLLabels(rows);
  }, [rows]);

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {error && (
        <div style={{ position: "absolute", top: 12, left: 12, color: "#b91c1c" }}>
          {error}
        </div>
      )}
    </div>
  );
}
