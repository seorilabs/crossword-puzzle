// 완료 후 다음 퍼즐 추천(난이도 진척) 정책 단위 테스트
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  ONBOARDING_RAMP_MAX_COMPLETIONS,
  getNextRecommendedPuzzleSummary,
} from "./recommendation.ts";
import type { PuzzleManifestItem } from "./types.ts";

function summary(
  puzzleId: string,
  difficulty?: PuzzleManifestItem["difficulty"],
  date = "2026-06-29",
): PuzzleManifestItem {
  return {
    puzzleId,
    date,
    path: `/${puzzleId}.json`,
    difficulty,
  };
}

// 온보딩 퍼즐은 번들 상수라 발행 날짜가 없다(고정 날짜). 같은 날짜 사다리 규칙이
// 온보딩 완료에 끼어들지 않도록 실제 값과 같은 모양으로 둔다.
const ONBOARDING_DATE = "2026-01-01";

const SET = (...ids: string[]) => new Set(ids);

describe("getNextRecommendedPuzzleSummary", () => {
  it("현재 퍼즐은 추천하지 않는다", () => {
    const summaries = [summary("p1", "hard"), summary("p2", "hard")];
    const next = getNextRecommendedPuzzleSummary(summaries, SET(), {
      puzzleId: "p1",
      difficulty: "hard",
    });
    assert.equal(next?.puzzleId, "p2");
  });

  it("완료 티어보다 한 단계 위 미완료를 우선 추천한다(난이도 상승)", () => {
    const summaries = [summary("easy1", "easy"), summary("hard1", "hard")];
    const next = getNextRecommendedPuzzleSummary(summaries, SET(), {
      puzzleId: "cur",
      difficulty: "easy",
    });
    assert.equal(next?.puzzleId, "hard1", "easy 완료 → hard 추천");
  });

  it("한 단계 위가 없거나 모두 완료면 같은 난이도 미완료로 잇는다", () => {
    const summaries = [
      summary("easy1", "easy"),
      summary("easy2", "easy"),
      summary("hard1", "hard"),
    ];
    const next = getNextRecommendedPuzzleSummary(summaries, SET("hard1"), {
      puzzleId: "easy1",
      difficulty: "easy",
    });
    assert.equal(next?.puzzleId, "easy2", "위 티어(hard) 완료됨 → 동일 easy");
  });

  it("최고 난이도(hard) 완료 시 같은 날짜의 easy가 남았으면 easy로, 없으면 같은 hard 미완료를 추천한다", () => {
    const summaries = [
      summary("hard1", "hard"),
      summary("hard2", "hard"),
      summary("easy1", "easy"),
    ];
    const withEasyLeft = getNextRecommendedPuzzleSummary(summaries, SET(), {
      puzzleId: "hard1",
      difficulty: "hard",
    });
    assert.equal(withEasyLeft?.puzzleId, "easy1", "오늘의 사다리 1단계가 남았다");

    const easyDone = getNextRecommendedPuzzleSummary(summaries, SET("easy1"), {
      puzzleId: "hard1",
      difficulty: "hard",
    });
    assert.equal(easyDone?.puzzleId, "hard2");
  });

  it("같은 날짜의 워밍업(easy) 완료 후에는 오늘의 퍼즐(hard)을 사다리 순서로 잇는다", () => {
    const summaries = [
      summary("old-hard", "hard", "2026-06-28"),
      summary("today-easy", "easy"),
      summary("today-hard", "hard"),
    ];
    const next = getNextRecommendedPuzzleSummary(summaries, SET("today-easy"), {
      puzzleId: "today-easy",
      difficulty: "easy",
      date: "2026-06-29",
    });
    assert.equal(next?.puzzleId, "today-hard");
  });

  it("램프가 켜져 있어도 온보딩 퍼즐이 아니면(RN daily easy) 오늘의 hard로 잇는다", () => {
    const summaries = [summary("today-easy", "easy"), summary("today-hard", "hard")];
    const next = getNextRecommendedPuzzleSummary(
      summaries,
      SET("today-easy"),
      { puzzleId: "today-easy", difficulty: "easy" },
      { onboardingRampEnabled: true },
    );
    assert.equal(next?.puzzleId, "today-hard");
  });

  it("위·동일 티어 미완료가 없으면 그 외 미완료로 폴백한다", () => {
    const summaries = [summary("easy1", "easy"), summary("easy2", "easy")];
    const next = getNextRecommendedPuzzleSummary(summaries, SET("easy1"), {
      puzzleId: "hard1",
      difficulty: "hard",
    });
    assert.equal(next?.puzzleId, "easy2", "하위 난이도라도 미완료를 잇는다");
  });

  it("모든 후보를 완료했으면 undefined를 반환해 홈·보너스 fallback을 허용한다(#274)", () => {
    const summaries = [summary("p1", "easy"), summary("p2", "hard")];
    const next = getNextRecommendedPuzzleSummary(summaries, SET("p1", "p2"), {
      puzzleId: "p1",
      difficulty: "easy",
    });
    assert.equal(next, undefined);
  });

  it("난이도 불명이면 기존 동작(미완료 우선)을 유지한다", () => {
    const summaries = [summary("p1"), summary("p2"), summary("p3")];
    const next = getNextRecommendedPuzzleSummary(summaries, SET("p2"), {
      puzzleId: "p1",
    });
    assert.equal(next?.puzzleId, "p3", "p2는 완료 → 첫 미완료 p3");
  });

  it("난이도 불명 후보가 다수여도 진척 분기에 매칭되지 않고 첫 미완료를 반환한다", () => {
    // 완료 티어는 hard인데 후보가 모두 난이도 불명(rank -1)이면, nextTierUp/
    // sameTier 어디에도 매칭되지 않고 미완료 첫 후보로 폴백해야 한다.
    const summaries = [summary("u1"), summary("u2"), summary("u3")];
    const next = getNextRecommendedPuzzleSummary(summaries, SET("u1"), {
      puzzleId: "cur",
      difficulty: "hard",
    });
    assert.equal(next?.puzzleId, "u2", "불명 후보는 진척 매칭 없이 첫 미완료");
  });

  it("최고 티어(hard) 완료 시 난이도 불명 후보를 '한 단계 위'로 오인하지 않는다", () => {
    // hard 완료(rank 2): 한 단계 위는 없다. 난이도 불명 후보(rank -1)가 섞여 있어도
    // 동일 티어(hard) 미완료를 우선 추천해야 한다.
    const summaries = [summary("unknown1"), summary("hard2", "hard")];
    const next = getNextRecommendedPuzzleSummary(summaries, SET(), {
      puzzleId: "hard1",
      difficulty: "hard",
    });
    assert.equal(next?.puzzleId, "hard2", "불명 후보가 아닌 동일 hard 우선");
  });

  it("후보가 현재 퍼즐뿐이면 undefined를 반환한다", () => {
    const summaries = [summary("only", "hard")];
    const next = getNextRecommendedPuzzleSummary(summaries, SET(), {
      puzzleId: "only",
      difficulty: "hard",
    });
    assert.equal(next, undefined);
  });
});

