import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  calculateGameContentChecksum,
  type GameContentV1,
} from "../../packages/crossword-core/src/gameContent.ts";
import {
  canonicalizeForChecksum,
  compareCanonicalStrings,
} from "../../packages/crossword-core/src/saveV2.ts";
import { sha256Checksum } from "../../packages/crossword-core/src/sha256.ts";
import { loadBundledOnboardingGameContent } from "./onboardingGameContent.ts";
import { loadLaunchPreviewContent } from "./launchPreviewContent.ts";

const CHECKPOINT_HASH = "a".repeat(64);
const GENERATOR_CONFIG_HASH = `sha256:${CHECKPOINT_HASH}`;
const GENERATOR_COMMIT = "b".repeat(40);
const PUZZLE_IDS = Object.freeze(
  Array.from(
    { length: 8 },
    (_, index) => `ko-kr-daily-2026-07-${String(index + 20).padStart(2, "0")}`,
  ),
);
const WEEKDAYS = Object.freeze([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "monday",
]);

type Fixture = ReturnType<typeof createFixture>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function checksum(value: unknown): string {
  return sha256Checksum(canonicalizeForChecksum(value));
}

function createContent(index: number): GameContentV1 {
  const base = loadBundledOnboardingGameContent();
  const unsealed: GameContentV1 = {
    ...clone(base),
    puzzleId: PUZZLE_IDS[index],
    slotId: `2026-07-${String(index + 20).padStart(2, "0")}-h00`,
    packId: "ko-kr-launch-v1",
    themeId: "table-kitchen",
    chapterId: "chapter-01",
    difficulty: index === 4 ? "hard" : "normal",
    generatorCommit: GENERATOR_COMMIT,
    generatorConfigHash: GENERATOR_CONFIG_HASH,
    contentChecksum: "sha256:unsealed",
  };
  return {
    ...unsealed,
    contentChecksum: calculateGameContentChecksum(unsealed),
  };
}

function createReport(content: GameContentV1, index: number) {
  const answers = [
    ...new Set(content.entries.map(({ answer }) => answer)),
  ].sort(compareCanonicalStrings);
  const metrics = {
    wordCount: content.entries.length,
    connectedComponents: 1,
  };
  const seed = 20260720 + index;
  return {
    puzzleId: content.puzzleId,
    packId: content.packId,
    contentChecksum: content.contentChecksum,
    generatorCommit: content.generatorCommit,
    generatorConfigHash: content.generatorConfigHash,
    route: { kind: "daily", weekday: WEEKDAYS[index] },
    difficulty: content.difficulty,
    themeId: content.themeId,
    accepted: true,
    selectedCandidateIndex: 0,
    selectedRetryIndex: 0,
    selectedSeed: seed,
    metrics,
    attempts: [
      {
        retryIndex: 0,
        seed,
        candidates: [
          {
            candidateIndex: 0,
            pass: true,
            metrics: clone(metrics),
            answers,
          },
        ],
      },
    ],
  };
}

function refreshCompleted(fixture: Fixture, index: number) {
  const puzzleId = PUZZLE_IDS[index];
  const completed = fixture.checkpoint.completed[index];
  if (puzzleId == null || completed == null) throw new Error("invalid fixture");
  completed.contentSha256 = checksum(fixture.contents[index]);
  completed.reportSha256 = checksum(fixture.reports[index]);
}

function createFixture(boardCount = 8) {
  const contents = Array.from({ length: boardCount }, (_, index) =>
    createContent(index),
  );
  const reports = contents.map(createReport);
  const checkpoint = {
    schemaVersion: "ko-kr-launch-generation-checkpoint/1",
    generatorCommit: GENERATOR_COMMIT,
    generatorConfigHash: GENERATOR_CONFIG_HASH,
    routePuzzleIds: PUZZLE_IDS.slice(0, boardCount),
    completed: contents.map((content, index) => ({
      puzzleId: content.puzzleId,
      contentSha256: checksum(content),
      reportSha256: checksum(reports[index]),
    })),
  };
  return { checkpoint, contents, reports };
}

function createFetch(fixture: Fixture, requestedUrls: string[] = []) {
  const root = `/tmp/launch-content-checkpoints/${CHECKPOINT_HASH}`;
  const documents = new Map<string, unknown>([
    [`${root}/checkpoint.json`, fixture.checkpoint],
  ]);
  for (const [index, content] of fixture.contents.entries()) {
    documents.set(`${root}/boards/${content.puzzleId}.json`, content);
    documents.set(
      `${root}/reports/${content.puzzleId}.json`,
      fixture.reports[index],
    );
  }
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    requestedUrls.push(url);
    if (!documents.has(url)) {
      return {
        ok: false,
        status: 404,
        json: async () => null,
      } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => clone(documents.get(url)),
    } as Response;
  }) as typeof fetch;
}

async function expectRejected(
  fixture: Fixture,
  pattern: RegExp,
  checkpointHash = CHECKPOINT_HASH,
) {
  await assert.rejects(
    loadLaunchPreviewContent({
      checkpointHash,
      fetch: createFetch(fixture),
    }),
    pattern,
  );
}

