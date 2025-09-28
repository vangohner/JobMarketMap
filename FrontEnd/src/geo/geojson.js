// src/geo/geojson.js
import { coordsForRow } from "./geocoding";

export const toGeoJSON = (rows) => ({
  type: "FeatureCollection",
  features: rows
    .map((r) => {
      const c = coordsForRow(r);
      if (!c || isNaN(c[0]) || isNaN(c[1])) return null;
      return { type: "Feature", geometry: { type: "Point", coordinates: c }, properties: { ...r } };
    })
    .filter(Boolean),
});
