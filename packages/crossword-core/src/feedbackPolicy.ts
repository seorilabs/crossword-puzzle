// 사운드·햅틱 피드백 정책. UI/플랫폼 SDK와 분리한 순수 로직으로, 어떤 피드백
// 시점에 소리/진동을 줄지 설정값만으로 결정한다. 실제 재생/진동은 market adapter가
// 담당하고(웹: Web Audio + navigator.vibrate), 여기서는 정책만 다룬다.

// 피드백을 주는 시점.
export type FeedbackKind = "wordComplete" | "puzzleComplete" | "wrong";

export type FeedbackSettings = {
  soundEnabled: boolean;
  hapticEnabled: boolean;
};

export type FeedbackActions = {
  playSound: boolean;
  vibrate: boolean;
};

// 햅틱(진동)은 성취 시점(단어 완성·퍼즐 완료)에만 준다. 오답에는 소리만 준다.
// 각 설정이 꺼져 있으면 해당 채널은 발생하지 않는다.
export function resolveFeedbackActions(
  kind: FeedbackKind,
  settings: FeedbackSettings,
): FeedbackActions {
  const isAchievement = kind === "wordComplete" || kind === "puzzleComplete";
  return {
    playSound: settings.soundEnabled,
    vibrate: settings.hapticEnabled && isAchievement,
  };
}
