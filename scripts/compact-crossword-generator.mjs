import {
  LAUNCH_QUALITY_SCORING_POLICY,
  makeWordMap,
  scoreBoard,
} from "./crossword-generator-prototype.mjs";

export const LAUNCH_COMPACT_FALLBACK_POLICY = Object.freeze({
  policyId: "launch-compact-connected-dfs-v1",
  activationScope: "launch-builder-only-after-standard-search-has-no-pass",
  initialSymmetry: "each-word-across-at-origin-then-global-candidate-ranking",
  connectivity: "every-placement-after-first-overlaps-an-existing-letter",
  intermediateRunPolicy: "all-maximal-runs-known-unique-and-accepted",
  bboxAreaLimit: "board-size-times-ceiling-half-board-size",
  maxNodeCount: 25_000,
  maxCandidateCount: 1,
  finalAcceptance: "full-route-quality-pass-only",
});

function requireCondition(condition, message) {
  if (!condition) throw new TypeError(message);
}

function splitAnswer(answer) {
  return [...answer];
}

function cellKey(row, col) {
  return `${row},${col}`;
}

function parseCellKey(key) {
  return key.split(",").map(Number);
}

function directionDelta(direction) {
  return direction === "across" ? [0, 1] : [1, 0];
}

function cloneSparseCells(cells) {
  return new Map(
    [...cells].map(([key, cell]) => [
      key,
      { letter: cell.letter, directions: new Set(cell.directions) },
    ]),
  );
}

function compareNumber(left, right) {
  return left - right;
}

