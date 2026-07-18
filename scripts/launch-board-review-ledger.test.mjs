import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  LAUNCH_BOARD_REVIEW_LEDGER_SCHEMA_VERSION,
  calculateCanonicalDocumentChecksum,
  validateLaunchBoardReviewLedger,
} from "./launch-board-review-ledger.mjs";

const GENERATOR_COMMIT = "a".repeat(40);
const GENERATOR_CONFIG = Object.freeze({
  schemaVersion: "fixture-launch-generator-config/1",
  seedPolicy: "deterministic",
});
const GENERATOR_CONFIG_HASH =
  calculateCanonicalDocumentChecksum(GENERATOR_CONFIG);
const THEMES = [
  "table-kitchen",
  "living-world",
  "home-family",
  "road-places",
  "learning-culture",
  "work-community",
];

function checksumFor(index) {
  return `sha256:${index.toString(16).padStart(64, "0")}`;
}

function makeFirstRunBoard(index) {
  const puzzleId = `first-run-${String(index + 1).padStart(2, "0")}`;
  const contentChecksum = checksumFor(index + 1);
  return {
    route: { kind: "first-run" },
    artifactPath: `/game-content/v1/ko-KR/packs/first-run/${contentChecksum}.json`,
    content: {
      puzzleId,
      contentChecksum,
      themeId: `first-run-theme-${index + 1}`,
      difficulty: "easy",
      entries: [{ sourceEntryId: `first-run-${index + 1}-entry-01` }],
    },
  };
}

function makeGeneratedBoard(index) {
  const number = String(index + 1).padStart(2, "0");
  const puzzleId = `generated-board-${number}`;
  const contentChecksum = checksumFor(index + 100);
  const artifactPath = `/game-content/v1/ko-KR/packs/launch/${contentChecksum}.json`;
  const themeId = THEMES[index % THEMES.length];
  const difficulty = index % 10 === 0 ? "hard" : "normal";
  const sourceEntryIds = Array.from(
    { length: 4 },
    (_, entryIndex) => `${puzzleId}-source-${entryIndex + 1}`,
  );
  const catalogBoard = {
    route: { kind: "chapter", chapterId: `chapter-${index % 3}` },
    artifactPath,
    content: {
      puzzleId,
      contentChecksum,
      generatorCommit: GENERATOR_COMMIT,
      generatorConfigHash: GENERATOR_CONFIG_HASH,
      themeId,
      difficulty,
      entries: sourceEntryIds.map((sourceEntryId) => ({ sourceEntryId })),
    },
  };
  const reportBoard = {
    puzzleId,
    contentChecksum,
    artifactPath,
    generatorCommit: GENERATOR_COMMIT,
    generatorConfigHash: GENERATOR_CONFIG_HASH,
    themeId,
    difficulty,
    entryProvenance: sourceEntryIds.map((sourceEntryId) => ({ sourceEntryId })),
  };
  return { catalogBoard, reportBoard, sourceEntryIds };
}

function createFixture() {
  const generated = Array.from({ length: 90 }, (_, index) =>
    makeGeneratedBoard(index),
  );
  const catalog = {
    schemaVersion: "launch-content-catalog/1",
    artifactStatus: "candidate",
    activationApproved: false,
    generatedAt: "2026-07-18T14:00:00.000Z",
    boards: [
      ...Array.from({ length: 3 }, (_, index) => makeFirstRunBoard(index)),
      ...generated.map((item) => item.catalogBoard),
    ],
  };
  const generationReport = {
    schemaVersion: "ko-kr-launch-generation-report/3",
    artifactStatus: "candidate",
    activationApproved: false,
    generatedAt: "2026-07-18T14:00:00.000Z",
    generator: {
      commit: GENERATOR_COMMIT,
      configHash: GENERATOR_CONFIG_HASH,
      config: { ...GENERATOR_CONFIG },
    },
    boards: [...generated.slice(42), ...generated.slice(0, 42)].map(
      (item) => item.reportBoard,
    ),
  };
  const ledger = {
    schemaVersion: LAUNCH_BOARD_REVIEW_LEDGER_SCHEMA_VERSION,
    artifactStatus: "candidate",
    activationApproved: false,
    catalogChecksum: calculateCanonicalDocumentChecksum(catalog),
    generationReportChecksum:
      calculateCanonicalDocumentChecksum(generationReport),
    generatorCommit: GENERATOR_COMMIT,
    generatorConfigHash: GENERATOR_CONFIG_HASH,
    boards: generated.map(({ catalogBoard, sourceEntryIds }) => ({
      puzzleId: catalogBoard.content.puzzleId,
      contentChecksum: catalogBoard.content.contentChecksum,
      artifactPath: catalogBoard.artifactPath,
      themeId: catalogBoard.content.themeId,
      difficulty: catalogBoard.content.difficulty,
      sourceEntryIds: [...sourceEntryIds],
      reviewerId: "content-reviewer-fixture",
      reviewedAt: "2026-07-18T15:00:00.000Z",
      note: "테마 의미와 단서 품질을 실제 보드 조합으로 확인함",
      decision: "approve",
      checks: {
        themeSemantics: true,
        clueAnswerUniqueness: true,
        toneSafety: true,
        difficultyFit: true,
      },
    })),
  };
  return { catalog, generationReport, ledger };
}

