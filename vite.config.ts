import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Development-only proxy (vite serve) to avoid CORS with trek.nasa.gov
    proxy: {
      "/trek": {
        target: "https://trek.nasa.gov/tiles",
        changeOrigin: true,
        secure: true,
        // /trek/Mars/EQ/... -> https://trek.nasa.gov/tiles/Mars/EQ/...
        rewrite: (path) => path.replace(/^\/trek/, ""),
      },
    },
    // Enable CORS in case the browser enforces strict rules
    cors: true,
  },
});

