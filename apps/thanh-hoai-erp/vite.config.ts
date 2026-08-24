import path from "node:path";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

const RUNTIME_TARGET =
  process.env.VITE_ERP_PROXY_TARGET || "http://127.0.0.1:8777";

export default defineConfig(({ command }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
    proxy: {
      // Cookie session SameSite=Strict → must be same-origin in dev
      "/api": {
        target: RUNTIME_TARGET,
        changeOrigin: false,
      },
    },
  },
  resolve: {
    alias: {
      "@retail": path.resolve(__dirname, "../../packages/ankhang-retail-erp/src"),
    },
  },
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart(),
    ...(command === "build" ? [nitro({ preset: "vercel" })] : []),
    viteReact(),
  ],
}));
