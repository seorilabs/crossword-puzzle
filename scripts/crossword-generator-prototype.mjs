import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BATCH_LEGACY_SCORING_POLICY = Object.freeze({
  policyId: "batch-legacy-span-v1",
  denseConnectivityAdmission: "legacy-final-board-only",
  placementIntersectionScoreBasis: "legacy-allow-adjacent-span",
  qualityBeforeBranchLimit: false,
  qualityBeamRanking: "priority-quality-score",
  weights: Object.freeze({
    boardAutoRunCount: 1100,
    boardMultiIntersection: 1500,
    denseBridgingAutoRunCount: 3200,
    directAutoRunCount: 900,
    autoRunExtraCell: 180,
  }),
});

export const LAUNCH_QUALITY_SCORING_POLICY = Object.freeze({
  policyId: "launch-quality-aligned-v2",
  denseConnectivityAdmission: "actual-overlap-or-bridging-auto-run",
  placementIntersectionScoreBasis: "actual-overlap",
  qualityBeforeBranchLimit: true,
  qualityBeamRanking: "quality-score",
  weights: Object.freeze({
    boardAutoRunCount: 0,
    boardMultiIntersection: 300,
    denseBridgingAutoRunCount: 0,
    directAutoRunCount: 0,
    autoRunExtraCell: 0,
  }),
});

const SCORING_POLICY_BY_ID = Object.freeze({
  [BATCH_LEGACY_SCORING_POLICY.policyId]: BATCH_LEGACY_SCORING_POLICY,
  [LAUNCH_QUALITY_SCORING_POLICY.policyId]: LAUNCH_QUALITY_SCORING_POLICY,
});

export const DEFAULT_OPTIONS = {
  attempts: 80,
  allowAdjacent: true,
  boardSize: 9,
  beamWidth: 24,
  branchLimit: 18,
  candidateWordLimit: 600,
  denseCandidateLimit: 96,
  maxWords: 13,
  minWordLength: 2,
  samples: 5,
  scoringPolicyId: BATCH_LEGACY_SCORING_POLICY.policyId,
  seed: 20260524,
  topCandidates: 48,
};

export const WORDS = [
  { answer: "가방", clue: "물건을 넣어 들고 다니는 것" },
  { answer: "방울", clue: "작고 둥근 물방울 모양" },
  { answer: "울타리", clue: "둘레를 막는 경계" },
  { answer: "타자기", clue: "글자를 찍어 내던 기계" },
  { answer: "기차", clue: "철로 위를 달리는 탈것" },
  { answer: "차표", clue: "차를 탈 때 필요한 표" },
  { answer: "표지판", clue: "길 안내나 주의를 알리는 판" },
  { answer: "지갑", clue: "돈과 카드를 넣는 물건" },
  { answer: "갑옷", clue: "몸을 보호하던 옷" },
  { answer: "옷장", clue: "옷을 넣어 두는 장" },
  { answer: "장갑", clue: "손에 끼는 물건" },
  { answer: "사과", clue: "빨갛거나 초록빛 과일" },
  { answer: "과일", clue: "나무나 풀에서 나는 먹을거리" },
  { answer: "일기", clue: "하루 일을 적은 글" },
  { answer: "기상", clue: "아침에 잠자리에서 일어남" },
  { answer: "상자", clue: "물건을 담는 네모난 통" },
  { answer: "자연", clue: "사람이 만든 것이 아닌 세계" },
  { answer: "연필", clue: "글씨를 쓰는 도구" },
  { answer: "필통", clue: "연필과 지우개를 넣는 통" },
  { answer: "통로", clue: "지나갈 수 있는 길" },
  { answer: "학교", clue: "학생이 배우는 곳" },
  { answer: "교실", clue: "수업을 듣는 방" },
  { answer: "실내", clue: "건물 안쪽" },
  { answer: "내일", clue: "오늘의 다음 날" },
  { answer: "일상", clue: "늘 반복되는 생활" },
  { answer: "상어", clue: "바다에 사는 큰 물고기" },
  { answer: "어항", clue: "물고기를 기르는 그릇" },
  { answer: "항구", clue: "배가 드나드는 곳" },
  { answer: "구름", clue: "하늘에 떠 있는 물방울 덩어리" },
  { answer: "나무", clue: "줄기와 가지가 있는 식물" },
  { answer: "무지개", clue: "비 온 뒤 하늘의 일곱 빛깔" },
  { answer: "개구리", clue: "논과 연못에 사는 동물" },
  { answer: "구두", clue: "발에 신는 격식 있는 신" },
  { answer: "두부", clue: "콩으로 만든 흰 음식" },
  { answer: "바다", clue: "넓고 짠 물" },
  { answer: "다리", clue: "건너가게 만든 구조물" },
  { answer: "리본", clue: "묶거나 꾸미는 띠" },
  { answer: "본문", clue: "글의 중심 내용" },
  { answer: "문어", clue: "다리가 여덟 개인 바다 동물" },
  { answer: "어제", clue: "오늘의 전날" },
  { answer: "제비", clue: "봄에 찾아오는 새" },
  { answer: "비누", clue: "몸이나 손을 씻는 물건" },
  { answer: "누나", clue: "남자가 부르는 손위 여자 형제" },
  { answer: "나비", clue: "날개가 넓은 곤충" },
  { answer: "도서관", clue: "책을 읽거나 빌리는 곳" },
  { answer: "관찰", clue: "자세히 살펴봄" },
  { answer: "찰나", clue: "아주 짧은 순간" },
  { answer: "반지", clue: "손가락에 끼는 장신구" },
  { answer: "지우개", clue: "글씨를 지우는 도구" },
  { answer: "개미", clue: "작고 부지런한 곤충" },
  { answer: "미소", clue: "살짝 웃는 표정" },
  { answer: "소금", clue: "짠맛을 내는 양념" },
  { answer: "호수", clue: "땅에 고인 넓은 물" },
  { answer: "수박", clue: "여름에 먹는 큰 과일" },
  { answer: "박수", clue: "손뼉을 치는 일" },
  { answer: "수첩", clue: "작게 들고 다니는 노트" },
  { answer: "커피", clue: "볶은 원두로 만든 음료" },
  { answer: "피아노", clue: "건반을 눌러 연주하는 악기" },
  { answer: "노래", clue: "가락에 맞춰 부르는 말" },
  { answer: "사진", clue: "카메라로 찍은 그림" },
  { answer: "진주", clue: "조개에서 나는 보석" },
  { answer: "주머니", clue: "옷이나 가방의 작은 넣는 곳" },
  { answer: "고양이", clue: "야옹 하고 우는 동물" },
  { answer: "양말", clue: "발에 신는 천" },
  { answer: "선물", clue: "마음을 담아 주는 물건" },
  { answer: "물병", clue: "물을 담는 병" },
  { answer: "병원", clue: "아픈 사람이 치료받는 곳" },
  { answer: "원숭이", clue: "나무를 잘 타는 동물" },
  { answer: "소나기", clue: "갑자기 세게 내리는 비" },
  { answer: "기분", clue: "마음의 상태" },
  { answer: "분수", clue: "물을 뿜어 올리는 장치" },
  { answer: "수영", clue: "물에서 헤엄치는 일" },
  { answer: "영수증", clue: "돈을 냈다는 기록 종이" },
  { answer: "증거", clue: "사실을 밝히는 근거" },
  { answer: "거실", clue: "집에서 함께 쉬는 방" },
  { answer: "실험", clue: "직접 해 보며 확인하는 일" },
];

