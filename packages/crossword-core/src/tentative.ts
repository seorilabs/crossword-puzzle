// 연필(임시) 입력 표시 로직. UI 프레임워크와 분리한 순수 함수 모음으로,
// 웹(src/App.tsx)과 모바일 어댑터가 공유하고 단위 테스트로 회귀를 가드한다.
// 정오/완료 판정은 cellValues 값만 보므로(여기서 다루지 않음), 임시 여부는
// 오직 "표시"와 "임시 셋 갱신"에만 영향을 준다.

export type TentativeCellRenderState = {
  // 확정 값이 채워진 셀인지(committedValue != null)
  isFilled: boolean;
  // 값이 정답과 일치해 잠긴 셀인지
  isCorrect: boolean;
  // IME 조합 등 미확정 입력 오버레이가 떠 있는 셀인지
  isPending: boolean;
  // 임시(연필) 셋에 포함된 셀인지
  isTentative: boolean;
};

// 셀을 임시(회색·기울임) 스타일로 렌더할지 여부.
// 정답으로 잠긴 셀·IME 미확정 셀은 제외한다. 오답 강조(autocheck)와는 독립적이라
// autocheck ON 상태에서도 임시 표시가 노출된다(오답 색상은 CSS에서 우선 적용).
export function shouldRenderTentative(
  state: TentativeCellRenderState,
): boolean {
  return (
    state.isFilled &&
    !state.isCorrect &&
    !state.isPending &&
    state.isTentative
  );
}

// 입력으로 값이 바뀐 셀 1건. hasValue=false면 값이 지워진 셀이다.
export type CellLetterChange = { key: string; hasValue: boolean };

// 변경된 셀들에 대한 임시 셋 변화량(추가/제거)을 계산한다.
// markTentative=true(연필 ON + 사용자 직접 입력)면 값이 채워진 셀은 임시로 추가,
// 그 외(펜 모드/힌트/정답 보기 등)는 확정 처리(제거)한다. 값이 지워진 셀은 항상 제거.
export function computeTentativeUpdate(
  changes: readonly CellLetterChange[],
  markTentative: boolean,
): { adds: string[]; removes: string[] } {
  const adds: string[] = [];
  const removes: string[] = [];

  for (const { key, hasValue } of changes) {
    if (hasValue && markTentative) {
      adds.push(key);
    } else {
      removes.push(key);
    }
  }

  return { adds, removes };
}

// 선택한 단어에서 '임시 확정'으로 승격할 셀 키를 고른다. 임시 셋에 있고 아직
// 정답으로 잠기지 않은(화면에 임시로 보이는) 셀만 대상으로 한다.
export function selectPromotableTentativeKeys(
  entryCellKeys: readonly string[],
  tentative: ReadonlySet<string>,
  isLocked: (key: string) => boolean,
): string[] {
  return entryCellKeys.filter((key) => tentative.has(key) && !isLocked(key));
}

// 임시 셋에 removes를 먼저, adds를 나중에 적용한 새 Set을 만든다.
export function applyTentativeUpdate(
  prev: ReadonlySet<string>,
  adds: readonly string[],
  removes: readonly string[],
): Set<string> {
  const next = new Set(prev);
  for (const key of removes) next.delete(key);
  for (const key of adds) next.add(key);
  return next;
}
