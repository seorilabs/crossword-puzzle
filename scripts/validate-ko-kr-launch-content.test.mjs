import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  DAILY_CONNECTOR_RANKING_POLICY,
  DAILY_CONNECTOR_WORD_LIMIT_BY_DIFFICULTY,
  LAUNCH_ACCEPTED_CANDIDATE_POLICY,
  LAUNCH_RETRY_PHASE_POLICY,
  LAUNCH_SEARCH_QUALITY_POLICY,
  LAUNCH_THEME_IDS,
  LAUNCH_THEME_OWNER_POLICY,
  allocateLaunchThemeOwners,
  buildLaunchRoutePlan,
  filterAvailableWords,
  orderRoutesForGeneration,
  searchOptionsForRetry,
  summarizeFuturePoolConnectivity,
} from "./build-ko-kr-launch-content.mjs";
import {
  KO_KR_LAUNCH_CLUE_QUALITY_POLICY,
  KO_KR_LAUNCH_SEARCH_QUALITY_POLICY,
  calculateCanonicalDocumentChecksum,
  calculateContentQualityEvidence,
  calculateLaunchRetrySeed,
  calculateWordPoolAnswerSetSha256,
  deriveLaunchWordBankReport,
  independentlyAllocateLaunchThemeOwners,
  independentlyFilterAvailableWords,
  independentlySummarizeFuturePoolConnectivity,
  resolvePublicArtifactPath,
  snapshotCommittedCurrentPointer,
  validateBundledFirstRunCatalog,
  validateCatalogLaunchSelection,
  validateCurrentPointer,
  validateFirstRunSourceLock,
  validateGeneratedEntryAgainstReviewedWord,
  validateGeneratorClueQualityPolicy,
  validateGeneratorReportTrace,
  validateGeneratorRetryPhasePolicy,
  validateGeneratorSearchQualityPolicy,
  validateGeneratorThemeInventoryPolicy,
  validateGlobalInventory,
  validateLaunchWordBankReport,
  validateLicensePolicyAnchors,
  validateReportedQualityEvidence,
  validateReportedDifficultySelection,
} from "./validate-ko-kr-launch-content.mjs";
import {
  DIFFICULTY_PROFILES,
  selectWordsForProfile,
} from "../packages/crossword-core/src/difficultyProfiles.ts";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const execFileAsync = promisify(execFile);

