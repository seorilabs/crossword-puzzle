import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "crossword-puzzle-game",
  brand: {
    displayName: "가로세로 낱말",
    primaryColor: "#00A88F",
    icon: "https://static.toss.im/appsintoss/38345/ee65422a-6347-4c07-a33f-bb50ddc0168a.png",
  },
  web: {
    host: "localhost",
    port: 5173,
    commands: {
      dev: "vite dev",
      build: "vite build",
    },
  },
  permissions: [],
  outdir: "dist",
});
