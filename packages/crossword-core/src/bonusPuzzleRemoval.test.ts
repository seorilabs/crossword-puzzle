import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const trackedTextExtensions = /\.(?:js|json|md|mjs|mts|sql|ts|tsx|yaml|yml)$/;
const removedContractDoc = "docs/market-parity.md";
const removedContractNeedles = [
  ["bonus", "puzzle"].join("_"),
  ["rewarded", "bonus", "puzzle"].join("_"),
];

function trackedTextFiles(): string[] {
  return execFileSync("git", ["ls-files"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter((path) => trackedTextExtensions.test(path));
}

describe("보너스 퍼즐 제거 계약 (#326)", () => {
  it("AC-1·4: 제거된 이벤트·광고 계약은 제거 상태 문서에만 남는다", () => {
    for (const path of trackedTextFiles()) {
      const content = readFileSync(
        new URL(`../../../${path}`, import.meta.url),
        "utf8",
      );
      const matchedLines = content
        .split("\n")
        .filter((line) =>
          removedContractNeedles.some((needle) => line.includes(needle)),
        );

      if (matchedLines.length === 0) {
        continue;
      }

      assert.equal(
        path,
        removedContractDoc,
        `${path}에 제거된 계약이 남아 있다`,
      );
      for (const line of matchedLines) {
        assert.match(line, /제거됨/, `${path}의 제거 상태가 명시되지 않았다`);
      }
    }
  });

  it("AC-2: 모바일의 미사용 보너스 패널 스타일을 제거한다", () => {
    const mobileApp = readFileSync(
      new URL("../../../apps/mobile/App.tsx", import.meta.url),
      "utf8",
    );
    const removedStyleNames = [
      ["bonus", "Eyebrow"].join(""),
      ["bonus", "Notice"].join(""),
      ["bonus", "Panel"].join(""),
      ["bonus", "PanelAvailable"].join(""),
      ["bonus", "PanelText"].join(""),
      ["bonus", "Title"].join(""),
    ];

    for (const styleName of removedStyleNames) {
      assert.doesNotMatch(mobileApp, new RegExp(`\\b${styleName}:`));
    }
  });

  it("AC-3: 복원은 지표 근거가 생길 때까지 제품 결정 대기로 기록한다", () => {
    const parityDoc = readFileSync(
      new URL("../../../docs/market-parity.md", import.meta.url),
      "utf8",
    );

    assert.match(parityDoc, /f992a61\(2026-07-25\)/);
    assert.match(parityDoc, /복원 여부는 제품 결정 대기 상태/);
    assert.match(parityDoc, /리텐션 효과 근거가 없/);
  });
});
