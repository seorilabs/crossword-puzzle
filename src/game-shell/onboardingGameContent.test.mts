import assert from "node:assert/strict";
import { test } from "node:test";

import { BUNDLED_ONBOARDING_CONTENT_IDENTITY } from "../../packages/crossword-core/src/launchContentCatalog.ts";
import { getEntryAnswerCells } from "../../packages/crossword-core/src/puzzle.ts";
import { loadBundledOnboardingGameContent } from "./onboardingGameContent.ts";

test("번들 온보딩 콘텐츠는 ko-KR answerCells·수동 단서 계약을 통과한다", () => {
  const content = loadBundledOnboardingGameContent();

  assert.equal(content.schemaVersion, "game-content/1");
  assert.equal(content.contentLocale, "ko-KR");
  assert.deepEqual(
    Object.fromEntries(
      Object.keys(BUNDLED_ONBOARDING_CONTENT_IDENTITY).map((key) => [
        key,
        content[key as keyof typeof content],
      ]),
    ),
    BUNDLED_ONBOARDING_CONTENT_IDENTITY,
  );
  assert.equal(content.entries.length, 6);
  assert.equal(content.review.manualCoverage, 1);
  assert.ok(
    content.entries.every(
      (entry) =>
        entry.needsManualClue === false &&
        entry.clueSource === "manual" &&
        getEntryAnswerCells(entry).length > 0,
    ),
  );
});