function parseArgs(argv) {
  const options = { ...DEFAULT_OPTIONS };

  for (const arg of argv) {
    const [key, rawValue] = arg.replace(/^--/, "").split("=");
    const value = Number(rawValue);

    if (key === "allowAdjacent") {
      options.allowAdjacent = rawValue !== "0" && rawValue !== "false";
    }
    if (key === "attempts" && Number.isFinite(value)) options.attempts = value;
    if (key === "size" && Number.isFinite(value)) options.boardSize = value;
    if (key === "beam" && Number.isFinite(value)) options.beamWidth = value;
    if (key === "branch" && Number.isFinite(value)) options.branchLimit = value;
    if (key === "candidates" && Number.isFinite(value))
      options.candidateWordLimit = value;
    if (key === "dense" && Number.isFinite(value))
      options.denseCandidateLimit = value;
    if (key === "words" && Number.isFinite(value)) options.maxWords = value;
    if (key === "minLength" && Number.isFinite(value))
      options.minWordLength = value;
    if (key === "samples" && Number.isFinite(value)) options.samples = value;
    if (key === "scoringPolicy" && rawValue) {
      options.scoringPolicyId = rawValue;
    }
    if (key === "seed" && Number.isFinite(value)) options.seed = value;
    if (key === "wordbank" && rawValue) options.wordBankPath = rawValue;
  }

  return options;
}

export function resolveGeneratorScoringPolicy(policyId) {
  const policy = SCORING_POLICY_BY_ID[policyId];
  if (policy == null) {
    throw new TypeError(`Unknown generator scoring policy: ${policyId}`);
  }
  return policy;
}

function createRandom(seed) {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffle(items, random) {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(random() * (index + 1));
    [result[index], result[otherIndex]] = [result[otherIndex], result[index]];
  }

  return result;
}

function limitCandidateWords(words, options) {
  if (
    !Number.isFinite(options.candidateWordLimit) ||
    words.length <= options.candidateWordLimit
  ) {
    return words;
  }

  return shuffle(words, createRandom(options.seed ^ 0x9e3779b9)).slice(
    0,
    options.candidateWordLimit,
  );
}

function splitWord(word) {
  return [...word];
}

function buildLetterIndex(words) {
  const byLetter = new Map();

  for (const word of words) {
    const letters = splitWord(word.answer);

    for (let index = 0; index < letters.length; index += 1) {
      const letter = letters[index];
      const letterWords = byLetter.get(letter) ?? new Map();
      const entry = letterWords.get(word.answer) ?? {
        word,
        letterIndexes: [],
      };

      entry.letterIndexes.push(index);
      letterWords.set(word.answer, entry);
      byLetter.set(letter, letterWords);
    }
  }

  return new Map(
    [...byLetter.entries()].map(([letter, letterWords]) => [
      letter,
      [...letterWords.values()],
    ]),
  );
}

export function makeWordMap(words) {
  return new Map(words.map((word) => [word.answer, word]));
}

export async function loadWordBank(filePath) {
  const content = await readFile(path.resolve(filePath), "utf8");
  const parsed = JSON.parse(content);

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (Array.isArray(parsed.words)) {
    return parsed.words;
  }

  throw new Error(`Invalid wordbank format: ${filePath}`);
}

function makeEmptyGrid(size) {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null),
  );
}

function makeDirectionGrid(size) {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => new Set()),
  );
}

function cloneState(state) {
  return {
    grid: state.grid.map((row) => [...row]),
    dirs: state.dirs.map((row) => row.map((cell) => new Set(cell))),
    placements: state.placements.map((placement) => ({
      ...placement,
      cells: placement.cells.map((cell) => ({ ...cell })),
      intersections: [...placement.intersections],
    })),
  };
}