function clueQualityConfig() {
  return {
    schemaVersion: KO_KR_LAUNCH_CLUE_QUALITY_POLICY.schemaVersion,
    clueSimilarity: structuredClone(
      KO_KR_LAUNCH_CLUE_QUALITY_POLICY.clueSimilarity,
    ),
    clueQuality: structuredClone(KO_KR_LAUNCH_CLUE_QUALITY_POLICY.clueQuality),
  };
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function fixtureWordPool({
  answers = [],
  connectors = null,
  theme = null,
  total = answers.length,
} = {}) {
  return {
    answerSetSha256: sha256(JSON.stringify([...answers].sort())),
    total,
    theme,
    connectors,
  };
}
const firstRunSourceLock = Object.freeze({
  sourceId: "repo-first-run-content-v1",
  sourceUrl:
    "https://github.com/seorilabs/crossword-puzzle/blob/07dc409a4d7bfdd136487904fa8eb8d7c3a81afd/src/data/onboardingPuzzle.ts",
  sourceCommit: "07dc409a4d7bfdd136487904fa8eb8d7c3a81afd",
  sourceFileSha256:
    "sha256:ec1738ceb0ba334eb874572fdfc73abf0bfbb6c7e1f0b36d31132e86c85dadb6",
});
const licensePolicyAnchors = Object.freeze([
  Object.freeze({
    licenseId: "LicenseRef-Seorilabs-First-Run-Content",
    name: "Seorilabs first-run content",
    termsUrl: firstRunSourceLock.sourceUrl,
    redistributionAllowed: true,
  }),
  Object.freeze({
    licenseId: "CC-BY-SA-2.0-KR",
    name: "Creative Commons Attribution-ShareAlike 2.0 Korea",
    termsUrl: "https://creativecommons.org/licenses/by-sa/2.0/kr/",
    redistributionAllowed: true,
    shareAlikeRequired: true,
  }),
]);

const reviewedWord = Object.freeze({
  answer: "가게",
  answerCells: Object.freeze(["가", "게"]),
  clue: "동네에서 여러 물건을 파는 작은 상점",
  clueSource: "editorial-reviewed-adaptation",
  needsManualClue: false,
  shortExplanation: "작은 규모로 물건을 펼쳐 놓고 파는 집",
  source: "국립국어원 한국어기초사전 XML",
  sourceEntryId: "17287",
  sourceUrl: "https://krdict.korean.go.kr/kor/openApi/openApiRegister",
  licenseId: "CC-BY-SA-2.0-KR",
  domainTags: Object.freeze(["general"]),
});

test("reviewed sourceEntryId로 변조 단서를 끼워 넣을 수 없다", () => {
  assert.doesNotThrow(() =>
    validateGeneratedEntryAgainstReviewedWord(
      { ...reviewedWord },
      reviewedWord,
      "fixture",
    ),
  );
  assert.throws(
    () =>
      validateGeneratedEntryAgainstReviewedWord(
        { ...reviewedWord, clue: "검수되지 않은 변조 단서" },
        reviewedWord,
        "fixture",
      ),
    /does not exactly match/,
  );
});

test("clue quality v2 config의 threshold나 scope 재봉인을 거부한다", () => {
  const config = clueQualityConfig();
  assert.equal(validateGeneratorClueQualityPolicy(config), true);

  const forgedThreshold = structuredClone(config);
  forgedThreshold.clueSimilarity.bigramDiceThreshold = 0.9;
  assert.throws(
    () => validateGeneratorClueQualityPolicy(forgedThreshold),
    /clue similarity policy does not exactly match/,
  );

  const forgedScope = structuredClone(config);
  forgedScope.clueQuality.answerFragmentExposure.scope = "wordbank-only";
  assert.throws(
    () => validateGeneratorClueQualityPolicy(forgedScope),
    /clue quality policy does not exactly match/,
  );
});

test("generator search quality의 route/연결성 정렬 정책 재봉인을 거부한다", () => {
  const config = {
    searchQuality: structuredClone(LAUNCH_SEARCH_QUALITY_POLICY),
  };
  assert.deepEqual(config.searchQuality, KO_KR_LAUNCH_SEARCH_QUALITY_POLICY);
  assert.equal(validateGeneratorSearchQualityPolicy(config), true);

  const forged = structuredClone(config);
  forged.searchQuality.maxConnectedComponents = 2;
  assert.throws(
    () => validateGeneratorSearchQualityPolicy(forged),
    /search quality policy does not exactly match/,
  );

  const forgedScoring = structuredClone(config);
  forgedScoring.searchQuality.scoringPolicy.weights.boardAutoRunCount = 1;
  assert.throws(
    () => validateGeneratorSearchQualityPolicy(forgedScoring),
    /search quality policy does not exactly match/,
  );
});

test("generator bounded fallback phase와 connector schedule 재봉인을 거부한다", () => {
  const config = {
    retryPhasePolicy: structuredClone(LAUNCH_RETRY_PHASE_POLICY),
  };
  assert.equal(validateGeneratorRetryPhasePolicy(config), true);

  const forgedTransition = structuredClone(config);
  forgedTransition.retryPhasePolicy.transition = "fallback-after-any-rejection";
  assert.throws(
    () => validateGeneratorRetryPhasePolicy(forgedTransition),
    /retry phase policy does not exactly match/,
  );

  const forgedScope = structuredClone(config);
  forgedScope.retryPhasePolicy.fallbackRouteKind = "chapter";
  assert.throws(
    () => validateGeneratorRetryPhasePolicy(forgedScope),
    /retry phase policy does not exactly match/,
  );

  const forgedSchedule = structuredClone(config);
  forgedSchedule.retryPhasePolicy.phases[1].connectorLimitScheduleByDifficulty.normal[0] = 80;
  assert.throws(
    () => validateGeneratorRetryPhasePolicy(forgedSchedule),
    /retry phase policy does not exactly match/,
  );
});

test("generator theme inventory의 길이 상한과 owner 정책 재봉인을 거부한다", () => {
  const config = {
    dailyConnectorWordLimitByDifficulty: structuredClone(
      DAILY_CONNECTOR_WORD_LIMIT_BY_DIFFICULTY,
    ),
    dailyConnectorRanking: structuredClone(DAILY_CONNECTOR_RANKING_POLICY),
    maxGenerationWordLength: { easy: 3, normal: 3, hard: 3 },
    themeOwnership: structuredClone(LAUNCH_THEME_OWNER_POLICY),
  };
  assert.equal(validateGeneratorThemeInventoryPolicy(config), true);

  const forgedMaximum = structuredClone(config);
  forgedMaximum.maxGenerationWordLength.hard = 4;
  assert.throws(
    () => validateGeneratorThemeInventoryPolicy(forgedMaximum),
    /maximum word length policy does not exactly match/,
  );

  const forgedOwnerPolicy = structuredClone(config);
  forgedOwnerPolicy.themeOwnership.productionTargetDistinctOwnerCountPerTheme = 74;
  assert.throws(
    () => validateGeneratorThemeInventoryPolicy(forgedOwnerPolicy),
    /theme ownership policy does not exactly match/,
  );

  const forgedConnectorPolicy = structuredClone(config);
  forgedConnectorPolicy.dailyConnectorWordLimitByDifficulty.hard = 80;
  assert.throws(
    () => validateGeneratorThemeInventoryPolicy(forgedConnectorPolicy),
    /daily connector word limit policy does not exactly match/,
  );

  const forgedConnectorRanking = structuredClone(config);
  forgedConnectorRanking.dailyConnectorRanking.connectorOrder = [
    "max-theme-word-degree",
    ...forgedConnectorRanking.dailyConnectorRanking.connectorOrder.filter(
      (item) => item !== "max-theme-word-degree",
    ),
  ];
  assert.throws(
    () => validateGeneratorThemeInventoryPolicy(forgedConnectorRanking),
    /daily connector ranking policy does not exactly match/,
  );
});

test("wordbank launch-selection exclusion count 변조를 독립 재계산으로 거부한다", () => {
  const word = (answer, clue) => ({
    answer,
    answerCells: [...answer],
    clue,
    sourceEntryId: `fixture-${answer}`,
    difficulty: "normal",
    domainTags: ["table-kitchen"],
    themeTags: ["table-kitchen"],
  });
  const wordbank = {
    metadata: {
      themeReviewCoverage: [{ startIndex: 0, endIndexInclusive: 2 }],
    },
    words: [
      ...LAUNCH_THEME_IDS.flatMap((themeId, themeIndex) =>
        Array.from({ length: 75 }, (_, wordIndex) => {
          const marker = String.fromCodePoint(
            0x4e00 + themeIndex * 75 + wordIndex,
          );
          const sourceEntryId = `inventory-${themeIndex}-${wordIndex}`;
          return {
            answer: `답${marker}`,
            answerCells: ["답", marker],
            clue: sha256(sourceEntryId),
            sourceEntryId,
            difficulty: "normal",
            domainTags: ["general"],
            themeTags: [themeId],
          };
        }),
      ),
      word("주재료", "어떤 것을 만드는 데 가장 중심이 되는 재료"),
      word("농작물", "논밭에 심어 가꾸는 곡식이나 채소"),
      word("작물", "논밭에서 심어 가꾸는 곡식이나 채소"),
    ],
  };
  const derived = deriveLaunchWordBankReport(wordbank, [{ entries: [] }]);
  const report = {
    path: "data/game-content/v1/ko-KR/reviewed-launch-wordbank-v2.json",
    checksum: `sha256:${"1".repeat(64)}`,
    ...derived,
    reviewCoverage: wordbank.metadata.themeReviewCoverage,
  };
  const validated = validateLaunchWordBankReport(
    report,
    wordbank,
    [{ entries: [] }],
    report.checksum,
  );
  assert.equal(
    validated.selectedWords.some((word) => word.answer === "농작물"),
    true,
  );
  assert.equal(
    validated.selectedWords.some((word) => word.answer === "주재료"),
    false,
  );
  assert.equal(
    validated.selectedWords.some((word) => word.answer === "작물"),
    false,
  );
  assert.equal(
    validateCatalogLaunchSelection(
      {
        boards: [
          {
            route: { kind: "chapter" },
            content: {
              puzzleId: "fixture-selected",
              entries: [{ id: "a1", sourceEntryId: "fixture-농작물" }],
            },
          },
        ],
      },
      validated.selectedWords,
    ),
    true,
  );
  assert.throws(
    () =>
      validateCatalogLaunchSelection(
        {
          boards: [
            {
              route: { kind: "chapter" },
              content: {
                puzzleId: "fixture-excluded",
                entries: [{ id: "a1", sourceEntryId: "fixture-작물" }],
              },
            },
          ],
        },
        validated.selectedWords,
      ),
    /outside the independently derived launch selection/,
  );
  const forged = structuredClone(report);
  forged.exclusions.answerFragmentExposure = 0;
  forged.cooldownSafeWordCount += 1;
  assert.throws(
    () =>
      validateLaunchWordBankReport(
        forged,
        wordbank,
        [{ entries: [] }],
        report.checksum,
      ),
    /launch wordbank audit does not exactly match/,
  );
});

test("generator와 validator가 theme owner와 금요일 reserve를 독립적으로 같은 값으로 계산한다", () => {
  const words = LAUNCH_THEME_IDS.flatMap((themeId, themeIndex) =>
    Array.from({ length: 76 }, (_, wordIndex) => ({
      answerCells: ["가", "나"],
      difficulty: wordIndex < 20 ? "normal" : "easy",
      sourceEntryId: `owner-${themeIndex}-${wordIndex}`,
      themeTags:
        wordIndex === 75
          ? [
              themeId,
              LAUNCH_THEME_IDS[(themeIndex + 1) % LAUNCH_THEME_IDS.length],
            ].sort(
              (left, right) =>
                LAUNCH_THEME_IDS.indexOf(left) -
                LAUNCH_THEME_IDS.indexOf(right),
            )
          : [themeId],
    })),
  );
  const generator = allocateLaunchThemeOwners(words);
  const validator = independentlyAllocateLaunchThemeOwners(words);
  assert.equal(
    generator.assignmentSha256,
    validator.themeOwnership.assignmentSha256,
  );
  assert.deepEqual(generator.inventory, validator.themeInventory);
  assert.deepEqual(
    generator.words.map(({ sourceEntryId, themeOwner, themeHardReserve }) => ({
      sourceEntryId,
      themeOwner,
      themeHardReserve,
    })),
    validator.selectedWords.map(
      ({ sourceEntryId, themeOwner, themeHardReserve }) => ({
        sourceEntryId,
        themeOwner,
        themeHardReserve,
      }),
    ),
  );
});

test("maximum matching은 공유 후보를 밀어내 각 테마의 disjoint owner를 완성한다", () => {
  const [firstTheme, secondTheme, ...remainingThemes] = LAUNCH_THEME_IDS;
  const makeWords = (prefix, themeTags) =>
    Array.from({ length: 75 }, (_, wordIndex) => ({
      answerCells: ["가", "나"],
      difficulty: wordIndex < 16 ? "normal" : "easy",
      sourceEntryId: `${prefix}-${wordIndex}`,
      themeTags,
    }));
  const words = [
    ...makeWords("shared", [firstTheme, secondTheme]),
    ...makeWords("first-only", [firstTheme]),
    ...remainingThemes.flatMap((themeId, themeIndex) =>
      makeWords(`exclusive-${themeIndex}`, [themeId]),
    ),
  ];

  const generator = allocateLaunchThemeOwners(words);
  const validator = independentlyAllocateLaunchThemeOwners(words);
  const generatorOwners = new Map(
    generator.words.map((word) => [word.sourceEntryId, word.themeOwner]),
  );

  assert.ok(
    makeWords("shared", [firstTheme, secondTheme]).every(
      (word) => generatorOwners.get(word.sourceEntryId) === secondTheme,
    ),
  );
  assert.ok(
    makeWords("first-only", [firstTheme]).every(
      (word) => generatorOwners.get(word.sourceEntryId) === firstTheme,
    ),
  );
  assert.deepEqual(
    [firstTheme, secondTheme].map((themeId) => generator.inventory[themeId]),
    [
      {
        owned: 75,
        hardReserve: 16,
        eligible: 150,
        normalOrHardEligible: 32,
      },
      {
        owned: 75,
        hardReserve: 16,
        eligible: 75,
        normalOrHardEligible: 16,
      },
    ],
  );
  assert.equal(
    generator.assignmentSha256,
    validator.themeOwnership.assignmentSha256,
  );
  assert.deepEqual(generator.inventory, validator.themeInventory);
});

test("최종 inventory에서 0.882 clue family 재봉인을 거부한다", () => {
  const rawCatalog = {
    boards: [
      {
        content: {
          puzzleId: "fixture-one",
          entries: [
            {
              id: "a1",
              answer: "하늘",
              clue: "어떤 것을 만드는 데 가장 중심이 되는 재료",
            },
          ],
        },
      },
      {
        content: {
          puzzleId: "fixture-two",
          entries: [
            {
              id: "a1",
              answer: "바다",
              clue: "어떤 것을 만드는 데 쓰는 가장 중심이 되는 재료",
            },
          ],
        },
      },
    ],
  };
  assert.throws(
    () =>
      validateGlobalInventory(rawCatalog, {
        cooldownAudit: {
          policyId: "launch-global-unique-answer-and-clue-family-v2",
          enforcedScope: "all-93-launch-boards-global",
          uniqueAnswerCount: 2,
          uniqueNormalizedClueFamilyCount: 2,
          pass: true,
        },
      }),
    /launch clue family collision/,
  );
});

test("immutable artifactPath traversal을 거부한다", () => {
  assert.throws(
    () =>
      resolvePublicArtifactPath(
        "/tmp/public/game-content/v1/ko-KR",
        "/game-content/v1/ko-KR/packs/../current.json",
      ),
    /unsafe immutable artifactPath/,
  );
});

test("license manifest checksum은 core canonicalizer 결과로 고정된다", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL(
        "../data/game-content/v1/ko-KR/license-manifest.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(
    calculateCanonicalDocumentChecksum(manifest),
    "sha256:959f2a7eaacb5fe81f9c4ae6585f12c07285455b541ac973d3a2f994314caa7a",
  );
});

