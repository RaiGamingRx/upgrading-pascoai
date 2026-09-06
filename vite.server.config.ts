import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  build: {
    outDir: "dist-server",
    emptyOutDir: true,
    ssr: true,
    rollupOptions: {
      input: path.resolve(__dirname, "server/index.ts"),
      output: {
        entryFileNames: "server.js",
        chunkFileNames: "chunks/[name]-[hash].js",
      },
    },
  },
});