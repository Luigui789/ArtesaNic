import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), tailwindcss(), tsconfigPaths()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/media": {
          target: env["API_PROXY_TARGET"] || "http://127.0.0.1:8000",
          changeOrigin: true,
        },
        "/api": {
          target: env["API_PROXY_TARGET"] || "http://127.0.0.1:8000",
          changeOrigin: true,
        },
      },
    },
  };
});
