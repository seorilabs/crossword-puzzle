import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";

import {
  calculateGameContentChecksum,
  verifyGameContentChecksum,
} from "../packages/crossword-core/src/gameContent.ts";
import { loadBundledFirstRunGameContents } from "../src/game-shell/onboardingGameContent.ts";
import {
  LAUNCH_BOARD_REVIEW_IDENTITY_KEYS,
  LAUNCH_BOARD_REVIEW_MANUAL_KEYS,
  calculateCanonicalDocumentChecksum,
  validateLaunchBoardReviewLedger,
} from "./launch-board-review-ledger.mjs";
import {
  assembleLaunchBoardReviewLedger,
  prepareLaunchBoardReviewWorkbook,
  preserveManualReviewFields,
} from "./launch-board-review-workbook.mjs";

const GENERATOR_COMMIT = "a".repeat(40);
const DAILY_CONNECTOR_RANKING_POLICY = Object.freeze({
  policyId: "ko-kr-launch-daily-connector-theme-coverage-v2",
  coverageScope:
    "greedy-prefix-over-distinct-theme-owner-answers-in-current-route-pool",
  sharedThemeCellDefinition:
    "unique-answer-cell-values-present-in-at-least-one-theme-answer",
  connectorOrder: Object.freeze([
    "max-marginal-uncovered-theme-owner-count",
    "max-distinct-shared-theme-cell-count",
    "max-theme-word-degree",
    "max-answer-cell-count",
    "max-connector-word-degree",
    "min-review-ledger-index",
    "stable-input-order",
  ]),
});
const GENERATOR_CONFIG = Object.freeze({
  schemaVersion: "ko-kr-launch-generator-config/9",
  dailyConnectorRanking: DAILY_CONNECTOR_RANKING_POLICY,
  seedPolicy: "deterministic",
});
const GENERATOR_CONFIG_HASH =
  calculateCanonicalDocumentChecksum(GENERATOR_CONFIG);
const MANUAL_REVIEW = Object.freeze({
  reviewerId: "human-reviewer-a",
  reviewedAt: "2026-07-19T03:00:00.000Z",
  note: "실제 단서와 정답, 테마, 난이도를 확인함",
  decision: "approve",
  checks: {
    themeSemantics: true,
    clueAnswerUniqueness: true,
    toneSafety: true,
    difficultyFit: true,
  },
});

function clone(value) {
  return structuredClone(value);
}

function makeGeneratedBoard(index) {
  const template = clone(loadBundledFirstRunGameContents()[index % 3]);
  const number = String(index + 1).padStart(3, "0");
  const puzzleId = `generated-board-${number}`;
  const themeId = `fixture-theme-${(index % 6) + 1}`;
  const difficulty = index % 10 === 0 ? "hard" : "normal";
  template.puzzleId = puzzleId;
  template.packId = "fixture-launch-pack";
  template.slotId = `fixture-slot-${number}`;
  template.themeId = themeId;
  template.difficulty = difficulty;
  template.generatorCommit = GENERATOR_COMMIT;
  template.generatorConfigHash = GENERATOR_CONFIG_HASH;
  template.entries = template.entries.map((entry, entryIndex) => ({
    ...entry,
    sourceEntryId: `${puzzleId}-source-${entryIndex + 1}`,
    domainTags: [themeId],
  }));
  template.contentChecksum = calculateGameContentChecksum(template);
  assert.equal(verifyGameContentChecksum(template), true);
  const artifactPath = `/game-content/v1/ko-KR/packs/fixture/${template.contentChecksum}.json`;
  const wordPool = {
    answerSetSha256: `sha256:${(index + 1_000).toString(16).padStart(64, "0")}`,
    total: 200,
    theme: null,
    connectors: null,
  };
  const report = {
    puzzleId,
    contentChecksum: template.contentChecksum,
    artifactPath,
    generatorCommit: GENERATOR_COMMIT,
    generatorConfigHash: GENERATOR_CONFIG_HASH,
    themeId,
    difficulty,
    entryProvenance: template.entries.map((entry) => ({
      sourceEntryId: entry.sourceEntryId,
    })),
    metrics: {
      wordCount: template.entries.length,
      connectedComponents: 1,
      accidentalRunCount: 0,
    },
    quality: {
      pass: true,
      checks: [{ key: "connectedComponents", pass: true }],
    },
    selectedRetryIndex: 0,
    wordPool: clone(wordPool),
    attempts: [{ wordPool: clone(wordPool) }],
  };
  return {
    catalogBoard: {
      route: { kind: index < 30 ? "chapter" : "daily" },
      artifactPath,
      content: template,
    },
    report,
  };
}

