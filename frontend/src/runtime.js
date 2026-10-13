export const isProductionMode = (mode) => mode === "production";
export const isProduction = isProductionMode(import.meta.env.MODE);
export const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:7777";
