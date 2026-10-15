import { defineConfig } from "vitest/config";
import { viteSingleFile } from "vite-plugin-singlefile";

// One self-contained index.html (data, figures, three.js and styles inlined), so the planner
// can be hosted anywhere static (GitHub Pages, S3, a USB stick) or opened offline.
export default defineConfig({
  base: "./",
  plugins: [viteSingleFile()],
  build: { assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 2000, target: "es2020" },
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