test("first-run source lock은 manifest GitHub blob의 raw bytes를 검증한다", async () => {
  const manifest = { sources: [{ ...firstRunSourceLock }] };
  await assert.doesNotReject(() =>
    validateFirstRunSourceLock(repositoryRoot, manifest),
  );

  for (const [field, value, expectedError] of [
    ["sourceCommit", "70835ad", /sourceCommit must be a 40-character/],
    [
      "sourceUrl",
      "https://github.com/seorilabs/crossword-puzzle/blob/004a06b30a44813312acee002fc7826061e90beb/src/data/onboardingPuzzle.ts",
      /sourceUrl commit must exactly match sourceCommit/,
    ],
    [
      "sourceUrl",
      "https://github.com/seorilabs/crossword-puzzle/blob/07dc409a4d7bfdd136487904fa8eb8d7c3a81afd/src/data/../game-shell/onboardingGameContent.ts",
      /sourceUrl path is not a safe repository-relative path/,
    ],
    [
      "sourceFileSha256",
      `sha256:${"0".repeat(64)}`,
      /sourceFileSha256 does not match the committed source bytes/,
    ],
  ]) {
    await assert.rejects(
      () =>
        validateFirstRunSourceLock(repositoryRoot, {
          sources: [{ ...firstRunSourceLock, [field]: value }],
        }),
      expectedError,
    );
  }
});

test("license 정책 URL과 재배포/share-alike flags 변조를 거부한다", () => {
  assert.doesNotThrow(() =>
    validateLicensePolicyAnchors(
      { licenses: structuredClone(licensePolicyAnchors) },
      firstRunSourceLock,
    ),
  );

  for (const mutate of [
    (licenses) => {
      licenses[0].termsUrl = `${firstRunSourceLock.sourceUrl}?unlocked=1`;
    },
    (licenses) => {
      licenses[0].redistributionAllowed = false;
    },
    (licenses) => {
      licenses[1].termsUrl = "https://creativecommons.org/licenses/by/2.0/kr/";
    },
    (licenses) => {
      licenses[1].shareAlikeRequired = false;
    },
  ]) {
    const licenses = structuredClone(licensePolicyAnchors);
    mutate(licenses);
    assert.throws(
      () => validateLicensePolicyAnchors({ licenses }, firstRunSourceLock),
      /license manifest policy anchors does not exactly match/,
    );
  }
});

test("두 번째 bundled first-run board 치환을 거부한다", () => {
  const bundledContents = [
    { puzzleId: "first-run-01", payload: "one" },
    { puzzleId: "first-run-02", payload: "two" },
    { puzzleId: "first-run-03", payload: "three" },
  ];
  const catalog = {
    boards: bundledContents.map((content) => ({
      route: { kind: "first-run" },
      content,
    })),
  };
  assert.doesNotThrow(() =>
    validateBundledFirstRunCatalog(catalog, bundledContents),
  );
  const forged = structuredClone(catalog);
  forged.boards[1].content.payload = "forged-and-resealed";
  assert.throws(
    () => validateBundledFirstRunCatalog(forged, bundledContents),
    /first-run bundled content.*does not exactly match/,
  );
});

test("저품질 board의 report quality PASS 재봉인을 거부한다", () => {
  const content = {
    puzzleId: "quality-fixture",
    difficulty: "easy",
    themeId: "general",
    grid: [
      ["가", "게", ""],
      ["나", "", ""],
      ["", "", ""],
    ],
    entries: [
      {
        answer: "가게",
        answerCells: ["가", "게"],
        clue: "동네에서 물건을 파는 작은 상점",
        direction: "across",
        row: 0,
        col: 0,
        generatedBy: "placed",
        domainTags: ["general"],
      },
      {
        answer: "가나",
        answerCells: ["가", "나"],
        clue: "두 글자로 된 fixture 답",
        direction: "down",
        row: 0,
        col: 0,
        generatedBy: "placed",
        domainTags: ["general"],
      },
    ],
  };
  const config = {
    minMultiCrossRatio: 0.65,
    maxAutoRunRatio: 0.5,
    minDailyThemeEntryRatio: 0.5,
    clueQuality: clueQualityConfig().clueQuality,
  };
  const evidence = calculateContentQualityEvidence(
    content,
    { kind: "chapter" },
    config,
  );
  assert.equal(evidence.quality.pass, false);
  assert.throws(
    () =>
      validateReportedQualityEvidence(
        content,
        { kind: "chapter" },
        {
          metrics: evidence.metrics,
          quality: { ...evidence.quality, pass: true },
        },
        config,
      ),
    /independently derived quality checks.*does not exactly match/,
  );

  const leakedContent = structuredClone(content);
  leakedContent.entries[0].clue = "다른 정답 가나를 그대로 알려 주는 단서";
  const leakedEvidence = calculateContentQualityEvidence(
    leakedContent,
    { kind: "chapter" },
    config,
  );
  assert.equal(leakedEvidence.metrics.crossAnswerClueLeakCount, 1);
  assert.equal(
    leakedEvidence.quality.checks.find(
      (check) => check.key === "maxCrossAnswerClueLeakCount",
    )?.pass,
    false,
  );
  const forgedLeakMetrics = {
    ...leakedEvidence.metrics,
    crossAnswerClueLeakCount: 0,
  };
  assert.throws(
    () =>
      validateReportedQualityEvidence(
        leakedContent,
        { kind: "chapter" },
        {
          metrics: forgedLeakMetrics,
          quality: leakedEvidence.quality,
        },
        config,
      ),
    /independently derived metrics does not exactly match/,
  );
});

