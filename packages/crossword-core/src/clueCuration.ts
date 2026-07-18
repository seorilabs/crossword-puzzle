// 단서(clue) 큐레이션 공통 정책. 발행 퍼즐의 단서 품질을 게이트로 강제하고,
// 검수 단서(manualClue)를 워드뱅크/퍼즐 엔트리에 적용하는 순수 로직을 모은다.
// 3마켓이 같은 발행 기준을 공유하도록 server/batch·scripts 가 이 모듈을 쓴다.

// 검수 완료 단서의 출처 표기. 사전 정의문(krdict-definition)과 구분한다.
export const CURATED_CLUE_SOURCE = "manual";

// 발행 퍼즐에서 허용하는 needsManualClue:true 엔트리 비율 상한. 한 퍼즐이라도
// 이 비율을 넘으면 발행 검증이 실패한다(전건 미검수 팩 발행 차단). 검수 단서
// 커버리지를 단계적으로 확대하며(#152 → #173 → #201) 상한도 0.95 → 0.8 → 0.5
// → 0.4 로 낮춰 미검수(사전 정의문) 단서 비중을 강제로 제한한다. #201에서 검수
// 단서를 411건으로 늘려 발행 팩 7종의 미검수 엔트리를 0건으로 만든 뒤 상한을
// 0.4 로 조정했다.
export const DEFAULT_MAX_NEEDS_MANUAL_CLUE_RATIO = 0.4;