function inBounds(size, row, col) {
  return row >= 0 && row < size && col >= 0 && col < size;
}

function directionDelta(direction) {
  return direction === "across" ? [0, 1] : [1, 0];
}

function perpendicularNeighbors(row, col, direction) {
  return direction === "across"
    ? [
        [row - 1, col],
        [row + 1, col],
      ]
    : [
        [row, col - 1],
        [row, col + 1],
      ];
}

function endpointCells(row, col, length, direction) {
  if (direction === "across") {
    return [
      [row, col - 1],
      [row, col + length],
    ];
  }

  return [
    [row - 1, col],
    [row + length, col],
  ];
}

function validatePlacement(state, word, row, col, direction, options) {
  const letters = splitWord(word.answer);
  const size = state.grid.length;
  const [dr, dc] = directionDelta(direction);
  const cells = [];
  const intersections = [];

  for (const [endRow, endCol] of endpointCells(
    row,
    col,
    letters.length,
    direction,
  )) {
    if (inBounds(size, endRow, endCol) && state.grid[endRow][endCol] !== null) {
      return null;
    }
  }

  for (let index = 0; index < letters.length; index += 1) {
    const currentRow = row + dr * index;
    const currentCol = col + dc * index;

    if (!inBounds(size, currentRow, currentCol)) {
      return null;
    }

    const existingLetter = state.grid[currentRow][currentCol];
    const existingDirs = state.dirs[currentRow][currentCol];

    if (existingLetter !== null && existingLetter !== letters[index]) {
      return null;
    }

    if (existingDirs.has(direction)) {
      return null;
    }

    if (existingLetter === null) {
      if (!options.allowAdjacent) {
        for (const [neighborRow, neighborCol] of perpendicularNeighbors(
          currentRow,
          currentCol,
          direction,
        )) {
          if (
            inBounds(size, neighborRow, neighborCol) &&
            state.grid[neighborRow][neighborCol] !== null
          ) {
            return null;
          }
        }
      }
    } else {
      intersections.push(`${currentRow},${currentCol}`);
    }

    cells.push({ row: currentRow, col: currentCol, letter: letters[index] });
  }

  if (
    state.placements.length > 0 &&
    intersections.length === 0 &&
    !options.allowAdjacent
  ) {
    return null;
  }

  return { cells, intersections };
}

function scoreAutoRuns(autoRuns, extraCellWeight) {
  return autoRuns.reduce((score, run) => {
    const length = splitWord(run.answer).length;
    return score + Math.max(0, length - 1) * extraCellWeight;
  }, 0);
}

function placementIntersectionScoreCount(validated, options) {
  if (
    options.allowAdjacent &&
    options.scoringPolicy.placementIntersectionScoreBasis ===
      "legacy-allow-adjacent-span"
  ) {
    return validated.cells.length;
  }
  return validated.intersections.length;
}

function hasDuplicateAnswers(runs) {
  const answers = new Set();

  for (const run of runs) {
    if (answers.has(run.answer)) {
      return true;
    }
    answers.add(run.answer);
  }

  return false;
}

function bridgesNewAndExistingCells(autoRun, state, validated) {
  const newCellKeys = new Set(
    validated.cells
      .filter((cell) => state.grid[cell.row][cell.col] === null)
      .map((cell) => `${cell.row},${cell.col}`),
  );

  let touchesNewCell = false;
  let touchesExistingCell = false;

  for (const cell of autoRun.cells) {
    const key = `${cell.row},${cell.col}`;
    if (newCellKeys.has(key)) {
      touchesNewCell = true;
    } else if (state.grid[cell.row][cell.col] !== null) {
      touchesExistingCell = true;
    }
  }

  return touchesNewCell && touchesExistingCell;
}

function applyPlacement(state, word, row, col, direction, validated) {
  const next = cloneState(state);

  for (const cell of validated.cells) {
    next.grid[cell.row][cell.col] = cell.letter;
    next.dirs[cell.row][cell.col].add(direction);
  }

  next.placements.push({
    answer: word.answer,
    clue: word.clue,
    row,
    col,
    direction,
    cells: validated.cells,
    intersections: validated.intersections,
  });

  return next;
}