describe("launch preview checkpoint loader", () => {
  test("8개 이상 checkpoint에서도 고정된 첫 7개 candidate itinerary만 반환한다", async () => {
    const fixture = createFixture(8);
    const requestedUrls: string[] = [];
    const result = await loadLaunchPreviewContent({
      checkpointHash: CHECKPOINT_HASH,
      fetch: createFetch(fixture, requestedUrls),
    });

    assert.deepEqual(
      {
        checkpointHash: result.checkpointHash,
        generatorCommit: result.generatorCommit,
        candidate: result.candidate,
        activationApproved: result.activationApproved,
      },
      {
        checkpointHash: CHECKPOINT_HASH,
        generatorCommit: GENERATOR_COMMIT,
        candidate: true,
        activationApproved: false,
      },
    );
    assert.deepEqual(
      result.items.map(({ content }) => content.puzzleId),
      PUZZLE_IDS.slice(0, 7),
    );
    assert.deepEqual(
      result.items.map(({ mapNodeId }) => mapNodeId),
      PUZZLE_IDS.slice(0, 7).map(
        (puzzleId) => `dev-preview:${CHECKPOINT_HASH}:${puzzleId}`,
      ),
    );
    assert.ok(result.items.every(({ cardIds }) => cardIds.length === 0));
    assert.ok(
      requestedUrls.every((url) => !url.includes(PUZZLE_IDS[7] as string)),
    );
    assert.equal(requestedUrls.length, 15);
  });

  test("checkpointHash는 정확한 lowercase 64 hex만 허용한다", async () => {
    const fixture = createFixture();
    for (const invalidHash of [
      "A".repeat(64),
      "a".repeat(63),
      `sha256:${"a".repeat(64)}`,
      `${"a".repeat(62)}/.`,
    ]) {
      await expectRejected(
        fixture,
        /checkpointHash must be exactly/,
        invalidHash,
      );
    }
  });

  test("완성 보드가 6개 이하면 fail-closed한다", async () => {
    await expectRejected(
      createFixture(6),
      /must contain at least seven completed launch routes/,
    );
  });

  test("checkpoint schema와 generator config hash 및 commit을 봉인한다", async () => {
    const schemaFixture = createFixture();
    schemaFixture.checkpoint.schemaVersion =
      "ko-kr-launch-generation-checkpoint/2";
    await expectRejected(schemaFixture, /schemaVersion/);

    const configFixture = createFixture();
    configFixture.checkpoint.generatorConfigHash = `sha256:${"c".repeat(64)}`;
    await expectRejected(configFixture, /does not match checkpointHash/);

    const commitFixture = createFixture();
    commitFixture.checkpoint.generatorCommit = "B".repeat(40);
    await expectRejected(commitFixture, /lowercase 40-character Git SHA/);
  });

  test("첫 7개 completed와 route 순서를 출시 생성 큐 prefix에 고정한다", async () => {
    const routeFixture = createFixture();
    [
      routeFixture.checkpoint.routePuzzleIds[0],
      routeFixture.checkpoint.routePuzzleIds[1],
    ] = [
      routeFixture.checkpoint.routePuzzleIds[1],
      routeFixture.checkpoint.routePuzzleIds[0],
    ];
    await expectRejected(routeFixture, /first seven routes drifted at index 0/);

    const completedFixture = createFixture();
    completedFixture.checkpoint.completed[0].puzzleId = "../checkpoint";
    await expectRejected(completedFixture, /is not a safe puzzleId/);
  });

  test("board와 report 문서 SHA를 checkpoint metadata와 대조한다", async () => {
    const boardFixture = createFixture();
    boardFixture.contents[0].themeId = "tampered";
    await expectRejected(boardFixture, /board SHA does not match/);

    const reportFixture = createFixture();
    reportFixture.reports[0].themeId = "tampered";
    await expectRejected(reportFixture, /report SHA does not match/);
  });

  test("artifact SHA가 맞아도 GameContentV1 checksum이 깨지면 거부한다", async () => {
    const fixture = createFixture();
    fixture.contents[0].themeId = "tampered-but-rehashed-artifact";
    refreshCompleted(fixture, 0);
    await expectRejected(
      fixture,
      /GameContentV1 is invalid \(checksum_mismatch/,
    );
  });

  test("content와 report의 generator, puzzle, checksum join을 정확히 검증한다", async () => {
    const contentFixture = createFixture();
    contentFixture.contents[0].generatorCommit = "c".repeat(40);
    contentFixture.contents[0].contentChecksum = calculateGameContentChecksum(
      contentFixture.contents[0],
    );
    refreshCompleted(contentFixture, 0);
    await expectRejected(contentFixture, /content identity does not match/);

    for (const mutate of [
      (fixture: Fixture) => {
        fixture.reports[0].generatorCommit = "c".repeat(40);
      },
      (fixture: Fixture) => {
        fixture.reports[0].puzzleId = PUZZLE_IDS[1];
      },
      (fixture: Fixture) => {
        fixture.reports[0].contentChecksum = `sha256:${"d".repeat(64)}`;
      },
    ]) {
      const fixture = createFixture();
      mutate(fixture);
      refreshCompleted(fixture, 0);
      await expectRejected(fixture, /does not exactly join/);
    }
  });

  test("report의 selected retry, candidate, answers를 실제 content에 고정한다", async () => {
    const retryFixture = createFixture();
    retryFixture.reports[0].selectedSeed += 1;
    refreshCompleted(retryFixture, 0);
    await expectRejected(retryFixture, /selected seed does not match/);

    const candidateFixture = createFixture();
    candidateFixture.reports[0].attempts[0].candidates[0].candidateIndex = 1;
    refreshCompleted(candidateFixture, 0);
    await expectRejected(
      candidateFixture,
      /selected candidate identity is invalid/,
    );

    const answersFixture = createFixture();
    answersFixture.reports[0].attempts[0].candidates[0].answers.pop();
    refreshCompleted(answersFixture, 0);
    await expectRejected(answersFixture, /answers do not match the content/);
  });
});
