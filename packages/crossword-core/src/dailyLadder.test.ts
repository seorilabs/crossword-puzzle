import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  DAILY_LADDER_ALL_DONE_LABEL,
  DAILY_LADDER_UNAVAILABLE_LABEL,
  buildDailyLadder,
  buildDailyLadderCtaParams,
  formatDailyLadderNextLabel,
  formatDailyLadderStepLabel,
  getDailyLadderCtaSource,
} from "./dailyLadder.ts";
import { DIFFICULTY_PROFILES } from "./difficultyProfiles.ts";
import type { PuzzleManifestItem } from "./types.ts";

function summary(
  puzzleId: string,
  difficulty: PuzzleManifestItem["difficulty"],
  date = "2026-09-07",
): PuzzleManifestItem {
  return { puzzleId, difficulty, date, path: `/puzzles/${puzzleId}.json` };
}

const easy = summary("26090700", "easy");
const hard = summary("26090701", "hard");
const options = { dailyAttemptLimit: 3 };

describe("buildDailyLadder", () => {
  it("입력 순서와 무관하게 easy → hard 순서로 두 단계를 만든다", () => {
    const ladder = buildDailyLadder([hard, easy], {}, options);
    assert.deepEqual(
      ladder.steps.map((step) => [step.step, step.difficulty, step.puzzleId]),
      [
        [1, "easy", easy.puzzleId],
        [2, "hard", hard.puzzleId],
      ],
    );
    assert.equal(ladder.steps[0].title, "워밍업");
    assert.equal(ladder.steps[1].title, "오늘의 퍼즐");
  });

  it("레거시 normal 과 중복 난이도는 무시한다", () => {
    const ladder = buildDailyLadder(
      [
        summary("legacy", "normal" as PuzzleManifestItem["difficulty"]),
        easy,
        summary("easy-dup", "easy"),
        hard,
      ],
      {},
      options,
    );
    assert.deepEqual(
      ladder.steps.map((step) => step.puzzleId),
      [easy.puzzleId, hard.puzzleId],
    );
  });

  it("카드 상태를 new/in_progress/exhausted/done 으로 판정한다", () => {
    const ladder = buildDailyLadder([easy, hard], {}, options);
    assert.deepEqual(
      ladder.steps.map((step) => [step.status, step.statusLabel]),
      [
        ["new", "새 퍼즐"],
        ["new", "새 퍼즐"],
      ],
    );

    const inProgress = buildDailyLadder(
      [easy, hard],
      { [easy.puzzleId]: { hasProgress: true, attemptsUsed: 1 } },
      options,
    );
    assert.equal(inProgress.steps[0].status, "in_progress");
    assert.equal(inProgress.steps[0].statusLabel, "이어 풀기");

    const exhausted = buildDailyLadder(
      [easy, hard],
      { [easy.puzzleId]: { hasProgress: true, attemptsUsed: 3 } },
      options,
    );
    assert.equal(exhausted.steps[0].status, "exhausted");
    assert.equal(exhausted.steps[0].statusLabel, "도전 종료");

    const done = buildDailyLadder(
      [easy, hard],
      {
        [easy.puzzleId]: {
          hasProgress: true,
          attemptsUsed: 3,
          completedAt: "2026-09-07T01:00:00.000Z",
        },
      },
      options,
    );
    assert.equal(done.steps[0].status, "done");
    assert.equal(done.completedCount, 1);
  });

  it("CTA는 첫 미완료 단계를 가리키고 라벨을 시작/이어 풀기로 나눈다", () => {
    const fresh = buildDailyLadder([easy, hard], {}, options);
    assert.equal(fresh.cta.kind, "start");
    assert.equal(fresh.cta.label, "워밍업 시작");
    assert.equal(
      fresh.cta.kind === "start" ? fresh.cta.source : null,
      "ladder_step_1",
    );

    const resume = buildDailyLadder(
      [easy, hard],
      { [hard.puzzleId]: { hasProgress: true, attemptsUsed: 1 } },
      options,
    );
    // 1단계가 새 퍼즐이면 진행 중인 2단계보다 1단계를 먼저 권한다.
    assert.equal(resume.cta.label, "워밍업 시작");

    const easyDone = buildDailyLadder(
      [easy, hard],
      {
        [easy.puzzleId]: { completedAt: "2026-09-07T01:00:00.000Z" },
        [hard.puzzleId]: { hasProgress: true, attemptsUsed: 1 },
      },
      options,
    );
    assert.equal(easyDone.cta.kind, "resume");
    assert.equal(easyDone.cta.label, "오늘의 퍼즐 이어 풀기");
    assert.equal(
      easyDone.cta.kind === "resume" ? easyDone.cta.source : null,
      "ladder_step_2",
    );
  });

  it("1단계가 도전 종료면 2단계로 넘어가고, 모두 끝나면 내일 다시 상태다", () => {
    const skipExhausted = buildDailyLadder(
      [easy, hard],
      { [easy.puzzleId]: { hasProgress: true, attemptsUsed: 3 } },
      options,
    );
    assert.equal(skipExhausted.cta.label, "오늘의 퍼즐 시작");

    const allDone = buildDailyLadder(
      [easy, hard],
      {
        [easy.puzzleId]: { completedAt: "2026-09-07T01:00:00.000Z" },
        [hard.puzzleId]: { hasProgress: true, attemptsUsed: 3 },
      },
      options,
    );
    assert.equal(allDone.cta.kind, "all_done");
    assert.equal(allDone.cta.label, DAILY_LADDER_ALL_DONE_LABEL);
  });

  it("easy만 발행된 날은 한 단계, 오늘 퍼즐이 없으면 준비 중 상태다", () => {
    const single = buildDailyLadder([easy], {}, options);
    assert.equal(single.steps.length, 1);
    assert.equal(single.cta.label, "워밍업 시작");

    const empty = buildDailyLadder([], {}, options);
    assert.equal(empty.steps.length, 0);
    assert.equal(empty.cta.kind, "unavailable");
    assert.equal(empty.cta.label, DAILY_LADDER_UNAVAILABLE_LABEL);
  });
});