function findPlacementCandidates(state, words, random, options) {
  const candidates = [];
  const occupiedCells = getOccupiedCells(state);

  if (state.placements.length === 0) {
    const sorted = [...words].sort(
      (left, right) =>
        splitWord(right.answer).length - splitWord(left.answer).length,
    );
    const seedWords = sorted.slice(0, Math.min(12, sorted.length));

    for (const word of seedWords) {
      const letters = splitWord(word.answer);
      for (const direction of ["across", "down"]) {
        const row =
          direction === "across"
            ? Math.floor(options.boardSize / 2)
            : Math.floor((options.boardSize - letters.length) / 2);
        const col =
          direction === "across"
            ? Math.floor((options.boardSize - letters.length) / 2)
            : Math.floor(options.boardSize / 2);
        const validated = validatePlacement(
          state,
          word,
          row,
          col,
          direction,
          options,
        );

        if (validated !== null) {
          const nextState = applyPlacement(
            state,
            word,
            row,
            col,
            direction,
            validated,
          );
          const runAnalysis = analyzeRuns(nextState, options.wordMap);

          if (
            runAnalysis.invalidRuns.length > 0 ||
            hasDuplicateAnswers(runAnalysis.runs) ||
            !acceptsRunSet(runAnalysis.runs, options)
          ) {
            continue;
          }

          candidates.push({
            word,
            row,
            col,
            direction,
            validated,
            nextState,
            runAnalysis,
            preferredRunRatio: getPreferredRunRatio(runAnalysis.runs, options),
            score: letters.length + random(),
          });
        }
      }
    }

    return candidates;
  }

  const remainingAnswers = new Set(words.map((word) => word.answer));

  for (const occupied of occupiedCells) {
    const letterEntries = options.wordsByLetter.get(occupied.letter) ?? [];

    for (const { word, letterIndexes } of letterEntries) {
      if (!remainingAnswers.has(word.answer)) {
        continue;
      }

      const letters = splitWord(word.answer);

      for (const letterIndex of letterIndexes) {
        for (const direction of ["across", "down"]) {
          if (state.dirs[occupied.row][occupied.col].has(direction)) {
            continue;
          }

          const [dr, dc] = directionDelta(direction);
          const row = occupied.row - dr * letterIndex;
          const col = occupied.col - dc * letterIndex;
          const validated = validatePlacement(
            state,
            word,
            row,
            col,
            direction,
            options,
          );

          if (validated === null) {
            continue;
          }

          const nextState = applyPlacement(
            state,
            word,
            row,
            col,
            direction,
            validated,
          );
          const runAnalysis = analyzeRuns(nextState, options.wordMap);

          if (
            runAnalysis.invalidRuns.length > 0 ||
            hasDuplicateAnswers(runAnalysis.runs) ||
            !acceptsRunSet(runAnalysis.runs, options)
          ) {
            continue;
          }

          const newCells = validated.cells.filter(
            (cell) => state.grid[cell.row][cell.col] === null,
          ).length;
          const currentStats = getPreviewStats(state, []);
          const previewStats = getPreviewStats(state, validated.cells);
          const bboxExpansion = previewStats.bboxArea - currentStats.bboxArea;
          const centerPenalty =
            Math.abs(row - Math.floor(options.boardSize / 2)) +
            Math.abs(col - Math.floor(options.boardSize / 2));
          const middleIntersectionBonus = validated.cells
            .filter((cell) => state.grid[cell.row][cell.col] !== null)
            .reduce((sum, cell) => {
              const wordIndex = validated.cells.findIndex(
                (target) => target.row === cell.row && target.col === cell.col,
              );
              const distanceFromMiddle = Math.abs(
                wordIndex - (letters.length - 1) / 2,
              );
              return sum + Math.max(0, 20 - distanceFromMiddle * 10);
            }, 0);
          const intersectionCount = placementIntersectionScoreCount(
            validated,
            options,
          );
          const multiIntersectionBonus =
            intersectionCount >= 3 ? 4200 : intersectionCount >= 2 ? 1800 : 0;
          const bboxEmptyCells =
            previewStats.bboxArea -
            getPreviewStats(state, validated.cells).occupiedCount;
          const shortWordPenalty = letters.length <= 2 ? 80 : 0;

          candidates.push({
            word,
            row,
            col,
            direction,
            validated,
            nextState,
            runAnalysis,
            preferredRunRatio: getPreferredRunRatio(runAnalysis.runs, options),
            score:
              intersectionCount ** 2 * 620 +
              runAnalysis.autoRuns.length *
                options.scoringPolicy.weights.directAutoRunCount +
              scoreAutoRuns(
                runAnalysis.autoRuns,
                options.scoringPolicy.weights.autoRunExtraCell,
              ) +
              multiIntersectionBonus +
              middleIntersectionBonus +
              previewStats.bboxDensity * 1200 -
              bboxEmptyCells * 18 -
              bboxExpansion * 30 -
              previewStats.bboxArea * 3 -
              newCells * 10 -
              centerPenalty * 3 +
              letters.length * 16 -
              shortWordPenalty * 2 +
              random(),
          });
        }
      }
    }
  }

  if (options.allowAdjacent) {
    const candidateKeys = new Set(
      candidates.map(
        (candidate) =>
          `${candidate.word.answer}:${candidate.direction}:${candidate.row}:${candidate.col}`,
      ),
    );
    let denseCandidateCount = 0;

    denseSearch: for (const word of words) {
      const letters = splitWord(word.answer);

      for (const direction of ["across", "down"]) {
        const searchWindow = getSearchWindow(
          state,
          direction,
          letters.length,
          options.boardSize,
        );

        for (
          let row = searchWindow.minRow;
          row <= searchWindow.maxRow;
          row += 1
        ) {
          for (
            let col = searchWindow.minCol;
            col <= searchWindow.maxCol;
            col += 1
          ) {
            const key = `${word.answer}:${direction}:${row}:${col}`;
            if (candidateKeys.has(key)) {
              continue;
            }

            const validated = validatePlacement(
              state,
              word,
              row,
              col,
              direction,
              options,
            );

            if (validated === null) {
              continue;
            }

            const nextState = applyPlacement(
              state,
              word,
              row,
              col,
              direction,
              validated,
            );
            const runAnalysis = analyzeRuns(nextState, options.wordMap);

            if (
              runAnalysis.invalidRuns.length > 0 ||
              hasDuplicateAnswers(runAnalysis.runs) ||
              !acceptsRunSet(runAnalysis.runs, options)
            ) {
              continue;
            }

            const bridgingAutoRuns = runAnalysis.autoRuns.filter((run) =>
              bridgesNewAndExistingCells(run, state, validated),
            );

            if (
              state.placements.length > 0 &&
              validated.intersections.length === 0 &&
              bridgingAutoRuns.length === 0 &&
              options.scoringPolicy.denseConnectivityAdmission !==
                "legacy-final-board-only"
            ) {
              continue;
            }

            const newCells = validated.cells.filter(
              (cell) => state.grid[cell.row][cell.col] === null,
            ).length;
            const currentStats = getPreviewStats(state, []);
            const previewStats = getPreviewStats(state, validated.cells);
            const bboxExpansion = previewStats.bboxArea - currentStats.bboxArea;
            const centerPenalty =
              Math.abs(row - Math.floor(options.boardSize / 2)) +
              Math.abs(col - Math.floor(options.boardSize / 2));
            const intersectionCount = placementIntersectionScoreCount(
              validated,
              options,
            );
            const multiIntersectionBonus =
              intersectionCount >= 3 ? 4200 : intersectionCount >= 2 ? 1800 : 0;
            const bboxEmptyCells =
              previewStats.bboxArea - previewStats.occupiedCount;
            const shortWordPenalty = letters.length <= 2 ? 80 : 0;

            candidateKeys.add(key);
            denseCandidateCount += 1;
            candidates.push({
              word,
              row,
              col,
              direction,
              validated,
              nextState,
              runAnalysis,
              preferredRunRatio: getPreferredRunRatio(
                runAnalysis.runs,
                options,
              ),
              score:
                intersectionCount ** 2 * 620 +
                bridgingAutoRuns.length *
                  options.scoringPolicy.weights.denseBridgingAutoRunCount +
                scoreAutoRuns(
                  bridgingAutoRuns,
                  options.scoringPolicy.weights.autoRunExtraCell,
                ) +
                multiIntersectionBonus +
                previewStats.bboxDensity * 1800 -
                bboxEmptyCells * 32 -
                bboxExpansion * 48 -
                previewStats.bboxArea * 4 -
                newCells * 12 -
                centerPenalty * 4 +
                letters.length * 16 -
                shortWordPenalty * 2 +
                random(),
            });

            if (denseCandidateCount >= options.denseCandidateLimit) {
              break denseSearch;
            }
          }
        }
      }
    }
  }

  if (
    options.scoringPolicy.qualityBeforeBranchLimit &&
    options.evaluateBoardQuality != null
  ) {
    for (const candidate of candidates) {
      candidate.scoredBoard = scoreBoard(
        candidate.nextState,
        options.wordMap,
        options.scoringPolicy,
      );
      candidate.quality = options.evaluateBoardQuality(candidate.scoredBoard);
    }
  }

  return selectDiverseGenerationCandidates(
    candidates,
    options.topCandidates,
    options,
  );
}

