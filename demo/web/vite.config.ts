import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiPort = env.WEB_PORT || (mode === "production" ? "8787" : "9780");

  return {
    // Avoid writing under node_modules/.vite (often root-owned → EACCES after sudo npm install).
    cacheDir: path.resolve(__dirname, ".vite"),
    plugins: [react()],
    resolve: {
      alias: {
        "@lib": path.resolve(__dirname, "src/lib"),
      },
    },
    server: {
      port: 5173,
      strictPort: false,
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
