// 그리드 셀 단서 번호(.cellNumber) 접근성 계약 테스트(#252).
// 시각 렌더는 헤드리스로 검증할 수 없으므로, App.css의 디자인 토큰과 규칙에서
// (1) 번호 색이 셀 배경 대비 WCAG AA(소형 텍스트 4.5:1) 이상인지(라이트/다크),
// (2) 번호 크기가 글자 크기 설정(--cell-font-scale)에 연동되며 하한 10px 을
// 보장하는지 — 구조적으로 검증한다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/App.css"), "utf8");

// :root(라이트) 블록과 dark 미디어쿼리 블록 본문을 거칠게 분리한다.
const rootBlock = css.slice(css.indexOf(":root"), css.indexOf("#root"));
const darkBlock = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"));

function readToken(block: string, token: string): string {
  const idx = block.indexOf(`${token}:`);
  if (idx < 0) {
    throw new Error(`토큰 ${token} 을 찾지 못했습니다`);
  }
  return block.slice(idx + token.length + 1, block.indexOf(";", idx)).trim();
}

// sRGB 채널 → 상대 휘도 성분(WCAG 2.x).
function channelLuminance(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

const AA_SMALL_TEXT = 4.5;

describe("셀 번호 접근성 계약(#252)", () => {
  it("라이트: 번호 색이 셀 배경 대비 WCAG AA(≥4.5:1) 이상이다", () => {
    const number = readToken(rootBlock, "--cw-cell-number");
    const bg = readToken(rootBlock, "--cw-cell-bg");
    expect(contrastRatio(number, bg)).toBeGreaterThanOrEqual(AA_SMALL_TEXT);
  });

  it("다크: 번호 색이 셀 배경 대비 WCAG AA(≥4.5:1) 이상이다", () => {
    const number = readToken(darkBlock, "--cw-cell-number");
    const bg = readToken(darkBlock, "--cw-cell-bg");
    expect(contrastRatio(number, bg)).toBeGreaterThanOrEqual(AA_SMALL_TEXT);
  });

  it("라이트: 번호 색이 교차/선택/활성 등 셀 상태색에서도 AA 이상을 유지한다", () => {
    const number = readToken(rootBlock, "--cw-cell-number");
    for (const token of [
      "--cw-cell-cross-bg",
      "--cw-cell-selected-bg",
      "--cw-cell-active-bg",
      "--cw-cell-pending-bg",
      "--cw-cell-correct-bg",
    ]) {
      const bg = readToken(rootBlock, token);
      expect(
        contrastRatio(number, bg),
        `${token} 대비 AA`,
      ).toBeGreaterThanOrEqual(AA_SMALL_TEXT);
    }
  });

  it(".cellNumber 크기가 --cell-font-scale 에 연동되고 하한 10px 을 보장한다", () => {
    const idx = css.indexOf(".cellNumber {");
    expect(idx).toBeGreaterThan(-1);
    const rule = css.slice(idx, css.indexOf("}", idx));
    // 배율 연동: 셀 글자와 같은 --cell-font-scale 변수를 쓴다.
    expect(rule).toContain("--cell-font-scale");
    // 하한 10px: max(10px, ...) 로 배율 축소 시에도 10px 미만으로 내려가지 않는다.
    expect(rule).toMatch(/font-size:\s*max\(\s*10px/);
    // 고정 9px 이 남아 있지 않다(회귀 방지).
    expect(rule).not.toMatch(/font-size:\s*9px/);
  });
});
