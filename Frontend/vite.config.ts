import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev-only proxy (F28): production serves same-origin statics from FastAPI,
// no proxy involved. 8100 here is a dev default matching Config/repos.yaml.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8100",
      "/ws": { target: "ws://127.0.0.1:8100", ws: true },
    },
  },
});
