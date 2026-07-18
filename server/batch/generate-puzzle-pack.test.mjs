import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const WORDS = [
  "가나다",
  "라마바",
  "사아자",
  "가라사",
  "나마아",
  "다바자",
  "가마자",
  "나바사",
  "다아라",
];

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function assertPassingQuality(quality) {
  assert.equal(quality.pass, true);
  assert.equal(
    quality.checks.every((check) => check.pass),
    true,
  );
  assert.deepEqual(quality.ratios, {
    autoRunRatio: 0.333,
    multiCrossRatio: 1,
  });
}

function assertCompleteThreeByThreeMetrics(metrics) {
  assert.deepEqual(metrics, {
    autoRunCount: 2,
    bboxDensity: 1,
    crossCells: 9,
    crossRatio: 1,
    filledCells: 9,
    multiCrossEntries: 6,
    placedWordCount: 4,
    wordCount: 6,
  });
}

test(
  "2시간 간격 두 슬롯을 CLI로 생성하고 각 슬롯의 품질 PASS를 보존한다",
  { timeout: 30_000 },
  async () => {
    const tempRoot = await mkdtemp(
      path.join(tmpdir(), "crossword-puzzle-batch-test-"),
    );
    const wordBankPath = path.join(tempRoot, "wordbank.json");
    const outDir = path.join(tempRoot, "puzzles");

    try {
      await writeFile(
        wordBankPath,
        `${JSON.stringify(
          {
            metadata: { sourceName: "3x3 black-box test" },
            words: WORDS.map((answer, index) => ({
              allowForPuzzle: true,
              answer,
              clue: `테스트 단서 ${index + 1}`,
              clueSource: "manual",
              difficulty: "normal",
              needsManualClue: false,
            })),
          },
          null,
          2,
        )}\n`,
      );

      await execFileAsync(
        process.execPath,
        [
          "--experimental-strip-types",
          "server/batch/generate-puzzle-pack.mjs",
          `--wordbank=${wordBankPath}`,
          `--outDir=${outDir}`,
          "--publishedAt=2026-07-19T01:15:00.000Z",
          "--start=2026-07-19",
          "--timeZone=Asia/Seoul",
          "--days=2",
          "--intervalHours=2",
          "--difficulty=normal",
          "--size=3",
          "--words=6",
          "--minEntries=6",
          "--minCross=1",
          "--minDensity=1",
          "--minMulti=1",
          "--maxAuto=1",
          "--attempts=12",
          "--retries=1",
          "--samples=2",
          "--beam=24",
          "--branch=18",
          "--candidates=9",
          "--dense=96",
          "--seed=20260719",
        ],
        {
          cwd: REPOSITORY_ROOT,
          maxBuffer: 1024 * 1024,
          timeout: 25_000,
        },
      );

      const manifest = await readJson(path.join(outDir, "manifest.json"));
      const report = await readJson(
        path.join(outDir, "generation-report.json"),
      );
      const expectedSlots = [
        {
          packId: "pack-20260719011500-20260719",
          publishedAt: "2026-07-19T01:15:00.000Z",
          puzzleId: "26071910",
          slotId: "2026-07-19-h10",
        },
        {
          packId: "pack-20260719031500-20260720",
          publishedAt: "2026-07-19T03:15:00.000Z",
          puzzleId: "26071912",
          slotId: "2026-07-19-h12",
        },
      ];

      assert.equal(manifest.wordBank.wordCount, 9);
      assert.equal(manifest.puzzles.length, 2);
      assert.equal(report.report.length, 2);

      for (const [index, expected] of expectedSlots.entries()) {
        const summary = manifest.puzzles[index];
        const generation = report.report[index];
        const puzzle = await readJson(
          path.join(outDir, `${expected.puzzleId}.json`),
        );

        assert.deepEqual(
          {
            packId: summary.packId,
            publishedAt: summary.publishedAt,
            puzzleId: summary.puzzleId,
            slotId: summary.slotId,
          },
          expected,
        );
        assert.deepEqual(
          {
            packId: puzzle.packId,
            publishedAt: puzzle.publishedAt,
            puzzleId: puzzle.puzzleId,
            slotId: puzzle.slotId,
          },
          expected,
        );
        assert.equal(generation.accepted, true);
        assert.equal(generation.selected.puzzleId, expected.puzzleId);
        assertPassingQuality(summary.quality);
        assertPassingQuality(puzzle.quality);
        assertPassingQuality(generation.selected.quality);
        assertCompleteThreeByThreeMetrics(summary.metrics);
        assertCompleteThreeByThreeMetrics(puzzle.metrics);
        assertCompleteThreeByThreeMetrics(generation.selected.metrics);
      }
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  },
);
