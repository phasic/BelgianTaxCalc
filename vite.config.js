import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Project Pages URL: https://<user>.github.io/<repo>/
const repo = "BelgianTaxCalc";

export default defineConfig(({ command }) => {
  const base = command === "build" ? `/${repo}/` : "/";

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.svg", "icon-192.png", "icon-512.png"],
        manifest: {
          name: "Belgian Tax Agent",
          short_name: "Tax Agent",
          description: "TOB tax calculator for Belgian retail investors",
          theme_color: "#111109",
          background_color: "#0d0d0f",
          display: "standalone",
          start_url: base,
          scope: base,
          icons: [
            {
              src: "icon-192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "icon-512.png",
              sizes: "512x512",
              type: "image/png",
            },
            {
              src: "icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
          // Firebase Auth and Firestore must always go to network
          navigateFallback: null,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/.*\.firebaseapp\.com\/.*/i,
              handler: "NetworkOnly",
            },
            {
              urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
              handler: "NetworkOnly",
            },
            {
              urlPattern: /^https:\/\/identitytoolkit\.googleapis\.com\/.*/i,
              handler: "NetworkOnly",
            },
          ],
        },
      }),
    ],
    root: "frontend",
    base,
    build: {
      outDir: "../docs",
      emptyOutDir: true,
    },
    server: {
      proxy: {
        "/openfigi": {
          target: "https://api.openfigi.com",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/openfigi/, ""),
        },
      },
    },
  };
});