function normalizeForAnswerLeakCheck(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

export const KO_KR_MIN_EXPOSED_ANSWER_FRAGMENT_LENGTH = 2;

type NormalizedTokenSpan = {
  end: number;
  start: number;
};

function normalizedClueTokenSpans(value: string): {
  characters: string[];
  spans: NormalizedTokenSpan[];
} {
  const tokens =
    value
      .normalize("NFKC")
      .toLocaleLowerCase("ko-KR")
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  const characters: string[] = [];
  const spans: NormalizedTokenSpan[] = [];
  for (const token of tokens) {
    const tokenCharacters = [...token];
    const start = characters.length;
    characters.push(...tokenCharacters);
    spans.push({ start, end: characters.length });
  }
  return { characters, spans };
}

function charactersEqualAt(
  source: readonly string[],
  candidate: readonly string[],
  offset: number,
): boolean {
  return candidate.every(
    (character, index) => source[offset + index] === character,
  );
}

/**
 * ko-KR 출시 단서에서 정답 전체가 아닌 2글자 이상 연속 조각이 노출됐는지 찾는다.
 *
 * 사전식 정의는 복합어 일부를 자연스럽게 반복할 수 있으므로 reviewed wordbank
 * 자체를 무효화하는 규칙이 아니라 실제 출시 보드 선택에 쓰는 난이도/품질 규칙이다.
 * 한 token 안의 노출은 모두 잡고, 공백을 가로지르는 경우에는 조각이 token 시작에서
 * 시작할 때만 잡아 `집안일`/`집 안`은 차단하되 `북반부`/`절반 부분`처럼 서로 다른
 * 단어의 끝과 시작이 우연히 붙는 경우는 제외한다.
 */
export function findKoKrAnswerFragmentExposure(
  answer: string,
  clue: string | undefined | null,
): string | null {
  if (clue == null || clue.length === 0) return null;

  const answerCharacters = [...normalizeForAnswerLeakCheck(answer)];
  if (answerCharacters.length <= KO_KR_MIN_EXPOSED_ANSWER_FRAGMENT_LENGTH) {
    return null;
  }
  const clueTokens = normalizedClueTokenSpans(clue);

  // 가장 긴 조각, 정답에서 더 앞선 조각 순으로 반환해 진단 메시지가 결정적이다.
  for (
    let length = answerCharacters.length - 1;
    length >= KO_KR_MIN_EXPOSED_ANSWER_FRAGMENT_LENGTH;
    length -= 1
  ) {
    for (
      let answerStart = 0;
      answerStart + length <= answerCharacters.length;
      answerStart += 1
    ) {
      const fragment = answerCharacters.slice(
        answerStart,
        answerStart + length,
      );
      for (
        let clueStart = 0;
        clueStart + fragment.length <= clueTokens.characters.length;
        clueStart += 1
      ) {
        if (!charactersEqualAt(clueTokens.characters, fragment, clueStart)) {
          continue;
        }
        const clueEnd = clueStart + fragment.length;
        const startSpan = clueTokens.spans.find(
          (span) => clueStart >= span.start && clueStart < span.end,
        );
        const endSpan = clueTokens.spans.find(
          (span) => clueEnd - 1 >= span.start && clueEnd - 1 < span.end,
        );
        if (
          startSpan != null &&
          endSpan != null &&
          (startSpan === endSpan || clueStart === startSpan.start)
        ) {
          return fragment.join("");
        }
      }
    }
  }
  return null;
}

export type BoardClueQualityEntry = {
  answer: string;
  clue: string;
};

export type BoardClueQualityConflict = {
  answer: string;
  entryIndex: number;
  otherAnswer: string;
  otherEntryIndex: number;
  type: "answer_contains_answer" | "clue_contains_other_answer";
};

/** 같은 보드에서만 금지하는 정답 계열/교차 단서 노출을 결정적으로 열거한다. */
export function findBoardClueQualityConflicts(
  entries: readonly BoardClueQualityEntry[],
): BoardClueQualityConflict[] {
  const normalized = entries.map((entry) => ({
    answer: normalizeForAnswerLeakCheck(entry.answer),
    clue: normalizeForAnswerLeakCheck(entry.clue),
  }));
  const conflicts: BoardClueQualityConflict[] = [];

  for (const [entryIndex, entry] of normalized.entries()) {
    for (const [otherEntryIndex, other] of normalized.entries()) {
      if (
        entryIndex === otherEntryIndex ||
        [...other.answer].length < 2 ||
        !entry.clue.includes(other.answer)
      ) {
        continue;
      }
      conflicts.push({
        type: "clue_contains_other_answer",
        entryIndex,
        otherEntryIndex,
        answer: entries[entryIndex].answer,
        otherAnswer: entries[otherEntryIndex].answer,
      });
    }
  }

  for (let entryIndex = 0; entryIndex < normalized.length; entryIndex += 1) {
    for (
      let otherEntryIndex = entryIndex + 1;
      otherEntryIndex < normalized.length;
      otherEntryIndex += 1
    ) {
      const answer = normalized[entryIndex].answer;
      const otherAnswer = normalized[otherEntryIndex].answer;
      if (
        answer === otherAnswer ||
        [...answer].length < 2 ||
        [...otherAnswer].length < 2 ||
        (!answer.includes(otherAnswer) && !otherAnswer.includes(answer))
      ) {
        continue;
      }
      conflicts.push({
        type: "answer_contains_answer",
        entryIndex,
        otherEntryIndex,
        answer: entries[entryIndex].answer,
        otherAnswer: entries[otherEntryIndex].answer,
      });
    }
  }
  return conflicts;
}

// 띄어쓰기나 문장부호를 제거한 뒤에도 단서가 정답을 부분 문자열로 포함하면
// 자기참조로 본다. `지하철`/`지하 철도`, `글자`/`한글 자모`처럼 경계만
// 갈라 답이 드러나는 경우도 같은 출시 게이트로 차단한다.
export function isSelfReferentialClue(
  answer: string,
  clue: string | undefined | null,
): boolean {
  if (clue == null || clue.length === 0) {
    return false;
  }

  const normalizedAnswer = normalizeForAnswerLeakCheck(answer);
  const normalizedClue = normalizeForAnswerLeakCheck(clue);
  return (
    normalizedAnswer.length > 0 && normalizedClue.includes(normalizedAnswer)
  );
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
      const ratio =
        bucket.total === 0 ? 0 : bucket.needsManualClue / bucket.total;
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
