// 단서(clue) 큐레이션 공통 정책. 발행 퍼즐의 단서 품질을 게이트로 강제하고,
// 검수 단서(manualClue)를 워드뱅크/퍼즐 엔트리에 적용하는 순수 로직을 모은다.
// 3마켓이 같은 발행 기준을 공유하도록 server/batch·scripts 가 이 모듈을 쓴다.

// 검수 완료 단서의 출처 표기. 사전 정의문(krdict-definition)과 구분한다.
export const CURATED_CLUE_SOURCE = "manual";

// 사전 뜻풀이(krdict-definition)는 워드뱅크 생성 단계에서 명사·길이·정답 노출·
// 괄호 규칙을 통과하고, 앱에도 출처와 CC BY-SA 조건을 상시 고지한다. 따라서
// needsManualClue는 후속 자체 문장 큐레이션 상태만 나타내며 발행 가능 여부를
// 제한하지 않는다. 명시적 검수 캠페인은 selectWordsForManualClueCoverage에
// 더 낮은 비율을 넘겨 기존 커버리지 계산을 그대로 사용할 수 있다.
export const DEFAULT_MAX_NEEDS_MANUAL_CLUE_RATIO = 1;

// 단서가 정답을 부분 문자열로 포함하면 자기참조(답을 그대로 노출)로 본다.
export function isSelfReferentialClue(
  answer: string,
  clue: string | undefined | null,
): boolean {
  if (clue == null || clue.length === 0) {
    return false;
  }

  return clue.includes(answer);
}

export function countNeedsManualClue(
  entries: readonly { needsManualClue?: boolean }[],
): number {
  return entries.filter((entry) => entry.needsManualClue === true).length;
}

// 엔트리 중 미검수(needsManualClue:true) 비율. 빈 목록은 0.
export function needsManualClueRatio(
  entries: readonly { needsManualClue?: boolean }[],
): number {
  if (entries.length === 0) {
    return 0;
  }

  return countNeedsManualClue(entries) / entries.length;
}

// 자체 문장 커버리지 목표가 명시된 작업에서 검수 완료 단어를 우선한다. 기본
// 발행 정책은 사전 뜻풀이를 허용하므로 전체 후보를 그대로 사용할 수 있고, 0.4
// 같은 별도 목표를 넘기면 기존처럼 목표 비율을 만족하는 크기까지 풀을 줄인다.
export function selectWordsForManualClueCoverage<
  T extends { needsManualClue?: boolean },
>(
  words: readonly T[],
  maxNeedsManualClueRatio: number = DEFAULT_MAX_NEEDS_MANUAL_CLUE_RATIO,
  maxWords: number = words.length,
): T[] {
  const normalizedMaxRatio = Math.min(
    1,
    Math.max(0, Number.isFinite(maxNeedsManualClueRatio) ? maxNeedsManualClueRatio : 0),
  );
  const targetSize = Math.min(
    words.length,
    Math.max(0, Math.floor(Number.isFinite(maxWords) ? maxWords : words.length)),
  );

  if (targetSize === 0) {
    return [];
  }

  const reviewed = words.filter((word) => word.needsManualClue !== true);
  const unreviewed = words.filter((word) => word.needsManualClue === true);
  const requiredReviewedFraction = 1 - normalizedMaxRatio;

  if (requiredReviewedFraction <= 0) {
    return words.slice(0, targetSize);
  }

  const requiredReviewed = Math.ceil(targetSize * requiredReviewedFraction);

  if (reviewed.length >= requiredReviewed) {
    const reviewedCount = Math.min(
      reviewed.length,
      Math.max(requiredReviewed, targetSize - unreviewed.length),
    );
    return [
      ...reviewed.slice(0, reviewedCount),
      ...unreviewed.slice(0, targetSize - reviewedCount),
    ];
  }

  const achievableSize = Math.min(
    targetSize,
    Math.floor(reviewed.length / requiredReviewedFraction),
  );

  return [
    ...reviewed.slice(0, achievableSize),
    ...unreviewed.slice(0, Math.max(0, achievableSize - reviewed.length)),
  ];
}

// 발행 커버리지 리포트용 타입. 생성된 퍼즐(난이도/주제)별로 미검수 비율을
// 집계해 "로테이션 대상 팩이 발행 게이트를 통과하는지"를 한눈에 드러낸다(#250).
export type ManualClueCoverageEntry = { needsManualClue?: boolean };

export type ManualClueCoveragePuzzle = {
  difficulty?: string | null;
  themeTag?: string | null;
  entries: readonly ManualClueCoverageEntry[];
};