describe("사다리 라벨·이벤트 파라미터", () => {
  it("단계 라벨은 프로파일의 보드 크기를 쓴다", () => {
    assert.equal(
      formatDailyLadderStepLabel("easy"),
      `워밍업 · ${DIFFICULTY_PROFILES.easy.boardSize}×${DIFFICULTY_PROFILES.easy.boardSize}`,
    );
    assert.equal(formatDailyLadderStepLabel("hard"), "오늘의 퍼즐 · 8×8");
  });

  it("home_quick_start 파라미터에 단계·난이도·상태를 싣는다", () => {
    const ladder = buildDailyLadder([easy, hard], {}, options);
    assert.deepEqual(buildDailyLadderCtaParams(ladder.steps[1]), {
      source: "ladder_step_2",
      difficulty: "hard",
      ladder_step: 2,
      step_status: "new",
    });
    assert.equal(getDailyLadderCtaSource({ step: 1 }), "ladder_step_1");
  });

  it("다음 퍼즐 문구는 같은 날짜 사다리 단계에만 단계 이름을 쓴다", () => {
    assert.equal(
      formatDailyLadderNextLabel(hard, "2026-09-07"),
      "오늘의 퍼즐 이어서 풀기",
    );
    assert.equal(
      formatDailyLadderNextLabel(easy, "2026-09-07"),
      "워밍업 퍼즐 풀기",
    );
    assert.equal(
      formatDailyLadderNextLabel(summary("old", "hard", "2026-09-01"), "2026-09-07"),
      "다음 퍼즐 풀기",
    );
    assert.equal(formatDailyLadderNextLabel(hard), "오늘의 퍼즐 이어서 풀기");
  });
});
