import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// 웹 컴포넌트(React) 테스트 전용 설정. node:test 기반 test:core/test:adapters와
// 분리해, jsdom 환경에서 *.test.tsx만 실행한다.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.tsx"],
  },
});
