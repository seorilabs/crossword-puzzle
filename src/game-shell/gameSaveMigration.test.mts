import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  createLegacyRawSnapshot,
  type LegacySaveMarket,
} from "../../packages/crossword-core/src/legacySaveMigration.ts";
import { BUNDLED_FIRST_RUN_CONTENT_CHECKSUMS } from "../../packages/crossword-core/src/launchContentCatalog.ts";
import {
  createEmptySaveV2,
  sealSaveV2,
} from "../../packages/crossword-core/src/saveV2.ts";
import {
  DEFAULT_GAME_SAVE_V2_KEY,
  type KeyValueStoragePort,
} from "./gameSaveRepository.ts";
import {
  GAME_SAVE_ACTIVE_POINTER_KEY,
  GAME_SAVE_LEGACY_PROJECTION_OUTBOX_KEY,
  GAME_SAVE_MIGRATION_BACKUP_KEY_PREFIX,
  GAME_SAVE_MIGRATION_STAGING_KEY,
  createGameSaveLegacyProjectionPort,
  portableGameSaveChecksumPort,
  prepareGameSaveMigration,
  recoverLegacyProjectionOutbox,
} from "./gameSaveMigration.ts";

type Fixture = {
  market: LegacySaveMarket;
  sourceVersion: string;
  records: [string, string][];
};

function fixtureSnapshot(
  name = "ait-v0.3.108.json",
  capturedAt = "2026-07-18T00:00:00.000Z",
) {
  const fixture = JSON.parse(
    readFileSync(
      new URL(`../../test/fixtures/save-migration/${name}`, import.meta.url),
      "utf8",
    ),
  ) as Fixture;
  return createLegacyRawSnapshot({
    market: fixture.market,
    sourceVersion: fixture.sourceVersion,
    capturedAt,
    records: fixture.records.map(([key, rawValue]) => ({ key, rawValue })),
  });
}

class MemoryStorage implements KeyValueStoragePort {
  readonly values = new Map<string, string>();
  readonly operations: string[] = [];
  failSetKey: string | null = null;
  failRemoveKey: string | null = null;

  constructor(initial: Readonly<Record<string, string>> = {}) {
    for (const [key, value] of Object.entries(initial)) {
      this.values.set(key, value);
    }
  }

  async getItem(key: string): Promise<string | null> {
    this.operations.push(`get:${key}`);
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.operations.push(`set:${key}`);
    if (this.failSetKey === key) {
      this.failSetKey = null;
      throw new Error(`injected set failure: ${key}`);
    }
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.operations.push(`remove:${key}`);
    if (this.failRemoveKey === key) {
      this.failRemoveKey = null;
      throw new Error(`injected remove failure: ${key}`);
    }
    this.values.delete(key);
  }
}

const now = () => "2026-07-18T00:01:00.000Z";

const legacyFNVChecksumPort = {
  digest(payload: string) {
    let hash = 2_166_136_261;
    for (const byte of new TextEncoder().encode(payload)) {
      hash ^= byte;
      hash = Math.imul(hash, 16_777_619);
    }
    return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
  },
};

