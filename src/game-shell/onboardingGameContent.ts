import {
  calculateGameContentChecksum,
  validateGameContentV1,
  verifyGameContentChecksum,
  type GameContentV1,
} from "../../packages/crossword-core/src/gameContent.ts";
import {
  validateKnowledgeCardCatalogItem,
  type KnowledgeCardCatalogItem,
} from "../../packages/crossword-core/src/gameMetaProgression.ts";
import {
  BUNDLED_FIRST_RUN_CONTENT_IDENTITIES,
  BUNDLED_FIRST_RUN_MAP_NODE_IDS,
  BUNDLED_ONBOARDING_CONTENT_IDENTITY,
  KO_KR_LAUNCH_CONTENT_CONTRACT,
} from "../../packages/crossword-core/src/launchContentCatalog.ts";
import { koKrLanguageProfile } from "../../packages/crossword-core/src/languageProfile.ts";
import type { Puzzle } from "../../packages/crossword-core/src/types.ts";
import { firstRunPuzzles } from "../data/onboardingPuzzle.ts";

export const BUNDLED_ONBOARDING_CONTENT_CHECKSUM =
  BUNDLED_ONBOARDING_CONTENT_IDENTITY.contentChecksum;
export const BUNDLED_ONBOARDING_KNOWLEDGE_CARD_ID =
  "chapter-01-forgotten-path:card:onboarding-easy-01";
const FIRST_RUN_SOURCE_COMMIT = "70835adbd2e3cea298e9023f4d061dd3ee84b987";
const FIRST_RUN_SOURCE_FILE_SHA256 =
  "sha256:e121052048ed27db79a3c3ce3721095984b9ba9c1e4bb6613d71b8bf7bc31f60";

type BundledFirstRunCatalogIdentity =
  (typeof BUNDLED_FIRST_RUN_CONTENT_IDENTITIES)[number];
export type BundledFirstRunContentIdentity = BundledFirstRunCatalogIdentity &
  Readonly<{ mapNodeId: string }>;

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

function createBundledFirstRunCandidate(
  puzzle: Puzzle,
  identity: BundledFirstRunCatalogIdentity,
): GameContentV1 {
  const unsealedContent: GameContentV1 = {
    schemaVersion: "game-content/1",
    contentLocale: KO_KR_LAUNCH_CONTENT_CONTRACT.contentLocale,
    releaseTimeZone: KO_KR_LAUNCH_CONTENT_CONTRACT.releaseTimeZone,
    languageProfile: KO_KR_LAUNCH_CONTENT_CONTRACT.languageProfile,
    puzzleId: identity.puzzleId,
    packId: identity.packId,
    slotId: identity.slotId,
    grid: puzzle.grid.map((row) => [...row]),
    entries: puzzle.entries.map((entry) => ({
      ...entry,
      answerCells: koKrLanguageProfile.segmentAnswer(entry.answer),
      clueSource: "repo-authored-reviewed",
      needsManualClue: false as const,
      shortExplanation: entry.clue,
      source: "Seorilabs crossword-puzzle first-run content",
      sourceEntryId: `repo:${identity.puzzleId}:${entry.id}`,
      sourceUrl:
        "https://github.com/seorilabs/crossword-puzzle/blob/70835adbd2e3cea298e9023f4d061dd3ee84b987/src/data/onboardingPuzzle.ts",
      licenseId: "LicenseRef-Seorilabs-First-Run-Content",
      domainTags: [identity.themeId],
    })),
    difficulty: puzzle.difficulty,
    themeId: identity.themeId,
    chapterId: identity.chapterId,
    worldTriggerSet: puzzle.entries.map((entry, index) => ({
      triggerId: `restore-path-${entry.id}`,
      entryId: entry.id,
      pathOrder: index,
    })),
    generatorCommit: FIRST_RUN_SOURCE_COMMIT,
    generatorConfigHash: FIRST_RUN_SOURCE_FILE_SHA256,
    contentChecksum: "sha256:unsealed",
    licenseManifestId: identity.licenseManifestId,
    licenseManifestChecksum: identity.licenseManifestChecksum,
    review: {
      reviewerId: "repo-hand-authored",
      reviewedAt: "2026-07-18T00:00:00.000Z",
      manualCoverage: 1,
    },
    minClientVersion: "0.1.0",
  };
  return {
    ...unsealedContent,
    contentChecksum: calculateGameContentChecksum(unsealedContent),
  };
}

