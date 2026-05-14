import { defineConfig } from "vite";

// Project Pages URL: https://<user>.github.io/<repo>/
const repo = "BelgianTaxCalc";

export default defineConfig(({ command }) => ({
  base: command === "build" ? `/${repo}/` : "/",
  // GitHub Pages "Deploy from branch" only allows / (root) or /docs — not /dist
  build: {
    outDir: "docs",
  },
  server: {
    proxy: {
      "/api/openfigi": {
        target: "https://api.openfigi.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/openfigi/, ""),
      },
    },
  },
}));
