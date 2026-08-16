// 온보딩 난이도 램프(#291) 수락 조건 통합 검증.
// issue #278(bonusPuzzlePanelImpression.test.ts) 관례를 따라 인수조건별로 it("AC-N: …")
// 를 한 파일에 모아, 인수조건↔테스트 대응을 명확히 한다.
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

import {
  DIFFICULTY_PROFILES,
  ONBOARDING_MEDIUM_PROFILE,
  isDifficulty,
} from "./difficultyProfiles.ts";
import {
  ONBOARDING_RAMP_MAX_COMPLETIONS,
  getNextRecommendedPuzzleSummary,
} from "./recommendation.ts";
import {
  defaultLaunchConfig,
  getLaunchConfigDefaultsForRemoteConfig,
  launchConfigKeys,
  normalizeLaunchConfig,
} from "./launchConfig.ts";
import type { PuzzleManifestItem } from "./types.ts";

const remoteConfigTemplate = JSON.parse(
  readFileSync(
    new URL("../../../remoteconfig.template.json", import.meta.url),
    "utf8",
  ),
) as {
  parameters: Record<
    string,
    { defaultValue?: { value?: string }; valueType?: string }
  >;
};

function summary(
  puzzleId: string,
  difficulty: PuzzleManifestItem["difficulty"],
): PuzzleManifestItem {
  return {
    puzzleId,
    date: "2026-06-29",
    path: `/${puzzleId}.json`,
    difficulty,
  };
}