// 온보딩 난이도 램프 배정 수락 조건(#291). it 이름의 AC-N 은 이슈 인수조건 번호와 대응.
describe("온보딩 난이도 램프 배정 수락 조건 (#291)", () => {
  const summaries = [
    summary("onboarding", "easy", ONBOARDING_DATE),
    summary("easy2", "easy"),
    summary("hard1", "hard"),
  ];
  const rampOn = { onboardingRampEnabled: true, onboardingPuzzleId: "onboarding" };

  it("AC-2: 램프 on + 신규(첫 완료)면 easy 완료 직후 hard 대신 완화(남은 easy)를 배정한다", () => {
    const current = { puzzleId: "onboarding", difficulty: "easy" as const };
    // 같은 입력에서 램프 off는 hard(급점프), 램프 on은 easy(완화)로 갈린다.
    const off = getNextRecommendedPuzzleSummary(
      summaries,
      SET("onboarding"),
      current,
      { onboardingRampEnabled: false },
    );
    const next = getNextRecommendedPuzzleSummary(
      summaries,
      SET("onboarding"),
      current,
      rampOn,
    );
    assert.equal(off?.difficulty, "hard", "램프 off: 기존 급점프");
    assert.equal(next?.puzzleId, "easy2", "easy→easy로 절벽 완화");
    assert.equal(next?.difficulty, "easy", "램프 on: 더 낮은 난이도로 배정");
  });

  it("AC-3: 램프를 명시적으로 끄면 easy 완료 → hard 기존 동작을 유지한다", () => {
    // Remote Config 명시적 false 킬스위치가 기존 추천 정책을 복원한다.
    const next = getNextRecommendedPuzzleSummary(
      summaries,
      SET("onboarding"),
      { puzzleId: "onboarding", difficulty: "easy" },
      { onboardingRampEnabled: false },
    );
    assert.equal(next?.puzzleId, "hard1");
  });

  it("AC-4: 상한 상수는 0(첫 완료에서만 완화)이다", () => {
    assert.equal(ONBOARDING_RAMP_MAX_COMPLETIONS, 0);
  });

  it("완료 집합에 현재 퍼즐이 없어도(렌더 타이밍) 첫 완료로 보고 완화한다", () => {
    const next = getNextRecommendedPuzzleSummary(
      summaries,
      SET(),
      { puzzleId: "onboarding", difficulty: "easy" },
      rampOn,
    );
    assert.equal(next?.puzzleId, "easy2");
  });

  it("두 번째 완료(현재 제외 기완료>상한)부터는 완화하지 않고 normal로 상승한다", () => {
    // easy2 를 이미 완료한 상태에서 다시 easy 완료 → 기완료(현재 제외) 1 > 0
    const next = getNextRecommendedPuzzleSummary(
      summaries,
      SET("easy2", "onboarding"),
      { puzzleId: "onboarding", difficulty: "easy" },
      rampOn,
    );
    assert.equal(next?.puzzleId, "hard1", "급점프 완화는 첫 완료 1회뿐");
  });

  it("램프 on인데 남은 easy가 없으면 추천을 숨긴다(hard 급점프 방지)", () => {
    const next = getNextRecommendedPuzzleSummary(
      [summary("onboarding", "easy", ONBOARDING_DATE), summary("hard1", "hard")],
      SET("onboarding"),
      { puzzleId: "onboarding", difficulty: "easy" },
      rampOn,
    );
    assert.equal(next, undefined);
  });

  it("첫 후속 후보가 hard뿐이면 추천을 숨긴다", () => {
    const next = getNextRecommendedPuzzleSummary(
      [summary("onboarding", "easy", ONBOARDING_DATE), summary("hard1", "hard")],
      SET("onboarding"),
      { puzzleId: "onboarding", difficulty: "easy" },
      rampOn,
    );
    assert.equal(next, undefined);
  });

  it("현재가 easy가 아니면(예: hard 완료) 램프가 개입하지 않는다", () => {
    const next = getNextRecommendedPuzzleSummary(
      [summary("hard1", "hard"), summary("hard2", "hard")],
      SET(),
      { puzzleId: "cur", difficulty: "hard" },
      rampOn,
    );
    assert.equal(next?.puzzleId, "hard1", "동일 hard 티어 연결 유지");
  });
});
