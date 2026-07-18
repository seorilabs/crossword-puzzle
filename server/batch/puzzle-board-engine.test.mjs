import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { generateBoardWithRetries } from "./puzzle-board-engine.mjs";

function buildFixture(overrides = {}) {
  const generatedOptions = [];
  const completedRetries = [];
  const result = generateBoardWithRetries({
    retries: 3,
    seedForRetry: (retryIndex) => 100 + retryIndex,
    searchOptionsForRetry: (retryIndex) => ({ attempts: retryIndex + 1 }),
    buildGeneratorOptions: ({ retryIndex, searchOptions, seed }) => {
      const options = { retryIndex, searchOptions, seed };
      generatedOptions.push(options);
      return options;
    },
    generateCandidates: ({ retryIndex }) => [
      { id: `retry-${retryIndex}-candidate-0`, pass: false },
      {
        id: `retry-${retryIndex}-candidate-1`,
        pass: retryIndex === 1,
      },
    ],
    evaluateCandidate: (board) => ({ pass: board.pass }),
    summarizeCandidate: (board, quality, candidateIndex) => ({
      candidateIndex,
      id: board.id,
      pass: quality.pass,
    }),
    onRetryComplete: (event) => completedRetries.push(event),
    ...overrides,
  });
  return { completedRetries, generatedOptions, result };
}

describe("shared puzzle board engine", () => {
  test("retry seed와 search 순서를 보존하고 첫 통과 후보에서 중단한다", () => {
    const { completedRetries, generatedOptions, result } = buildFixture();

    assert.equal(result.accepted, true);
    assert.equal(result.board.id, "retry-1-candidate-1");
    assert.equal(result.selectedRetryIndex, 1);
    assert.equal(result.selectedCandidateIndex, 1);
    assert.equal(result.selectedSeed, 101);
    assert.deepEqual(generatedOptions, [
      { retryIndex: 0, searchOptions: { attempts: 1 }, seed: 100 },
      { retryIndex: 1, searchOptions: { attempts: 2 }, seed: 101 },
    ]);
    assert.equal(result.attempts.length, 2);
    assert.equal(completedRetries.length, 2);
  });

  test("모든 retry가 실패하면 전체 trace를 반환한다", () => {
    const { result } = buildFixture({
      generateCandidates: ({ retryIndex }) => [
        { id: `retry-${retryIndex}`, pass: false },
      ],
    });

    assert.deepEqual(result, {
      accepted: false,
      attempts: [
        {
          retryIndex: 0,
          seed: 100,
          searchOptions: { attempts: 1 },
          candidateCount: 1,
          candidates: [{ candidateIndex: 0, id: "retry-0", pass: false }],
        },
        {
          retryIndex: 1,
          seed: 101,
          searchOptions: { attempts: 2 },
          candidateCount: 1,
          candidates: [{ candidateIndex: 0, id: "retry-1", pass: false }],
        },
        {
          retryIndex: 2,
          seed: 102,
          searchOptions: { attempts: 3 },
          candidateCount: 1,
          candidates: [{ candidateIndex: 0, id: "retry-2", pass: false }],
        },
      ],
    });
  });

  test("같은 입력은 elapsed time을 제외한 동일 결과를 만든다", () => {
    const first = buildFixture().result;
    const second = buildFixture().result;
    assert.deepEqual(first, second);
  });
});
