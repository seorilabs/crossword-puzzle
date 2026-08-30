import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("#347 RN 다음 퍼즐 CTA 인수조건", () => {
  const mobileApp = read("apps/mobile/App.tsx");
  const webApp = read("src/App.tsx");
  const nextPuzzleTests = read(
    "packages/crossword-core/src/nextPuzzleCta.test.ts",
  );
  const surfaceParityTests = read(
    "packages/crossword-core/src/recommendationSurfaceParity.test.ts",
  );
  const releaseParity = read("scripts/check-release-parity.mjs");

  it("AC-1: RN 추천 후보에 발행 manifest 전체가 들어간다", () => {
    assert.match(mobileApp, /const recommendationPuzzleSummaries/);
    assert.match(mobileApp, /\.\.\.puzzlePack\.summaries/);
    assert.match(
      mobileApp,
      /getNextRecommendedPuzzleSummary\(\s*recommendationPuzzleSummaries/,
    );
  });

  it("AC-2·5: 오늘 팩 소진 뒤 과거 미완료를 추천하는 core 테스트가 있다", () => {
    assert.match(nextPuzzleTests, /오늘 팩을 소진해도/);
    assert.match(nextPuzzleTests, /olderUncompleted/);
  });

  it("AC-3: 후보가 없을 때 완료 모달과 결과 화면에 기록 fallback CTA가 있다", () => {
    assert.ok(
      (mobileApp.match(/퍼즐 기록 보기/g) ?? []).length >= 4,
      "두 표면의 접근성 라벨과 버튼 문구가 필요하다",
    );
    assert.match(mobileApp, /navigateTo\('history'\)/);
  });

  it("AC-4: Web·RN이 같은 공용 추천 정책을 사용하고 동일 입력 parity를 검증한다", () => {
    assert.match(webApp, /const recommendationPuzzleSummaries/);
    assert.match(webApp, /\.\.\.puzzleSummaries/);
    assert.match(webApp, /getNextRecommendedPuzzleSummary/);
    assert.match(mobileApp, /getNextRecommendedPuzzleSummary/);
    assert.match(surfaceParityTests, /webResult/);
    assert.match(surfaceParityTests, /rnResult/);
    assert.match(
      surfaceParityTests,
      /rnResult\?\.puzzleId, webResult\?\.puzzleId/,
    );
  });

  it("AC-6: release parity가 manifest 후보와 두 fallback 표면을 고정한다", () => {
    assert.match(releaseParity, /recommendationPuzzleSummaries/);
    assert.match(releaseParity, /recommendationFallbackCtaMarkers/);
  });
});