function createFixture() {
  const generated = Array.from({ length: 90 }, (_, index) =>
    makeGeneratedBoard(index),
  );
  const firstRun = loadBundledFirstRunGameContents().map((content) => ({
    route: { kind: "first-run" },
    artifactPath: `/game-content/v1/ko-KR/packs/first-run/${content.contentChecksum}.json`,
    content: clone(content),
  }));
  const catalog = {
    schemaVersion: "launch-content-catalog/1",
    artifactStatus: "candidate",
    activationApproved: false,
    generatedAt: "2026-07-19T00:00:00.000Z",
    boards: [...firstRun, ...generated.map((item) => item.catalogBoard)],
  };
  const generationReport = {
    schemaVersion: "ko-kr-launch-generation-report/6",
    artifactStatus: "candidate",
    activationApproved: false,
    generatedAt: "2026-07-19T00:00:00.000Z",
    generator: {
      commit: GENERATOR_COMMIT,
      configHash: GENERATOR_CONFIG_HASH,
      config: clone(GENERATOR_CONFIG),
    },
    boards: [...generated.slice(42), ...generated.slice(0, 42)].map(
      (item) => item.report,
    ),
  };
  return { catalog, generationReport, generated };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function createWorkspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "launch-board-review-"));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const fixture = createFixture();
  const catalogPath = path.join(root, "catalog.json");
  const generationReportPath = path.join(root, "generation-report.json");
  const workbookRoot = path.join(root, "workbook");
  const outputPath = path.join(root, "launch-board-review-ledger.json");
  await writeJson(catalogPath, fixture.catalog);
  await writeJson(generationReportPath, fixture.generationReport);
  return {
    root,
    ...fixture,
    catalogPath,
    generationReportPath,
    workbookRoot,
    outputPath,
  };
}

async function fillAllHumanReviews(workbookRoot) {
  const workbook = await readJson(path.join(workbookRoot, "workbook.json"));
  for (const descriptor of workbook.shards) {
    const shardPath = path.join(workbookRoot, descriptor.path);
    const shard = await readJson(shardPath);
    shard.boards = shard.boards.map((row, index) => ({
      ...row,
      ...clone(MANUAL_REVIEW),
      reviewerId: `human-reviewer-${descriptor.shardIndex}-${index}`,
    }));
    await writeJson(shardPath, shard);
  }
}

async function assertMissing(filePath) {
  await assert.rejects(stat(filePath), (error) => error.code === "ENOENT");
}

