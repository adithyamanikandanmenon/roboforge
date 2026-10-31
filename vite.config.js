import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
const offlineManifest = {
  name: "offline-manifest",
  generateBundle(_, bundle) {
    this.emitFile({
      type: "asset",
      fileName: "offline-manifest.json",
      source: JSON.stringify({
        files: [
          "/index.html",
          "/pond-config.json",
          "/pond-icon.svg",
          "/manifest.webmanifest",
          ...Object.keys(bundle)
            .filter((name) => name.startsWith("assets/"))
            .map((name) => "/" + name),
        ],
      }),
    });
  },
};
export default defineConfig({
  base: "./",
  plugins: [tailwindcss(), offlineManifest],
  build: { chunkSizeWarningLimit: 650 },
});
