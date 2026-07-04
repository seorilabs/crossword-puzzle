import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { buildShareText } from "./shareText.ts";

// 공통 입력. 개별 테스트에서 필요한 필드만 덮어쓴다.
const baseInput = {
  puzzleLabel: "7월 4일",
  elapsedLabel: "01:23",
  hintCount: 0,
  attemptsUsed: 1,
  completedCount: 8,
  totalCount: 8,
  consecutiveStreak: 3,
  isComplete: true,
  revealUsed: false,
  shareGrid: "🟩🟩\n🟩🟩",
};

describe("buildShareText: 앱 진입 링크(#227)", () => {
  it("링크 값이 없으면 링크 줄이 붙지 않는다", () => {
    const text = buildShareText(baseInput);
    assert.ok(!text.includes("앱에서 풀어보기"));
    // 마지막 줄은 완성 개수 줄이어야 한다(링크가 뒤에 붙지 않음).
    const lines = text.split("\n");
    assert.equal(lines[lines.length - 1], "낱말 8/8개 완성 🎉");
  });

  it("링크 값이 없을 때와 빈 문자열/공백만일 때 결과가 바이트 단위로 동일하다(회귀 없음)", () => {
    const noLink = buildShareText(baseInput);
    assert.equal(buildShareText({ ...baseInput, shareLandingUrl: "" }), noLink);
    assert.equal(
      buildShareText({ ...baseInput, shareLandingUrl: "   " }),
      noLink,
    );
    assert.equal(
      buildShareText({ ...baseInput, shareLandingUrl: undefined }),
      noLink,
    );
  });

  it("링크 값이 있으면 마지막 줄에 앱 진입 링크가 붙는다", () => {
    const url = "https://example.app/crossword";
    const text = buildShareText({ ...baseInput, shareLandingUrl: url });
    const lines = text.split("\n");
    assert.equal(lines[lines.length - 1], `앱에서 풀어보기 👉 ${url}`);
    // 링크 앞에는 빈 줄 구분이 들어간다.
    assert.equal(lines[lines.length - 2], "");
  });

  it("링크가 붙어도 링크 앞부분은 링크 없는 결과와 동일하다(기존 텍스트 보존)", () => {
    const url = "https://example.app/crossword";
    const noLink = buildShareText(baseInput);
    const withLink = buildShareText({ ...baseInput, shareLandingUrl: url });
    // 링크 블록("\n\n앱에서 풀어보기 👉 URL")을 제거하면 링크 없는 버전과 같아야 한다.
    assert.equal(withLink, `${noLink}\n\n앱에서 풀어보기 👉 ${url}`);
  });

  it("링크 값의 앞뒤 공백은 제거해 붙인다", () => {
    const text = buildShareText({
      ...baseInput,
      shareLandingUrl: "  https://example.app/x  ",
    });
    assert.ok(text.endsWith("앱에서 풀어보기 👉 https://example.app/x"));
  });
});
