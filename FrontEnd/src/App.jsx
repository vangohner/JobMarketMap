// src/App.jsx
import React, { useRef, useState, useEffect } from "react";
import maplibregl from "maplibre-gl";
import MapView from "./components/MapView";
import { toGeoJSON } from "./geo/geojson";

export default function App() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const mapRef = useRef(null);

  const onMapReady = (map) => { mapRef.current = map; };

  const onInitialQuery = async () => {
    setError(null);
    try {
      const response = await fetch("/jobs/initial");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const json = await response.json();
      const data = json.result || []; // matches your FastAPI return shape

      if (!data.length) {
        setError("No jobs found.");
      }
      setRows(data);

      // Fit to data
      const feats = toGeoJSON(data).features;
      const map = mapRef.current;
      if (map && feats.length) {
        const b = new maplibregl.LngLatBounds();
        for (const f of feats) b.extend(f.geometry.coordinates);
        map.fitBounds(b, { padding: 60, duration: 600, maxZoom: 8 });
      }
    } catch (err) {
      setError(String(err));
    }
  };

  // CALL INITIAL QUERY ON MOUNT
  useEffect(() => {
    onInitialQuery();
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <MapView rows={rows} onMapReady={onMapReady} />

      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 10,
          background: "rgba(255,255,255,0.95)",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: "10px 12px",
          font: "13px/18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          color: "#0b1021",
          boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>US Job Map</div>

        <button
          type="button"
          style={{
            display: "block",
            marginTop: 10,
            padding: "6px 10px",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            background: "#fff",
            font: "13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
            cursor: "default",
          }}
          disabled
          aria-disabled="true"
          title="UI only — wire this up to apply the filter"
        >
          Apply
        </button>

        <label
          htmlFor="filter-job"
          style={{ display: "block", fontSize: 12, color: "#475569", marginTop: 12, marginBottom: 6 }}
        >
          Filter by Job
        </label>
        <input
          id="filter-job"
          type="text"
          placeholder="e.g. blah blah blah"
          autoComplete="off"
          spellCheck={false}
          style={{
            width: 260,
            padding: "6px 8px",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            font: "13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
            outline: "none",
          }}
        />

        <label
          htmlFor="filter-company"
          style={{ display: "block", fontSize: 12, color: "#475569", marginTop: 12, marginBottom: 6 }}
        >
          Filter by Company
        </label>
        <input
          id="filter-company"
          type="text"
          placeholder="e.g. blah blah blah"
          autoComplete="off"
          spellCheck={false}
          style={{
            width: 260,
            padding: "6px 8px",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            font: "13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
            outline: "none",
          }}
        />

        {error && <div style={{ color: "#b91c1c", marginTop: 8, maxWidth: 320 }}>{error}</div>}
      </div>
    </div>
  );
}
