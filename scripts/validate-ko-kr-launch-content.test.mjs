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
  DAILY_CONNECTOR_WORD_LIMIT_BY_DIFFICULTY,
  LAUNCH_ACCEPTED_CANDIDATE_POLICY,
  LAUNCH_THEME_IDS,
  LAUNCH_THEME_OWNER_POLICY,
  allocateLaunchThemeOwners,
  buildLaunchRoutePlan,
  searchOptionsForRetry,
} from "./build-ko-kr-launch-content.mjs";
import {
  KO_KR_LAUNCH_CLUE_QUALITY_POLICY,
  calculateCanonicalDocumentChecksum,
  calculateContentQualityEvidence,
  calculateLaunchRetrySeed,
  deriveLaunchWordBankReport,
  independentlyAllocateLaunchThemeOwners,
  resolvePublicArtifactPath,
  snapshotCommittedCurrentPointer,
  validateBundledFirstRunCatalog,
  validateCatalogLaunchSelection,
  validateCurrentPointer,
  validateFirstRunSourceLock,
  validateGeneratedEntryAgainstReviewedWord,
  validateGeneratorClueQualityPolicy,
  validateGeneratorReportTrace,
  validateGeneratorThemeInventoryPolicy,
  validateGlobalInventory,
  validateLaunchWordBankReport,
  validateLicensePolicyAnchors,
  validateReportedQualityEvidence,
} from "./validate-ko-kr-launch-content.mjs";

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

test("generator theme inventory의 길이 상한과 owner 정책 재봉인을 거부한다", () => {
  const config = {
    dailyConnectorWordLimitByDifficulty: structuredClone(
      DAILY_CONNECTOR_WORD_LIMIT_BY_DIFFICULTY,
    ),
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
    "sha256:18ee800bc56bb69fdb20ce87ed385443dbaec7f8fa985f375ebfa46ac7f0b4ee",
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

function makeGeneratorTraceFixture() {
  const route = buildLaunchRoutePlan()[0];
  const config = {
    schemaVersion: "ko-kr-launch-generator-config/5",
    acceptedCandidateSelection: structuredClone(
      LAUNCH_ACCEPTED_CANDIDATE_POLICY,
    ),
    baseSeed: 20260718,
    attempts: 30,
    retries: LAUNCH_ACCEPTED_CANDIDATE_POLICY.defaultRetries,
    samples: 5,
    beamWidth: 16,
    branchLimit: 14,
    candidateWordLimit: 600,
    denseCandidateLimit: 96,
    minMultiCrossRatio: 0.65,
    maxAutoRunRatio: 0.5,
    minDailyThemeEntryRatio: 0.5,
    clueQuality: clueQualityConfig().clueQuality,
    routePlan: buildLaunchRoutePlan(),
  };
  config.searchEscalation = Array.from(
    { length: config.retries },
    (_, retryIndex) => searchOptionsForRetry(config, retryIndex),
  );
  const rejectedMetrics = {
    wordCount: 10,
    autoRunCount: 6,
    crossRatio: 0.3,
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
    cooldownAnswerCount: rejectedAnswers.length,
  };
  const selectedSelectionScore = {
    totalSharedCellEdges: 100,
    themeConnectorSharedCellEdges: 0,
    isolatedThemeOwnerCount: 0,
    cooldownAnswerCount: selectedAnswers.length,
  };
  const attempts = [
    {
      retryIndex: 0,
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
      retryIndex: 1,
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
      retryIndex: 2,
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
  return {
    config,
    board: {
      puzzleId: route.puzzleId,
      route: route.route,
      difficulty: route.difficulty,
      themeId: route.themeId,
      selectedCandidateIndex: 1,
      selectedRetryIndex: 1,
      selectedSeed: attempts[1].seed,
      metrics: { ...selectedMetrics },
      quality: { ratios: { ...selectedRatios } },
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
        config.schemaVersion = "ko-kr-launch-generator-config/4";
      },
      expected: /trace config schema must be ko-kr-launch-generator-config\/5/,
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
      mutate: ({ board }) => {
        board.attempts[0].retryIndex = 1;
      },
      expected: /retryIndex must be sequential/,
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
