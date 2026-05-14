import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Project Pages URL: https://<user>.github.io/<repo>/
const repo = "BelgianTaxCalc";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  root: "frontend",
  base: command === "build" ? `/${repo}/` : "/",
  build: {
    outDir: "../docs",
    emptyOutDir: true,
  },
}));
