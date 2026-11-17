import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

// Cloudflare Web Analytics: cookieless page views. The beacon goes into production builds only, and only
// when CF_BEACON_TOKEN (the site token from the Web Analytics dashboard) is set, in the shell or `.env`.
function webAnalytics(token: string | undefined): Plugin {
  return {
    name: "cloudflare-web-analytics",
    apply: "build",
    transformIndexHtml() {
      if (!token) return [];
      return [
        {
          tag: "script",
          attrs: {
            defer: true,
            src: "https://static.cloudflareinsights.com/beacon.min.js",
            "data-cf-beacon": JSON.stringify({ token }),
          },
          injectTo: "body",
        },
      ];
    },
  };
}

// `bun run web:dev` serves the app with hot reload and sends API calls to `bun run worker:dev`.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  return {
    root: "web",
    plugins: [react(), webAnalytics(env.CF_BEACON_TOKEN)],
    // Mantine is one chunk; fine for a single settings page.
    build: { outDir: "../dist/web", emptyOutDir: true, chunkSizeWarningLimit: 800 },
    server: {
      proxy: { "/api": "http://127.0.0.1:8787", "/auth": "http://127.0.0.1:8787" },
    },
  };
});