function makeGeneratorTraceFixture(route = buildLaunchRoutePlan()[0]) {
  const clueConfig = clueQualityConfig();
  const config = {
    schemaVersion: "ko-kr-launch-generator-config/11",
    acceptedCandidateSelection: structuredClone(
      LAUNCH_ACCEPTED_CANDIDATE_POLICY,
    ),
    retryPhasePolicy: structuredClone(LAUNCH_RETRY_PHASE_POLICY),
    baseSeed: 20260718,
    attempts: 30,
    retries: LAUNCH_ACCEPTED_CANDIDATE_POLICY.defaultRetries,
    samples: 5,
    beamWidth: 16,
    branchLimit: 14,
    candidateWordLimit: 600,
    denseCandidateLimit: 96,
    dailyConnectorWordLimitByDifficulty: structuredClone(
      DAILY_CONNECTOR_WORD_LIMIT_BY_DIFFICULTY,
    ),
    dailyConnectorRanking: structuredClone(DAILY_CONNECTOR_RANKING_POLICY),
    difficultyProfiles: structuredClone(DIFFICULTY_PROFILES),
    maxGenerationWordLength: { easy: 3, normal: 3, hard: 3 },
    themeOwnership: structuredClone(LAUNCH_THEME_OWNER_POLICY),
    minMultiCrossRatio: 0.65,
    maxAutoRunRatio: 0.5,
    minDailyThemeEntryRatio: 0.5,
    searchQuality: structuredClone(LAUNCH_SEARCH_QUALITY_POLICY),
    clueSimilarity: clueConfig.clueSimilarity,
    clueQuality: clueConfig.clueQuality,
    dependencies: [],
    dependencyTreeSha256: sha256("fixture-dependencies"),
    routePlan: buildLaunchRoutePlan(),
    scriptSha256: sha256("fixture-generator-script"),
    wordBankSha256: sha256("fixture-wordbank"),
  };
  const retryScheduleLength = LAUNCH_RETRY_PHASE_POLICY.phases.reduce(
    (count, phase) => count + phase.retryCount,
    0,
  );
  config.searchEscalation = Array.from(
    { length: retryScheduleLength },
    (_, retryIndex) => searchOptionsForRetry(config, retryIndex),
  );
  const rejectedMetrics = {
    wordCount: 10,
    autoRunCount: 6,
    crossRatio: 0.3,
    bboxArea: 40,
    bboxDensity: 0.3,
    multiIntersectionPlacements: 2,
    connectedComponents: 1,
    accidentalRunCount: 0,
    crossAnswerClueLeakCount: 0,
    answerContainmentCount: 0,
  };
  const rejectedRatios = { autoRunRatio: 0.6, multiCrossRatio: 0.2 };
  const rejectedAnswers = Array.from(
    { length: 10 },
    (_, index) => `rejected-${String(index).padStart(2, "0")}`,
  );
  const selectedMetrics = {
    wordCount: 16,
    autoRunCount: 4,
    crossRatio: 0.6,
    bboxArea: 28,
    bboxDensity: 0.7,
    multiIntersectionPlacements: 12,
    connectedComponents: 1,
    accidentalRunCount: 0,
    crossAnswerClueLeakCount: 0,
    answerContainmentCount: 0,
  };
  const selectedRatios = { autoRunRatio: 0.25, multiCrossRatio: 0.75 };
  const selectedAnswers = Array.from(
    { length: 16 },
    (_, index) => `selected-${String(index).padStart(2, "0")}`,
  );
  const lookaheadAnswers = Array.from(
    { length: 16 },
    (_, index) => `lookahead-${String(index).padStart(2, "0")}`,
  );
  const rejectedFailedChecks = [
    "minCrossRatio",
    "minBboxDensity",
    "minMultiCrossRatio",
    "maxAutoRunRatio",
  ];
  const rejectedSelectionScore = {
    totalSharedCellEdges: 10,
    themeConnectorSharedCellEdges: 0,
    isolatedThemeOwnerCount: 0,
    usableMultiPositionThemeOwnerCount: 0,
    usableMultiPositionAnswerCount: 0,
    cooldownAnswerCount: rejectedAnswers.length,
  };
  const selectedSelectionScore = {
    totalSharedCellEdges: 100,
    themeConnectorSharedCellEdges: 0,
    isolatedThemeOwnerCount: 0,
    usableMultiPositionThemeOwnerCount: 0,
    usableMultiPositionAnswerCount: 0,
    cooldownAnswerCount: selectedAnswers.length,
  };
  const traceWordPool = fixtureWordPool({
    answers: Array.from({ length: 200 }, (_, index) => `pool-${index}`),
    total: 200,
  });
  const attempts = [
    {
      phase: "base",
      phaseIndex: 0,
      phaseId: "base",
      retryIndex: 0,
      globalRetryIndex: 0,
      connectorLimit: null,
      wordPool: structuredClone(traceWordPool),
      seed: calculateLaunchRetrySeed(config.baseSeed, route.puzzleId, 0),
      searchOptions: searchOptionsForRetry(config, 0),
      candidateCount: 1,
      candidates: [
        {
          candidateIndex: 0,
          pass: false,
          failedChecks: [...rejectedFailedChecks],
          metrics: rejectedMetrics,
          ratios: rejectedRatios,
          themeEntryCount: null,
          answers: [...rejectedAnswers],
          selectionScore: { ...rejectedSelectionScore },
        },
      ],
    },
    {
      phase: "base",
      phaseIndex: 0,
      phaseId: "base",
      retryIndex: 1,
      globalRetryIndex: 1,
      connectorLimit: null,
      wordPool: structuredClone(traceWordPool),
      seed: calculateLaunchRetrySeed(config.baseSeed, route.puzzleId, 1),
      searchOptions: searchOptionsForRetry(config, 1),
      candidateCount: 2,
      candidates: [
        {
          candidateIndex: 0,
          pass: false,
          failedChecks: [...rejectedFailedChecks],
          metrics: rejectedMetrics,
          ratios: rejectedRatios,
          themeEntryCount: null,
          answers: [...rejectedAnswers],
          selectionScore: { ...rejectedSelectionScore },
        },
        {
          candidateIndex: 1,
          pass: true,
          failedChecks: [],
          metrics: { ...selectedMetrics },
          ratios: { ...selectedRatios },
          themeEntryCount: null,
          answers: [...selectedAnswers],
          selectionScore: { ...selectedSelectionScore },
        },
      ],
    },
    {
      phase: "base",
      phaseIndex: 0,
      phaseId: "base",
      retryIndex: 2,
      globalRetryIndex: 2,
      connectorLimit: null,
      wordPool: structuredClone(traceWordPool),
      seed: calculateLaunchRetrySeed(config.baseSeed, route.puzzleId, 2),
      searchOptions: searchOptionsForRetry(config, 2),
      candidateCount: 1,
      candidates: [
        {
          candidateIndex: 0,
          pass: true,
          failedChecks: [],
          metrics: { ...selectedMetrics },
          ratios: { ...selectedRatios },
          themeEntryCount: null,
          answers: [...lookaheadAnswers],
          selectionScore: { ...selectedSelectionScore },
        },
      ],
    },
  ];
  for (const attempt of attempts) {
    for (const candidate of attempt.candidates) {
      candidate.generationMethod = "standard-beam";
      candidate.compactSearch = null;
    }
  }
  return {
    config,
    board: {
      puzzleId: route.puzzleId,
      route: route.route,
      difficulty: route.difficulty,
      themeId: route.themeId,
      effectiveWordDifficulties: [
        ...DIFFICULTY_PROFILES[route.difficulty].wordDifficulties,
      ],
      broadenedDifficultyPool: false,
      selectedCandidateIndex: 1,
      selectedRetryIndex: 1,
      selectedSeed: attempts[1].seed,
      metrics: { ...selectedMetrics },
      quality: { ratios: { ...selectedRatios } },
      wordPool: structuredClone(traceWordPool),
      attempts,
    },
  };
}

