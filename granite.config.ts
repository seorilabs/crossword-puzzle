import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "crossword-puzzle",
  brand: {
    displayName: "가로세로낱말퍼즐",
    primaryColor: "#00A88F",
    icon: "", // 화면에 노출될 앱의 아이콘 이미지 주소로 바꿔주세요.
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
