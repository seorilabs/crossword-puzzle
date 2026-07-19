import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  createLegacyRawSnapshot,
  LEGACY_PROGRESS_KEY_PREFIX,
  LegacySaveMigrationError,
  migrateLegacyRawSnapshotToSaveV2,
  projectSaveV2ToLegacyWrites,
  verifyLegacyRawSnapshot,
  type LegacySaveMarket,
} from "./legacySaveMigration.ts";
import { validateSaveV2Namespaces } from "./saveV2.ts";

type Fixture = {
  market: LegacySaveMarket;
  sourceVersion: string;
  records: [string, string][];
};

function loadFixture(name: string): Fixture {
  return JSON.parse(
    readFileSync(
      new URL(`../../../test/fixtures/save-migration/${name}`, import.meta.url),
      "utf8",
    ),
  ) as Fixture;
}

function snapshot(name: string, capturedAt = "2026-07-18T00:00:00.000Z") {
  const fixture = loadFixture(name);
  return createLegacyRawSnapshot({
    market: fixture.market,
    sourceVersion: fixture.sourceVersion,
    capturedAt,
    records: fixture.records.map(([key, rawValue]) => ({ key, rawValue })),
  });
}

const migratedAt = "2026-07-18T00:01:00.000Z";

describe("tag 기반 legacy raw snapshot", () => {
  test("출시 tag fixture가 실제 manifest ID·colon cell key·archive reader shape를 따른다", () => {
    for (const [name, puzzleId] of [
      ["ait-v0.3.108.json", "2026-05-25-normal-01"],
      ["play-v0.3.108.json", "2026-05-26-normal-02"],
      ["app-store-v1.0.1.json", "2026-05-27-normal-03"],
    ] as const) {
      const fixture = loadFixture(name);
      const values = new Map(fixture.records);
      const progress = JSON.parse(
        values.get(`crossword-puzzle:progress:${puzzleId}`) as string,
      ) as { cellValues: Record<string, string> };
      const archive = JSON.parse(
        values.get(`crossword-puzzle:archive:record:${puzzleId}`) as string,
      ) as {
        puzzle: {
          entries: Array<Record<string, unknown>>;
          grid: string[][];
          gridSize: number;
          metrics: Record<string, unknown>;
          puzzleId: string;
        };
      };
      assert.ok(
        Object.keys(progress.cellValues).every((key) => /^\d+:\d+$/.test(key)),
      );
      assert.equal(archive.puzzle.puzzleId, puzzleId);
      assert.equal(archive.puzzle.grid.length, archive.puzzle.gridSize);
      assert.ok(archive.puzzle.entries.length > 0);
      assert.ok(
        archive.puzzle.entries.every(
          (entry) =>
            typeof entry.id === "string" &&
            typeof entry.answer === "string" &&
            typeof entry.clue === "string" &&
            typeof entry.row === "number" &&
            typeof entry.col === "number",
        ),
      );
      assert.equal(typeof archive.puzzle.metrics, "object");
    }
  });

  test("capture 시간과 무관한 source checksum으로 원문을 결정적으로 봉인한다", () => {
    const first = snapshot("ait-v0.3.108.json");
    const second = snapshot("ait-v0.3.108.json", "2026-07-18T01:00:00.000Z");

    assert.equal(first.sourceChecksum, second.sourceChecksum);
    assert.equal(verifyLegacyRawSnapshot(first), true);
    assert.equal(first.records[0].key, "crossword-puzzle:archive:index");
    assert.throws(
      () =>
        createLegacyRawSnapshot({
          market: "web",
          sourceVersion: "fixture",
          capturedAt: migratedAt,
          records: [
            { key: "crossword:test", rawValue: "1" },
            { key: "crossword:test", rawValue: "2" },
          ],
        }),
      (error: unknown) =>
        error instanceof LegacySaveMigrationError &&
        error.code === "duplicate-key",
    );
  });

  test("AIT v0.3.108 전체 필드를 ko-KR Save v2와 reversible projection으로 옮긴다", () => {
    const result = migrateLegacyRawSnapshotToSaveV2(
      snapshot("ait-v0.3.108.json"),
      { migratedAt },
    );
    const state = result.save.content["ko-KR"];
    const puzzle = state.puzzles["2026-05-25-normal-01"];

    assert.deepEqual(validateSaveV2Namespaces(result.save), []);
    assert.equal(result.save.content["future-X"], undefined);
    assert.deepEqual(puzzle.cellValues, { "0:0": "가", "0:1": "나" });
    assert.equal(puzzle.revealUsed, true);
    assert.deepEqual(puzzle.tentativeCells, ["0:1"]);
    assert.deepEqual(state.completedPuzzleIds, ["2026-05-25-normal-01"]);
    assert.deepEqual(state.streakCompletedDates, ["2026-05-25"]);
    assert.equal(
      state.missions?.[
        "crossword-puzzle:mission:2026-05-25:2026-05-25-normal-01"
      ].extraAttemptsGranted,
      1,
    );
    assert.deepEqual(state.dailyExtraAttemptGrants, {
      date: "2026-05-25",
      count: 1,
    });
    assert.equal(
      state.personalBestMsByPuzzleId?.["2026-05-25-normal-01"],
      180000,
    );
    assert.equal(result.save.profile.settings.soundEnabled, false);
    assert.equal(
      result.save.profile.settings.returnReminderErrorReason,
      "fixture-timeout",
    );
    assert.equal(result.save.profile.accessibility.textScale, "large");
    assert.deepEqual(result.save.economyRecords, []);

    const writes = new Map(
      projectSaveV2ToLegacyWrites(result.save).map(({ key, value }) => [
        key,
        value,
      ]),
    );
    const projectedProgress = JSON.parse(
      writes.get("crossword-puzzle:progress:2026-05-25-normal-01") as string,
    ) as Record<string, unknown>;
    assert.equal(projectedProgress.revealUsed, true);
    assert.deepEqual(projectedProgress.tentativeCells, ["0:1"]);
    assert.equal(writes.get("crossword:sound-enabled"), "0");
  });

  test("Play v0.3.108과 App Store v1.0.1 leapfrog fixture를 세 번 돌려도 결과가 같다", () => {
    for (const name of ["play-v0.3.108.json", "app-store-v1.0.1.json"]) {
      const raw = snapshot(name);
      const first = migrateLegacyRawSnapshotToSaveV2(raw, { migratedAt });
      const second = migrateLegacyRawSnapshotToSaveV2(raw, { migratedAt });
      const third = migrateLegacyRawSnapshotToSaveV2(raw, { migratedAt });
      assert.deepEqual(first, second);
      assert.deepEqual(second, third);
      assert.equal(first.completedPuzzleIds.length, 1);
      assert.equal(first.save.economyRecords.length, 0);
      assert.equal(
        first.save.content["ko-KR"].completionRecords[0].assistanceKnown,
        false,
      );
    }
  });

  test("content를 확인할 수 없는 orphan progress는 legacy를 유지하도록 fail-closed 처리한다", () => {
    const raw = createLegacyRawSnapshot({
      market: "web",
      sourceVersion: "unversioned-web",
      capturedAt: migratedAt,
      records: [
        {
          key: "crossword-puzzle:progress:orphan",
          rawValue: JSON.stringify({ cellValues: { "0,0": "가" } }),
        },
      ],
    });

    assert.throws(
      () => migrateLegacyRawSnapshotToSaveV2(raw, { migratedAt }),
      (error: unknown) =>
        error instanceof LegacySaveMigrationError &&
        error.code === "unresolved-content-checksum",
    );
  });

  test("content checksum 없는 빈 placeholder progress는 사용자 진행으로 승격하지 않는다", () => {
    const puzzleId = "untouched-remote-placeholder";
    const rawValue = JSON.stringify({
      cellValues: {},
      earnedHintCredits: 0,
      hintCount: 0,
      revealUsed: false,
      tentativeCells: [],
    });
    const raw = createLegacyRawSnapshot({
      market: "google-play",
      sourceVersion: "android-main-0.1.0",
      capturedAt: migratedAt,
      records: [
        {
          key: `${LEGACY_PROGRESS_KEY_PREFIX}${puzzleId}`,
          rawValue,
        },
      ],
    });

    const result = migrateLegacyRawSnapshotToSaveV2(raw, { migratedAt });

    assert.deepEqual(result.migratedPuzzleIds, []);
    assert.equal(result.save.content["ko-KR"].puzzles[puzzleId], undefined);
    assert.equal(
      new Map(
        result.projectionWrites.map(({ key, value }) => [key, value]),
      ).get(`${LEGACY_PROGRESS_KEY_PREFIX}${puzzleId}`),
      rawValue,
    );
  });

  test("archive index 밖 orphan과 mobile reader-invalid record는 완료로 승격하지 않는다", () => {
    const fixture = loadFixture("play-v0.3.108.json");
    const orphanPuzzleId = "orphan-mobile-record";
    const raw = createLegacyRawSnapshot({
      market: fixture.market,
      sourceVersion: fixture.sourceVersion,
      capturedAt: migratedAt,
      records: [
        ...fixture.records.map(([key, rawValue]) => ({ key, rawValue })),
        {
          key: `crossword-puzzle:archive:record:${orphanPuzzleId}`,
          rawValue: JSON.stringify({
            completedAt: migratedAt,
            puzzleId: orphanPuzzleId,
            puzzle: {
              puzzleId: orphanPuzzleId,
              date: "2026-05-28",
              gridSize: 1,
              grid: [["고"]],
              entries: [],
              metrics: {},
            },
          }),
        },
      ],
    });
    const result = migrateLegacyRawSnapshotToSaveV2(raw, { migratedAt });
    assert.equal(result.completedPuzzleIds.includes(orphanPuzzleId), false);
  });

  test("reader-invalid archive를 progress content checksum 근거로 사용하지 않는다", () => {
    const puzzleId = "invalid-archive-progress";
    const raw = createLegacyRawSnapshot({
      market: "google-play",
      sourceVersion: "invalid-archive",
      capturedAt: migratedAt,
      records: [
        {
          key: "crossword-puzzle:archive:index",
          rawValue: JSON.stringify([puzzleId]),
        },
        {
          key: `crossword-puzzle:archive:record:${puzzleId}`,
          rawValue: JSON.stringify({
            completedAt: migratedAt,
            puzzleId,
            puzzle: {
              puzzleId,
              date: "2026-05-28",
              gridSize: 1,
              grid: [["고"]],
              entries: [],
              metrics: {},
            },
          }),
        },
        {
          key: `crossword-puzzle:progress:${puzzleId}`,
          rawValue: JSON.stringify({ cellValues: { "0:0": "고" } }),
        },
      ],
    });
    assert.throws(
      () => migrateLegacyRawSnapshotToSaveV2(raw, { migratedAt }),
      (error: unknown) =>
        error instanceof LegacySaveMigrationError &&
        error.code === "unresolved-content-checksum",
    );
  });

  test("mission key/value date 불일치는 legacy reader와 같이 fail-closed 처리한다", () => {
    const raw = createLegacyRawSnapshot({
      market: "web",
      sourceVersion: "corrupt-mission",
      capturedAt: migratedAt,
      records: [
        {
          key: "crossword-puzzle:mission:2026-01-01:p1",
          rawValue: JSON.stringify({
            date: "2026-01-02",
            puzzleId: "p1",
            attemptsUsed: 1,
            maxAttempts: 3,
          }),
        },
      ],
    });
    assert.throws(
      () => migrateLegacyRawSnapshotToSaveV2(raw, { migratedAt }),
      (error: unknown) =>
        error instanceof LegacySaveMigrationError &&
        error.code === "malformed-mission",
    );
  });

  test("version marker 없는 Web/mobile과 현재 mobile reveal·연필 상태도 손실 없이 이관한다", () => {
    const web = migrateLegacyRawSnapshotToSaveV2(
      snapshot("web-unversioned.json"),
      { migratedAt },
    );
    const mobile = migrateLegacyRawSnapshotToSaveV2(
      snapshot("mobile-unversioned.json"),
      { migratedAt },
    );

    assert.equal(
      Object.values(web.save.content["ko-KR"].missions ?? {})[0].sourceKey,
      "crossword-puzzle:mission:2026-01-01",
    );
    assert.equal(
      mobile.save.content["ko-KR"].puzzles["onboarding-easy-01"].revealUsed,
      true,
    );
    assert.deepEqual(
      mobile.save.content["ko-KR"].puzzles["onboarding-easy-01"].tentativeCells,
      ["0:0"],
    );
  });
});
