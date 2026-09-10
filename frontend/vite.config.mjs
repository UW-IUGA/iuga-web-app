import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");

    if (mode === "production") {
        const missing = ["VITE_API_URL", "VITE_ENTRA_API_SCOPE"].filter((key) => !env[key]);
        if (missing.length > 0) {
            throw new Error(`${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} required for production builds`);
        }
    }

    return {
        plugins: [react()],
        server: {
            port: 3000,
            proxy: {
                "/api": "http://localhost:7777",
            },
        },
        build: {
            outDir: "build",
        },
        test: {
            environment: "jsdom",
            globals: true,
            setupFiles: "./src/test-setup.js",
        },
    };
});
