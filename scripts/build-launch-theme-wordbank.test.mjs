import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  LAUNCH_THEME_WORD_BANK_PATHS,
  buildLaunchThemeWordBank,
  deriveLaunchThemeArtifacts,
  sha256,
} from "./build-launch-theme-wordbank.mjs";

const FIXTURE_SHARD_SPECS = Object.freeze([
  Object.freeze({
    relativePath:
      "data/game-content/v1/ko-KR/reviews/editorial-theme-decisions-0000-0799.json",
    startIndex: 0,
    endIndexInclusive: 1,
  }),
  Object.freeze({
    relativePath:
      "data/game-content/v1/ko-KR/reviews/editorial-theme-decisions-0800-1599.json",
    startIndex: 2,
    endIndexInclusive: 3,
  }),
  Object.freeze({
    relativePath:
      "data/game-content/v1/ko-KR/reviews/editorial-theme-decisions-1600-2399.json",
    startIndex: 4,
    endIndexInclusive: 5,
  }),
]);

function prettyJson(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function buildFixture() {
  const rows = [
    {
      answer: "가게",
      clue: "동네에서 물건을 파는 작은 상점",
      decision: "approve",
      difficulty: "easy",
      editorialStatus: "approved",
      eligibleThemeIds: ["table-kitchen"],
      reasonCodes: ["direct-fit:table-kitchen"],
      senseAlignment: "same-sense",
    },
    {
      answer: "가격",
      clue: "물건을 사기 위해 치르는 값",
      decision: "rewrite",
      difficulty: "normal",
      editorialStatus: "approved",
      eligibleThemeIds: [],
      reasonCodes: ["no-direct-theme-fit"],
      senseAlignment: "same-sense",
    },
    {
      answer: "길이",
      clue: "한끝에서 다른 끝까지의 거리",
      decision: "approve",
      difficulty: "hard",
      editorialStatus: "needs-editorial-fix",
      eligibleThemeIds: [],
      reasonCodes: ["clue-definition-sense-mismatch"],
      senseAlignment: "needs-editorial-fix",
    },
    {
      answer: "거절",
      clue: "기본 검토에서 제외된 단서",
      decision: "reject",
      difficulty: "easy",
      editorialStatus: "not-applicable-rejected",
      eligibleThemeIds: [],
      reasonCodes: ["base-editorial-rejected"],
      senseAlignment: "not-applicable",
    },
    {
      answer: "공원",
      clue: "사람들이 쉬며 자연을 만나는 곳",
      decision: "approve",
      difficulty: "hard",
      editorialStatus: "approved",
      eligibleThemeIds: ["table-kitchen", "living-world"],
      reasonCodes: ["direct-fit:table-kitchen", "direct-fit:living-world"],
      senseAlignment: "same-sense",
    },
    {
      answer: "탈락",
      clue: "기본 검토에서 제외된 두 번째 단서",
      decision: "reject",
      difficulty: "normal",
      editorialStatus: "not-applicable-rejected",
      eligibleThemeIds: [],
      reasonCodes: ["base-editorial-rejected"],
      senseAlignment: "not-applicable",
    },
  ].map((row, candidateIndex) => ({
    ...row,
    candidateIndex,
    definitionChecksum: sha256(`fixture-definition-${candidateIndex}`),
    sourceEntryId: `fixture-${candidateIndex}`,
  }));
  const candidateFileSha256 = sha256("fixture-candidates");
  const taxonomyDocument = {
    schemaVersion: "game-content-theme-taxonomy/1",
    taxonomyId: "fixture-taxonomy-v1",
    contentLocale: "ko-KR",
    policy: {
      eligibilityRule: "fixture",
    },
    themes: [
      {
        id: "table-kitchen",
        label: "식탁과 부엌",
      },
      {
        id: "living-world",
        label: "살아 있는 자연",
      },
    ],
    inventoryGate: {
      dailyBoardsPerTheme: 7,
      normalBoardsPerTheme: 6,
      hardBoardsPerTheme: 1,
      minimumThemeEntryRatio: 0.5,
      hardFailDistinctOwnerCountPerTheme: 2,
      productionTargetDistinctOwnerCountPerTheme: 4,
      hardFailNormalOrHardReservePerTheme: 1,
      productionTargetNormalOrHardReservePerTheme: 2,
      ownerRule: "fixture owner rule",
    },
  };
  const taxonomyText = prettyJson(taxonomyDocument);
  const taxonomySha256 = sha256(taxonomyText);

  const baseWords = rows
    .filter((row) => row.decision !== "reject")
    .map((row) => ({
      answer: row.answer,
      sourceEntryId: row.sourceEntryId,
      definition: `fixture definition ${row.candidateIndex}`,
      definitionChecksum: row.definitionChecksum,
      clue: row.clue,
      difficulty: row.difficulty,
      themeTags: ["legacy-theme"],
      domainTags: ["legacy-domain"],
      reviewDecision: row.decision,
      reviewLedgerIndex: row.candidateIndex,
      customEvidence: {
        marker: `preserve-${row.candidateIndex}`,
      },
    }));
  const baseWordBankDocument = {
    metadata: {
      schemaVersion: "launch-wordbank/1",
      contentLocale: "ko-KR",
      sourceDataset: {
        datasetId: "fixture-dataset",
      },
      sourceCandidateFile:
        "data/game-content/v1/ko-KR/reviews/editorial-candidates.json",
      sourceCandidateFileSha256: candidateFileSha256,
      editorialCheckSetId: "fixture-check-set",
    },
    words: baseWords,
  };
  const baseWordBankText = prettyJson(baseWordBankDocument);
  const baseWordBankSha256 = sha256(baseWordBankText);

  const baseEditorialLedgerDocument = {
    schemaVersion: "game-content-editorial-ledger/1",
    contentLocale: "ko-KR",
    editorialCheckSetId: "fixture-check-set",
    candidateFileSha256,
    wordbankFileSha256: baseWordBankSha256,
    coverage: [],
    summary: {},
    decisions: rows.map((row) => ({
      candidateIndex: row.candidateIndex,
      sourceEntryId: row.sourceEntryId,
      answer: row.answer,
      decision: row.decision,
      reasonCodes: [
        row.decision === "reject"
          ? "fixture-base-reject"
          : "fixture-base-approved",
      ],
      checkSetId: "fixture-check-set",
      definitionChecksum: row.definitionChecksum,
      ...(row.decision === "rewrite" ? { rewrittenClue: row.clue } : {}),
    })),
  };
  const baseEditorialLedgerText = prettyJson(baseEditorialLedgerDocument);
  const baseEditorialLedgerSha256 = sha256(baseEditorialLedgerText);

  const themeShardInputs = FIXTURE_SHARD_SPECS.map((spec, shardIndex) => {
    const document = {
      schemaVersion: "game-content-theme-editorial-decisions/1",
      contentLocale: "ko-KR",
      candidateFileSha256,
      baseEditorialLedgerSha256,
      taxonomyId: taxonomyDocument.taxonomyId,
      taxonomySha256,
      reviewerId: `fixture-reviewer-${shardIndex}`,
      reviewedAt: `2026-07-18T0${shardIndex}:00:00.000Z`,
      coverage: {
        startIndex: spec.startIndex,
        endIndexInclusive: spec.endIndexInclusive,
      },
      decisions: rows
        .slice(spec.startIndex, spec.endIndexInclusive + 1)
        .map((row) => ({
          candidateIndex: row.candidateIndex,
          sourceEntryId: row.sourceEntryId,
          answer: row.answer,
          definitionChecksum: row.definitionChecksum,
          resolvedClueChecksum: sha256(row.clue),
          editorialStatus: row.editorialStatus,
          senseAlignment: row.senseAlignment,
          eligibleThemeIds: row.eligibleThemeIds,
          reasonCodes: row.reasonCodes,
        })),
    };
    return {
      relativePath: spec.relativePath,
      text: prettyJson(document),
    };
  });

  return {
    baseEditorialLedgerDocument,
    baseEditorialLedgerText,
    baseWordBankDocument,
    baseWordBankText,
    contract: {
      expectedCandidateCount: rows.length,
      expectedCandidateFileSha256: candidateFileSha256,
      expectedBaseWordBankSha256: baseWordBankSha256,
      expectedBaseEditorialLedgerSha256: baseEditorialLedgerSha256,
      expectedTaxonomySha256: taxonomySha256,
      shardSpecs: FIXTURE_SHARD_SPECS,
    },
    rows,
    taxonomyDocument,
    taxonomyText,
    themeShardInputs,
  };
}

function deriveFixture(fixture, overrides = {}) {
  return deriveLaunchThemeArtifacts({
    baseWordBankText: overrides.baseWordBankText ?? fixture.baseWordBankText,
    baseEditorialLedgerText:
      overrides.baseEditorialLedgerText ?? fixture.baseEditorialLedgerText,
    taxonomyText: overrides.taxonomyText ?? fixture.taxonomyText,
    themeShardInputs: overrides.themeShardInputs ?? fixture.themeShardInputs,
    contract: overrides.contract ?? fixture.contract,
  });
}

function replaceShard(fixture, shardIndex, mutate) {
  return fixture.themeShardInputs.map((input, index) => {
    if (index !== shardIndex) return input;
    const document = JSON.parse(input.text);
    mutate(document);
    return { ...input, text: prettyJson(document) };
  });
}

async function writeFixture(repositoryRoot, fixture, { omitShardIndex } = {}) {
  const inputs = [
    [LAUNCH_THEME_WORD_BANK_PATHS.baseWordBank, fixture.baseWordBankText],
    [
      LAUNCH_THEME_WORD_BANK_PATHS.baseEditorialLedger,
      fixture.baseEditorialLedgerText,
    ],
    [LAUNCH_THEME_WORD_BANK_PATHS.taxonomy, fixture.taxonomyText],
    ...fixture.themeShardInputs
      .filter((_, index) => index !== omitShardIndex)
      .map((input) => [input.relativePath, input.text]),
  ];
  for (const [relativePath, contents] of inputs) {
    const absolutePath = path.join(repositoryRoot, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents, "utf8");
  }
}

test("v2 wordbank and theme ledger are deterministic and preserve eligible base word fields", () => {
  const fixture = buildFixture();
  const first = deriveFixture(fixture);
  const second = deriveFixture(fixture);

  assert.equal(first.wordBankText, second.wordBankText);
  assert.equal(first.themeLedgerText, second.themeLedgerText);
  assert.equal(
    first.wordBankDocument.metadata.schemaVersion,
    "launch-wordbank/2",
  );
  assert.deepEqual(
    first.wordBankDocument.words.map((word) => word.reviewLedgerIndex),
    [0, 1, 4],
  );
  assert.deepEqual(first.wordBankDocument.words[0], {
    ...fixture.baseWordBankDocument.words[0],
    themeTags: ["table-kitchen"],
    domainTags: ["general"],
    themeDecisionLedgerIndex: 0,
  });
  assert.deepEqual(first.wordBankDocument.words[1].themeTags, []);
  assert.deepEqual(first.wordBankDocument.words[2].themeTags, [
    "table-kitchen",
    "living-world",
  ]);
  assert.deepEqual(first.wordBankDocument.metadata.themeTaxonomy, {
    taxonomyId: fixture.taxonomyDocument.taxonomyId,
    path: LAUNCH_THEME_WORD_BANK_PATHS.taxonomy,
    sha256: fixture.contract.expectedTaxonomySha256,
    themeIds: ["table-kitchen", "living-world"],
    inventoryGate: fixture.taxonomyDocument.inventoryGate,
  });
  assert.equal(
    first.wordBankDocument.metadata.exclusionCounts.themeNeedsEditorialFix,
    1,
  );
  assert.deepEqual(
    first.wordBankDocument.metadata.themeEligibilitySummary.byTheme,
    [
      {
        themeId: "table-kitchen",
        total: 2,
        difficulty: { easy: 1, normal: 0, hard: 1 },
      },
      {
        themeId: "living-world",
        total: 1,
        difficulty: { easy: 0, normal: 0, hard: 1 },
      },
    ],
  );
  assert.equal(first.themeLedgerDocument.decisions.length, 6);
  assert.deepEqual(
    first.themeLedgerDocument.decisions,
    fixture.themeShardInputs.flatMap(
      (input) => JSON.parse(input.text).decisions,
    ),
  );
  assert.equal(
    first.themeLedgerDocument.wordBankV2.sha256,
    sha256(first.wordBankText),
  );
});

test("tampered theme decision identity fails closed", () => {
  const fixture = buildFixture();
  const themeShardInputs = replaceShard(fixture, 0, (document) => {
    document.decisions[0].answer = "변조";
  });
  assert.throws(
    () => deriveFixture(fixture, { themeShardInputs }),
    /identity does not match base editorial decision 0/u,
  );
});

test("theme shard coverage gaps fail clearly", () => {
  const fixture = buildFixture();
  const themeShardInputs = replaceShard(fixture, 1, (document) => {
    document.coverage.startIndex = 3;
  });
  assert.throws(
    () => deriveFixture(fixture, { themeShardInputs }),
    /coverage must be 2-3/u,
  );
});

test("taxonomy and resolved clue checksum tampering fail closed", async (t) => {
  await t.test("taxonomy raw checksum", () => {
    const fixture = buildFixture();
    const taxonomyDocument = JSON.parse(fixture.taxonomyText);
    taxonomyDocument.inventoryGate.ownerRule = "tampered";
    assert.throws(
      () =>
        deriveFixture(fixture, {
          taxonomyText: prettyJson(taxonomyDocument),
        }),
      /checksum does not match the locked taxonomy/u,
    );
  });

  await t.test("resolved clue checksum", () => {
    const fixture = buildFixture();
    const themeShardInputs = replaceShard(fixture, 0, (document) => {
      document.decisions[1].resolvedClueChecksum = sha256("tampered clue");
    });
    assert.throws(
      () => deriveFixture(fixture, { themeShardInputs }),
      /resolvedClueChecksum does not match the v1 reviewed clue/u,
    );
  });
});

test("filesystem build excludes needs-editorial-fix and preserves base bytes", async (t) => {
  const fixture = buildFixture();
  const repositoryRoot = await mkdtemp(
    path.join(os.tmpdir(), "launch-theme-wordbank-success-"),
  );
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  await writeFixture(repositoryRoot, fixture);
  const baseWordBankPath = path.join(
    repositoryRoot,
    LAUNCH_THEME_WORD_BANK_PATHS.baseWordBank,
  );
  const baseLedgerPath = path.join(
    repositoryRoot,
    LAUNCH_THEME_WORD_BANK_PATHS.baseEditorialLedger,
  );
  const before = await Promise.all([
    readFile(baseWordBankPath),
    readFile(baseLedgerPath),
  ]);

  const result = await buildLaunchThemeWordBank({
    repositoryRoot,
    contract: fixture.contract,
  });
  const after = await Promise.all([
    readFile(baseWordBankPath),
    readFile(baseLedgerPath),
  ]);
  assert.equal(Buffer.compare(before[0], after[0]), 0);
  assert.equal(Buffer.compare(before[1], after[1]), 0);
  assert.equal(result.wordCount, 3);

  const outputWordBank = JSON.parse(
    await readFile(
      path.join(repositoryRoot, LAUNCH_THEME_WORD_BANK_PATHS.outputWordBank),
      "utf8",
    ),
  );
  assert.equal(
    outputWordBank.words.some((word) => word.reviewLedgerIndex === 2),
    false,
  );
  const outputLedgerText = await readFile(
    path.join(repositoryRoot, LAUNCH_THEME_WORD_BANK_PATHS.outputThemeLedger),
    "utf8",
  );
  const outputLedger = JSON.parse(outputLedgerText);
  assert.equal(outputLedger.wordBankV2.sha256, result.wordBankSha256);
  assert.equal(outputLedger.summary.editorialStatus["needs-editorial-fix"], 1);

  const outputPaths = [
    path.join(repositoryRoot, LAUNCH_THEME_WORD_BANK_PATHS.outputWordBank),
    path.join(repositoryRoot, LAUNCH_THEME_WORD_BANK_PATHS.outputThemeLedger),
  ];
  const outputsBeforeCheck = await Promise.all(
    outputPaths.map((outputPath) => readFile(outputPath)),
  );
  const checkResult = await buildLaunchThemeWordBank({
    repositoryRoot,
    contract: fixture.contract,
    check: true,
  });
  const outputsAfterCheck = await Promise.all(
    outputPaths.map((outputPath) => readFile(outputPath)),
  );
  assert.equal(checkResult.checked, true);
  assert.equal(Buffer.compare(outputsBeforeCheck[0], outputsAfterCheck[0]), 0);
  assert.equal(Buffer.compare(outputsBeforeCheck[1], outputsAfterCheck[1]), 0);
});

test("--check fails on missing outputs without creating them", async (t) => {
  const fixture = buildFixture();
  const repositoryRoot = await mkdtemp(
    path.join(os.tmpdir(), "launch-theme-wordbank-check-missing-"),
  );
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  await writeFixture(repositoryRoot, fixture);

  await assert.rejects(
    buildLaunchThemeWordBank({
      repositoryRoot,
      contract: fixture.contract,
      check: true,
    }),
    /generated theme review artifact is missing/u,
  );
  for (const relativePath of [
    LAUNCH_THEME_WORD_BANK_PATHS.outputWordBank,
    LAUNCH_THEME_WORD_BANK_PATHS.outputThemeLedger,
  ]) {
    await assert.rejects(readFile(path.join(repositoryRoot, relativePath)), {
      code: "ENOENT",
    });
  }
});

test("--check fails on stale outputs without rewriting them", async (t) => {
  for (const [name, relativePath] of [
    ["wordbank", LAUNCH_THEME_WORD_BANK_PATHS.outputWordBank],
    ["theme ledger", LAUNCH_THEME_WORD_BANK_PATHS.outputThemeLedger],
  ]) {
    await t.test(name, async (t) => {
      const fixture = buildFixture();
      const repositoryRoot = await mkdtemp(
        path.join(os.tmpdir(), "launch-theme-wordbank-check-stale-"),
      );
      t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
      await writeFixture(repositoryRoot, fixture);
      await buildLaunchThemeWordBank({
        repositoryRoot,
        contract: fixture.contract,
      });

      const outputPath = path.join(repositoryRoot, relativePath);
      const staleBytes = Buffer.from(`stale-${name}\n`, "utf8");
      await writeFile(outputPath, staleBytes);
      await assert.rejects(
        buildLaunchThemeWordBank({
          repositoryRoot,
          contract: fixture.contract,
          check: true,
        }),
        new RegExp(`generated theme review artifact is stale: ${relativePath}`),
      );
      assert.equal(Buffer.compare(await readFile(outputPath), staleBytes), 0);
    });
  }
});

test("missing required theme shard fails before writing outputs", async (t) => {
  const fixture = buildFixture();
  const repositoryRoot = await mkdtemp(
    path.join(os.tmpdir(), "launch-theme-wordbank-missing-"),
  );
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  await writeFixture(repositoryRoot, fixture, { omitShardIndex: 2 });
  const baseWordBankPath = path.join(
    repositoryRoot,
    LAUNCH_THEME_WORD_BANK_PATHS.baseWordBank,
  );
  const baseLedgerPath = path.join(
    repositoryRoot,
    LAUNCH_THEME_WORD_BANK_PATHS.baseEditorialLedger,
  );
  const before = await Promise.all([
    readFile(baseWordBankPath),
    readFile(baseLedgerPath),
  ]);

  await assert.rejects(
    buildLaunchThemeWordBank({
      repositoryRoot,
      contract: fixture.contract,
    }),
    /required theme decision shard is missing: .*1600-2399\.json/u,
  );
  const after = await Promise.all([
    readFile(baseWordBankPath),
    readFile(baseLedgerPath),
  ]);
  assert.equal(Buffer.compare(before[0], after[0]), 0);
  assert.equal(Buffer.compare(before[1], after[1]), 0);
  await assert.rejects(
    readFile(
      path.join(repositoryRoot, LAUNCH_THEME_WORD_BANK_PATHS.outputWordBank),
    ),
    { code: "ENOENT" },
  );
  await assert.rejects(
    readFile(
      path.join(repositoryRoot, LAUNCH_THEME_WORD_BANK_PATHS.outputThemeLedger),
    ),
    { code: "ENOENT" },
  );
});