function makeFallbackGeneratorTraceFixture(routeKind = "chapter") {
  const route = buildLaunchRoutePlan().find(
    (candidate) => candidate.route.kind === routeKind,
  );
  assert.ok(route != null);
  const fixture = makeGeneratorTraceFixture(route);
  const rejectedCandidate = structuredClone(
    fixture.board.attempts[0].candidates[0],
  );
  const passingCandidate = structuredClone(
    fixture.board.attempts[1].candidates[1],
  );
  passingCandidate.candidateIndex = 0;
  const baseAttempts = Array.from({ length: 8 }, (_, retryIndex) => ({
    phase: "base",
    phaseIndex: 0,
    phaseId: "base",
    retryIndex,
    globalRetryIndex: retryIndex,
    connectorLimit: null,
    wordPool: structuredClone(fixture.board.wordPool),
    seed: calculateLaunchRetrySeed(
      fixture.config.baseSeed,
      fixture.board.puzzleId,
      retryIndex,
    ),
    searchOptions: searchOptionsForRetry(fixture.config, retryIndex),
    candidateCount: 1,
    candidates: [structuredClone(rejectedCandidate)],
  }));
  const fallbackAttempts = Array.from({ length: 2 }, (_, retryIndex) => {
    const globalRetryIndex = retryIndex + 8;
    return {
      phase: "fallback",
      phaseIndex: 1,
      phaseId: "fallback",
      retryIndex,
      globalRetryIndex,
      connectorLimit: null,
      wordPool: structuredClone(fixture.board.wordPool),
      seed: calculateLaunchRetrySeed(
        fixture.config.baseSeed,
        fixture.board.puzzleId,
        globalRetryIndex,
      ),
      searchOptions: searchOptionsForRetry(fixture.config, globalRetryIndex),
      candidateCount: 1,
      candidates: [structuredClone(passingCandidate)],
    };
  });
  fixture.board.attempts = [...baseAttempts, ...fallbackAttempts];
  fixture.board.selectedRetryIndex = 8;
  fixture.board.selectedCandidateIndex = 0;
  fixture.board.selectedSeed = fallbackAttempts[0].seed;
  fixture.board.metrics = structuredClone(passingCandidate.metrics);
  fixture.board.quality = {
    ratios: structuredClone(passingCandidate.ratios),
  };
  fixture.board.wordPool = structuredClone(fallbackAttempts[0].wordPool);
  return fixture;
}

function makeDailyFallbackPoolTraceFixture() {
  const { config } = makeGeneratorTraceFixture();
  const routes = orderRoutesForGeneration(buildLaunchRoutePlan());
  const route = routes[0];
  const nextRoute = routes[1];
  const reviewedWords = [
    ...Array.from({ length: 100 }, (_, index) => ({
      answer: `테마-${String(index).padStart(3, "0")}`,
      answerCells: ["가"],
      clue: `테마 단서 ${index}`,
      difficulty: "normal",
      reviewLedgerIndex: index,
      themeOwner: route.themeId,
      themeHardReserve: false,
    })),
    ...Array.from({ length: 160 }, (_, index) => ({
      answer: `연결-${String(index).padStart(3, "0")}`,
      answerCells: ["가", "나"],
      clue: `연결 단서 ${index}`,
      difficulty: "normal",
      reviewLedgerIndex: index + 100,
      themeOwner: null,
      themeHardReserve: false,
    })),
  ];
  const baseSelection = filterAvailableWords(reviewedWords, route, new Set());
  const fallbackLimit =
    LAUNCH_RETRY_PHASE_POLICY.phases[1].connectorLimitScheduleByDifficulty
      .normal[0];
  const fallbackSelection = filterAvailableWords(
    reviewedWords,
    route,
    new Set(),
    { connectorWordLimit: fallbackLimit },
  );
  const baseAnswers = new Set(baseSelection.words.map((word) => word.answer));
  const fallbackOnlyWord = fallbackSelection.words.find(
    (word) => word.themeOwner == null && !baseAnswers.has(word.answer),
  );
  assert.ok(fallbackOnlyWord != null);
  const answers = [
    ...fallbackSelection.words
      .filter((word) => word.themeOwner === route.themeId)
      .slice(0, 5)
      .map((word) => word.answer),
    ...fallbackSelection.words
      .filter((word) => word.themeOwner == null && baseAnswers.has(word.answer))
      .slice(0, 4)
      .map((word) => word.answer),
    fallbackOnlyWord.answer,
  ].sort();
  const futureUsedAnswers = new Set(answers);
  const futureConnectivity = summarizeFuturePoolConnectivity(
    filterAvailableWords(reviewedWords, nextRoute, futureUsedAnswers).words,
    nextRoute,
  );
  const metrics = {
    wordCount: 10,
    autoRunCount: 0,
    crossRatio: 0.6,
    bboxArea: 30,
    bboxDensity: 0.6,
    multiIntersectionPlacements: 7,
    connectedComponents: 1,
    accidentalRunCount: 0,
    crossAnswerClueLeakCount: 0,
    answerContainmentCount: 0,
  };
  const ratios = {
    autoRunRatio: 0,
    multiCrossRatio: 0.7,
    themeEntryRatio: 0.5,
  };
  const passingCandidate = {
    candidateIndex: 0,
    generationMethod: "standard-beam",
    compactSearch: null,
    pass: true,
    failedChecks: [],
    metrics,
    ratios,
    themeEntryCount: 5,
    answers,
    selectionScore: {
      ...futureConnectivity,
      cooldownAnswerCount: answers.length,
    },
  };
  const wordPool = (selection) => ({
    answerSetSha256: calculateWordPoolAnswerSetSha256(selection.words),
    total: selection.words.length,
    theme: selection.themeWordCount,
    connectors: selection.connectorWordCount,
  });
  const baseAttempts = Array.from({ length: 8 }, (_, retryIndex) => ({
    phase: "base",
    phaseIndex: 0,
    phaseId: "base",
    retryIndex,
    globalRetryIndex: retryIndex,
    connectorLimit: 80,
    wordPool: wordPool(baseSelection),
    seed: calculateLaunchRetrySeed(config.baseSeed, route.puzzleId, retryIndex),
    searchOptions: searchOptionsForRetry(config, retryIndex),
    candidateCount: 0,
    candidates: [],
  }));
  const fallbackAttempts = Array.from({ length: 2 }, (_, retryIndex) => {
    const globalRetryIndex = retryIndex + 8;
    return {
      phase: "fallback",
      phaseIndex: 1,
      phaseId: "fallback",
      retryIndex,
      globalRetryIndex,
      connectorLimit: fallbackLimit,
      wordPool: wordPool(fallbackSelection),
      seed: calculateLaunchRetrySeed(
        config.baseSeed,
        route.puzzleId,
        globalRetryIndex,
      ),
      searchOptions: searchOptionsForRetry(config, globalRetryIndex),
      candidateCount: retryIndex === 0 ? 1 : 0,
      candidates: retryIndex === 0 ? [passingCandidate] : [],
    };
  });
  return {
    config,
    reviewedWords,
    fallbackOnlyAnswer: fallbackOnlyWord.answer,
    board: {
      puzzleId: route.puzzleId,
      route: route.route,
      difficulty: route.difficulty,
      themeId: route.themeId,
      effectiveWordDifficulties: ["easy", "normal"],
      broadenedDifficultyPool: false,
      selectedCandidateIndex: 0,
      selectedRetryIndex: 8,
      selectedSeed: fallbackAttempts[0].seed,
      metrics: structuredClone(metrics),
      quality: { ratios: structuredClone(ratios) },
      wordPool: wordPool(fallbackSelection),
      attempts: [...baseAttempts, ...fallbackAttempts],
    },
  };
}

