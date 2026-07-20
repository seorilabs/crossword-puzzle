// 완료 후 다음 퍼즐 추천(난이도 진척) 정책 단위 테스트
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  buildNextPuzzleCtaParams,
  getNextRecommendedPuzzleSummary,
  NEXT_PUZZLE_CTA_EVENT,
} from "./recommendation.ts";
import type { PuzzleManifestItem } from "./types.ts";

function summary(
  puzzleId: string,
  difficulty?: PuzzleManifestItem["difficulty"],
): PuzzleManifestItem {
  return { puzzleId, date: "2026-06-29", path: `/${puzzleId}.json`, difficulty };
}

const SET = (...ids: string[]) => new Set(ids);

describe("getNextRecommendedPuzzleSummary", () => {
  it("현재 퍼즐은 추천하지 않는다", () => {
    const summaries = [summary("p1", "normal"), summary("p2", "normal")];
    const next = getNextRecommendedPuzzleSummary(summaries, SET(), {
      puzzleId: "p1",
      difficulty: "normal",
    });
    assert.equal(next?.puzzleId, "p2");
  });

  it("완료 티어보다 한 단계 위 미완료를 우선 추천한다(난이도 상승)", () => {
    const summaries = [
      summary("easy1", "easy"),
      summary("normal1", "normal"),
      summary("hard1", "hard"),
    ];
    const next = getNextRecommendedPuzzleSummary(summaries, SET(), {
      puzzleId: "cur",
      difficulty: "easy",
    });
    assert.equal(next?.puzzleId, "normal1", "easy 완료 → normal 추천");
  });

  it("한 단계 위가 없거나 모두 완료면 같은 난이도 미완료로 잇는다", () => {
    const summaries = [
      summary("normal1", "normal"),
      summary("normal2", "normal"),
      summary("hard1", "hard"),
    ];
    const next = getNextRecommendedPuzzleSummary(summaries, SET("hard1"), {
      puzzleId: "normal1",
      difficulty: "normal",
    });
    assert.equal(next?.puzzleId, "normal2", "위 티어(hard) 완료됨 → 동일 normal");
  });

  it("최고 난이도(hard) 완료 시 같은 hard 미완료를 추천한다", () => {
    const summaries = [
      summary("hard1", "hard"),
      summary("hard2", "hard"),
      summary("easy1", "easy"),
    ];
    const next = getNextRecommendedPuzzleSummary(summaries, SET(), {
      puzzleId: "hard1",
      difficulty: "hard",
    });
    assert.equal(next?.puzzleId, "hard2");
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
    const summaries = [summary("p1", "easy"), summary("p2", "normal")];
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
    // 완료 티어는 normal인데 후보가 모두 난이도 불명(rank -1)이면, nextTierUp/
    // sameTier 어디에도 매칭되지 않고 미완료 첫 후보로 폴백해야 한다.
    const summaries = [summary("u1"), summary("u2"), summary("u3")];
    const next = getNextRecommendedPuzzleSummary(summaries, SET("u1"), {
      puzzleId: "cur",
      difficulty: "normal",
    });
    assert.equal(next?.puzzleId, "u2", "불명 후보는 진척 매칭 없이 첫 미완료");
  });

  it("최고 티어(hard) 완료 시 난이도 불명 후보를 '한 단계 위'로 오인하지 않는다", () => {
    // hard 완료(rank 2): 한 단계 위는 없다. 난이도 불명 후보(rank -1)가 섞여 있어도
    // 동일 티어(hard) 미완료를 우선 추천해야 한다.
    const summaries = [
      summary("unknown1"),
      summary("hard2", "hard"),
    ];
    const next = getNextRecommendedPuzzleSummary(summaries, SET(), {
      puzzleId: "hard1",
      difficulty: "hard",
    });
    assert.equal(next?.puzzleId, "hard2", "불명 후보가 아닌 동일 hard 우선");
  });

  it("후보가 현재 퍼즐뿐이면 undefined를 반환한다", () => {
    const summaries = [summary("only", "normal")];
    const next = getNextRecommendedPuzzleSummary(summaries, SET(), {
      puzzleId: "only",
      difficulty: "normal",
    });
    assert.equal(next, undefined);
  });

  it("next_puzzle_cta에 result_overlay 진입 경로와 다음 퍼즐 메타를 기록한다(#274)", () => {
    const next = summary("hard1", "hard");

    assert.equal(NEXT_PUZZLE_CTA_EVENT, "next_puzzle_cta");
    assert.deepEqual(buildNextPuzzleCtaParams(next, "result_overlay"), {
      next_difficulty: "hard",
      next_puzzle_id: "hard1",
      source: "result_overlay",
    });
  });

  it("기존 결과 화면 CTA는 source=result_screen으로 구분한다(#274)", () => {
    assert.equal(
      buildNextPuzzleCtaParams(summary("normal2", "normal"), "result_screen")
        .source,
      "result_screen",
    );
  });
});