describe("launch board review workbook", () => {
  test("prepare는 catalog 순서의 identity와 실검수 evidence만 채운다", async (t) => {
    const workspace = await createWorkspace(t);
    const result = await prepareLaunchBoardReviewWorkbook({
      catalogPath: workspace.catalogPath,
      generationReportPath: workspace.generationReportPath,
      checkpointRoot: null,
      workbookRoot: workspace.workbookRoot,
      shardSize: 17,
    });

    assert.equal(result.workbook.source.mode, "catalog-report");
    assert.equal(result.workbook.boardCount, 90);
    assert.equal(result.workbook.shards.length, 6);
    assert.equal(result.rows[0].puzzleId, "generated-board-001");
    assert.deepEqual(
      Object.keys(result.rows[0]).sort(),
      [...LAUNCH_BOARD_REVIEW_IDENTITY_KEYS, "evidence"].sort(),
    );
    for (const key of LAUNCH_BOARD_REVIEW_MANUAL_KEYS) {
      assert.equal(Object.hasOwn(result.rows[0], key), false);
    }
    assert.deepEqual(Object.keys(result.rows[0].evidence).sort(), [
      "entries",
      "metrics",
      "quality",
    ]);
    assert.deepEqual(Object.keys(result.rows[0].evidence.entries[0]).sort(), [
      "answer",
      "clue",
      "domainTags",
      "generatedBy",
      "sourceEntryId",
    ]);
    assert.equal(result.rows[0].evidence.quality.pass, true);
    assert.equal(
      result.rows[0].sourceEntryIds[0],
      result.rows[0].evidence.entries[0].sourceEntryId,
    );
  });

  test("prepare 재실행은 exact identity 행의 human fields만 보존한다", async (t) => {
    const workspace = await createWorkspace(t);
    await prepareLaunchBoardReviewWorkbook({
      catalogPath: workspace.catalogPath,
      generationReportPath: workspace.generationReportPath,
      checkpointRoot: null,
      workbookRoot: workspace.workbookRoot,
      shardSize: 10,
    });
    const firstDescriptor = (
      await readJson(path.join(workspace.workbookRoot, "workbook.json"))
    ).shards[0];
    const firstShardPath = path.join(
      workspace.workbookRoot,
      firstDescriptor.path,
    );
    const firstShard = await readJson(firstShardPath);
    firstShard.boards[0] = {
      ...firstShard.boards[0],
      ...clone(MANUAL_REVIEW),
    };
    firstShard.boards[1].note = "아직 검수 중인 부분 메모";
    await writeJson(firstShardPath, firstShard);

    const preserved = await prepareLaunchBoardReviewWorkbook({
      catalogPath: workspace.catalogPath,
      generationReportPath: workspace.generationReportPath,
      checkpointRoot: null,
      workbookRoot: workspace.workbookRoot,
      shardSize: 10,
    });
    assert.equal(preserved.rows[0].decision, "approve");
    assert.equal(preserved.rows[1].note, "아직 검수 중인 부분 메모");

    const changedCatalog = clone(workspace.catalog);
    const changedReport = clone(workspace.generationReport);
    const changedContent = changedCatalog.boards[3].content;
    changedContent.entries[0].clue = "내용이 바뀐 새 단서";
    changedContent.contentChecksum =
      calculateGameContentChecksum(changedContent);
    changedCatalog.boards[3].artifactPath = `/game-content/v1/ko-KR/packs/fixture/${changedContent.contentChecksum}.json`;
    const changedReportRow = changedReport.boards.find(
      (row) => row.puzzleId === changedContent.puzzleId,
    );
    changedReportRow.contentChecksum = changedContent.contentChecksum;
    changedReportRow.artifactPath = changedCatalog.boards[3].artifactPath;
    await writeJson(workspace.catalogPath, changedCatalog);
    await writeJson(workspace.generationReportPath, changedReport);

    const reset = await prepareLaunchBoardReviewWorkbook({
      catalogPath: workspace.catalogPath,
      generationReportPath: workspace.generationReportPath,
      checkpointRoot: null,
      workbookRoot: workspace.workbookRoot,
      shardSize: 10,
    });
    for (const key of LAUNCH_BOARD_REVIEW_MANUAL_KEYS) {
      assert.equal(Object.hasOwn(reset.rows[0], key), false);
    }
    assert.equal(reset.rows[1].note, "아직 검수 중인 부분 메모");

    const directReset = preserveManualReviewFields(
      { ...reset.rows[1], contentChecksum: `sha256:${"b".repeat(64)}` },
      reset.rows[1],
    );
    assert.equal(Object.hasOwn(directReset, "note"), false);

    const previousWithReview = {
      ...clone(reset.rows[1]),
      ...clone(MANUAL_REVIEW),
    };
    const changedEvidence = clone(reset.rows[1]);
    changedEvidence.evidence.entries[0].clue = "검수 근거가 달라진 단서";
    const evidenceReset = preserveManualReviewFields(
      changedEvidence,
      previousWithReview,
    );
    for (const key of LAUNCH_BOARD_REVIEW_MANUAL_KEYS) {
      assert.equal(Object.hasOwn(evidenceReset, key), false);
    }
  });

  test("prepare는 기존 shard의 source·descriptor·evidence checksum drift를 거부한다", async (t) => {
    for (const [name, mutate, expected] of [
      [
        "source",
        (shard) => {
          shard.source.generatorConfigHash = `sha256:${"a".repeat(64)}`;
        },
        /source.*stale/,
      ],
      [
        "descriptor",
        (shard) => {
          shard.startIndex = 1;
        },
        /startIndex does not match workbook/,
      ],
      [
        "evidence checksum",
        (shard) => {
          shard.boards[0].evidence.entries[0].clue = "몰래 바뀐 단서";
        },
        /reviewInputChecksum is missing or stale/,
      ],
    ]) {
      await t.test(name, async (t) => {
        const workspace = await createWorkspace(t);
        await prepareLaunchBoardReviewWorkbook({
          catalogPath: workspace.catalogPath,
          generationReportPath: workspace.generationReportPath,
          checkpointRoot: null,
          workbookRoot: workspace.workbookRoot,
          shardSize: 10,
        });
        const workbook = await readJson(
          path.join(workspace.workbookRoot, "workbook.json"),
        );
        const shardPath = path.join(
          workspace.workbookRoot,
          workbook.shards[0].path,
        );
        const shard = await readJson(shardPath);
        mutate(shard);
        await writeJson(shardPath, shard);

        await assert.rejects(
          prepareLaunchBoardReviewWorkbook({
            catalogPath: workspace.catalogPath,
            generationReportPath: workspace.generationReportPath,
            checkpointRoot: null,
            workbookRoot: workspace.workbookRoot,
            shardSize: 10,
          }),
          expected,
        );
      });
    }
  });

  test("assemble은 사람 입력 90행만 final exact ledger로 투영한다", async (t) => {
    const workspace = await createWorkspace(t);
    await prepareLaunchBoardReviewWorkbook({
      catalogPath: workspace.catalogPath,
      generationReportPath: workspace.generationReportPath,
      checkpointRoot: null,
      workbookRoot: workspace.workbookRoot,
      shardSize: 13,
    });
    await fillAllHumanReviews(workspace.workbookRoot);

    const ledger = await assembleLaunchBoardReviewLedger({
      catalogPath: workspace.catalogPath,
      generationReportPath: workspace.generationReportPath,
      workbookRoot: workspace.workbookRoot,
      outputPath: workspace.outputPath,
    });
    assert.equal(ledger.boards.length, 90);
    assert.equal(
      validateLaunchBoardReviewLedger(
        workspace.catalog,
        workspace.generationReport,
        ledger,
      ),
      true,
    );
    assert.equal(Object.hasOwn(ledger.boards[0], "evidence"), false);
    assert.deepEqual(
      Object.keys(ledger.boards[0]).sort(),
      [
        ...LAUNCH_BOARD_REVIEW_IDENTITY_KEYS,
        ...LAUNCH_BOARD_REVIEW_MANUAL_KEYS,
      ].sort(),
    );
    assert.deepEqual(await readJson(workspace.outputPath), ledger);
  });

  test("assemble은 미검수·stale evidence·stale source에서 출력하지 않는다", async (t) => {
    await t.test("missing human fields", async (t) => {
      const workspace = await createWorkspace(t);
      await prepareLaunchBoardReviewWorkbook({
        catalogPath: workspace.catalogPath,
        generationReportPath: workspace.generationReportPath,
        checkpointRoot: null,
        workbookRoot: workspace.workbookRoot,
      });
      await assert.rejects(
        assembleLaunchBoardReviewLedger({
          catalogPath: workspace.catalogPath,
          generationReportPath: workspace.generationReportPath,
          workbookRoot: workspace.workbookRoot,
          outputPath: workspace.outputPath,
        }),
        /keys must exactly match/,
      );
      await assertMissing(workspace.outputPath);
    });

    await t.test("stale evidence", async (t) => {
      const workspace = await createWorkspace(t);
      await prepareLaunchBoardReviewWorkbook({
        catalogPath: workspace.catalogPath,
        generationReportPath: workspace.generationReportPath,
        checkpointRoot: null,
        workbookRoot: workspace.workbookRoot,
      });
      await fillAllHumanReviews(workspace.workbookRoot);
      const workbook = await readJson(
        path.join(workspace.workbookRoot, "workbook.json"),
      );
      const shardPath = path.join(
        workspace.workbookRoot,
        workbook.shards[0].path,
      );
      const shard = await readJson(shardPath);
      shard.boards[0].evidence.entries[0].clue = "검수 후 몰래 바뀐 단서";
      await writeJson(shardPath, shard);
      await assert.rejects(
        assembleLaunchBoardReviewLedger({
          catalogPath: workspace.catalogPath,
          generationReportPath: workspace.generationReportPath,
          workbookRoot: workspace.workbookRoot,
          outputPath: workspace.outputPath,
        }),
        /reviewInputChecksum.*stale/,
      );
      await assertMissing(workspace.outputPath);
    });

    await t.test("stale catalog/report lock", async (t) => {
      const workspace = await createWorkspace(t);
      await prepareLaunchBoardReviewWorkbook({
        catalogPath: workspace.catalogPath,
        generationReportPath: workspace.generationReportPath,
        checkpointRoot: null,
        workbookRoot: workspace.workbookRoot,
      });
      await fillAllHumanReviews(workspace.workbookRoot);
      const changedCatalog = clone(workspace.catalog);
      changedCatalog.generatedAt = "2026-07-19T00:01:00.000Z";
      await writeJson(workspace.catalogPath, changedCatalog);
      await assert.rejects(
        assembleLaunchBoardReviewLedger({
          catalogPath: workspace.catalogPath,
          generationReportPath: workspace.generationReportPath,
          workbookRoot: workspace.workbookRoot,
          outputPath: workspace.outputPath,
        }),
        /workbook source identity.*stale/,
      );
      await assertMissing(workspace.outputPath);
    });
  });

  test("checkpoint prefix는 provisional packet만 만들고 full 전환 때 exact row를 보존한다", async (t) => {
    const workspace = await createWorkspace(t);
    const generationOrder = [
      ...workspace.generated.slice(42),
      ...workspace.generated.slice(0, 42),
    ];
    const checkpointRoot = path.join(
      workspace.root,
      GENERATOR_CONFIG_HASH.slice("sha256:".length),
    );
    const completed = [];
    for (const item of generationOrder.slice(0, 2)) {
      const puzzleId = item.catalogBoard.content.puzzleId;
      const content = item.catalogBoard.content;
      const report = item.report;
      await writeJson(
        path.join(checkpointRoot, "boards", `${puzzleId}.json`),
        content,
      );
      await writeJson(
        path.join(checkpointRoot, "reports", `${puzzleId}.json`),
        report,
      );
      completed.push({
        puzzleId,
        contentSha256: calculateCanonicalDocumentChecksum(content),
        reportSha256: calculateCanonicalDocumentChecksum(report),
      });
    }
    await writeJson(path.join(checkpointRoot, "checkpoint.json"), {
      schemaVersion: "ko-kr-launch-generation-checkpoint/1",
      generatorCommit: GENERATOR_COMMIT,
      generatorConfigHash: GENERATOR_CONFIG_HASH,
      routePuzzleIds: generationOrder.map(
        (item) => item.catalogBoard.content.puzzleId,
      ),
      completed,
    });

    const provisional = await prepareLaunchBoardReviewWorkbook({
      catalogPath: null,
      generationReportPath: null,
      checkpointRoot,
      workbookRoot: workspace.workbookRoot,
      shardSize: 10,
    });
    assert.equal(provisional.workbook.source.mode, "checkpoint");
    assert.equal(provisional.rows.length, 2);
    assert.equal(provisional.rows[0].puzzleId, "generated-board-043");
    const provisionalShardPath = path.join(
      workspace.workbookRoot,
      provisional.workbook.shards[0].path,
    );
    const provisionalShard = await readJson(provisionalShardPath);
    provisionalShard.boards[0] = {
      ...provisionalShard.boards[0],
      ...clone(MANUAL_REVIEW),
    };
    await writeJson(provisionalShardPath, provisionalShard);

    await assert.rejects(
      assembleLaunchBoardReviewLedger({
        catalogPath: workspace.catalogPath,
        generationReportPath: workspace.generationReportPath,
        workbookRoot: workspace.workbookRoot,
        outputPath: workspace.outputPath,
      }),
      /mode must be catalog-report for final assembly/,
    );
    await assertMissing(workspace.outputPath);

    const full = await prepareLaunchBoardReviewWorkbook({
      catalogPath: workspace.catalogPath,
      generationReportPath: workspace.generationReportPath,
      checkpointRoot: null,
      workbookRoot: workspace.workbookRoot,
      shardSize: 10,
    });
    assert.equal(full.workbook.source.mode, "catalog-report");
    const preserved = full.rows.find(
      (row) => row.puzzleId === "generated-board-043",
    );
    assert.equal(preserved.decision, "approve");
    assert.equal(
      full.rows.find((row) => row.puzzleId === "generated-board-044").decision,
      undefined,
    );
  });
});
