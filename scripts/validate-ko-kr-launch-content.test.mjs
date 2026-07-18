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
  buildLaunchRoutePlan,
  searchOptionsForRetry,
} from "./build-ko-kr-launch-content.mjs";
import {
  calculateCanonicalDocumentChecksum,
  calculateContentQualityEvidence,
  calculateLaunchRetrySeed,
  resolvePublicArtifactPath,
  snapshotCommittedCurrentPointer,
  validateBundledFirstRunCatalog,
  validateCurrentPointer,
  validateFirstRunSourceLock,
  validateGeneratedEntryAgainstReviewedWord,
  validateGeneratorReportTrace,
  validateLicensePolicyAnchors,
  validateReportedQualityEvidence,
} from "./validate-ko-kr-launch-content.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const execFileAsync = promisify(execFile);

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
const firstRunSourceLock = Object.freeze({
  sourceId: "repo-first-run-content-v1",
  sourceUrl:
    "https://github.com/seorilabs/crossword-puzzle/blob/70835adbd2e3cea298e9023f4d061dd3ee84b987/src/data/onboardingPuzzle.ts",
  sourceCommit: "70835adbd2e3cea298e9023f4d061dd3ee84b987",
  sourceFileSha256:
    "sha256:e121052048ed27db79a3c3ce3721095984b9ba9c1e4bb6613d71b8bf7bc31f60",
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
    "sha256:abaccaa41f73f4c5428f4d158c4626897d145a91a2d0cc8dd14299a2e8942d0c",
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
      "https://github.com/seorilabs/crossword-puzzle/blob/70835adbd2e3cea298e9023f4d061dd3ee84b987/src/data/../game-shell/onboardingGameContent.ts",
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
        answerCells: ["가", "게"],
        direction: "across",
        row: 0,
        col: 0,
        generatedBy: "placed",
        domainTags: ["general"],
      },
      {
        answerCells: ["가", "나"],
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
});

function makeGeneratorTraceFixture() {
  const route = buildLaunchRoutePlan()[0];
  const config = {
    baseSeed: 20260718,
    attempts: 30,
    retries: 6,
    samples: 5,
    beamWidth: 16,
    branchLimit: 14,
    candidateWordLimit: 600,
    denseCandidateLimit: 96,
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
  };
  const rejectedRatios = { autoRunRatio: 0.6, multiCrossRatio: 0.2 };
  const selectedMetrics = {
    wordCount: 16,
    autoRunCount: 4,
    crossRatio: 0.6,
    bboxDensity: 0.7,
    multiIntersectionPlacements: 12,
    connectedComponents: 1,
    accidentalRunCount: 0,
  };
  const selectedRatios = { autoRunRatio: 0.25, multiCrossRatio: 0.75 };
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
          failedChecks: ["minCrossRatio"],
          metrics: rejectedMetrics,
          ratios: rejectedRatios,
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
          failedChecks: ["minBboxDensity"],
          metrics: rejectedMetrics,
          ratios: rejectedRatios,
        },
        {
          candidateIndex: 1,
          pass: true,
          failedChecks: [],
          metrics: { ...selectedMetrics },
          ratios: { ...selectedRatios },
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
      expected: /contains a pass before the selected retry/,
    },
    {
      mutate: ({ board }) => {
        board.attempts[1].candidates[1].metrics.wordCount += 1;
      },
      expected: /selected first-pass candidate metrics does not exactly match/,
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
