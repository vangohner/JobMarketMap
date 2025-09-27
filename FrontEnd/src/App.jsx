import React, { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import Supercluster from "supercluster";

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
// (coordsForRow, parseCityState, STATE_CENTROIDS, CITY_CENTROIDS, hashToUnit, toGeoJSON, etc.)
// …include all of your original helpers here exactly as they were…

/* ------------------------- Component ------------------------- */
export default function App() {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const clusterMarkersRef = useRef([]);
  const popupRef = useRef(null);

  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);

  /* ------------------ Cluster index ------------------ */
  const pointsFC = useMemo(() => toGeoJSON(rows), [rows]);
  const index = useMemo(() => {
    const sc = new Supercluster({
      radius: 80,
      maxZoom: 16,
      map: (p) => ({ titleCounts: { [p.title || "Job"]: 1 } }),
      reduce: (acc, p) => {
        for (const [t, c] of Object.entries(p.titleCounts)) acc.titleCounts[t] = (acc.titleCounts[t] || 0) + c;
      },
    });
    sc.load(pointsFC.features);
    return sc;
  }, [pointsFC]);
  const indexRef = useRef(index);
  useEffect(() => { indexRef.current = index; }, [index]);

  // Picks the top job title from a Supercluster titleCounts object
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
    const map = mapRef.current;
    if (!map) return;
    clearClusterMarkers();
    for (const f of feats) {
      if (!f.properties?.cluster) continue;
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
      el.textContent = `${f.properties.topTitle || "Jobs"} (${f.properties.point_count || 0})`;
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
    if (mapRef.current) { try { mapRef.current.remove(); } catch { } mapRef.current = null; }
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_RASTER_STYLE,
      center: [-98.5795, 39.8283],
      zoom: 3.5,
      attributionControl: false, // we'll add custom attribution below
    });
    mapRef.current = map;

    // Add zoom controls
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    const onLoad = () => {
      const map = mapRef.current;
      if (!map) return;

      // --- Map Sources ---
      map.addSource("jobs", { type: "geojson", data: { type: "FeatureCollection", features: [] } });

      // --- Cluster layer ---
      map.addLayer({
        id: "cluster-circles",
        type: "circle",
        source: "jobs",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#1976d2",
          "circle-radius": [
            "step",
            ["get", "point_count"],
            15, 10,
            20, 50,
            25
          ],
          "circle-opacity": 0.6,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#fff",
        },
      });

      // --- Cluster count (invisible, using HTML markers instead) ---
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "jobs",
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-size": 12,
        },
        paint: {
          "text-color": "#000",
        },
      });

      // --- Single job points ---
      map.addLayer({
        id: "job-points",
        type: "circle",
        source: "jobs",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 6,
          "circle-color": "#ff5722",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#fff",
        },
      });

      // --- Click handlers ---
      map.on("click", "cluster-circles", (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["cluster-circles"] });
        if (!features.length) return;
        const clusterId = features[0].properties.cluster_id;
        map.getSource("jobs").getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          map.easeTo({ center: features[0].geometry.coordinates, zoom });
        });
      });

      map.on("click", "job-points", (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["job-points"] });
        if (!features.length) return;
        showPointPopup(features[0]);
      });

      // --- Change cursor on hover ---
      map.on("mouseenter", "cluster-circles", () => map.getCanvas().style.cursor = "pointer");
      map.on("mouseleave", "cluster-circles", () => map.getCanvas().style.cursor = "");
      map.on("mouseenter", "job-points", () => map.getCanvas().style.cursor = "pointer");
      map.on("mouseleave", "job-points", () => map.getCanvas().style.cursor = "");

      // --- Add attribution / contributors ---
      const attr = document.createElement("div");
      attr.style.cssText = `
      position: absolute; bottom: 4px; right: 4px;
      background: rgba(255,255,255,0.85);
      padding: 2px 6px;
      font-size: 11px;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      border-radius: 3px;
      pointer-events: none;
      color: #222;
    `;
      attr.innerHTML = `Map © <a href="https://www.openstreetmap.org/copyright">OSM</a>`;
      map.getContainer().appendChild(attr);
    };

    if (map.loaded()) onLoad();
    else map.on("load", onLoad);

    return () => {
      clearClusterMarkers();
      popupRef.current?.remove();
      try { map.remove(); } catch { }
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
          `/api/jobs/bbox?lat_min=${bounds.getSouth()}&lat_max=${bounds.getNorth()}&lon_min=${bounds.getWest()}&lon_max=${bounds.getEast()}`
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

  // Converts your job rows into GeoJSON features
  function toGeoJSON(rows) {
    return {
      type: "FeatureCollection",
      features: rows
        .map((row) => {
          if (!row.lat || !row.long) return null;
          return {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [Number(row.long), Number(row.lat)],
            },
            properties: row,
          };
        })
        .filter(Boolean),
    };
  }

  /* ----------------- Update clusters when rows change ----------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("jobs");
    if (!src || !("setData" in src)) return;

    const feats = getClustersForZoom(map.getZoom() || 3.5);
    src.setData({ type: "FeatureCollection", features: feats });
    renderClusterHTMLLabels(feats);
  }, [rows, index]);


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
