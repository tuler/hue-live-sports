import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `bun run web:dev` serves the app with hot reload and sends API calls to `bun run worker:dev`.
export default defineConfig({
  root: "web",
  plugins: [react()],
  // Mantine is one chunk; fine for a single settings page.
  build: { outDir: "../dist/web", emptyOutDir: true, chunkSizeWarningLimit: 800 },
  server: {
    proxy: { "/api": "http://127.0.0.1:8787", "/auth": "http://127.0.0.1:8787" },
  },
});