function makeDailyGreedyPoolTraceFixture() {
  const { config } = makeGeneratorTraceFixture();
  const routes = orderRoutesForGeneration(buildLaunchRoutePlan());
  const route = routes[0];
  const nextRoute = routes[1];
  const themeWords = Array.from({ length: 100 }, (_, index) => ({
    answer: `테마-${String(index).padStart(3, "0")}`,
    answerCells: [index < 60 ? "가" : "나"],
    clue: `테마 단서 ${index}`,
    difficulty: "normal",
    reviewLedgerIndex: index,
    themeOwner: route.themeId,
    themeHardReserve: false,
  }));
  const redundantConnectors = Array.from({ length: 159 }, (_, index) => ({
    answer: `중복-${String(index).padStart(3, "0")}`,
    answerCells: ["가", "다"],
    clue: `중복 연결 단서 ${index}`,
    difficulty: "normal",
    reviewLedgerIndex: index + 100,
    themeOwner: null,
    themeHardReserve: false,
  }));
  const uncoveredConnector = {
    answer: "미연결-owner-coverage",
    answerCells: ["나", "라"],
    clue: "남은 테마 owner를 덮는 연결 단서",
    difficulty: "normal",
    reviewLedgerIndex: 259,
    themeOwner: null,
    themeHardReserve: false,
  };
  const reviewedWords = [
    ...themeWords,
    ...redundantConnectors,
    uncoveredConnector,
  ];
  const selection = filterAvailableWords(reviewedWords, route, new Set());
  const independentSelection = independentlyFilterAvailableWords(
    reviewedWords,
    route,
    new Set(),
  );
  assert.equal(
    calculateWordPoolAnswerSetSha256(independentSelection.words),
    calculateWordPoolAnswerSetSha256(selection.words),
  );

  const oldConnectorPrefix = redundantConnectors.slice(0, 80);
  const oldPoolWords = [...themeWords, ...oldConnectorPrefix];
  const newPoolAnswers = new Set(selection.words.map((word) => word.answer));
  const oldPoolAnswers = new Set(oldPoolWords.map((word) => word.answer));
  assert.equal(newPoolAnswers.has(uncoveredConnector.answer), true);
  assert.equal(oldPoolAnswers.has(uncoveredConnector.answer), false);

  const answers = [
    ...themeWords.slice(0, 5),
    ...redundantConnectors.slice(0, 5),
  ]
    .map((word) => word.answer)
    .sort();
  assert.equal(
    answers.every(
      (answer) => newPoolAnswers.has(answer) && oldPoolAnswers.has(answer),
    ),
    true,
  );
  const futureUsedAnswers = new Set(answers);
  const futureConnectivity = summarizeFuturePoolConnectivity(
    filterAvailableWords(reviewedWords, nextRoute, futureUsedAnswers).words,
    nextRoute,
  );
  assert.deepEqual(
    independentlySummarizeFuturePoolConnectivity(
      independentlyFilterAvailableWords(
        reviewedWords,
        nextRoute,
        futureUsedAnswers,
      ).words,
      nextRoute,
    ),
    futureConnectivity,
  );
  const metrics = {
    wordCount: 10,
    autoRunCount: 0,
    crossRatio: 0.6,
    bboxArea: 30,
    bboxDensity: 0.6,
    multiIntersectionPlacements: 7,
    connectedComponents: 1,
    accidentalRunCount: 0,
    crossAnswerClueLeakCount: 0,
    answerContainmentCount: 0,
  };
  const ratios = {
    autoRunRatio: 0,
    multiCrossRatio: 0.7,
    themeEntryRatio: 0.5,
  };
  const candidate = {
    candidateIndex: 0,
    generationMethod: "standard-beam",
    compactSearch: null,
    pass: true,
    failedChecks: [],
    metrics,
    ratios,
    themeEntryCount: 5,
    answers,
    selectionScore: {
      ...futureConnectivity,
      cooldownAnswerCount: answers.length,
    },
  };
  const wordPool = fixtureWordPool({
    answers: selection.words.map((word) => word.answer),
    total: selection.words.length,
    theme: selection.themeWordCount,
    connectors: selection.connectorWordCount,
  });
  const attempts = [
    {
      phase: "base",
      phaseIndex: 0,
      phaseId: "base",
      retryIndex: 0,
      globalRetryIndex: 0,
      connectorLimit: 80,
      wordPool: structuredClone(wordPool),
      seed: calculateLaunchRetrySeed(config.baseSeed, route.puzzleId, 0),
      searchOptions: searchOptionsForRetry(config, 0),
      candidateCount: 1,
      candidates: [candidate],
    },
    {
      phase: "base",
      phaseIndex: 0,
      phaseId: "base",
      retryIndex: 1,
      globalRetryIndex: 1,
      connectorLimit: 80,
      wordPool: structuredClone(wordPool),
      seed: calculateLaunchRetrySeed(config.baseSeed, route.puzzleId, 1),
      searchOptions: searchOptionsForRetry(config, 1),
      candidateCount: 0,
      candidates: [],
    },
  ];
  return {
    config,
    reviewedWords,
    oldAnswerSetSha256: calculateWordPoolAnswerSetSha256(oldPoolWords),
    newAnswerSetSha256: wordPool.answerSetSha256,
    board: {
      puzzleId: route.puzzleId,
      route: route.route,
      difficulty: route.difficulty,
      themeId: route.themeId,
      effectiveWordDifficulties: ["easy", "normal"],
      broadenedDifficultyPool: false,
      selectedCandidateIndex: 0,
      selectedRetryIndex: 0,
      selectedSeed: attempts[0].seed,
      metrics: structuredClone(metrics),
      quality: { ratios: structuredClone(ratios) },
      wordPool: structuredClone(wordPool),
      attempts,
    },
  };
}

