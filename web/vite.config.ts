import { defineConfig } from "vite";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: "web",
  publicDir: "public",
  server: { port: 5173, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
  plugins: [{
    name: "version-pwa-service-worker",
    closeBundle() {
      const workerPath = resolve(webRoot, "dist/service-worker.js");
      const buildId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const worker = readFileSync(workerPath, "utf8").replace("__PWA_BUILD_ID__", buildId);
      writeFileSync(workerPath, worker);
    },
  }],
});
