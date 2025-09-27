import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "maplibre-gl/dist/maplibre-gl.css";   // REQUIRED
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  // You can comment out StrictMode while debugging; leave it in after it works.
  // <React.StrictMode>
    <App />
  // </React.StrictMode>
);