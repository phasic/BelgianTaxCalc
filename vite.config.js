import { defineConfig } from "vite";

// Project Pages URL: https://<user>.github.io/<repo>/
const repo = "BelgianTaxCalc";

export default defineConfig(({ command }) => ({
  base: command === "build" ? `/${repo}/` : "/",
}));
