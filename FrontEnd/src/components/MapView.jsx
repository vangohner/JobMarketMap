// src/components/MapView.jsx
import React, { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import { OSM_RASTER_STYLE } from "../maplibre/style";
import { toGeoJSON } from "../geo/geojson";
import { buildIndex, getClustersForZoom } from "../cluster/superclusterIndex";
import { injectGlobalStyles } from "../ui/globalStyles";
import { renderClusterHTMLLabels } from "../ui/ClusterLabels";
import { showPointPopup, showClusterMenu } from "../ui/popups";

export default function MapView({ rows, onMapReady }) {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const clusterMarkersRef = useRef([]);
  const popupRef = useRef(null);
  const indexRef = useRef(null);

  // CSS
  useEffect(() => injectGlobalStyles(), []);

  const pointsFC = useMemo(() => toGeoJSON(rows), [rows]);
  const index = useMemo(() => buildIndex(pointsFC), [pointsFC]);
  useEffect(() => { indexRef.current = index; }, [index]);

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
    onMapReady?.(map);

    const onLoad = () => {
      map.addSource("jobs", { type: "geojson", data: { type: "FeatureCollection", features: [] } });

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

      map.on("click", "cluster-hit", (e) => {
        const f = e.features?.[0]; if (!f) return;
        e.preventDefault();
        showClusterMenu(map, indexRef, popupRef, f, 0);
      });
      map.on("click", "job-hit", (e) => {
        const f = e.features?.[0]; if (!f) return;
        e.preventDefault();
        showPointPopup(map, popupRef, f);
      });

      const hover = (on) => () => { map.getCanvas().style.cursor = on ? "pointer" : ""; };
      map.on("mouseenter", "cluster-hit", hover(true));
      map.on("mouseleave", "cluster-hit", hover(false));
      map.on("mouseenter", "job-hit", hover(true));
      map.on("mouseleave", "job-hit", hover(false));
    };

    if (map.loaded()) onLoad(); else map.on("load", onLoad);

    return () => {
      try { popupRef.current?.remove(); } catch {}
      try { clusterMarkersRef.current.forEach((m) => m.remove()); } catch {}
      try { map.remove(); } catch {}
      mapRef.current = null;
    };
  }, []);

  // Push data once index is built (e.g., after CSV load)
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const src = map.getSource("jobs"); if (!src || !("setData" in src)) return;
    const feats = getClustersForZoom(index, map.getZoom() || 3.5);
    src.setData({ type: "FeatureCollection", features: feats });
    renderClusterHTMLLabels(map, feats, clusterMarkersRef);
  }, [index]);

  // Live updates on pan/zoom/resize
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const update = () => {
      const feats = getClustersForZoom(indexRef.current, map.getZoom());
      const src = map.getSource("jobs");
      if (src && "setData" in src) src.setData({ type: "FeatureCollection", features: feats });
      renderClusterHTMLLabels(map, feats, clusterMarkersRef);
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
  }, []);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
