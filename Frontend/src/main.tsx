import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// v0.1.12.0 D2 (B.2): register the installability service worker —
// feature-detected (no behavior change when unsupported) and silent on
// rejection (e.g. a stale dist without /sw.js must not spam the console).
navigator.serviceWorker?.register("/sw.js").catch(() => {});
