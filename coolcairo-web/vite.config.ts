import type { OutputAsset, OutputChunk } from "rollup";
import { defineConfig, type Plugin } from "vitest/config";

// One self-contained index.html (data, figures, three.js and styles inlined), so the planner
// can be hosted anywhere static (GitHub Pages, S3, a USB stick) or opened offline.
// A few lines instead of a plugin dependency: inline the built JS and CSS into the page.
function singleFile(): Plugin {
  return {
    name: "coolcairo-single-file",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find((f): f is OutputAsset => f.type === "asset" && f.fileName.endsWith(".html"));
      if (!html) return;
      let page = String(html.source);
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === "chunk" && name.endsWith(".js")) {
          const code = (file as OutputChunk).code.replace(/<\/script/gi, "<\\/script");
          page = page.replace(new RegExp(`<script[^>]*src="[^"]*${escape(name)}"[^>]*></script>`), () => `<script type="module">${code}</script>`);
          delete bundle[name];
        } else if (file.type === "asset" && name.endsWith(".css")) {
          page = page.replace(new RegExp(`<link[^>]*href="[^"]*${escape(name)}"[^>]*>`), () => `<style>${String(file.source)}</style>`);
          delete bundle[name];
        }
      }
      html.source = page;
    },
  };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default defineConfig({
  base: "./",
  plugins: [singleFile()],
  build: {
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 2500,
    cssCodeSplit: false,
    modulePreload: false,
    target: "es2020",
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
