import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  GAME_CONTENT_SCHEMA_VERSION,
  validateGameContentV1,
  type GameContentV1,
} from "./gameContent.ts";

function createFixture(): GameContentV1 {
  return {
    schemaVersion: GAME_CONTENT_SCHEMA_VERSION,
    contentLocale: "ko-KR",
    releaseTimeZone: "Asia/Seoul",
    languageProfile: { id: "ko-KR", version: 1 },
    puzzleId: "ftue-001",
    packId: "ftue-pack-v1",
    slotId: "ftue-01",
    grid: [
      ["가", "나"],
      ["다", ""],
    ],
    entries: [
      {
        id: "a1",
        answer: "가나",
        answerCells: ["가", "나"],
        clue: "fixture clue",
        clueSource: "manual",
        direction: "across",
        row: 0,
        col: 0,
        generatedBy: "placed",
        needsManualClue: false,
      },
      {
        id: "d1",
        answer: "가다",
        answerCells: ["가", "다"],
        clue: "fixture clue 2",
        clueSource: "manual",
        direction: "down",
        row: 0,
        col: 0,
        generatedBy: "placed",
        needsManualClue: false,
      },
    ],
    difficulty: "easy",
    themeId: "alley-words",
    chapterId: "chapter-01",
    worldTriggerSet: [],
    generatorCommit: "0123456789abcdef",
    generatorConfigHash: "config-fixture",
    contentChecksum: "checksum-fixture",
    licenseManifestId: "license-fixture",
    review: {
      reviewerId: "reviewer-fixture",
      reviewedAt: "2026-07-17T00:00:00.000Z",
      manualCoverage: 1,
    },
    minClientVersion: "0.1.0",
  };
}

function validate(value: unknown, requestedContentLocale = "ko-KR") {
  return validateGameContentV1(value, {
    requestedContentLocale,
    verifyChecksum: (content) =>
      content.contentChecksum === "checksum-fixture",
  });
}

describe("game-content/1 fail-closed validator", () => {
  test("검수·locale·profile·grid·checksum이 모두 맞는 pack만 통과한다", () => {
    const result = validate(createFixture());
    assert.equal(result.pass, true);
    assert.equal(result.content?.entries[0].answer, "가나");
  });

  test("answerCells가 answer와 다르면 두 번째 권위값을 허용하지 않는다", () => {
    const fixture = createFixture();
    fixture.entries[0].answerCells = ["가", "다"];
    const result = validate(fixture);

    assert.equal(result.pass, false);
    assert.ok(
      result.issues.some(
        (issue) => issue.code === "answer_projection_mismatch",
      ),
    );
  });

  test("needsManualClue 누락·true를 검수 완료로 해석하지 않는다", () => {
    const fixture = createFixture() as unknown as {
      entries: Array<Record<string, unknown>>;
    };
    delete fixture.entries[0].needsManualClue;
    const result = validate(fixture);

    assert.equal(result.pass, false);
    assert.ok(
      result.issues.some((issue) => issue.code === "manual_review_required"),
    );
  });

  test("요청 locale과 payload locale이 다르면 한국어 pack으로 fallback하지 않는다", () => {
    const result = validate(createFixture(), "future-X");
    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "locale_mismatch"));
  });

  test("checksum verifier가 없거나 실패하면 content를 반환하지 않는다", () => {
    const missing = validateGameContentV1(createFixture(), {
      requestedContentLocale: "ko-KR",
    });
    const mismatch = validateGameContentV1(createFixture(), {
      requestedContentLocale: "ko-KR",
      verifyChecksum: () => false,
    });

    assert.equal(missing.content, null);
    assert.ok(
      missing.issues.some(
        (issue) => issue.code === "checksum_verifier_missing",
      ),
    );
    assert.equal(mismatch.content, null);
    assert.ok(
      mismatch.issues.some((issue) => issue.code === "checksum_mismatch"),
    );
  });

  test("grid 교차 셀과 entry가 어긋나면 차단한다", () => {
    const fixture = createFixture();
    fixture.grid[1][0] = "라";
    const result = validate(fixture);

    assert.equal(result.pass, false);
    assert.ok(
      result.issues.some((issue) => issue.code === "grid_entry_mismatch"),
    );
  });
});
