import React from "react";
import { createRoot } from "react-dom/client";
import BelgianTaxAgent from "./belgian-tax-agent.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BelgianTaxAgent />
  </React.StrictMode>
);
