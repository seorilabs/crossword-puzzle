import assert from "node:assert/strict";
import { test } from "node:test";

import { verifyGameContentChecksum } from "../../packages/crossword-core/src/gameContent.ts";
import {
  BUNDLED_FIRST_RUN_CONTENT_IDENTITIES,
  BUNDLED_ONBOARDING_CONTENT_IDENTITY,
  KO_KR_LAUNCH_CONTENT_CONTRACT,
} from "../../packages/crossword-core/src/launchContentCatalog.ts";
import { getEntryAnswerCells } from "../../packages/crossword-core/src/puzzle.ts";
import {
  BUNDLED_ONBOARDING_KNOWLEDGE_CARD_ID,
  loadBundledFirstRunGameContents,
  loadBundledOnboardingGameContent,
  loadBundledOnboardingKnowledgeCard,
} from "./onboardingGameContent.ts";

test("실제 번들 첫 실행 3보드는 ko-KR answerCells·수동 단서 계약을 통과한다", () => {
  const contents = loadBundledFirstRunGameContents();
  const content = loadBundledOnboardingGameContent();

  assert.equal(
    contents.length,
    KO_KR_LAUNCH_CONTENT_CONTRACT.routeCounts["first-run"],
  );
  assert.deepEqual(
    contents.map((candidate) => candidate.puzzleId),
    BUNDLED_FIRST_RUN_CONTENT_IDENTITIES.map((identity) => identity.puzzleId),
  );
  assert.equal(content.schemaVersion, "game-content/1");
  assert.equal(content.contentLocale, "ko-KR");
  assert.equal(content.puzzleId, BUNDLED_ONBOARDING_CONTENT_IDENTITY.puzzleId);
  assert.equal(content.packId, BUNDLED_ONBOARDING_CONTENT_IDENTITY.packId);
  assert.equal(content.slotId, BUNDLED_ONBOARDING_CONTENT_IDENTITY.slotId);
  assert.equal(content.themeId, BUNDLED_ONBOARDING_CONTENT_IDENTITY.themeId);
  assert.equal(
    content.chapterId,
    BUNDLED_ONBOARDING_CONTENT_IDENTITY.chapterId,
  );
  assert.equal(
    content.contentChecksum,
    BUNDLED_ONBOARDING_CONTENT_IDENTITY.contentChecksum,
  );
  assert.equal(content.entries.length, 6);
  assert.ok(
    contents.every(
      (candidate) =>
        candidate.review.manualCoverage === 1 &&
        candidate.difficulty === "easy" &&
        candidate.entries.length >= 4 &&
        candidate.entries.length <= 6 &&
        candidate.entries.every(
          (entry) =>
            entry.needsManualClue === false &&
            entry.clueSource === "repo-authored-reviewed" &&
            entry.sourceEntryId.startsWith(`repo:${candidate.puzzleId}:`) &&
            entry.licenseId === "LicenseRef-Seorilabs-First-Run-Content" &&
            entry.domainTags.length > 0 &&
            getEntryAnswerCells(entry).length > 0,
        ),
    ),
  );
  assert.ok(contents.every(verifyGameContentChecksum));

  const card = loadBundledOnboardingKnowledgeCard();
  assert.equal(card.cardId, BUNDLED_ONBOARDING_KNOWLEDGE_CARD_ID);
  assert.ok(content.entries.some((entry) => entry.answer === card.answer));
  assert.equal(card.sourceEntryId, "89388");
  assert.equal(card.licenseId, "CC-BY-SA-2.0-KR");
  assert.match(card.sourceUrl, /^https:\/\//);
});
