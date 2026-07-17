import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const nativeGameRoot = fileURLToPath(new URL("./native-game", import.meta.url));

export default defineConfig({
  base: "./",
  publicDir: false,
  root: nativeGameRoot,
  plugins: [react()],
  build: {
    emptyOutDir: true,
    outDir: fileURLToPath(
      new URL("./apps/mobile/game-bundle", import.meta.url),
    ),
    rollupOptions: {
      input: fileURLToPath(
        new URL("./native-game/index.html", import.meta.url),
      ),
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
