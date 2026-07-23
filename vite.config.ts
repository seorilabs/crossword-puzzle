import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import { version as packageVersion } from "./package.json";

// 빌드 산출물에 앱 버전을 패키지 유래 상수로 주입한다(#293). 배포 워크플로가
// VITE_APP_VERSION(태그 유래)을 넘기면 그 값이 우선하고, 없으면 이 package.json 버전이
// release_version 계측의 fallback 상수가 된다. 텔레메트리 adapter가 __APP_VERSION__을 읽는다.
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(packageVersion),
  },
});
