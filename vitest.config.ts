import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import { version as packageVersion } from "./package.json";

// 웹 컴포넌트(React) 테스트 전용 설정. node:test 기반 test:core/test:adapters와
// 분리해, jsdom 환경에서 *.test.tsx만 실행한다. 텔레메트리 adapter(analyticsSinks)가
// 읽는 빌드 상수 __APP_VERSION__을 vite.config와 동일하게 주입해, 텔레메트리를
// 경유하는 컴포넌트 테스트가 로드 시 ReferenceError로 실패하지 않게 한다(#299).
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(packageVersion),
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.tsx"],
  },
});
