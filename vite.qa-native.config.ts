import { resolve } from "node:path";
import { defineConfig, transformWithEsbuild } from "vite";
import react from "@vitejs/plugin-react";

const root = process.cwd();
const fixture = (name: string) => resolve(root, "qa/native", name);
export default defineConfig({
  cacheDir: resolve(root, "node_modules/.vite-qa-native"),
  root: resolve(root, "qa/native"),
  publicDir: resolve(root, "public"),
  optimizeDeps: { esbuildOptions: { loader: { ".js": "jsx" } } },
  plugins: [
    {
      name: "native-entry-jsx",
      enforce: "pre",
      transform(code, id) {
        if (id.endsWith("/apps/mobile/index.js")) {
          return transformWithEsbuild(code, id, {
            loader: "jsx",
            jsx: "automatic",
          });
        }
      },
    },
    react(),
  ],
  define: { __DEV__: true, __APP_VERSION__: JSON.stringify("0.0.0-qa") },
  server: {
    host: "127.0.0.1",
    port: 4182,
    strictPort: true,
    fs: { allow: [root] },
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      {
        find: /^react-dom$/,
        replacement: resolve(root, "apps/mobile/node_modules/react-dom"),
      },
      {
        find: /^react-dom\/client$/,
        replacement: resolve(
          root,
          "apps/mobile/node_modules/react-dom/client.js",
        ),
      },
      {
        find: /^react-native$/,
        replacement: fixture("react-native.ts"),
      },
      {
        find: /^react$/,
        replacement: resolve(root, "apps/mobile/node_modules/react"),
      },
      {
        find: /^react\/jsx-runtime$/,
        replacement: resolve(
          root,
          "apps/mobile/node_modules/react/jsx-runtime.js",
        ),
      },
      {
        find: /^react\/jsx-dev-runtime$/,
        replacement: resolve(
          root,
          "apps/mobile/node_modules/react/jsx-dev-runtime.js",
        ),
      },
      {
        find: /^@react-native-async-storage\/async-storage$/,
        replacement: fixture("storage.ts"),
      },
      {
        find: /^react-native-safe-area-context$/,
        replacement: fixture("safe-area.tsx"),
      },
      {
        find: /^@react-native-firebase\/analytics$/,
        replacement: fixture("analytics.ts"),
      },
      {
        find: /^@react-native-firebase\/remote-config$/,
        replacement: fixture("remote-config.ts"),
      },
      {
        find: /^@react-native-firebase\/auth$/,
        replacement: fixture("auth.ts"),
      },
      {
        find: /^@seorilabs\/platform-sdk$/,
        replacement: fixture("platform-sdk.ts"),
      },
      {
        find: /^react-native-google-mobile-ads$/,
        replacement: fixture("ads.ts"),
      },
      {
        find: /^react-native-notify-kit$/,
        replacement: fixture("notifications.ts"),
      },
      {
        find: /.*\/specs\/Native(AppInfo|Leaderboard)$/,
        replacement: fixture("native-module.ts"),
      },
    ],
  },
});
