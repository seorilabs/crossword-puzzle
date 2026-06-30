// 막힘(stuck) 힌트 노출 정책. "언제 힌트/정답 보기 도움을 띄울지"의 지연·트리거
// 결정만 코어에 두어 3개 시장(AIT/Web, Android, iOS)이 동일한 사용자 정책으로
// 동작하게 한다. 실제 노출(프롬프트 렌더)·타이머 구동은 UI(App)에 분리한다.
//
// 배경: first_answer_input 사용자조차 완료까지 64%가 이탈한다(이슈 #163). 첫 글자만
// 입력하고 한 단어도 완성하지 못한 채 막힌 신규 사용자에게는, 일반 정체보다 더 빨리
// 도움을 노출해 첫 성공(활성화)으로 끌어올린다.

// 입력/조작이 정체된 뒤 힌트 CTA를 띄우기까지의 지연(ms).
export const STUCK_HINT_IDLE_MS = 20000;
// 오답이 쌓여 막힌 신호가 보이면 더 짧은 지연으로 빠르게 띄운다.
export const STUCK_HINT_WRONG_IDLE_MS = 5000;
// 아직 한 단어도 완성하지 못한(진척 0) 상태로 정체되면, 일반 정체보다 빠르게
// 도움을 노출해 첫 성공 전 이탈을 줄인다.
export const STUCK_HINT_NO_PROGRESS_IDLE_MS = 10000;
// 막힘으로 간주하는 오답 셀 누적 개수.
export const WRONG_CELL_COUNT_FOR_STUCK_HINT = 2;

// 막힘 힌트 노출을 유발한 신호. 텔레메트리 trigger 파라미터 값과 1:1 대응한다.
export type StuckHintTrigger = "idle" | "wrong_answer" | "no_progress";

export type StuckHintExposureInput = {
  // 누적 오답 셀 개수.
  wrongCellCount: number;
  // 현재까지 완성한 단어 수.
  wordsFilled: number;
};

export type StuckHintExposure = {
  // 정체 후 힌트 CTA를 띄우기까지의 지연(ms).
  delayMs: number;
  // 적용된 트리거(텔레메트리 trigger 값).
  trigger: StuckHintTrigger;
};

// 막힘 힌트 노출 지연과 트리거를 결정한다. 우선순위는
// 오답 누적(가장 빠름) > 진척 0(빠름) > 일반 정체(기본) 순이다.
export function resolveStuckHintExposure(
  input: StuckHintExposureInput,
): StuckHintExposure {
  if (input.wrongCellCount >= WRONG_CELL_COUNT_FOR_STUCK_HINT) {
    return { delayMs: STUCK_HINT_WRONG_IDLE_MS, trigger: "wrong_answer" };
  }

  if (input.wordsFilled <= 0) {
    return { delayMs: STUCK_HINT_NO_PROGRESS_IDLE_MS, trigger: "no_progress" };
  }

  return { delayMs: STUCK_HINT_IDLE_MS, trigger: "idle" };
}
