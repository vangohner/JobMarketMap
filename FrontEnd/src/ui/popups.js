// src/ui/popups.js
import maplibregl from "maplibre-gl";

const CLUSTER_PAGE_SIZE = 15;

export function showPointPopup(map, popupRef, feature) {
  const p = feature.properties || {};
  const html = `<div style="font:12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; min-width:240px;">
    <div style="font-weight:600">${p.title || "Job"}</div>
    <div class="job-sub">${p.company_name || ""}</div>
    <div class="job-sub">${p.location || ""}</div>
    ${p.normalized_salary ? `<div>$${Number(p.normalized_salary).toLocaleString()}</div>` : ""}
    ${p.formatted_work_type ? `<div>${p.formatted_work_type}</div>` : ""}
    ${p.formatted_experience_level != null && p.formatted_experience_level !== "" && p.formatted_experience_level !== "NaN" && !Number.isNaN(p.formatted_experience_level)
  ? `<div>Level: ${p.formatted_experience_level}</div>` 
  : ""}

    ${p.original_listed_time ? `<div>Listed: ${new Date(p.original_listed_time).toLocaleDateString()}</div>` : ""}
    ${String(p.remote_allowed).trim() === "1" ? `<div>Remote allowed</div>` : ""}
  </div>`;
  popupRef.current?.remove();
  popupRef.current = new maplibregl.Popup({ closeButton: true })
    .setLngLat(feature.geometry.coordinates)
    .setHTML(html)
    .addTo(map);
}

function nearestLiveClusterAtZoom(index, targetLngLat, zoom) {
  const z = Math.max(0, Math.floor(zoom || 0));
  const all = index.getClusters([-180, -85, 180, 85], z).filter((f) => f.properties && f.properties.cluster);
  if (!all.length) return null;
  const [cx, cy] = targetLngLat;
  let best = Infinity, winner = null;
  for (const c of all) {
    const [x, y] = c.geometry.coordinates;
    const dx = x - cx, dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < best) { best = d2; winner = c; }
  }
  return winner;
}

export function showClusterMenu(map, indexRef, popupRef, clusterFeature, offset = 0) {
  const sc = indexRef.current;
  let baseFeature = clusterFeature;
  let cid = clusterFeature?.properties?.cluster_id;
  let total = clusterFeature?.properties?.point_count || 0;

  const ensureLeaves = () => {
    try {
      return sc.getLeaves(cid, CLUSTER_PAGE_SIZE, offset);
    } catch {
      const near = nearestLiveClusterAtZoom(sc, clusterFeature.geometry.coordinates, map.getZoom());
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
      <div style="display:flex; gap:8px; justify-content:space-between; margin-top:8px; flex-wrap:wrap; align-items:center">
        <button class="btn" data-btn="close">Close</button>
        <button class="btn" data-btn="prev" ${hasPrev ? "" : "disabled"}>Prev</button>
        <div style="flex:1; text-align:center; vertical-align:bottom; color:#6f; font-size:11px">${Math.floor(offset / CLUSTER_PAGE_SIZE) + 1} / ${Math.max(1, Math.ceil(total / CLUSTER_PAGE_SIZE))}</div>
        <button class="btn" data-btn="next" ${hasNext ? "" : "disabled"}>Next</button>
        <button class="btn" data-btn="zoom">Zoom</button>
      </div>
    </div>
  `;

  popupRef.current?.remove();
  const popup = new maplibregl.Popup({ closeButton: false })
    .setLngLat(baseFeature.geometry.coordinates)
    .setHTML(html)
    .addTo(map);
  popupRef.current = popup;

  const wire = () => {
    const root = popup.getElement();
    if (!root || !root.isConnected) return;

    root.querySelectorAll(".job-link").forEach((a, i) => {
      a.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const leaf = leaves[i]; if (!leaf) return;
        map.easeTo({ center: leaf.geometry.coordinates, zoom: Math.max(map.getZoom(), 8), duration: 400 });
        showPointPopup(map, popupRef, leaf);
      }, { passive: false });
    });

    const on = (sel, fn) => {
      const b = root.querySelector(sel);
      if (b) b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false });
    };
    on('button[data-btn="prev"]', () => showClusterMenu(map, indexRef, popupRef, baseFeature, Math.max(0, offset - CLUSTER_PAGE_SIZE)));
    on('button[data-btn="next"]', () => showClusterMenu(map, indexRef, popupRef, baseFeature, offset + CLUSTER_PAGE_SIZE));
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
}