function acceptsRunSet(runs, options) {
  return options.acceptRuns == null || options.acceptRuns(runs) !== false;
}

function getPreferredRunRatio(runs, options) {
  if (options.isPreferredRun == null || runs.length === 0) return 1;
  return runs.filter((run) => options.isPreferredRun(run)).length / runs.length;
}

function compareGenerationCandidatesByPreferredRunGate(left, right, options) {
  if (options.isPreferredRun == null) return right.score - left.score;
  const minimum = options.minPreferredRunRatio ?? 0;
  const leftPass = left.preferredRunRatio >= minimum;
  const rightPass = right.preferredRunRatio >= minimum;

  if (leftPass !== rightPass) return leftPass ? -1 : 1;
  if (!leftPass && left.preferredRunRatio !== right.preferredRunRatio) {
    return right.preferredRunRatio - left.preferredRunRatio;
  }
  return right.score - left.score;
}

function getBoardQualityDeficit(quality) {
  if (!Array.isArray(quality?.checks)) return Number.POSITIVE_INFINITY;
  return quality.checks.reduce((sum, check) => {
    if (check.pass) return sum;
    const scale = Math.abs(check.expected) || 1;
    if (check.operator === ">=") {
      return sum + Math.max(0, check.expected - check.actual) / scale;
    }
    if (check.operator === "<=") {
      return sum + Math.max(0, check.actual - check.expected) / scale;
    }
    return sum + 1;
  }, 0);
}

export function compareGenerationCandidatesByGeometryQuality(left, right) {
  const deficitOrder =
    getBoardQualityDeficit(left.quality) -
    getBoardQualityDeficit(right.quality);
  if (Number.isFinite(deficitOrder) && deficitOrder !== 0) {
    return deficitOrder;
  }
  return right.score - left.score;
}

export function selectDiverseGenerationCandidates(candidates, limit, options) {
  const scoreRanked = [...candidates].sort(
    (left, right) => right.score - left.score,
  );
  const priorityRanked =
    options.isPreferredRun == null
      ? null
      : [...candidates].sort((left, right) =>
          compareGenerationCandidatesByPreferredRunGate(left, right, options),
        );
  const geometryRanked = candidates.some(
    (candidate) => candidate.quality != null,
  )
    ? [...candidates].sort(compareGenerationCandidatesByGeometryQuality)
    : null;
  if (priorityRanked == null && geometryRanked == null) {
    return scoreRanked.slice(0, limit);
  }
  const selected = [];
  const selectedSet = new Set();
  const qualityBeamRanking =
    options.scoringPolicy?.qualityBeamRanking ??
    (options.scoringPolicyId === LAUNCH_QUALITY_SCORING_POLICY.policyId
      ? LAUNCH_QUALITY_SCORING_POLICY.qualityBeamRanking
      : null);
  const rankedGroups =
    qualityBeamRanking === "quality-score" && geometryRanked != null
      ? [geometryRanked, scoreRanked]
      : [
          ...(priorityRanked == null ? [] : [priorityRanked]),
          ...(geometryRanked == null ? [] : [geometryRanked]),
          scoreRanked,
        ];
  const quotas = rankedGroups.map(
    (_, index) =>
      Math.floor(limit / rankedGroups.length) +
      (index < limit % rankedGroups.length ? 1 : 0),
  );
  const indexes = rankedGroups.map(() => 0);

  function takeNext(groupIndex) {
    const ranked = rankedGroups[groupIndex];
    while (indexes[groupIndex] < ranked.length) {
      const candidate = ranked[indexes[groupIndex]];
      indexes[groupIndex] += 1;
      if (selectedSet.has(candidate)) continue;
      selectedSet.add(candidate);
      selected.push(candidate);
      return true;
    }
    return false;
  }

  for (let index = 0; index < Math.max(...quotas); index += 1) {
    for (
      let groupIndex = 0;
      groupIndex < rankedGroups.length;
      groupIndex += 1
    ) {
      if (index < quotas[groupIndex]) takeNext(groupIndex);
    }
  }
  for (
    let groupIndex = 0;
    selected.length < limit && groupIndex < rankedGroups.length;
    groupIndex += 1
  ) {
    while (selected.length < limit && takeNext(groupIndex)) {
      // Fill a quota shortened by overlap or a small candidate set.
    }
  }
  return selected;
}

