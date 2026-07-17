import {
  validateGameContentV1,
  type GameContentV1,
} from "../../packages/crossword-core/src/gameContent.ts";
import {
  validateKnowledgeCardCatalogItem,
  type KnowledgeCardCatalogItem,
} from "../../packages/crossword-core/src/gameMetaProgression.ts";
import {
  BUNDLED_ONBOARDING_CONTENT_IDENTITY,
  KO_KR_LAUNCH_CONTENT_CONTRACT,
} from "../../packages/crossword-core/src/launchContentCatalog.ts";
import { koKrLanguageProfile } from "../../packages/crossword-core/src/languageProfile.ts";
import { onboardingPuzzle } from "../data/onboardingPuzzle.ts";

export const BUNDLED_ONBOARDING_CONTENT_CHECKSUM =
  BUNDLED_ONBOARDING_CONTENT_IDENTITY.contentChecksum;
export const BUNDLED_ONBOARDING_KNOWLEDGE_CARD_ID =
  "chapter-01-forgotten-path:card:onboarding-easy-01";

const bundledOnboardingKnowledgeCard = Object.freeze({
  cardId: BUNDLED_ONBOARDING_KNOWLEDGE_CARD_ID,
  contentLocale: KO_KR_LAUNCH_CONTENT_CONTRACT.contentLocale,
  answer: "토끼",
  shortExplanation:
    "귀가 길고 뒷다리가 앞다리보다 발달하였으며 꼬리는 짧은 동물",
  source: "국립국어원 한국어기초사전 XML",
  sourceEntryId: "89388",
  sourceUrl: "https://github.com/spellcheck-ko/korean-dict-nikl-krdict",
  licenseId: "CC-BY-SA-2.0-KR",
  domainTags: Object.freeze(["animal"]),
  reviewerId: "migration/legacy-bundled",
  reviewedAt: "2026-07-17T00:00:00.000Z",
  cardChecksum: "bundled:knowledge-card:onboarding-easy-01:토끼:v1",
}) satisfies KnowledgeCardCatalogItem;

const bundledOnboardingCandidate = {
  schemaVersion: "game-content/1",
  contentLocale: "ko-KR",
  releaseTimeZone: "Asia/Seoul",
  languageProfile: { id: "ko-KR", version: 1 },
  puzzleId: BUNDLED_ONBOARDING_CONTENT_IDENTITY.puzzleId,
  packId: BUNDLED_ONBOARDING_CONTENT_IDENTITY.packId,
  slotId: BUNDLED_ONBOARDING_CONTENT_IDENTITY.slotId,
  grid: onboardingPuzzle.grid,
  entries: onboardingPuzzle.entries.map((entry) => ({
    ...entry,
    answerCells: koKrLanguageProfile.segmentAnswer(entry.answer),
    clueSource: "manual",
    needsManualClue: false as const,
  })),
  difficulty: onboardingPuzzle.difficulty,
  themeId: BUNDLED_ONBOARDING_CONTENT_IDENTITY.themeId,
  chapterId: BUNDLED_ONBOARDING_CONTENT_IDENTITY.chapterId,
  worldTriggerSet: onboardingPuzzle.entries.map((entry, index) => ({
    triggerId: `restore-path-${entry.id}`,
    entryId: entry.id,
    pathOrder: index,
  })),
  generatorCommit: "bundled-hand-authored",
  generatorConfigHash: "onboarding-easy-01-v1",
  contentChecksum: BUNDLED_ONBOARDING_CONTENT_CHECKSUM,
  licenseManifestId: BUNDLED_ONBOARDING_CONTENT_IDENTITY.licenseManifestId,
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
  if (
    onboardingPuzzle.puzzleId !==
      BUNDLED_ONBOARDING_CONTENT_IDENTITY.puzzleId ||
    onboardingPuzzle.date !== BUNDLED_ONBOARDING_CONTENT_IDENTITY.slotId
  ) {
    throw new Error("Bundled onboarding source identity drifted");
  }
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

export function loadBundledOnboardingKnowledgeCard(): KnowledgeCardCatalogItem {
  const card = validateKnowledgeCardCatalogItem(bundledOnboardingKnowledgeCard);
  if (!onboardingPuzzle.entries.some((entry) => entry.answer === card.answer)) {
    throw new Error("Bundled onboarding knowledge card answer drifted");
  }
  return card;
}
