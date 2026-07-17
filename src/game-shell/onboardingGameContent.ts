import {
  validateGameContentV1,
  type GameContentV1,
} from "../../packages/crossword-core/src/gameContent.ts";
import { koKrLanguageProfile } from "../../packages/crossword-core/src/languageProfile.ts";
import { onboardingPuzzle } from "../data/onboardingPuzzle.ts";

export const BUNDLED_ONBOARDING_CONTENT_CHECKSUM =
  "bundled:onboarding-easy-01:ko-KR:v1";

const bundledOnboardingCandidate = {
  schemaVersion: "game-content/1",
  contentLocale: "ko-KR",
  releaseTimeZone: "Asia/Seoul",
  languageProfile: { id: "ko-KR", version: 1 },
  puzzleId: onboardingPuzzle.puzzleId,
  packId: "bundled-game-onboarding-v1",
  slotId: onboardingPuzzle.date,
  grid: onboardingPuzzle.grid,
  entries: onboardingPuzzle.entries.map((entry) => ({
    ...entry,
    answerCells: koKrLanguageProfile.segmentAnswer(entry.answer),
    clueSource: "manual",
    needsManualClue: false as const,
  })),
  difficulty: onboardingPuzzle.difficulty,
  themeId: "memory-garden",
  chapterId: "chapter-01-forgotten-path",
  worldTriggerSet: onboardingPuzzle.entries.map((entry, index) => ({
    triggerId: `restore-path-${entry.id}`,
    entryId: entry.id,
    pathOrder: index,
  })),
  generatorCommit: "bundled-hand-authored",
  generatorConfigHash: "onboarding-easy-01-v1",
  contentChecksum: BUNDLED_ONBOARDING_CONTENT_CHECKSUM,
  licenseManifestId: "repo-owned-bundled-content-v1",
  review: {
    reviewerId: "migration/legacy-bundled",
    reviewedAt: "2026-07-17T00:00:00.000Z",
    manualCoverage: 1,
  },
  minClientVersion: "0.1.0",
} satisfies GameContentV1;

/**
 * The candidate still goes through the same fail-closed validator as remote
 * packs. Its expected checksum lives in the signed application bundle rather
 * than in the content payload itself.
 */
export function loadBundledOnboardingGameContent(): GameContentV1 {
  const result = validateGameContentV1(bundledOnboardingCandidate, {
    requestedContentLocale: "ko-KR",
    verifyChecksum: (content) =>
      content.contentChecksum === BUNDLED_ONBOARDING_CONTENT_CHECKSUM,
  });

  if (!result.pass || result.content == null) {
    const issueSummary = result.issues
      .map((issue) => `${issue.code}:${issue.path}`)
      .join(",");
    throw new Error(`Bundled onboarding content rejected: ${issueSummary}`);
  }

  return result.content;
}