export function compareGeneratedBoardCandidates(left, right) {
  if (left.quality?.pass !== right.quality?.pass) {
    return left.quality?.pass ? -1 : 1;
  }
  return 0;
}

function getPreviewStats(state, nextCells) {
  const occupied = getOccupiedCells(state);
  const byKey = new Map(
    occupied.map((cell) => [
      `${cell.row},${cell.col}`,
      { row: cell.row, col: cell.col },
    ]),
  );

  for (const cell of nextCells) {
    byKey.set(`${cell.row},${cell.col}`, { row: cell.row, col: cell.col });
  }

  const cells = [...byKey.values()];
  if (cells.length === 0) {
    return { bboxArea: 0, bboxDensity: 0, occupiedCount: 0 };
  }

  const rows = cells.map((cell) => cell.row);
  const cols = cells.map((cell) => cell.col);
  const bboxArea =
    (Math.max(...rows) - Math.min(...rows) + 1) *
    (Math.max(...cols) - Math.min(...cols) + 1);

  return {
    bboxArea,
    occupiedCount: cells.length,
    bboxDensity: cells.length / bboxArea,
  };
}

function getSearchWindow(state, direction, wordLength, boardSize) {
  const occupied = getOccupiedCells(state);

  if (occupied.length === 0) {
    return {
      minRow: 0,
      maxRow: direction === "across" ? boardSize - 1 : boardSize - wordLength,
      minCol: 0,
      maxCol: direction === "across" ? boardSize - wordLength : boardSize - 1,
    };
  }

  const rows = occupied.map((cell) => cell.row);
  const cols = occupied.map((cell) => cell.col);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);

  if (direction === "across") {
    return {
      minRow: Math.max(0, minRow - 1),
      maxRow: Math.min(boardSize - 1, maxRow + 1),
      minCol: Math.max(0, minCol - wordLength),
      maxCol: Math.min(boardSize - wordLength, maxCol + 1),
    };
  }

  return {
    minRow: Math.max(0, minRow - wordLength),
    maxRow: Math.min(boardSize - wordLength, maxRow + 1),
    minCol: Math.max(0, minCol - 1),
    maxCol: Math.min(boardSize - 1, maxCol + 1),
  };
}

function getOccupiedCells(state) {
  const cells = [];

  for (let row = 0; row < state.grid.length; row += 1) {
    for (let col = 0; col < state.grid[row].length; col += 1) {
      const letter = state.grid[row][col];
      if (letter !== null) {
        cells.push({ row, col, letter });
      }
    }
  }

  return cells;
}

function getRunKey(run) {
  return `${run.direction}:${run.row}:${run.col}:${run.answer}`;
}

function getPlacementKey(placement) {
  return `${placement.direction}:${placement.row}:${placement.col}:${placement.answer}`;
}

function scanRuns(grid) {
  const runs = [];

  for (const direction of ["across", "down"]) {
    const [dr, dc] = directionDelta(direction);

    for (let row = 0; row < grid.length; row += 1) {
      for (let col = 0; col < grid[row].length; col += 1) {
        const beforeRow = row - dr;
        const beforeCol = col - dc;

        if (
          inBounds(grid.length, beforeRow, beforeCol) &&
          grid[beforeRow][beforeCol] !== null
        ) {
          continue;
        }

        const cells = [];
        let currentRow = row;
        let currentCol = col;

        while (
          inBounds(grid.length, currentRow, currentCol) &&
          grid[currentRow][currentCol] !== null
        ) {
          cells.push({
            row: currentRow,
            col: currentCol,
            letter: grid[currentRow][currentCol],
          });
          currentRow += dr;
          currentCol += dc;
        }

        if (cells.length >= 2) {
          runs.push({
            answer: cells.map((cell) => cell.letter).join(""),
            row,
            col,
            direction,
            cells,
          });
        }
      }
    }
  }

  return runs;
}

export function analyzeRuns(state, wordMap) {
  const placementKeys = new Set(state.placements.map(getPlacementKey));
  const runs = scanRuns(state.grid).map((run) => ({
    ...run,
    clue: wordMap.get(run.answer)?.clue,
    isPlaced: placementKeys.has(getRunKey(run)),
    isKnown: wordMap.has(run.answer),
  }));

  return {
    runs,
    autoRuns: runs.filter((run) => run.isKnown && !run.isPlaced),
    invalidRuns: runs.filter((run) => !run.isKnown),
  };
}

