import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Proxy SOLO en dev (vite serve) para evitar CORS con trek.nasa.gov
    proxy: {
      "/trek": {
        target: "https://trek.nasa.gov/tiles",
        changeOrigin: true,
        secure: true,
        // /trek/Mars/EQ/... -> https://trek.nasa.gov/tiles/Mars/EQ/...
        rewrite: (path) => path.replace(/^\/trek/, ""),
      },
    },
    // CORS habilitado por si tu navegador es estricto
    cors: true,
  },
});