function relock({ catalog, generationReport, ledger }) {
  ledger.catalogChecksum = calculateCanonicalDocumentChecksum(catalog);
  ledger.generationReportChecksum =
    calculateCanonicalDocumentChecksum(generationReport);
}

function expectRejected(fixture, pattern = /./) {
  assert.throws(
    () =>
      validateLaunchBoardReviewLedger(
        fixture.catalog,
        fixture.generationReport,
        fixture.ledger,
      ),
    pattern,
  );
}

describe("launch board review ledger", () => {
  test("90개 생성 보드의 사람 승인을 catalog 순서로 검증한다", () => {
    const fixture = createFixture();
    assert.equal(
      validateLaunchBoardReviewLedger(
        fixture.catalog,
        fixture.generationReport,
        fixture.ledger,
      ),
      true,
    );
    assert.equal(fixture.catalog.boards.length, 93);
    assert.equal(fixture.generationReport.boards.length, 90);
    assert.equal(fixture.ledger.boards.length, 90);
    assert.notEqual(
      fixture.generationReport.boards[0].puzzleId,
      fixture.ledger.boards[0].puzzleId,
    );
  });

  test("canonical checksum은 객체 key 순서와 무관하게 동일하다", () => {
    assert.equal(
      calculateCanonicalDocumentChecksum({ z: 1, a: { y: 2, b: 3 } }),
      calculateCanonicalDocumentChecksum({ a: { b: 3, y: 2 }, z: 1 }),
    );
  });

  test("ledger schema와 candidate 비활성 상태의 변조를 거부한다", async (t) => {
    for (const [name, mutate, pattern] of [
      [
        "schema",
        (fixture) => {
          fixture.ledger.schemaVersion =
            "game-content-launch-board-review-ledger/2";
        },
        /schemaVersion/,
      ],
      [
        "artifact status",
        (fixture) => {
          fixture.ledger.artifactStatus = "approved";
        },
        /inactive candidate/,
      ],
      [
        "activation",
        (fixture) => {
          fixture.ledger.activationApproved = true;
        },
        /inactive candidate/,
      ],
      [
        "unexpected top-level field",
        (fixture) => {
          fixture.ledger.unreviewedOverride = true;
        },
        /keys must exactly match/,
      ],
    ]) {
      await t.test(name, () => {
        const fixture = createFixture();
        mutate(fixture);
        expectRejected(fixture, pattern);
      });
    }
  });

  test("catalog/report canonical SHA lock의 missing·stale 상태를 거부한다", async (t) => {
    for (const [name, mutate, pattern] of [
      [
        "missing catalog lock",
        (fixture) => {
          delete fixture.ledger.catalogChecksum;
        },
        /keys must exactly match/,
      ],
      [
        "stale catalog lock",
        (fixture) => {
          fixture.catalog.generatedAt = "2026-07-18T14:01:00.000Z";
        },
        /catalogChecksum.*stale/,
      ],
      [
        "missing report lock",
        (fixture) => {
          delete fixture.ledger.generationReportChecksum;
        },
        /keys must exactly match/,
      ],
      [
        "stale report lock",
        (fixture) => {
          fixture.generationReport.generatedAt = "2026-07-18T14:01:00.000Z";
        },
        /generationReportChecksum.*stale/,
      ],
    ]) {
      await t.test(name, () => {
        const fixture = createFixture();
        mutate(fixture);
        expectRejected(fixture, pattern);
      });
    }
  });

  test("generator commit/configHash의 stale·invalid·board drift를 거부한다", async (t) => {
    for (const [name, mutate, pattern] of [
      [
        "stale commit lock",
        (fixture) => {
          fixture.ledger.generatorCommit = "c".repeat(40);
        },
        /generator identity.*stale/,
      ],
      [
        "stale config lock",
        (fixture) => {
          fixture.ledger.generatorConfigHash = `sha256:${"c".repeat(64)}`;
        },
        /generator identity.*stale/,
      ],
      [
        "invalid generator commit",
        (fixture) => {
          fixture.generationReport.generator.commit = "not-a-commit";
          fixture.ledger.generatorCommit = "not-a-commit";
          relock(fixture);
        },
        /generator commit is invalid/,
      ],
      [
        "invalid config hash",
        (fixture) => {
          fixture.generationReport.generator.configHash = "sha256:bad";
          fixture.ledger.generatorConfigHash = "sha256:bad";
          relock(fixture);
        },
        /configHash.*SHA-256/,
      ],
      [
        "config payload drift",
        (fixture) => {
          fixture.generationReport.generator.config.seedPolicy = "random";
          relock(fixture);
        },
        /configHash does not match/,
      ],
      [
        "report board generator drift",
        (fixture) => {
          fixture.generationReport.boards[7].generatorCommit = "c".repeat(40);
          relock(fixture);
        },
        /generator identity mismatch/,
      ],
      [
        "catalog board generator drift",
        (fixture) => {
          fixture.catalog.boards[12].content.generatorConfigHash = `sha256:${"c".repeat(64)}`;
          relock(fixture);
        },
        /generator identity mismatch/,
      ],
    ]) {
      await t.test(name, () => {
        const fixture = createFixture();
        mutate(fixture);
        expectRejected(fixture, pattern);
      });
    }
  });

  test("3개 first-run을 제외한 생성 보드 수가 정확히 90개가 아니면 거부한다", async (t) => {
    for (const [name, mutate, pattern] of [
      [
        "missing review",
        (fixture) => fixture.ledger.boards.pop(),
        /exactly 90 generated board reviews/,
      ],
      [
        "missing report board",
        (fixture) => {
          fixture.generationReport.boards.pop();
          relock(fixture);
        },
        /exactly 90 generated boards/,
      ],
      [
        "missing catalog board",
        (fixture) => {
          fixture.catalog.boards.pop();
          relock(fixture);
        },
        /exactly 3 first-run and 90 generated boards/,
      ],
      [
        "first-run interleaving",
        (fixture) => {
          [fixture.catalog.boards[2], fixture.catalog.boards[3]] = [
            fixture.catalog.boards[3],
            fixture.catalog.boards[2],
          ];
          relock(fixture);
        },
        /first-run boards must be exactly the first three/,
      ],
      [
        "missing generated route kind",
        (fixture) => {
          delete fixture.catalog.boards[3].route.kind;
          relock(fixture);
        },
        /generated route kind/,
      ],
      [
        "unsupported generated route kind",
        (fixture) => {
          fixture.catalog.boards[3].route.kind = "experimental";
          relock(fixture);
        },
        /generated route kind/,
      ],
      [
        "first-run/generated puzzleId collision",
        (fixture) => {
          fixture.catalog.boards[3].content.puzzleId =
            fixture.catalog.boards[0].content.puzzleId;
          relock(fixture);
        },
        /catalog puzzleId.*unique/,
      ],
      [
        "first-run review inclusion",
        (fixture) => {
          fixture.ledger.boards[0].puzzleId =
            fixture.catalog.boards[0].content.puzzleId;
        },
        /catalog-order board 0/,
      ],
    ]) {
      await t.test(name, () => {
        const fixture = createFixture();
        mutate(fixture);
        expectRejected(fixture, pattern);
      });
    }
  });

  test("catalog 순서의 exact identity와 sourceEntryIds 순서를 모두 봉인한다", async (t) => {
    const mutations = {
      puzzleId: (row) => {
        row.puzzleId = "stale-puzzle";
      },
      contentChecksum: (row) => {
        row.contentChecksum = checksumFor(999);
      },
      artifactPath: (row) => {
        row.artifactPath = "/game-content/v1/ko-KR/packs/stale.json";
      },
      themeId: (row) => {
        row.themeId = "stale-theme";
      },
      difficulty: (row) => {
        row.difficulty = "easy";
      },
      sourceEntryIds: (row) => {
        [row.sourceEntryIds[0], row.sourceEntryIds[1]] = [
          row.sourceEntryIds[1],
          row.sourceEntryIds[0],
        ];
      },
    };
    for (const [field, mutate] of Object.entries(mutations)) {
      await t.test(field, () => {
        const fixture = createFixture();
        mutate(fixture.ledger.boards[1]);
        expectRejected(fixture, /catalog-order board 1/);
      });
    }

    await t.test("duplicate", () => {
      const fixture = createFixture();
      fixture.ledger.boards[1] = structuredClone(fixture.ledger.boards[0]);
      expectRejected(fixture, /puzzleId.*unique/);
    });
    await t.test("report duplicate", () => {
      const fixture = createFixture();
      fixture.generationReport.boards[1] = structuredClone(
        fixture.generationReport.boards[0],
      );
      relock(fixture);
      expectRejected(fixture, /generation report puzzleId.*unique/);
    });
    await t.test("order swap", () => {
      const fixture = createFixture();
      [fixture.ledger.boards[4], fixture.ledger.boards[5]] = [
        fixture.ledger.boards[5],
        fixture.ledger.boards[4],
      ];
      expectRejected(fixture, /catalog-order board 4/);
    });
    await t.test("catalog order swap with a fresh SHA lock", () => {
      const fixture = createFixture();
      [fixture.catalog.boards[7], fixture.catalog.boards[8]] = [
        fixture.catalog.boards[8],
        fixture.catalog.boards[7],
      ];
      relock(fixture);
      expectRejected(fixture, /catalog-order board 4/);
    });
    await t.test(
      "report sourceEntryId order drift with a fresh SHA lock",
      () => {
        const fixture = createFixture();
        const entries = fixture.generationReport.boards[8].entryProvenance;
        [entries[0], entries[1]] = [entries[1], entries[0]];
        relock(fixture);
        expectRejected(fixture, /generation report\/catalog board/);
      },
    );
  });

  test("reviewerId·reviewedAt·note와 approve decision을 fail closed한다", async (t) => {
    for (const [name, mutate, pattern] of [
      [
        "missing reviewer",
        (row) => {
          row.reviewerId = " ";
        },
        /reviewerId.*non-empty/,
      ],
      [
        "invalid reviewedAt",
        (row) => {
          row.reviewedAt = "2026/07/18 15:00";
        },
        /reviewedAt.*ISO/,
      ],
      [
        "missing note",
        (row) => {
          row.note = "";
        },
        /note.*non-empty/,
      ],
      [
        "pending",
        (row) => {
          row.decision = "pending";
        },
        /decision must be approve/,
      ],
      [
        "fail",
        (row) => {
          row.decision = "fail";
        },
        /decision must be approve/,
      ],
    ]) {
      await t.test(name, () => {
        const fixture = createFixture();
        mutate(fixture.ledger.boards[12]);
        expectRejected(fixture, pattern);
      });
    }
  });

  test("사람 검수 네 항목은 exact key와 true만 허용한다", async (t) => {
    for (const check of [
      "themeSemantics",
      "clueAnswerUniqueness",
      "toneSafety",
      "difficultyFit",
    ]) {
      await t.test(`${check}=false`, () => {
        const fixture = createFixture();
        fixture.ledger.boards[20].checks[check] = false;
        expectRejected(fixture, new RegExp(`${check} must be true`));
      });
      await t.test(`${check}=missing`, () => {
        const fixture = createFixture();
        delete fixture.ledger.boards[20].checks[check];
        expectRejected(fixture, /checks keys must exactly match/);
      });
    }
    await t.test("unexpected check", () => {
      const fixture = createFixture();
      fixture.ledger.boards[20].checks.automaticPass = true;
      expectRejected(fixture, /checks keys must exactly match/);
    });
  });
});
