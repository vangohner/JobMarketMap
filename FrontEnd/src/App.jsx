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

export default function App() {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const clusterMarkersRef = useRef([]);
  const popupRef = useRef(null);

  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);

  /* ------------------ Clear markers ------------------ */
  const clearClusterMarkers = () => {
    clusterMarkersRef.current.forEach((m) => m.remove());
    clusterMarkersRef.current = [];
  };

  /* ------------------ Render clusters & points ------------------ */
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

  /* ------------------ Map lifecycle ------------------ */
  useEffect(() => {
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

    return () => {
      clearClusterMarkers();
      popupRef.current?.remove();
      try { map.remove(); } catch {}
      mapRef.current = null;
    };
  }, []);

  /* ------------------ Fetch clusters from API ------------------ */
  useEffect(() => {
    const fetchJobs = async () => {
      const map = mapRef.current;
      if (!map) return;

      const bounds = map.getBounds();
      const zoom = Math.floor(map.getZoom());

      try {
        const res = await fetch(
          `/api/jobs/bbox?lat_min=${bounds.getSouth()}&lat_max=${bounds.getNorth()}&lon_min=${bounds.getWest()}&lon_max=${bounds.getEast()}&zoom=${zoom}`
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

  /* ------------------ Render when rows change ------------------ */
  useEffect(() => {
    renderClusters();
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