function runAttempt(words, random, options) {
  let beam = [
    {
      state: {
        grid: makeEmptyGrid(options.boardSize),
        dirs: makeDirectionGrid(options.boardSize),
        placements: [],
      },
      remainingWords: shuffle(words, random),
    },
  ];

  for (let step = 0; step < options.maxWords; step += 1) {
    const expanded = [];

    for (const item of beam) {
      const candidates = findPlacementCandidates(
        item.state,
        item.remainingWords,
        random,
        options,
      );

      for (const candidate of candidates.slice(0, options.branchLimit)) {
        const nextState = candidate.nextState;
        const runAnalysis =
          candidate.runAnalysis ?? analyzeRuns(nextState, options.wordMap);
        const usedAnswers = new Set(runAnalysis.runs.map((run) => run.answer));
        const scoredBoard =
          candidate.scoredBoard ??
          scoreBoard(nextState, options.wordMap, options.scoringPolicy);

        expanded.push({
          board: scoredBoard,
          state: nextState,
          remainingWords: item.remainingWords.filter(
            (word) => !usedAnswers.has(word.answer),
          ),
          preferredRunRatio: getPreferredRunRatio(runAnalysis.runs, options),
          quality:
            candidate.quality ?? options.evaluateBoardQuality?.(scoredBoard),
          score: scoredBoard.metrics.score + candidate.score,
        });
      }
    }

    if (expanded.length === 0) {
      break;
    }

    const seen = new Set();
    const uniqueExpanded = expanded.filter((item) => {
      const key = renderGrid(item.state.grid);
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
    beam = selectDiverseGenerationCandidates(
      uniqueExpanded,
      options.beamWidth,
      options,
    );
  }

  return beam
    .map((item) => {
      const board =
        item.board ??
        scoreBoard(item.state, options.wordMap, options.scoringPolicy);
      return {
        board,
        preferredRunRatio: item.preferredRunRatio,
        quality: item.quality ?? options.evaluateBoardQuality?.(board),
      };
    })
    .sort((left, right) => {
      const qualityOrder = compareGeneratedBoardCandidates(left, right);
      if (qualityOrder !== 0) return qualityOrder;
      return compareGenerationCandidatesByPreferredRunGate(
        {
          preferredRunRatio: left.preferredRunRatio,
          score: left.board.metrics.score,
        },
        {
          preferredRunRatio: right.preferredRunRatio,
          score: right.board.metrics.score,
        },
        options,
      );
    })[0]?.board;
}

export function scoreBoard(
  state,
  wordMap = makeWordMap(WORDS),
  scoringPolicy = BATCH_LEGACY_SCORING_POLICY,
) {
  const occupied = getOccupiedCells(state);
  const runAnalysis = analyzeRuns(state, wordMap);
  const runs = runAnalysis.runs;
  const graph = runs.map(() => new Set());
  const cellsToWords = new Map();

  for (let runIndex = 0; runIndex < runs.length; runIndex += 1) {
    for (const cell of runs[runIndex].cells) {
      const key = `${cell.row},${cell.col}`;
      const linkedWords = cellsToWords.get(key) ?? [];

      for (const linkedWordIndex of linkedWords) {
        graph[runIndex].add(linkedWordIndex);
        graph[linkedWordIndex].add(runIndex);
      }

      linkedWords.push(runIndex);
      cellsToWords.set(key, linkedWords);
    }
  }

  const connectedComponents = countConnectedComponents(graph);
  const crossCellKeys = new Set(
    [...cellsToWords.entries()]
      .filter(([, runIndexes]) => {
        const directions = new Set(
          runIndexes.map((runIndex) => runs[runIndex].direction),
        );
        return directions.size > 1;
      })
      .map(([key]) => key),
  );
  const totalRunCrossTouches = runs.reduce(
    (sum, run) =>
      sum +
      run.cells.filter((cell) => crossCellKeys.has(`${cell.row},${cell.col}`))
        .length,
    0,
  );
  const size = state.grid.length;
  const emptyRatio = (size * size - occupied.length) / (size * size);
  const bbox = getPreviewStats(state, []);
  const crossRatio =
    occupied.length === 0
      ? 0
      : Number((crossCellKeys.size / occupied.length).toFixed(3));
  const averageCrossesPerWord =
    runs.length === 0
      ? 0
      : Number((totalRunCrossTouches / runs.length).toFixed(2));
  const multiIntersectionPlacements = runs.filter(
    (run) =>
      run.cells.filter((cell) => crossCellKeys.has(`${cell.row},${cell.col}`))
        .length >= 2,
  ).length;
  const bboxEmptyCells = bbox.bboxArea - bbox.occupiedCount;

  return {
    ...state,
    metrics: {
      wordCount: runs.length,
      placedWordCount: state.placements.length,
      filledCells: occupied.length,
      crossCells: crossCellKeys.size,
      crossRatio,
      averageCrossesPerWord,
      connectedComponents,
      emptyRatio: Number(emptyRatio.toFixed(3)),
      accidentalRuns: runAnalysis.invalidRuns,
      autoRunCount: runAnalysis.autoRuns.length,
      bboxArea: bbox.bboxArea,
      bboxEmptyCells,
      bboxDensity: Number(bbox.bboxDensity.toFixed(3)),
      multiIntersectionPlacements,
      score:
        runs.length * 160 +
        occupied.length * 42 +
        crossCellKeys.size * 220 +
        crossRatio * 450 +
        averageCrossesPerWord * 220 +
        bbox.bboxDensity * 1600 +
        runAnalysis.autoRuns.length * scoringPolicy.weights.boardAutoRunCount +
        multiIntersectionPlacements *
          scoringPolicy.weights.boardMultiIntersection -
        connectedComponents * 100 -
        runAnalysis.invalidRuns.length * 3000 -
        emptyRatio * 90 -
        bbox.bboxArea * 5 -
        bboxEmptyCells * 20,
    },
  };
}

function countConnectedComponents(graph) {
  if (graph.length === 0) {
    return 0;
  }

  const visited = new Set();
  let components = 0;

  for (let index = 0; index < graph.length; index += 1) {
    if (visited.has(index)) {
      continue;
    }

    components += 1;
    const stack = [index];
    visited.add(index);

    while (stack.length > 0) {
      const current = stack.pop();
      for (const next of graph[current]) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }
  }

  return components;
}

export function generateBoards(inputOptions = {}) {
  const options = {
    ...DEFAULT_OPTIONS,
    ...inputOptions,
  };
  options.scoringPolicy = resolveGeneratorScoringPolicy(
    options.scoringPolicyId,
  );
  const random = createRandom(options.seed);
  const boards = [];
  const seen = new Set();
  const inputWords = inputOptions.wordBank ?? WORDS;
  const words = inputWords.filter(
    (word) => splitWord(word.answer).length >= options.minWordLength,
  );
  const candidateWords = limitCandidateWords(words, options);
  options.wordMap = makeWordMap(words);
  options.wordsByLetter = buildLetterIndex(candidateWords);
  if (options.acceptRuns != null && typeof options.acceptRuns !== "function") {
    throw new TypeError("acceptRuns must be a function");
  }
  if (
    options.isPreferredRun != null &&
    typeof options.isPreferredRun !== "function"
  ) {
    throw new TypeError("isPreferredRun must be a function");
  }
  if (
    options.evaluateBoardQuality != null &&
    typeof options.evaluateBoardQuality !== "function"
  ) {
    throw new TypeError("evaluateBoardQuality must be a function");
  }

  for (let attempt = 0; attempt < options.attempts; attempt += 1) {
    const board = runAttempt(candidateWords, random, options);

    if (
      board != null &&
      board.metrics.wordCount >= 6 &&
      board.metrics.connectedComponents === 1 &&
      board.metrics.accidentalRuns.length === 0 &&
      !hasDuplicateAnswers(analyzeRuns(board, options.wordMap).runs)
    ) {
      const key = renderGrid(board.grid);
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      boards.push(board);
    }
  }

  boards.sort((left, right) => {
    const qualityOrder = compareGeneratedBoardCandidates(
      { board: left, quality: options.evaluateBoardQuality?.(left) },
      { board: right, quality: options.evaluateBoardQuality?.(right) },
    );
    if (qualityOrder !== 0) return qualityOrder;
    const leftRuns = analyzeRuns(left, options.wordMap).runs;
    const rightRuns = analyzeRuns(right, options.wordMap).runs;
    return compareGenerationCandidatesByPreferredRunGate(
      {
        preferredRunRatio: getPreferredRunRatio(leftRuns, options),
        score: left.metrics.score,
      },
      {
        preferredRunRatio: getPreferredRunRatio(rightRuns, options),
        score: right.metrics.score,
      },
      options,
    );
  });
  return boards.slice(0, options.samples);
}

export function renderGrid(grid) {
  return grid.map((row) => row.map((cell) => cell ?? "·").join(" ")).join("\n");
}

export function renderBoard(board, index, words = WORDS) {
  const metrics = board.metrics;
  const runAnalysis = analyzeRuns(board, makeWordMap(words));
  const cellToDirections = new Map();

  for (const run of runAnalysis.runs) {
    for (const cell of run.cells) {
      const key = `${cell.row},${cell.col}`;
      const directions = cellToDirections.get(key) ?? new Set();
      directions.add(run.direction);
      cellToDirections.set(key, directions);
    }
  }

  const placements = runAnalysis.runs
    .map((run, runIndex) => {
      const directionLabel = run.direction === "across" ? "가로" : "세로";
      const sourceLabel = run.isPlaced ? "배치" : "자동";
      const finalIntersections = run.cells
        .filter(
          (cell) => cellToDirections.get(`${cell.row},${cell.col}`)?.size > 1,
        )
        .map((cell) => `${cell.row},${cell.col}`);
      const intersections =
        finalIntersections.length === 0 ? "-" : finalIntersections.join(" ");
      return `${runIndex + 1}. ${directionLabel} ${run.answer} (${run.row},${run.col}) ${sourceLabel} 최종교차:${intersections}`;
    })
    .join("\n");

  return [
    `#${index + 1}`,
    `score=${metrics.score.toFixed(1)} entries=${metrics.wordCount} placed=${metrics.placedWordCount} auto=${metrics.autoRunCount} filled=${metrics.filledCells} crossCells=${metrics.crossCells} crossRatio=${metrics.crossRatio} avgCross/entry=${metrics.averageCrossesPerWord} emptyRatio=${metrics.emptyRatio} bboxDensity=${metrics.bboxDensity} multiCrossEntries=${metrics.multiIntersectionPlacements}`,
    renderGrid(board.grid),
    placements,
  ].join("\n");
}

async function runCli() {
  const options = parseArgs(process.argv.slice(2));
  if (options.wordBankPath != null) {
    options.wordBank = await loadWordBank(options.wordBankPath);
  }
  const boards = generateBoards(options);
  const words = options.wordBank ?? WORDS;
  const candidateCount = Math.min(words.length, options.candidateWordLimit);

  console.log(
    `options size=${options.boardSize} words=${options.maxWords} minLength=${options.minWordLength} attempts=${options.attempts} beam=${options.beamWidth} branch=${options.branchLimit} dense=${options.denseCandidateLimit} candidates=${candidateCount} allowAdjacent=${options.allowAdjacent} seed=${options.seed} wordbank=${words.length}`,
  );

  if (boards.length === 0) {
    console.log(
      "No valid boards generated. Try increasing --attempts or --size.",
    );
    process.exitCode = 1;
  } else {
    console.log(
      boards
        .map((board, index) => renderBoard(board, index, words))
        .join("\n\n"),
    );
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
