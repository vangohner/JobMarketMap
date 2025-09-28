// src/loaders/csvLoader.js
import Papa from "papaparse";

export function parseJobsCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (res) => {
        const data = (res.data || []).filter((row) => row && (row.job_id || row.title));
        resolve(data);
      },
      error: (err) => reject(err?.message || "Failed to parse CSV"),
    });
  });
}
