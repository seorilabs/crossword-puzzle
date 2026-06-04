import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "crossword-puzzle",
  brand: {
    displayName: "가로세로 낱말 퍼즐",
    primaryColor: "#00A88F",
    icon: "https://static.toss.im/appsintoss/38345/15757b74-afc5-4f91-acc9-19602ffb73e6.png",
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
