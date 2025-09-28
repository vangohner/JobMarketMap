// src/ui/globalStyles.js
export function injectGlobalStyles() {
  const style = document.createElement("style");
  style.innerHTML = `
    .maplibregl-popup-content, .maplibregl-popup, .cluster-list {
      max-width: 300px !important;
      white-space: normal !important;
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
    }
    .cluster-list { list-style:none; padding:0; margin:0; max-height:300px; overflow:auto; }
    .cluster-list li { padding-right: 6px; border-bottom:1px solid #eef2f7; }
    .job-link { display:block; color:#0b1021; text-decoration:none; }
    .job-title { font-weight:600; font-size:12px; }
    .job-sub { color:#4b5563; font-size:11px; }
    .btn {
      padding:6px 10px; border:1px solid #e5e7eb; border-radius:8px; background:#fff;
    }
    .btn[disabled] { opacity:.5; cursor:default; }
  `;
  document.head.appendChild(style);
  return () => { try { document.head.removeChild(style); } catch {} };
}