test("재봉인한 route/search/attempt 허위 trace를 거부한다", () => {
  const fixture = makeGeneratorTraceFixture();
  assert.doesNotThrow(() =>
    validateGeneratorReportTrace(fixture.config, [fixture.board]),
  );

  const forgeries = [
    {
      mutate: ({ config }) => {
        config.unrecognizedSearchPolicy = "forged";
      },
      expected: /generator config keys does not exactly match/,
    },
    {
      mutate: ({ config }) => {
        config.schemaVersion = "ko-kr-launch-generator-config/8";
      },
      expected: /trace config schema must be ko-kr-launch-generator-config\/11/,
    },
    {
      mutate: ({ config }) => {
        config.searchQuality.evaluator = "geometry-only";
      },
      expected: /search quality policy does not exactly match/,
    },
    {
      mutate: ({ config }) => {
        config.dailyConnectorRanking.connectorOrder.reverse();
      },
      expected: /daily connector ranking policy does not exactly match/,
    },
    {
      mutate: ({ config }) => {
        config.acceptedCandidateSelection.acceptedLookaheadRetries = 0;
      },
      expected: /acceptedCandidateSelection does not exactly match/,
    },
    {
      mutate: ({ config }) => {
        config.retries -= 1;
        config.searchEscalation.pop();
      },
      expected: /retries must match the launch candidate policy default/,
    },
    {
      mutate: ({ config }) => {
        config.routePlan[0].themeId = "forged-theme";
      },
      expected: /generator config routePlan does not exactly match/,
    },
    {
      mutate: ({ config }) => {
        config.searchEscalation[0].beamWidth += 1;
      },
      expected: /generator config searchEscalation does not exactly match/,
    },
    {
      mutate: ({ config }) => {
        config.searchEscalation[8].attempts += 1;
      },
      expected: /generator config searchEscalation does not exactly match/,
    },
    {
      mutate: ({ board }) => {
        board.attempts[0].retryIndex = 1;
      },
      expected: /phase\/local\/global retry identity is invalid/,
    },
    {
      mutate: ({ board }) => {
        board.attempts[0].searchOptions.samples += 1;
      },
      expected: /searchOptions does not exactly match/,
    },
    {
      mutate: ({ board }) => {
        board.attempts[0].candidateCount = 2;
      },
      expected: /candidateCount mismatch/,
    },
    {
      mutate: ({ board }) => {
        board.attempts[0].candidates[0].pass = true;
      },
      expected: /pass does not match independently derived quality/,
    },
    {
      mutate: ({ board }) => {
        board.attempts[1].candidates[1].pass = false;
      },
      expected: /pass does not match independently derived quality/,
    },
    {
      mutate: ({ board }) => {
        board.attempts[1].candidates[1].metrics.connectedComponents = 2;
      },
      expected: /does not satisfy generator candidate admission/,
    },
    {
      mutate: ({ board }) => {
        board.attempts[1].candidates[1].metrics.accidentalRunCount = 1;
      },
      expected: /does not satisfy generator candidate admission/,
    },
    {
      mutate: ({ board }) => {
        board.attempts[2].candidates[0].selectionScore.totalSharedCellEdges += 1;
      },
      expected: /selected candidate is not the policy winner/,
    },
    {
      mutate: ({ board }) => {
        board.attempts[2].candidates[0].selectionScore.cooldownAnswerCount = -1;
      },
      expected: /must be a non-negative safe integer/,
    },
    {
      mutate: ({ board }) => {
        board.attempts[2].candidates[0].answers.reverse();
      },
      expected: /answers canonical order does not exactly match/,
    },
    {
      mutate: ({ board }) => {
        board.attempts[2].candidates[0].answers.pop();
        board.attempts[2].candidates[0].selectionScore.cooldownAnswerCount -= 1;
      },
      expected: /answers length must match metrics.wordCount/,
    },
    {
      mutate: ({ board }) => {
        board.metrics.wordCount += 1;
      },
      expected: /selected candidate metrics does not exactly match/,
    },
    {
      mutate: ({ board }) => {
        board.selectedCandidateIndex = 0;
      },
      expected: /selected candidate is not a passing trace candidate/,
    },
    {
      mutate: ({ board }) => {
        board.selectedSeed += 1;
      },
      expected: /selectedSeed mismatch/,
    },
  ];

  for (const { mutate, expected } of forgeries) {
    const forged = structuredClone(fixture);
    mutate(forged);
    const resealedConfigHash = calculateCanonicalDocumentChecksum(
      forged.config,
    );
    assert.match(resealedConfigHash, /^sha256:[0-9a-f]{64}$/);
    assert.throws(
      () => validateGeneratorReportTrace(forged.config, [forged.board]),
      expected,
    );
  }
});

test("compact fallback trace의 정책·node cap·정답 inventory를 봉인한다", () => {
  const fixture = makeGeneratorTraceFixture();
  const candidate = fixture.board.attempts[1].candidates[1];
  candidate.generationMethod = "compact-fallback";
  candidate.compactSearch = {
    policyId: fixture.config.searchQuality.compactFallback.policyId,
    termination: "pass",
    nodeCount: 120,
    uniqueStateCount: 80,
    maxNodeCount: fixture.config.searchQuality.compactFallback.maxNodeCount,
    maxBboxArea:
      DIFFICULTY_PROFILES[fixture.board.difficulty].boardSize *
      Math.ceil(DIFFICULTY_PROFILES[fixture.board.difficulty].boardSize / 2),
    selectedAnswers: [...candidate.answers],
  };
  assert.doesNotThrow(() =>
    validateGeneratorReportTrace(fixture.config, [fixture.board]),
  );

  const forgeries = [
    {
      mutate: (trace) => {
        trace.policyId = "forged-compact-policy";
      },
      expected: /compactSearch policy or termination is invalid/,
    },
    {
      mutate: (trace) => {
        trace.nodeCount = trace.maxNodeCount + 1;
      },
      expected: /exceeds its deterministic node cap/,
    },
    {
      mutate: (trace) => {
        trace.selectedAnswers[0] = "forged-answer";
        trace.selectedAnswers.sort();
      },
      expected: /selected answer inventory/,
    },
    {
      mutate: (trace, candidate) => {
        candidate.metrics.bboxArea = trace.maxBboxArea + 1;
      },
      expected: /candidate exceeds maxBboxArea/,
    },
  ];
  for (const { mutate, expected } of forgeries) {
    const forged = structuredClone(fixture);
    const forgedCandidate = forged.board.attempts[1].candidates[1];
    mutate(forgedCandidate.compactSearch, forgedCandidate);
    assert.throws(
      () => validateGeneratorReportTrace(forged.config, [forged.board]),
      expected,
    );
  }

  const forgedActivation = structuredClone(fixture);
  const compactCandidate = forgedActivation.board.attempts[1].candidates[1];
  forgedActivation.board.attempts[1].candidates[0] = {
    ...structuredClone(compactCandidate),
    candidateIndex: 0,
    generationMethod: "standard-beam",
    compactSearch: null,
  };
  assert.throws(
    () =>
      validateGeneratorReportTrace(forgedActivation.config, [
        forgedActivation.board,
      ]),
    /compact fallback candidate placement is invalid/,
  );
});

test("normal report의 hard effective 난이도와 허위 broadened 상태를 거부한다", () => {
  const reportBoard = {
    difficulty: "normal",
    effectiveWordDifficulties: ["easy", "normal"],
    broadenedDifficultyPool: false,
  };
  assert.equal(validateReportedDifficultySelection(reportBoard), true);

  const hardBroadened = structuredClone(reportBoard);
  hardBroadened.effectiveWordDifficulties.push("hard");
  hardBroadened.broadenedDifficultyPool = true;
  assert.throws(
    () => validateReportedDifficultySelection(hardBroadened),
    /exceeds normal ceiling/,
  );

  const forgedFlag = structuredClone(reportBoard);
  forgedFlag.broadenedDifficultyPool = true;
  assert.throws(
    () => validateReportedDifficultySelection(forgedFlag),
    /broadenedDifficultyPool does not match/,
  );
});