describe("Save v2 migration transaction", () => {
  test("AIT/Web legacy mirror의 두세 번째 첫 실행 보드를 exact checksum으로 복구한다", async () => {
    for (const market of ["apps-in-toss", "web"] as const) {
      const storage = new MemoryStorage();
      const legacySnapshot = createLegacyRawSnapshot({
        market,
        sourceVersion: `${market}-main-0.1.0`,
        capturedAt: "2026-07-18T00:00:00.000Z",
        records: ["onboarding-easy-02", "onboarding-easy-03"].map(
          (puzzleId) => ({
            key: `crossword-puzzle:progress:${puzzleId}`,
            rawValue: JSON.stringify({
              cellValues: { "0:0": "가" },
              earnedHintCredits: 1,
              hintCount: 0,
              revealUsed: false,
              tentativeCells: [],
            }),
          }),
        ),
      });

      const result = await prepareGameSaveMigration({
        storage,
        legacySnapshot,
        knownContentChecksums: BUNDLED_FIRST_RUN_CONTENT_CHECKSUMS,
        now,
      });

      assert.equal(result.status, "activated");
      assert.deepEqual(result.migratedPuzzleIds, [
        "onboarding-easy-02",
        "onboarding-easy-03",
      ]);
      for (const puzzleId of result.migratedPuzzleIds) {
        assert.equal(
          result.save.content["ko-KR"].puzzles[puzzleId].contentChecksum,
          BUNDLED_FIRST_RUN_CONTENT_CHECKSUMS[puzzleId],
        );
      }
    }
  });

  test("backup → staging 검증 → legacy projection → active save → pointer 순으로 활성화한다", async () => {
    const storage = new MemoryStorage();
    const legacySnapshot = fixtureSnapshot();
    const result = await prepareGameSaveMigration({
      storage,
      legacySnapshot,
      now,
    });

    assert.equal(result.status, "activated");
    assert.ok(storage.values.has(DEFAULT_GAME_SAVE_V2_KEY));
    assert.ok(storage.values.has(GAME_SAVE_ACTIVE_POINTER_KEY));
    assert.ok(
      storage.values.has(
        `${GAME_SAVE_MIGRATION_BACKUP_KEY_PREFIX}:${legacySnapshot.sourceChecksum}`,
      ),
    );
    assert.equal(storage.values.has(GAME_SAVE_MIGRATION_STAGING_KEY), false);
    assert.equal(
      storage.values.has(GAME_SAVE_LEGACY_PROJECTION_OUTBOX_KEY),
      false,
    );
    assert.equal(
      JSON.parse(
        storage.values.get(
          "crossword-puzzle:progress:2026-05-25-normal-01",
        ) as string,
      ).revealUsed,
      true,
    );

    const setOperations = storage.operations.filter((operation) =>
      operation.startsWith("set:"),
    );
    const stagingIndex = setOperations.indexOf(
      `set:${GAME_SAVE_MIGRATION_STAGING_KEY}`,
    );
    const outboxIndex = setOperations.indexOf(
      `set:${GAME_SAVE_LEGACY_PROJECTION_OUTBOX_KEY}`,
    );
    const saveIndex = setOperations.indexOf(`set:${DEFAULT_GAME_SAVE_V2_KEY}`);
    const pointerIndex = setOperations.indexOf(
      `set:${GAME_SAVE_ACTIVE_POINTER_KEY}`,
    );
    assert.ok(stagingIndex >= 0 && stagingIndex < outboxIndex);
    assert.ok(outboxIndex < saveIndex && saveIndex < pointerIndex);
  });

  test("같은 snapshot 재실행은 활성 저장과 완료 원장을 바꾸지 않는다", async () => {
    const storage = new MemoryStorage();
    const legacySnapshot = fixtureSnapshot();
    const first = await prepareGameSaveMigration({
      storage,
      legacySnapshot,
      now,
    });
    const rawSave = storage.values.get(DEFAULT_GAME_SAVE_V2_KEY);
    const rawPointer = storage.values.get(GAME_SAVE_ACTIVE_POINTER_KEY);

    const second = await prepareGameSaveMigration({
      storage,
      legacySnapshot,
      now,
    });
    const third = await prepareGameSaveMigration({
      storage,
      legacySnapshot,
      now,
    });
    assert.equal(first.status, "activated");
    assert.equal(second.status, "already-active");
    assert.equal(third.status, "already-active");
    assert.equal(storage.values.get(DEFAULT_GAME_SAVE_V2_KEY), rawSave);
    assert.equal(storage.values.get(GAME_SAVE_ACTIVE_POINTER_KEY), rawPointer);
    assert.equal(second.save.economyRecords.length, 0);
  });

  test("pointer 전환 실패는 legacy preimage를 복구하고 재시도 가능한 outbox 상태를 남기지 않는다", async () => {
    const original = JSON.stringify({
      cellValues: { "0,0": "옛" },
      earnedHintCredits: 9,
      hintCount: 4,
    });
    const progressKey = "crossword-puzzle:progress:2026-05-25-normal-01";
    const storage = new MemoryStorage({ [progressKey]: original });
    storage.failSetKey = GAME_SAVE_ACTIVE_POINTER_KEY;

    await assert.rejects(
      prepareGameSaveMigration({
        storage,
        legacySnapshot: fixtureSnapshot(),
        now,
      }),
    );
    assert.equal(storage.values.has(GAME_SAVE_ACTIVE_POINTER_KEY), false);
    assert.equal(storage.values.get(progressKey), original);
    assert.equal(
      storage.values.has(GAME_SAVE_LEGACY_PROJECTION_OUTBOX_KEY),
      false,
    );

    const retry = await prepareGameSaveMigration({
      storage,
      legacySnapshot: fixtureSnapshot(
        "ait-v0.3.108.json",
        "2026-07-18T00:00:01.000Z",
      ),
      now,
    });
    assert.equal(retry.status, "promoted-direct-v2");
    assert.ok(storage.values.has(GAME_SAVE_ACTIVE_POINTER_KEY));
  });

  test("pointer 뒤 outbox cleanup 실패는 다음 부팅에서 roll-forward한다", async () => {
    const storage = new MemoryStorage();
    storage.failRemoveKey = GAME_SAVE_LEGACY_PROJECTION_OUTBOX_KEY;
    await prepareGameSaveMigration({
      storage,
      legacySnapshot: fixtureSnapshot(),
      now,
    });
    assert.equal(
      storage.values.has(GAME_SAVE_LEGACY_PROJECTION_OUTBOX_KEY),
      true,
    );
    assert.equal(
      await recoverLegacyProjectionOutbox(storage),
      "rolled-forward",
    );
    assert.equal(
      storage.values.has(GAME_SAVE_LEGACY_PROJECTION_OUTBOX_KEY),
      false,
    );
  });

  test("기존 direct Save v2는 legacy 전체와 병합하고 portable checksum으로 승격한다", async () => {
    const direct = await sealSaveV2(
      createEmptySaveV2({
        uiLocale: "ko-KR",
        contentLocale: "ko-KR",
        inputMode: "word-strip",
        migratedAt: now(),
        sourceVersion: "current-main-direct-v2",
        migrationChecksum: "direct-fixture",
      }),
      portableGameSaveChecksumPort,
    );
    const serialized = JSON.stringify(direct);
    const storage = new MemoryStorage({
      [DEFAULT_GAME_SAVE_V2_KEY]: serialized,
    });

    const result = await prepareGameSaveMigration({
      storage,
      legacySnapshot: fixtureSnapshot("play-v0.3.108.json"),
      now,
    });
    assert.equal(result.status, "promoted-direct-v2");
    assert.notEqual(storage.values.get(DEFAULT_GAME_SAVE_V2_KEY), serialized);
    assert.ok(result.save.checksum.startsWith("sha256:"));
    assert.ok(
      result.save.content["ko-KR"].puzzles["2026-05-26-normal-02"] != null,
    );
    assert.equal(result.save.profile.inputMode, "word-strip");
    assert.ok(storage.values.has(GAME_SAVE_ACTIVE_POINTER_KEY));
  });

  test("구 FNV direct Save v2는 검증 후 SHA-256으로 재봉인한다", async () => {
    const direct = await sealSaveV2(
      createEmptySaveV2({
        uiLocale: "ko-KR",
        contentLocale: "ko-KR",
        inputMode: "word-strip",
        migratedAt: now(),
        sourceVersion: "experimental-game-shell",
        migrationChecksum: "fnv-direct-fixture",
      }),
      legacyFNVChecksumPort,
    );
    const storage = new MemoryStorage({
      [DEFAULT_GAME_SAVE_V2_KEY]: JSON.stringify(direct),
    });

    const result = await prepareGameSaveMigration({
      storage,
      legacySnapshot: fixtureSnapshot("play-v0.3.108.json"),
      now,
    });
    assert.equal(result.status, "promoted-direct-v2");
    assert.ok(result.save.checksum.startsWith("sha256:"));
    assert.ok(
      result.save.content["ko-KR"].puzzles["2026-05-26-normal-02"] != null,
    );
  });

  test("OFF legacy 진행 변경은 다음 ON에서 v2-only 상태를 보존하며 병합한다", async () => {
    const storage = new MemoryStorage();
    const first = await prepareGameSaveMigration({
      storage,
      legacySnapshot: fixtureSnapshot(),
      now,
    });
    const fixture = JSON.parse(
      readFileSync(
        new URL(
          "../../test/fixtures/save-migration/ait-v0.3.108.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as Fixture;
    const progressKey = "crossword-puzzle:progress:2026-05-25-normal-01";
    const records = fixture.records.map(([key, rawValue]) => ({
      key,
      rawValue:
        key === progressKey
          ? JSON.stringify({
              ...JSON.parse(rawValue),
              cellValues: { "0:0": "가", "0:1": "나", "1:0": "후" },
            })
          : rawValue,
    }));
    const changed = createLegacyRawSnapshot({
      market: fixture.market,
      sourceVersion: fixture.sourceVersion,
      capturedAt: "2026-07-18T02:00:00.000Z",
      records,
    });

    const reconciled = await prepareGameSaveMigration({
      storage,
      legacySnapshot: changed,
      now,
    });
    assert.equal(reconciled.status, "reconciled-legacy");
    assert.equal(
      reconciled.save.content["ko-KR"].puzzles["2026-05-25-normal-01"]
        .cellValues["1:0"],
      "후",
    );
    assert.deepEqual(reconciled.save.economyRecords, first.save.economyRecords);

    const stable = await prepareGameSaveMigration({
      storage,
      legacySnapshot: changed,
      now,
    });
    assert.equal(stable.status, "already-active");
  });

  test("ongoing projection은 progress 전체와 기존 archive 완료 메타를 read-back한다", async () => {
    const storage = new MemoryStorage();
    const migration = await prepareGameSaveMigration({
      storage,
      legacySnapshot: fixtureSnapshot(),
      now,
    });
    const nextSave = structuredClone(migration.save);
    const snapshot = nextSave.content["ko-KR"].puzzles["2026-05-25-normal-01"];
    snapshot.cellValues["1:0"] = "새";
    snapshot.tentativeCells = ["1:0"];
    const completion = nextSave.content["ko-KR"].completionRecords[0];
    completion.hintCount = 7;
    completion.revealUsed = false;

    const sealed = await sealSaveV2(nextSave, portableGameSaveChecksumPort);
    storage.values.set(DEFAULT_GAME_SAVE_V2_KEY, JSON.stringify(sealed));
    await createGameSaveLegacyProjectionPort(storage).synchronize(sealed);
    const progress = JSON.parse(
      storage.values.get(
        "crossword-puzzle:progress:2026-05-25-normal-01",
      ) as string,
    ) as { cellValues: Record<string, string>; tentativeCells: string[] };
    const archive = JSON.parse(
      storage.values.get(
        "crossword-puzzle:archive:record:2026-05-25-normal-01",
      ) as string,
    ) as { hintCount: number; revealUsed: boolean };
    assert.equal(progress.cellValues["1:0"], "새");
    assert.deepEqual(progress.tentativeCells, ["1:0"]);
    assert.equal(archive.hintCount, 7);
    assert.equal(archive.revealUsed, false);
  });

  test("ongoing canonical write 전 종료는 preimage로, write 후 실패는 target으로 수렴한다", async () => {
    const storage = new MemoryStorage();
    const migration = await prepareGameSaveMigration({
      storage,
      legacySnapshot: fixtureSnapshot(),
      now,
    });
    const next = structuredClone(migration.save);
    next.content["ko-KR"].puzzles["2026-05-25-normal-01"].cellValues["1:0"] =
      "새";
    const sealed = await sealSaveV2(next, portableGameSaveChecksumPort);
    const projection = createGameSaveLegacyProjectionPort(storage);
    const progressKey = "crossword-puzzle:progress:2026-05-25-normal-01";
    const preimage = storage.values.get(progressKey);

    await projection.prepareCanonicalWrite(sealed);
    assert.ok(storage.values.has(GAME_SAVE_LEGACY_PROJECTION_OUTBOX_KEY));
    assert.equal(await recoverLegacyProjectionOutbox(storage), "rolled-back");
    assert.equal(storage.values.get(progressKey), preimage);

    await projection.prepareCanonicalWrite(sealed);
    storage.values.set(DEFAULT_GAME_SAVE_V2_KEY, JSON.stringify(sealed));
    storage.failSetKey = progressKey;
    await assert.rejects(projection.commitCanonicalWrite(sealed));
    assert.ok(storage.values.has(GAME_SAVE_LEGACY_PROJECTION_OUTBOX_KEY));
    assert.equal(
      await recoverLegacyProjectionOutbox(storage),
      "rolled-forward",
    );
    assert.equal(
      JSON.parse(storage.values.get(progressKey) as string).cellValues["1:0"],
      "새",
    );
  });
});