export type ManualClueCoverageGroup = {
  // 그룹 종류: 난이도 티어 또는 주제 태그
  kind: "difficulty" | "theme";
  // 그룹 키(예: "easy"/"hard" 또는 "food"/"animal")
  key: string;
  // 이 그룹에 속한 퍼즐 수
  puzzleCount: number;
  // 집계 대상 엔트리 총수
  total: number;
  // 미검수(needsManualClue:true) 엔트리 수
  needsManualClue: number;
  // 미검수 비율(total 이 0이면 0)
  ratio: number;
  // 발행 게이트(maxRatio)를 초과했는지
  exceedsGate: boolean;
};

export type ManualClueCoverageSummary = {
  groups: ManualClueCoverageGroup[];
  // 하나라도 게이트를 초과한 그룹이 있는지(리포트가 실패로 종료할지 판단)
  anyExceeded: boolean;
};

const DIFFICULTY_GROUP_ORDER: Record<string, number> = {
  easy: 0,
  normal: 1,
  hard: 2,
};

// 생성된 퍼즐 목록을 난이도 티어·주제 태그별로 묶어 미검수 비율을 집계한다.
// 각 퍼즐은 자신의 difficulty 그룹과(있으면) themeTag 그룹 양쪽에 합산된다.
// 순수 함수(파일/네트워크 없음)라 core 테스트로 경계를 고정하고, 리포트
// 스크립트(scripts/apply-manual-clues.mjs --report)가 이를 그대로 쓴다.
export function summarizeManualClueCoverage(
  puzzles: readonly ManualClueCoveragePuzzle[],
  maxRatio: number = DEFAULT_MAX_NEEDS_MANUAL_CLUE_RATIO,
): ManualClueCoverageSummary {
  type Accumulator = {
    kind: "difficulty" | "theme";
    key: string;
    puzzleCount: number;
    total: number;
    needsManualClue: number;
  };
  const buckets = new Map<string, Accumulator>();

  const add = (
    kind: "difficulty" | "theme",
    key: string,
    entries: readonly ManualClueCoverageEntry[],
  ) => {
    const bucketKey = `${kind}:${key}`;
    let bucket = buckets.get(bucketKey);
    if (bucket == null) {
      bucket = { kind, key, puzzleCount: 0, total: 0, needsManualClue: 0 };
      buckets.set(bucketKey, bucket);
    }
    bucket.puzzleCount += 1;
    bucket.total += entries.length;
    bucket.needsManualClue += countNeedsManualClue(entries);
  };

  for (const puzzle of puzzles) {
    const entries = puzzle.entries ?? [];
    if (puzzle.difficulty != null && puzzle.difficulty !== "") {
      add("difficulty", puzzle.difficulty, entries);
    }
    if (puzzle.themeTag != null && puzzle.themeTag !== "") {
      add("theme", puzzle.themeTag, entries);
    }
  }

  const groups: ManualClueCoverageGroup[] = [...buckets.values()]
    .map((bucket) => {
      const ratio = bucket.total === 0 ? 0 : bucket.needsManualClue / bucket.total;
      return {
        kind: bucket.kind,
        key: bucket.key,
        puzzleCount: bucket.puzzleCount,
        total: bucket.total,
        needsManualClue: bucket.needsManualClue,
        ratio,
        exceedsGate: ratio > maxRatio,
      };
    })
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "difficulty" ? -1 : 1;
      }
      if (left.kind === "difficulty") {
        const leftOrder = DIFFICULTY_GROUP_ORDER[left.key] ?? 99;
        const rightOrder = DIFFICULTY_GROUP_ORDER[right.key] ?? 99;
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
      }
      return left.key.localeCompare(right.key);
    });

  return {
    groups,
    anyExceeded: groups.some((group) => group.exceedsGate),
  };
}

export type ManualClueMap = Record<string, string>;

export type CurationTarget = {
  answer: string;
  clue?: string;
  clueSource?: string;
  needsManualClue?: boolean;
};

// 검수 단서가 있으면 적용해 새 객체를 반환한다(불변). 단서가 없으면 원본 그대로.
// 적용 시 clue 를 검수 단서로 바꾸고 clueSource=manual·needsManualClue=false 로 표기.
export function applyManualClue<T extends CurationTarget>(
  item: T,
  clues: ManualClueMap,
): T {
  const manualClue = clues[item.answer];

  if (manualClue == null) {
    return item;
  }

  return {
    ...item,
    clue: manualClue,
    clueSource: CURATED_CLUE_SOURCE,
    needsManualClue: false,
  };
}

// 목록에 검수 단서를 일괄 적용하고, 실제 적용된 건수를 함께 반환한다.
export function applyManualClues<T extends CurationTarget>(
  items: readonly T[],
  clues: ManualClueMap,
): { items: T[]; applied: number } {
  let applied = 0;
  const next = items.map((item) => {
    const updated = applyManualClue(item, clues);
    if (updated !== item) {
      applied += 1;
    }
    return updated;
  });

  return { items: next, applied };
}