describe("온보딩 난이도 램프 수락 조건 (#291)", () => {
  it("AC-1: difficultyProfiles.ts에 easy와 normal 사이의 중간 프로파일(normal 완화 파라미터 세트)을 추가한다", () => {
    const { easy, normal } = DIFFICULTY_PROFILES;
    const medium = ONBOARDING_MEDIUM_PROFILE;

    // (1) difficultyProfiles.ts에 프로파일이 실제로 추가·export 되었다.
    assert.ok(medium, "ONBOARDING_MEDIUM_PROFILE 이 존재한다");
    // 새 티어(enum)를 만들지 않으려고 difficulty는 normal 유지(파급 0).
    assert.equal(medium.difficulty, "normal");
    assert.equal(isDifficulty("medium"), false);

    // (2) "easy와 normal 사이": 완료 부담(단어 수)이 easy 이상 normal 미만 사이에 위치.
    assert.ok(
      easy.minWordCount < medium.minWordCount &&
        medium.minWordCount < normal.minWordCount,
      `easy(${easy.minWordCount}) < medium(${medium.minWordCount}) < normal(${normal.minWordCount})`,
    );
    assert.ok(
      medium.maxWords >= easy.maxWords && medium.maxWords < normal.maxWords,
    );

    // (3) "normal 완화": 교차율은 normal보다 높거나 같아(단서 연결↑) 체감 난도를 낮춘다.
    // 어휘는 모든 티어가 워드뱅크 전체를 공유하므로, 완화 수단은 단어 수와 교차율뿐이다.
    assert.ok(medium.minCrossRatio >= normal.minCrossRatio);
    assert.equal("wordDifficulties" in medium, false);
  });

  it("AC-2: 배정 로직이 신규 사용자의 easy 완료 직후 완화(중간) 난이도를 제공한다", () => {
    const summaries = [
      summary("onboarding", "easy"),
      summary("easy2", "easy"),
      summary("normal1", "normal"),
    ];
    const current = { puzzleId: "onboarding", difficulty: "easy" as const };
    // 같은 입력에서 램프 off는 normal 급점프, 램프 on은 완화된 easy로 갈린다.
    const off = getNextRecommendedPuzzleSummary(
      summaries,
      new Set(["onboarding"]),
      current,
      { onboardingRampEnabled: false },
    );
    const on = getNextRecommendedPuzzleSummary(
      summaries,
      new Set(["onboarding"]),
      current,
      { onboardingRampEnabled: true },
    );
    assert.equal(off?.difficulty, "normal", "램프 off: 기존 동작(normal 상승)");
    assert.equal(on?.puzzleId, "easy2");
    assert.equal(on?.difficulty, "easy", "램프 on: 완화된 난이도 배정");
  });

  it("AC-3: launchConfig 기본값은 ON이고 명시적 false 킬스위치를 유지한다", () => {
    assert.equal(defaultLaunchConfig.onboardingDifficultyRampEnabled, true);
    assert.equal(
      getLaunchConfigDefaultsForRemoteConfig()[
        launchConfigKeys.onboardingDifficultyRampEnabled
      ],
      true,
    );
    assert.equal(
      launchConfigKeys.onboardingDifficultyRampEnabled,
      "onboarding_difficulty_ramp_enabled",
    );
    assert.equal(
      normalizeLaunchConfig({ onboardingDifficultyRampEnabled: false })
        .onboardingDifficultyRampEnabled,
      false,
    );
    assert.equal(
      normalizeLaunchConfig({}).onboardingDifficultyRampEnabled,
      true,
    );
    assert.deepEqual(
      remoteConfigTemplate.parameters.onboarding_difficulty_ramp_enabled,
      {
        defaultValue: { value: "true" },
        description:
          "기완료 퍼즐이 없는 사용자의 첫 easy 완료 후 easy 1판을 추가 추천한다. 회귀 시 false로 기존 추천을 복원한다",
        valueType: "BOOLEAN",
      },
    );
  });

  it("AC-4: 기존 난이도 테스트(difficultyProfiles.test.mts, difficultyRotation.test.ts)를 갱신하고 신규 케이스를 추가한다", () => {
    // (직접 검증) AC-4가 명시한 두 기존 난이도 테스트 파일이 이번 변경(#291)의 신규
    // 케이스로 실제 갱신됐는지 파일 내용을 읽어 확인한다(실행 경로: readFileSync).
    // 이 케이스들이 제거되면 이 테스트가 실패해 AC-4 커버리지 회귀를 막는다.
    const profilesTest = readFileSync(
      new URL("./difficultyProfiles.test.mts", import.meta.url),
      "utf8",
    );
    const rotationTest = readFileSync(
      new URL("./difficultyRotation.test.ts", import.meta.url),
      "utf8",
    );
    assert.match(
      profilesTest,
      /온보딩 중간 난이도 프로파일 수락 조건 \(#291\)/,
      "difficultyProfiles.test.mts 에 #291 신규 케이스가 있어야 한다",
    );
    assert.match(
      rotationTest,
      /발행 로테이션은 온보딩 램프와 무관하다 \(#291\)/,
      "difficultyRotation.test.ts 에 #291 신규 케이스가 있어야 한다",
    );

    // (실행 경로) 갱신한 난이도 추천 동작의 신규 경계 케이스들을 함께 검증한다.
    const summaries = [
      summary("onboarding", "easy"),
      summary("easy2", "easy"),
      summary("normal1", "normal"),
    ];
    const current = { puzzleId: "onboarding", difficulty: "easy" as const };

    // 신규 케이스 1(실행 경로): 명시적 false 킬스위치는 기존 난이도 상승을 유지한다.
    const rampOff = getNextRecommendedPuzzleSummary(
      summaries,
      new Set(["onboarding"]),
      current,
      { onboardingRampEnabled: false },
    );
    assert.equal(rampOff?.difficulty, "normal");

    // 신규 케이스 2(실행 경로): 두 번째 완료(현재 제외 기완료 1 > 상한 0)부터는 완화하지
    // 않고 기존 normal 상승으로 돌아간다 — 첫 급점프만 1회 늦춘다.
    const secondCompletion = getNextRecommendedPuzzleSummary(
      summaries,
      new Set(["easy2", "onboarding"]),
      current,
      { onboardingRampEnabled: true },
    );
    assert.equal(secondCompletion?.difficulty, "normal");
    assert.equal(ONBOARDING_RAMP_MAX_COMPLETIONS, 0);

    // 신규 케이스 3(실행 경로): 램프가 켜져도 남은 easy가 없으면 기존 상승(normal)으로
    // 안전하게 폴백한다.
    const noEasyLeft = getNextRecommendedPuzzleSummary(
      [summary("onboarding", "easy"), summary("normal1", "normal")],
      new Set(["onboarding"]),
      current,
      { onboardingRampEnabled: true },
    );
    assert.equal(noEasyLeft?.difficulty, "normal");

    // 신규 케이스 4(실행 경로): 첫 후속으로 hard만 남으면 CTA를 숨긴다.
    const hardOnly = getNextRecommendedPuzzleSummary(
      [summary("onboarding", "easy"), summary("hard1", "hard")],
      new Set(["onboarding"]),
      current,
      { onboardingRampEnabled: true },
    );
    assert.equal(hardOnly, undefined);
  });
});
