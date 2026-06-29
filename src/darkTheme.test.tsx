// 다크 모드(시스템 테마 연동) 토큰·미디어쿼리 계약 테스트.
// 시각 렌더 자체는 헤드리스로 검증할 수 없으므로, 여기서는 App.css가
// (1) 핵심 색을 CSS 변수 토큰으로 추출했고, (2) prefers-color-scheme: dark에서
// 그 토큰을 다크 팔레트로 덮으며, (3) 셀 상태가 다크에서 서로 구분되도록
// 별도 토큰을 갖는지 — 구조적으로 보장한다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// vitest는 저장소 루트에서 실행된다.
const css = readFileSync(join(process.cwd(), "src/App.css"), "utf8");
const indexCss = readFileSync(join(process.cwd(), "src/index.css"), "utf8");

// :root 블록과 dark 미디어쿼리 블록 본문을 거칠게 분리한다.
const rootBlock = css.slice(css.indexOf(":root"), css.indexOf("#root"));
const darkBlockStart = css.indexOf("@media (prefers-color-scheme: dark)");
const darkBlock = css.slice(darkBlockStart);

const CORE_TOKENS = [
  "--cw-bg",
  "--cw-text",
  "--cw-surface",
  "--cw-cell-bg",
  "--cw-cell-text",
  "--cw-cell-block",
  "--cw-cell-selected-bg",
  "--cw-cell-selected-ring",
  "--cw-cell-correct-bg",
  "--cw-cell-correct-text",
  "--cw-cell-wrong-bg",
  "--cw-cell-wrong-text",
  "--cw-cell-tentative-text",
  "--cw-cell-complete-bg",
];

describe("다크 모드 테마 계약(App.css)", () => {
  it("핵심 배경/텍스트/셀 상태 색이 :root 토큰으로 추출돼 있다", () => {
    expect(darkBlockStart).toBeGreaterThan(-1);
    for (const token of CORE_TOKENS) {
      expect(rootBlock).toContain(`${token}:`);
    }
  });

  it(".appShell 배경/텍스트가 토큰을 참조한다(하드코딩 라이트 색 제거)", () => {
    const appShell = css.slice(css.indexOf(".appShell {"), css.indexOf(".appShellToday"));
    expect(appShell).toContain("background: var(--cw-bg)");
    expect(appShell).toContain("color: var(--cw-text)");
    expect(appShell).not.toContain("#ffffff");
    expect(appShell).not.toContain("#191f28");
  });

  it("셀 상태 선택자가 토큰을 참조한다", () => {
    const checks: Array<[string, string]> = [
      [".cellBlock {", "var(--cw-cell-block)"],
      [".cellSelected {", "var(--cw-cell-selected-bg)"],
      [".cellCorrect:not(.cellSelected)", "var(--cw-cell-correct-bg)"],
      [".cellWrong:not(.cellSelected)", "var(--cw-cell-wrong-bg)"],
      [".cellTentative {", "var(--cw-cell-tentative-text)"],
    ];
    for (const [selector, expected] of checks) {
      const idx = css.indexOf(selector);
      expect(idx, `${selector} 선택자 존재`).toBeGreaterThan(-1);
      const rule = css.slice(idx, css.indexOf("}", idx));
      expect(rule, `${selector} → ${expected}`).toContain(expected);
    }
  });

  it("prefers-color-scheme: dark에서 모든 핵심 토큰을 재정의한다", () => {
    for (const token of CORE_TOKENS) {
      expect(darkBlock, `다크 블록에서 ${token} 재정의`).toContain(`${token}:`);
    }
  });

  it("다크에서 셀 상태(선택/정답/오답/임시)가 서로 다른 값으로 구분된다", () => {
    const read = (token: string) => {
      const idx = darkBlock.indexOf(`${token}:`);
      return darkBlock.slice(idx, darkBlock.indexOf(";", idx));
    };
    const selected = read("--cw-cell-selected-bg");
    const correct = read("--cw-cell-correct-bg");
    const wrong = read("--cw-cell-wrong-bg");
    const tentative = read("--cw-cell-tentative-text");
    expect(new Set([selected, correct, wrong, tentative]).size).toBe(4);
  });

  it("와이드 화면 거터도 다크에서 어둡게 전환된다(index.css)", () => {
    expect(indexCss).toContain("prefers-color-scheme: dark");
  });
});
