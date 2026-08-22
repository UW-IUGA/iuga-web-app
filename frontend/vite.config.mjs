import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");

    if (mode === "production" && !env.VITE_API_URL) {
        throw new Error("VITE_API_URL is required for production builds");
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