test("report 난이도 evidence를 재계산한 selected word selection과 exact binding한다", () => {
  const currentSelection = selectWordsForProfile(
    [
      ...Array.from({ length: 5 }, (_, index) => ({
        answer: `쉬움-${index}`,
        difficulty: "easy",
      })),
      ...Array.from({ length: 200 }, (_, index) => ({
        answer: `보통-${index}`,
        difficulty: "normal",
      })),
      ...Array.from({ length: 200 }, (_, index) => ({
        answer: `어려움-${index}`,
        difficulty: "hard",
      })),
    ],
    DIFFICULTY_PROFILES.easy,
  );
  assert.deepEqual(currentSelection.difficulties, ["easy", "normal"]);
  assert.equal(currentSelection.broadened, true);

  const forgedReportBoard = {
    difficulty: "easy",
    // 구조상 canonical이고 easy ceiling 안이지만, 실제 selector가 normal을 건너뛴 채
    // hard만 보강할 수는 없다.
    effectiveWordDifficulties: ["easy", "hard"],
    broadenedDifficultyPool: true,
  };
  assert.equal(validateReportedDifficultySelection(forgedReportBoard), true);
  assert.throws(
    () =>
      validateReportedDifficultySelection(
        forgedReportBoard,
        "generator report board",
        currentSelection,
      ),
    /effectiveWordDifficulties independently recalculated does not exactly match/,
  );
});

test("chapter·bonus·weekly report의 fallback attempt를 명시적으로 거부한다", () => {
  for (const routeKind of ["chapter", "bonus", "weekly-challenge"]) {
    const fixture = makeFallbackGeneratorTraceFixture(routeKind);
    assert.throws(
      () => validateGeneratorReportTrace(fixture.config, [fixture.board]),
      /fallback is allowed only for daily routes/,
    );
  }
});

test("daily는 base를 모두 소진한 뒤에만 fallback global retry trace를 허용한다", () => {
  const fixture = makeDailyFallbackPoolTraceFixture();
  assert.doesNotThrow(() =>
    validateGeneratorReportTrace(fixture.config, [fixture.board]),
  );

  const earlyFallback = structuredClone(fixture);
  earlyFallback.board.attempts[7].candidates = structuredClone(
    earlyFallback.board.attempts[8].candidates,
  );
  earlyFallback.board.attempts[7].candidateCount =
    earlyFallback.board.attempts[7].candidates.length;
  assert.throws(
    () =>
      validateGeneratorReportTrace(earlyFallback.config, [earlyFallback.board]),
    /fallback requires an exhausted non-passing base phase/,
  );

  const forgedGlobalIndex = structuredClone(fixture);
  forgedGlobalIndex.board.attempts[8].globalRetryIndex = 7;
  assert.throws(
    () =>
      validateGeneratorReportTrace(forgedGlobalIndex.config, [
        forgedGlobalIndex.board,
      ]),
    /phase\/local\/global retry identity is invalid/,
  );

  const forgedConnectorLimit = structuredClone(fixture);
  forgedConnectorLimit.board.attempts[8].connectorLimit = 80;
  assert.throws(
    () =>
      validateGeneratorReportTrace(forgedConnectorLimit.config, [
        forgedConnectorLimit.board,
      ]),
    /connectorLimit mismatch/,
  );

  const forgedSelectedPool = structuredClone(fixture);
  forgedSelectedPool.board.wordPool.total += 1;
  assert.throws(
    () =>
      validateGeneratorReportTrace(forgedSelectedPool.config, [
        forgedSelectedPool.board,
      ]),
    /wordPool must match the selected phase pool/,
  );
});

test("fallback 후보 답과 selection score를 해당 retry의 확장 pool로 재계산한다", () => {
  const fixture = makeDailyFallbackPoolTraceFixture();
  assert.doesNotThrow(() =>
    validateGeneratorReportTrace(fixture.config, [fixture.board], {
      reviewedWords: fixture.reviewedWords,
    }),
  );

  const fallbackCandidate = fixture.board.attempts[8].candidates[0];
  assert.ok(fallbackCandidate.answers.includes(fixture.fallbackOnlyAnswer));

  const outsidePool = structuredClone(fixture);
  outsidePool.board.attempts[8].candidates[0].answers[0] = "연결-159";
  outsidePool.board.attempts[8].candidates[0].answers.sort();
  assert.throws(
    () =>
      validateGeneratorReportTrace(outsidePool.config, [outsidePool.board], {
        reviewedWords: outsidePool.reviewedWords,
      }),
    /answers contain a word outside the current route pool/,
  );

  const forgedScore = structuredClone(fixture);
  forgedScore.board.attempts[8].candidates[0].selectionScore.totalSharedCellEdges += 1;
  assert.throws(
    () =>
      validateGeneratorReportTrace(forgedScore.config, [forgedScore.board], {
        reviewedWords: forgedScore.reviewedWords,
      }),
    /selectionScore independently recalculated does not exactly match/,
  );
});

test("old ranking과 겹치는 후보만 있어도 word pool answer-set seal 변조를 거부한다", () => {
  const fixture = makeDailyGreedyPoolTraceFixture();
  assert.notEqual(fixture.oldAnswerSetSha256, fixture.newAnswerSetSha256);
  assert.doesNotThrow(() =>
    validateGeneratorReportTrace(fixture.config, [fixture.board], {
      reviewedWords: fixture.reviewedWords,
    }),
  );

  const forged = structuredClone(fixture);
  forged.board.wordPool.answerSetSha256 = forged.oldAnswerSetSha256;
  for (const attempt of forged.board.attempts) {
    attempt.wordPool.answerSetSha256 = forged.oldAnswerSetSha256;
  }
  assert.throws(
    () =>
      validateGeneratorReportTrace(forged.config, [forged.board], {
        reviewedWords: forged.reviewedWords,
      }),
    /wordPool independently recalculated does not exactly match/,
  );
});

test("current pointer before는 generator commit의 Git blob과 일치해야 한다", async (t) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), "crossword-current-pointer-"),
  );
  t.after(() => rm(fixtureRoot, { force: true, recursive: true }));
  const publicRoot = path.join(fixtureRoot, "public/game-content/v1/ko-KR");
  const pointerPath = path.join(publicRoot, "current.json");
  const baselineBytes = Buffer.from('{"catalogId":"baseline"}\n');
  await mkdir(publicRoot, { recursive: true });
  await writeFile(pointerPath, baselineBytes);
  await execFileAsync("git", ["init", "-q"], { cwd: fixtureRoot });
  await execFileAsync("git", ["add", "."], { cwd: fixtureRoot });
  await execFileAsync(
    "git",
    [
      "-c",
      "user.name=Validator Test",
      "-c",
      "user.email=validator@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-q",
      "-m",
      "baseline",
    ],
    { cwd: fixtureRoot },
  );
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: fixtureRoot,
  });
  const commit = stdout.trim();
  const baselineSha256 = sha256(baselineBytes);
  assert.equal(
    await snapshotCommittedCurrentPointer(fixtureRoot, commit),
    baselineSha256,
  );
  const validReport = {
    generator: { commit },
    currentPointer: {
      path: "/game-content/v1/ko-KR/current.json",
      beforeSha256: baselineSha256,
      afterSha256: baselineSha256,
      unchanged: true,
    },
  };
  await assert.doesNotReject(() =>
    validateCurrentPointer(fixtureRoot, publicRoot, validReport),
  );

  const forgedBytes = Buffer.from('{"catalogId":"forged-live"}\n');
  await writeFile(pointerPath, forgedBytes);
  const forgedSha256 = sha256(forgedBytes);
  await assert.rejects(
    () =>
      validateCurrentPointer(fixtureRoot, publicRoot, {
        generator: { commit },
        currentPointer: {
          path: "/game-content/v1/ko-KR/current.json",
          beforeSha256: forgedSha256,
          afterSha256: forgedSha256,
          unchanged: true,
        },
      }),
    /before state differs from generator commit/,
  );
});
