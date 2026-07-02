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