function compareCodeUnits(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function sortedSparseCellEntries(cells) {
  return [...cells.entries()].sort(([leftKey], [rightKey]) => {
    const [leftRow, leftCol] = parseCellKey(leftKey);
    const [rightRow, rightCol] = parseCellKey(rightKey);
    return compareNumber(leftRow, rightRow) || compareNumber(leftCol, rightCol);
  });
}

function calculateSparseBbox(cells) {
  if (cells.size === 0) {
    return {
      area: 0,
      height: 0,
      maxCol: 0,
      maxRow: 0,
      minCol: 0,
      minRow: 0,
      width: 0,
    };
  }
  const coordinates = [...cells.keys()].map(parseCellKey);
  const rows = coordinates.map(([row]) => row);
  const cols = coordinates.map(([, col]) => col);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  const height = maxRow - minRow + 1;
  const width = maxCol - minCol + 1;
  return {
    area: height * width,
    height,
    maxCol,
    maxRow,
    minCol,
    minRow,
    width,
  };
}

function scanSparseRuns(cells) {
  const runs = [];
  const cellEntries = sortedSparseCellEntries(cells);
  for (const direction of ["across", "down"]) {
    const [dr, dc] = directionDelta(direction);
    for (const [key] of cellEntries) {
      const [row, col] = parseCellKey(key);
      if (cells.has(cellKey(row - dr, col - dc))) continue;
      const runCells = [];
      let currentRow = row;
      let currentCol = col;
      while (cells.has(cellKey(currentRow, currentCol))) {
        runCells.push({
          row: currentRow,
          col: currentCol,
          letter: cells.get(cellKey(currentRow, currentCol)).letter,
        });
        currentRow += dr;
        currentCol += dc;
      }
      if (runCells.length < 2) continue;
      runs.push({
        answer: runCells.map((cell) => cell.letter).join(""),
        row,
        col,
        direction,
        cells: runCells,
      });
    }
  }
  return runs;
}

function analyzeSparseState(cells, options) {
  const runs = scanSparseRuns(cells);
  const answers = new Set();
  for (const run of runs) {
    if (!options.wordMap.has(run.answer) || answers.has(run.answer)) {
      return null;
    }
    answers.add(run.answer);
  }
  if (options.acceptRuns?.(runs) === false) return null;

  const directionsByCell = new Map();
  for (const run of runs) {
    for (const cell of run.cells) {
      const key = cellKey(cell.row, cell.col);
      const directions = directionsByCell.get(key) ?? new Set();
      directions.add(run.direction);
      directionsByCell.set(key, directions);
    }
  }
  const crossCellKeys = new Set(
    [...directionsByCell.entries()]
      .filter(([, directions]) => directions.size > 1)
      .map(([key]) => key),
  );
  const multiIntersectionRunCount = runs.filter(
    (run) =>
      run.cells.filter((cell) => crossCellKeys.has(cellKey(cell.row, cell.col)))
        .length >= 2,
  ).length;
  const bbox = calculateSparseBbox(cells);
  const preferredRunCount =
    options.isPreferredRun == null
      ? runs.length
      : runs.filter((run) => options.isPreferredRun(run)).length;
  return {
    answers,
    bbox,
    crossCellKeys,
    metrics: {
      bboxArea: bbox.area,
      bboxDensity: bbox.area === 0 ? 0 : cells.size / bbox.area,
      crossRatio: cells.size === 0 ? 0 : crossCellKeys.size / cells.size,
      filledCells: cells.size,
      multiIntersectionRunCount,
      multiIntersectionRunRatio:
        runs.length === 0 ? 0 : multiIntersectionRunCount / runs.length,
      preferredRunRatio:
        runs.length === 0 ? 1 : preferredRunCount / runs.length,
      wordCount: runs.length,
    },
    runs,
  };
}

function compactPlacementKey(placement) {
  return `${placement.direction}:${placement.row}:${placement.col}:${placement.word.answer}`;
}

function enumerateCompactPlacements(state, word) {
  if (state.cells.size === 0) {
    return [{ word, row: 0, col: 0, direction: "across" }];
  }
  const candidates = new Map();
  for (const [key, cell] of sortedSparseCellEntries(state.cells)) {
    const [cellRow, cellCol] = parseCellKey(key);
    for (
      let letterIndex = 0;
      letterIndex < word.letters.length;
      letterIndex += 1
    ) {
      if (word.letters[letterIndex] !== cell.letter) continue;
      for (const direction of ["across", "down"]) {
        if (cell.directions.has(direction)) continue;
        const [dr, dc] = directionDelta(direction);
        const placement = {
          word,
          row: cellRow - dr * letterIndex,
          col: cellCol - dc * letterIndex,
          direction,
        };
        candidates.set(compactPlacementKey(placement), placement);
      }
    }
  }
  return [...candidates.values()];
}

function applyCompactPlacement(state, placement, options) {
  const [dr, dc] = directionDelta(placement.direction);
  if (
    state.cells.has(cellKey(placement.row - dr, placement.col - dc)) ||
    state.cells.has(
      cellKey(
        placement.row + dr * placement.word.letters.length,
        placement.col + dc * placement.word.letters.length,
      ),
    )
  ) {
    return null;
  }

  const placementCells = [];
  const intersections = [];
  for (let index = 0; index < placement.word.letters.length; index += 1) {
    const row = placement.row + dr * index;
    const col = placement.col + dc * index;
    const key = cellKey(row, col);
    const existing = state.cells.get(key);
    if (
      existing != null &&
      (existing.letter !== placement.word.letters[index] ||
        existing.directions.has(placement.direction))
    ) {
      return null;
    }
    if (existing != null) intersections.push(key);
    placementCells.push({ row, col, letter: placement.word.letters[index] });
  }
  if (state.cells.size > 0 && intersections.length === 0) return null;

  const cells = cloneSparseCells(state.cells);
  for (const cell of placementCells) {
    const key = cellKey(cell.row, cell.col);
    const target = cells.get(key) ?? {
      letter: cell.letter,
      directions: new Set(),
    };
    target.directions.add(placement.direction);
    cells.set(key, target);
  }
  const bbox = calculateSparseBbox(cells);
  if (
    bbox.area > options.maxBboxArea ||
    bbox.height > options.boardSize ||
    bbox.width > options.boardSize
  ) {
    return null;
  }
  const analysis = analyzeSparseState(cells, options);
  if (analysis == null) return null;
  return {
    analysis,
    cells,
    placements: [
      ...state.placements,
      {
        ...placement,
        cells: placementCells,
        intersections,
      },
    ],
    usedAnswers: new Set([
      ...state.usedAnswers,
      placement.word.answer,
      ...analysis.answers,
    ]),
  };
}

function canonicalCompactStateKey(state) {
  const bbox = calculateSparseBbox(state.cells);
  const cells = sortedSparseCellEntries(state.cells)
    .map(([key, cell]) => {
      const [row, col] = parseCellKey(key);
      return `${row - bbox.minRow},${col - bbox.minCol}:${cell.letter}:${[
        ...cell.directions,
      ]
        .sort(compareCodeUnits)
        .join("+")}`;
    })
    .join("|");
  const placements = state.placements
    .map(
      (placement) =>
        `${placement.direction}:${placement.row - bbox.minRow}:${placement.col - bbox.minCol}:${placement.word.answer}`,
    )
    .sort(compareCodeUnits)
    .join("|");
  return `${state.placements.length}#${placements}#${cells}#${[
    ...state.usedAnswers,
  ]
    .sort(compareCodeUnits)
    .join("|")}`;
}

function compareCompactStates(left, right) {
  const leftMetrics = left.analysis.metrics;
  const rightMetrics = right.analysis.metrics;
  const numericOrder =
    rightMetrics.wordCount - leftMetrics.wordCount ||
    rightMetrics.multiIntersectionRunRatio -
      leftMetrics.multiIntersectionRunRatio ||
    rightMetrics.crossRatio - leftMetrics.crossRatio ||
    rightMetrics.bboxDensity - leftMetrics.bboxDensity ||
    leftMetrics.bboxArea - rightMetrics.bboxArea ||
    right.placements.length - left.placements.length ||
    rightMetrics.preferredRunRatio - leftMetrics.preferredRunRatio;
  if (numericOrder !== 0) return numericOrder;
  const leftPlacement = left.placements.at(-1);
  const rightPlacement = right.placements.at(-1);
  return (
    leftPlacement.word.searchOrder - rightPlacement.word.searchOrder ||
    compareCodeUnits(
      compactPlacementKey(leftPlacement),
      compactPlacementKey(rightPlacement),
    )
  );
}

function centerCompactBoardState(state, options) {
  const bbox = state.analysis.bbox;
  const rowOffset =
    Math.floor((options.boardSize - bbox.height) / 2) - bbox.minRow;
  const colOffset =
    Math.floor((options.boardSize - bbox.width) / 2) - bbox.minCol;
  const grid = Array.from({ length: options.boardSize }, () =>
    Array.from({ length: options.boardSize }, () => null),
  );
  for (const [key, cell] of state.cells) {
    const [row, col] = parseCellKey(key);
    grid[row + rowOffset][col + colOffset] = cell.letter;
  }

  const translatedRuns = state.analysis.runs.map((run) => ({
    ...run,
    row: run.row + rowOffset,
    col: run.col + colOffset,
    cells: run.cells.map((cell) => ({
      ...cell,
      row: cell.row + rowOffset,
      col: cell.col + colOffset,
    })),
  }));
  const directions = Array.from({ length: options.boardSize }, () =>
    Array.from({ length: options.boardSize }, () => new Set()),
  );
  for (const run of translatedRuns) {
    for (const cell of run.cells) {
      directions[cell.row][cell.col].add(run.direction);
    }
  }
  const finalRunKeys = new Set(
    translatedRuns.map(
      (run) => `${run.direction}:${run.row}:${run.col}:${run.answer}`,
    ),
  );
  const placements = state.placements
    .map((placement) => ({
      answer: placement.word.answer,
      clue: placement.word.clue,
      row: placement.row + rowOffset,
      col: placement.col + colOffset,
      direction: placement.direction,
      cells: placement.cells.map((cell) => ({
        ...cell,
        row: cell.row + rowOffset,
        col: cell.col + colOffset,
      })),
      intersections: placement.intersections.map((key) => {
        const [row, col] = parseCellKey(key);
        return cellKey(row + rowOffset, col + colOffset);
      }),
    }))
    .filter((placement) =>
      finalRunKeys.has(
        `${placement.direction}:${placement.row}:${placement.col}:${placement.answer}`,
      ),
    );
  return { grid, dirs: directions, placements };
}

function makeCompactTrace(
  options,
  state,
  nodeCount,
  uniqueStateCount,
  termination,
) {
  return Object.freeze({
    policyId: LAUNCH_COMPACT_FALLBACK_POLICY.policyId,
    termination,
    nodeCount,
    uniqueStateCount,
    maxNodeCount: options.maxNodeCount,
    maxBboxArea: options.maxBboxArea,
    selectedAnswers:
      state == null
        ? []
        : state.analysis.runs.map((run) => run.answer).sort(compareCodeUnits),
  });
}

function roundedRatio(value) {
  return Number(value.toFixed(3));
}

function passesCompactGeometryPrecheck(state, options) {
  const metrics = state.analysis.metrics;
  return (
    metrics.wordCount >= options.compactMinimumWordCount &&
    roundedRatio(metrics.crossRatio) >= options.compactMinimumCrossRatio &&
    roundedRatio(metrics.bboxDensity) >= options.compactMinimumBboxDensity &&
    roundedRatio(metrics.multiIntersectionRunRatio) >=
      options.compactMinimumMultiIntersectionRunRatio &&
    roundedRatio(metrics.preferredRunRatio) >=
      (options.minPreferredRunRatio ?? 0)
  );
}

/**
 * Launch-only fallback search. It intentionally does not share the batch RNG or
 * mutate the standard beam generator, so the two-hour batch remains byte-for-
 * byte compatible with its legacy scoring path.
 */
export function generateCompactLaunchBoard(inputOptions = {}) {
  requireCondition(
    inputOptions.scoringPolicyId === LAUNCH_QUALITY_SCORING_POLICY.policyId,
    "compact launch fallback requires the launch scoring policy",
  );
  for (const field of [
    "compactMinimumCrossRatio",
    "compactMinimumBboxDensity",
    "compactMinimumMultiIntersectionRunRatio",
  ]) {
    requireCondition(
      Number.isFinite(inputOptions[field]) &&
        inputOptions[field] >= 0 &&
        inputOptions[field] <= 1,
      `compact launch fallback ${field} must be between 0 and 1`,
    );
  }
  requireCondition(
    Number.isInteger(inputOptions.boardSize) && inputOptions.boardSize > 0,
    "compact launch fallback boardSize must be a positive integer",
  );
  requireCondition(
    Number.isInteger(inputOptions.maxWords) && inputOptions.maxWords > 0,
    "compact launch fallback maxWords must be a positive integer",
  );
  requireCondition(
    Number.isInteger(inputOptions.compactMinimumWordCount) &&
      inputOptions.compactMinimumWordCount >= 6,
    "compact launch fallback compactMinimumWordCount must be at least 6",
  );
  requireCondition(
    Array.isArray(inputOptions.wordBank) && inputOptions.wordBank.length > 0,
    "compact launch fallback wordBank must be a non-empty array",
  );
  requireCondition(
    typeof inputOptions.evaluateBoardQuality === "function",
    "compact launch fallback evaluateBoardQuality must be a function",
  );
  if (inputOptions.acceptRuns != null) {
    requireCondition(
      typeof inputOptions.acceptRuns === "function",
      "compact launch fallback acceptRuns must be a function",
    );
  }
  if (inputOptions.isPreferredRun != null) {
    requireCondition(
      typeof inputOptions.isPreferredRun === "function",
      "compact launch fallback isPreferredRun must be a function",
    );
  }

  const words = inputOptions.wordBank
    .map((word, searchOrder) => ({
      ...word,
      letters: splitAnswer(word.answer),
      searchOrder,
    }))
    .filter(
      (word) =>
        word.letters.length >= (inputOptions.minWordLength ?? 2) &&
        word.letters.length <= inputOptions.boardSize,
    );
  const options = {
    ...inputOptions,
    maxBboxArea: inputOptions.boardSize * Math.ceil(inputOptions.boardSize / 2),
    maxNodeCount: LAUNCH_COMPACT_FALLBACK_POLICY.maxNodeCount,
    wordMap: makeWordMap(words),
  };
  const initial = {
    analysis: null,
    cells: new Map(),
    placements: [],
    usedAnswers: new Set(),
  };
  const seen = new Set();
  let nodeCount = 0;
  let reachedNodeCap = false;

  function search(state) {
    if (nodeCount >= options.maxNodeCount) {
      reachedNodeCap = true;
      return null;
    }
    nodeCount += 1;
    if (
      state.analysis != null &&
      passesCompactGeometryPrecheck(state, options)
    ) {
      const candidateState = centerCompactBoardState(state, options);
      const board = scoreBoard(
        candidateState,
        options.wordMap,
        LAUNCH_QUALITY_SCORING_POLICY,
      );
      const quality = options.evaluateBoardQuality(board);
      if (quality?.pass === true) return { board, state };
    }
    if (state.placements.length >= options.maxWords) return null;
    const stateKey = canonicalCompactStateKey(state);
    if (seen.has(stateKey)) return null;
    seen.add(stateKey);

    const candidates = [];
    for (const word of words) {
      if (state.usedAnswers.has(word.answer)) continue;
      for (const placement of enumerateCompactPlacements(state, word)) {
        const candidate = applyCompactPlacement(state, placement, options);
        if (candidate != null) candidates.push(candidate);
      }
    }
    candidates.sort(compareCompactStates);
    for (const candidate of candidates) {
      const result = search(candidate);
      if (result != null) return result;
      if (reachedNodeCap) return null;
    }
    return null;
  }

  const result = search(initial);
  const termination =
    result != null ? "pass" : reachedNodeCap ? "node-cap" : "exhausted";
  const trace = makeCompactTrace(
    options,
    result?.state,
    nodeCount,
    seen.size,
    termination,
  );
  if (result == null) return { board: null, trace };
  return {
    board: Object.freeze({ ...result.board, compactSearch: trace }),
    trace,
  };
}
