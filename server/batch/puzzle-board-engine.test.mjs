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

  test("첫 PASS 뒤 lookahead retry의 모든 PASS를 비교하고 선택 trace를 보존한다", () => {
    const compared = [];
    const { completedRetries, generatedOptions, result } = buildFixture({
      acceptedLookaheadRetries: 1,
      generateCandidates: ({ retryIndex }) => {
        if (retryIndex === 0) {
          return [{ id: "retry-0-fail", pass: false, rank: 100 }];
        }
        if (retryIndex === 1) {
          return [
            { id: "retry-1-candidate-0", pass: true, rank: 5 },
            { id: "retry-1-candidate-1", pass: true, rank: 3 },
          ];
        }
        return [
          { id: "retry-2-candidate-0", pass: true, rank: 1 },
          { id: "retry-2-candidate-1", pass: false, rank: 0 },
        ];
      },
      compareAcceptedCandidates: (left, right) => {
        compared.push([left.board.id, right.board.id]);
        return left.board.rank - right.board.rank;
      },
    });

    assert.equal(result.accepted, true);
    assert.equal(result.board.id, "retry-2-candidate-0");
    assert.equal(result.selectedRetryIndex, 2);
    assert.equal(result.selectedCandidateIndex, 0);
    assert.equal(result.selectedSeed, 102);
    assert.equal(result.attempts.length, 3);
    assert.equal(completedRetries.length, 3);
    assert.equal(generatedOptions.length, 3);
    assert.deepEqual(compared, [
      ["retry-1-candidate-1", "retry-1-candidate-0"],
      ["retry-2-candidate-0", "retry-1-candidate-1"],
    ]);
  });

  test("마지막 retry에서 처음 PASS하면 lookahead 여유가 없어도 그 후보를 반환한다", () => {
    const { generatedOptions, result } = buildFixture({
      acceptedLookaheadRetries: 1,
      generateCandidates: ({ retryIndex }) => [
        {
          id: `retry-${retryIndex}`,
          pass: retryIndex === 2,
        },
      ],
    });

    assert.equal(result.accepted, true);
    assert.equal(result.board.id, "retry-2");
    assert.equal(result.selectedRetryIndex, 2);
    assert.equal(result.selectedCandidateIndex, 0);
    assert.equal(result.attempts.length, 3);
    assert.equal(generatedOptions.length, 3);
  });

  test("같은 입력은 elapsed time을 제외한 동일 결과를 만든다", () => {
    const first = buildFixture().result;
    const second = buildFixture().result;
    assert.deepEqual(first, second);
  });
});
