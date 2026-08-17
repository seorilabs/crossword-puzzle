// 플레이 방법 안내(HowToPlayDialog) 계측 계약.
//
// 왜 필요한가: 퍼즐 화면에 처음 들어온 사용자는 전원 이 안내를 먼저 본다. 그런데
// 지금까지 이 다이얼로그에는 계측이 하나도 없었다. `onboarding_guide_*` 는 그 다음
// 단계인 "첫 입력 가이드"의 이벤트라 서로 다른 구간이다.
//
// GA4 실측에서 무입력 이탈이 93명, 체류 중앙값 7초였고 그중 56.6%가 8초 안에
// 떠났다. 첫 글자를 넣은 사용자는 92.3%가 완료하므로 병목은 입력이 아니라 그
// 앞이다. 이 안내를 어디까지 보고 떠나는지가 지금 비어 있는 조각이라, 이탈
// 지점을 스텝 단위로 남긴다.
//
// core에 두는 이유는 gameAnalytics.ts 와 같다. AIT WebView(src)와 RN(apps/mobile)이
// 같은 이벤트를 같은 파라미터로 보내도록 계약을 한곳에 고정한다. sink 는 각 마켓
// adapter 가 정한다.

export const HOW_TO_PLAY_SHOWN_EVENT = "how_to_play_shown";
export const HOW_TO_PLAY_COMPLETE_EVENT = "how_to_play_complete";
export const HOW_TO_PLAY_DISMISS_EVENT = "how_to_play_dismiss";

// 안내를 떠난 방식. 마지막 단계까지 보고 시작한 경우와 도중에 닫은 경우를 나눈다.
export type HowToPlayOutcome = "complete" | "dismiss";

export type HowToPlayProgress = {
  // 떠난 시점에 보고 있던 단계(0-based). 단일 화면 안내(RN)는 0.
  stepIndex: number;
  // 안내의 전체 단계 수. 단일 화면 안내는 1.
  stepCount: number;
  // 안내가 뜬 뒤 지난 시간(초). 측정할 수 없으면 생략한다.
  elapsedSeconds?: number;
};

export type HowToPlayParams = {
  step_index: number;
  step_count: number;
  step_number: number;
  progress_percent: number;
  elapsed_seconds?: number;
};

function clampStepCount(stepCount: number) {
  return Number.isFinite(stepCount) && stepCount > 0
    ? Math.floor(stepCount)
    : 1;
}

function clampStepIndex(stepIndex: number, stepCount: number) {
  if (!Number.isFinite(stepIndex) || stepIndex < 0) {
    return 0;
  }

  return Math.min(Math.floor(stepIndex), stepCount - 1);
}

// 안내 진행 상태를 GA4 파라미터로 만든다. step_index 는 0-based 원본,
// step_number 는 사람이 읽는 1-based 값이라 대시보드에서 그대로 쓴다.
export function buildHowToPlayParams(
  progress: HowToPlayProgress,
): HowToPlayParams {
  const stepCount = clampStepCount(progress.stepCount);
  const stepIndex = clampStepIndex(progress.stepIndex, stepCount);
  const params: HowToPlayParams = {
    step_index: stepIndex,
    step_count: stepCount,
    step_number: stepIndex + 1,
    progress_percent: Math.round(((stepIndex + 1) / stepCount) * 100),
  };

  if (
    progress.elapsedSeconds != null &&
    Number.isFinite(progress.elapsedSeconds) &&
    progress.elapsedSeconds >= 0
  ) {
    params.elapsed_seconds = Math.round(progress.elapsedSeconds);
  }

  return params;
}

export function getHowToPlayOutcomeEvent(outcome: HowToPlayOutcome) {
  return outcome === "complete"
    ? HOW_TO_PLAY_COMPLETE_EVENT
    : HOW_TO_PLAY_DISMISS_EVENT;
}
