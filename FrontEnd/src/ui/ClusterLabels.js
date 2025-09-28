// src/ui/ClusterLabels.js
import maplibregl from "maplibre-gl";

export function clearClusterMarkers(clusterMarkersRef) {
  clusterMarkersRef.current.forEach((m) => m.remove());
  clusterMarkersRef.current = [];
}

export function renderClusterHTMLLabels(map, feats, clusterMarkersRef) {
  clearClusterMarkers(clusterMarkersRef);
  for (const f of feats) {
    if (!f.properties?.cluster) continue;
    const { topTitle = "Jobs", point_count = 0, topPct = 0, topSummary = "" } = f.properties;
    const el = document.createElement("div");
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = [
      "transform: translate(-50%, -100%)",
      "background: rgba(255,255,255,0.96)",
      "border: 1px solid #e5e7eb",
      "border-radius: 8px",
      "box-shadow: 0 6px 18px rgba(0,0,0,0.08)",
      "padding: 5px 5px",
      "font: 10px/15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      "color: #0b1021",
      "white-space: normal",
      "overflow-wrap: anywhere",
      "word-break: break-word",
      "width: 150px",
      "line-height: 1.2",
      "pointer-events: none",
      "max-width: 230px",
    ].join(";");

    el.innerHTML = `
      <div style="font-weight:700">${topTitle} • ${topPct}% <span style="color:#64748b">(${point_count})</span></div>
      ${topSummary ? `<div style="color:#64748b; font-size:10px; margin-top:2px">${topSummary}</div>` : ""}
    `;

    const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat(f.geometry.coordinates)
      .addTo(map);
    clusterMarkersRef.current.push(marker);
  }
}