let bundledFirstRunContentCache: readonly GameContentV1[] | null = null;

/**
 * 실제 앱에 포함되는 ko-KR 첫 실행 3보드를 모두 동일한 fail-closed 경로로
 * 검증한다. 순서는 지도와 자동 이어하기의 안정 계약이므로 identity 배열과 같다.
 */
export function loadBundledFirstRunGameContents(): readonly GameContentV1[] {
  if (bundledFirstRunContentCache != null) {
    return bundledFirstRunContentCache;
  }
  if (
    firstRunPuzzles.length !==
    KO_KR_LAUNCH_CONTENT_CONTRACT.routeCounts["first-run"]
  ) {
    throw new Error("Bundled first-run content count drifted");
  }

  const contents = BUNDLED_FIRST_RUN_CONTENT_IDENTITIES.map(
    (identity, index) => {
      const puzzle = firstRunPuzzles[index];
      if (
        puzzle == null ||
        puzzle.puzzleId !== identity.puzzleId ||
        puzzle.date !== identity.slotId
      ) {
        throw new Error(`Bundled first-run identity drifted at index ${index}`);
      }
      const candidate = createBundledFirstRunCandidate(puzzle, identity);
      const result = validateGameContentV1(candidate, {
        requestedContentLocale: KO_KR_LAUNCH_CONTENT_CONTRACT.contentLocale,
        verifyChecksum: (content) =>
          verifyGameContentChecksum(content) &&
          content.contentChecksum === identity.contentChecksum,
      });
      if (!result.pass || result.content == null) {
        const issueSummary = result.issues
          .map((issue) => `${issue.code}:${issue.path}`)
          .join(",");
        throw new Error(
          `Bundled first-run content rejected (${identity.puzzleId}): ${issueSummary}`,
        );
      }
      return result.content;
    },
  );
  bundledFirstRunContentCache = Object.freeze(contents);
  return bundledFirstRunContentCache;
}

export function loadBundledFirstRunGameContent(
  puzzleId: string,
): GameContentV1 {
  const content = loadBundledFirstRunGameContents().find(
    (candidate) => candidate.puzzleId === puzzleId,
  );
  if (content == null) {
    throw new Error(`Unknown bundled first-run puzzle: ${puzzleId}`);
  }
  return content;
}

export function getBundledFirstRunContentIdentity(
  puzzleId: string,
): BundledFirstRunContentIdentity {
  const index = BUNDLED_FIRST_RUN_CONTENT_IDENTITIES.findIndex(
    (candidate) => candidate.puzzleId === puzzleId,
  );
  const identity = BUNDLED_FIRST_RUN_CONTENT_IDENTITIES[index];
  const mapNodeId = BUNDLED_FIRST_RUN_MAP_NODE_IDS[index];
  if (identity == null || mapNodeId == null) {
    throw new Error(`Unknown bundled first-run identity: ${puzzleId}`);
  }
  return Object.freeze({ ...identity, mapNodeId });
}

/** 기존 호출부와 첫 보드 저장 식별자를 보존하는 호환 export다. */
export function loadBundledOnboardingGameContent(): GameContentV1 {
  return loadBundledFirstRunGameContent(
    BUNDLED_ONBOARDING_CONTENT_IDENTITY.puzzleId,
  );
}

export function loadBundledOnboardingKnowledgeCard(): KnowledgeCardCatalogItem {
  const card = validateKnowledgeCardCatalogItem(bundledOnboardingKnowledgeCard);
  const onboardingContent = loadBundledOnboardingGameContent();
  if (
    !onboardingContent.entries.some((entry) => entry.answer === card.answer)
  ) {
    throw new Error("Bundled onboarding knowledge card answer drifted");
  }
  return card;
}
