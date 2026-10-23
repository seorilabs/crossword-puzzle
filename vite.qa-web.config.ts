import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const root = process.cwd();
export default defineConfig({
  cacheDir: resolve(root, "node_modules/.vite-qa-web"),
  root: resolve(root, "qa/web"),
  envDir: resolve(root, "qa/web"),
  publicDir: resolve(root, "public"),
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify("0.0.0-qa"),
    "import.meta.env.VITE_PUZZLE_PACK_BASE_URL": JSON.stringify(
      "http://127.0.0.1:4183",
    ),
    "import.meta.env.VITE_PUZZLE_MANIFEST_URL": JSON.stringify(
      "http://127.0.0.1:4183/puzzles/manifest.json",
    ),
    "import.meta.env.VITE_FIREBASE_API_KEY": JSON.stringify("qa-fixture-key"),
    "import.meta.env.VITE_FIREBASE_PROJECT_ID":
      JSON.stringify("qa-fixture-project"),
    "import.meta.env.VITE_FIREBASE_APP_ID": JSON.stringify("qa-fixture-app"),
    "import.meta.env.VITE_FIREBASE_MEASUREMENT_ID": JSON.stringify(
      "qa-fixture-measurement",
    ),
  },
  server: {
    host: "127.0.0.1",
    port: 4183,
    strictPort: true,
    fs: { allow: [root] },
  },
  resolve: {
    alias: [
      {
        find: /^@apps-in-toss\/web-framework$/,
        replacement: resolve(root, "qa/web/framework.ts"),
      },
      {
        find: /^firebase\/(app|auth|analytics|remote-config)$/,
        replacement: resolve(root, "qa/web/firebase.ts"),
      },
      {
        find: /^@seorilabs\/platform-sdk$/,
        replacement: resolve(root, "qa/native/platform-sdk.ts"),
      },
    ],
  },
});
