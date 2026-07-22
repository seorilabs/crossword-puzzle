// 온보딩 난이도 램프(#291) 수락 조건 통합 검증.
// issue #278(bonusPuzzlePanelImpression.test.ts) 관례를 따라 인수조건별로 it("AC-N: …")
// 를 한 파일에 모아, 인수조건↔테스트 대응을 명확히 한다.
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  DIFFICULTY_PROFILES,
  ONBOARDING_MEDIUM_PROFILE,
  filterWordsByDifficulty,
  isDifficulty,
  selectWordsForProfile,
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

function summary(
  puzzleId: string,
  difficulty: PuzzleManifestItem["difficulty"],
): PuzzleManifestItem {
  return { puzzleId, date: "2026-06-29", path: `/${puzzleId}.json`, difficulty };
}

describe("온보딩 난이도 램프 수락 조건 (#291)", () => {
  it("AC-1: difficultyProfiles에 easy와 normal 사이의 완화 normal 파라미터 세트를 추가한다", () => {
    const { easy, normal } = DIFFICULTY_PROFILES;
    const medium = ONBOARDING_MEDIUM_PROFILE;
    // 새 티어(enum)를 만들지 않으려고 difficulty는 normal 유지(파급 0).
    assert.equal(medium.difficulty, "normal");
    assert.equal(isDifficulty("medium"), false);
    // 단어 수는 easy와 normal 사이(완료 부담↓), 교차율은 easy 수준(단서 연결 쉬움).
    assert.ok(
      easy.minWordCount < medium.minWordCount &&
        medium.minWordCount < normal.minWordCount,
    );
    assert.ok(medium.maxWords < normal.maxWords);
    assert.ok(medium.minCrossRatio >= normal.minCrossRatio);
    assert.deepEqual([...medium.wordDifficulties], ["easy", "normal"]);

    // 실행 경로: 실제 생성 파이프라인 함수(filterWordsByDifficulty)에 중간 프로파일을
    // 넣으면 easy·normal 어휘만 남고 hard(고급) 어휘는 배제된다 — easy와 normal 사이의
    // 완화 프로파일로 동작함을 확인한다.
    const words = [
      { answer: "가게", difficulty: "easy" },
      { answer: "평면", difficulty: "normal" },
      { answer: "정정", difficulty: "hard" },
    ];
    const filtered = filterWordsByDifficulty(words, medium).map((w) => w.answer);
    assert.deepEqual(filtered, ["가게", "평면"]);
    // 실행 경로: 생성 단어 선택도 easy/normal 로 구성되고 hard 는 편향에서 빠진다.
    const selection = selectWordsForProfile(words, medium, 0);
    assert.equal(selection.difficulties.includes("hard"), false);
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

  it("AC-3: launchConfig 플래그로 on/off 가능하고 기본값은 기존 동작 유지(false)다", () => {
    assert.equal(defaultLaunchConfig.onboardingDifficultyRampEnabled, false);
    assert.equal(
      getLaunchConfigDefaultsForRemoteConfig()[
        launchConfigKeys.onboardingDifficultyRampEnabled
      ],
      false,
    );
    assert.equal(
      launchConfigKeys.onboardingDifficultyRampEnabled,
      "onboarding_difficulty_ramp_enabled",
    );
    assert.equal(
      normalizeLaunchConfig({ onboardingDifficultyRampEnabled: true })
        .onboardingDifficultyRampEnabled,
      true,
    );
    assert.equal(
      normalizeLaunchConfig({}).onboardingDifficultyRampEnabled,
      false,
    );
  });

  it("AC-4: 난이도 배정에 신규 케이스(램프 경계 회귀 가드)를 추가한다", () => {
    const summaries = [
      summary("onboarding", "easy"),
      summary("easy2", "easy"),
      summary("normal1", "normal"),
    ];
    const current = { puzzleId: "onboarding", difficulty: "easy" as const };
    // 신규 케이스 1(실행 경로): 두 번째 완료(현재 제외 기완료 1 > 상한 0)부터는 완화하지
    // 않고 기존 normal 상승으로 돌아간다 — 첫 급점프만 1회 늦춘다는 회귀 가드.
    const secondCompletion = getNextRecommendedPuzzleSummary(
      summaries,
      new Set(["easy2", "onboarding"]),
      current,
      { onboardingRampEnabled: true },
    );
    assert.equal(secondCompletion?.difficulty, "normal");
    assert.equal(ONBOARDING_RAMP_MAX_COMPLETIONS, 0);

    // 신규 케이스 2(실행 경로): 램프가 켜져도 남은 easy가 없으면 기존 상승(normal)으로
    // 안전하게 폴백한다.
    const noEasyLeft = getNextRecommendedPuzzleSummary(
      [summary("onboarding", "easy"), summary("normal1", "normal")],
      new Set(["onboarding"]),
      current,
      { onboardingRampEnabled: true },
    );
    assert.equal(noEasyLeft?.difficulty, "normal");
  });
});
