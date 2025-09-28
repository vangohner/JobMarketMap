// src/cluster/superclusterIndex.js
import Supercluster from "supercluster";

export const buildIndex = (pointsFC) => {
  const sc = new Supercluster({
    radius: 90,
    maxZoom: 16,
    map: (p) => ({ titleCounts: { [p.title || "Job"]: 1 } }),
    reduce: (acc, p) => {
      for (const [t, c] of Object.entries(p.titleCounts)) {
        acc.titleCounts[t] = (acc.titleCounts[t] || 0) + c;
      }
    },
  });
  sc.load(pointsFC.features);
  return sc;
};

export const sortCounts = (counts) => Object.entries(counts || {}).sort((a, b) => b[1] - a[1]);

export function enhanceClusterFeature(f) {
  if (!f.properties?.cluster) return f;
  const counts = f.properties.titleCounts || {};
  const total = f.properties.point_count || 0;
  const sorted = sortCounts(counts);
  const [topName, topCount] = sorted[0] || ["Jobs", 0];
  const topPct = total ? Math.round((topCount / total) * 100) : 0;
  const topSummary = sorted.slice(1, 3).map(([k, v]) => `${k} ${Math.round((v / total) * 100)}%`).join(" • ");
  return {
    ...f,
    properties: {
      ...f.properties,
      topTitle: topName,
      topCount,
      topPct,
      topSummary,
    },
  };
}

export function getClustersForZoom(index, z) {
  const feats = index.getClusters([-180, -85, 180, 85], Math.max(0, Math.floor(z)));
  return feats.map(enhanceClusterFeature);
}
