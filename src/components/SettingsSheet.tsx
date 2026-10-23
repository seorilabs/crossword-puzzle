import { Paragraph } from "@toss/tds-mobile";

import type { TextScale } from "../../packages/crossword-core/src";
import type { UsageStatisticsState } from "../../packages/crossword-core/src/usageStatistics";

export type SettingsSheetProps = {
  usageStatistics: UsageStatisticsState;
  toggleUsageStatistics: () => void;
  hapticEnabled: boolean;
  onClose: () => void;
  selectTextScale: (scale: TextScale) => void;
  soundEnabled: boolean;
  textScale: TextScale;
  timerVisible: boolean;
  toggleHaptic: () => void;
  toggleSound: () => void;
  toggleTimerVisible: () => void;
};

// 사운드, 햅틱, 타이머와 글자 크기를 조정한다.
// 상태와 영속은 전부 상위(App)에서 주입받고 렌더만 담당한다.
export function SettingsSheet({
  usageStatistics,
  toggleUsageStatistics,
  hapticEnabled,
  onClose,
  selectTextScale,
  soundEnabled,
  textScale,
  timerVisible,
  toggleHaptic,
  toggleSound,
  toggleTimerVisible,
}: SettingsSheetProps) {
  return (
    <div
      className="clueOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="설정"
    >
      <div className="clueOverlayHeader">
        <div>
          <Paragraph typography="t7" color="#6b7684">
            설정
          </Paragraph>
          <Paragraph typography="t4" fontWeight="bold">
            나에게 맞게 플레이하기
          </Paragraph>
        </div>
        <button className="ghostButton" type="button" onClick={onClose}>
          닫기
        </button>
      </div>

      <div className="settingsSheetBody">
        <div className="settingsRow">
          <div className="settingsRowText">
            <strong>사용 통계</strong>
            <span>
              앱 개선을 위한 풀이와 이용 통계예요. 꺼도 퍼즐 기록과 힌트는
              유지돼요.
            </span>
          </div>
          <button
            type="button"
            className={`assistButton assistToggle ${usageStatistics.enabled ? "assistToggleOn" : ""}`}
            aria-label="사용 통계"
            aria-pressed={usageStatistics.enabled}
            disabled={!usageStatistics.ready || usageStatistics.busy}
            onClick={toggleUsageStatistics}
          >
            {usageStatistics.enabled ? "켜짐" : "꺼짐"}
          </button>
        </div>
        {usageStatistics.error ? (
          <p role="status">
            {usageStatistics.error === "storage"
              ? "설정을 저장하지 못했어요. 이번 실행에만 적용되므로 다음 실행에서 다시 확인해 주세요."
              : "통계 설정을 적용하지 못했어요. 다시 선택해 주세요."}
          </p>
        ) : null}
        <div className="settingsRow">
          <div className="settingsRowText">
            <strong>사운드</strong>
            <span>단어 완성·퍼즐 완료·오답 시 효과음</span>
          </div>
          <button
            type="button"
            className={[
              "assistButton",
              "assistToggle",
              soundEnabled ? "assistToggleOn" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-pressed={soundEnabled}
            onClick={toggleSound}
          >
            {soundEnabled ? "켜짐" : "꺼짐"}
          </button>
        </div>

        <div className="settingsRow">
          <div className="settingsRowText">
            <strong>햅틱</strong>
            <span>단어 완성·퍼즐 완료 시 진동</span>
          </div>
          <button
            type="button"
            className={[
              "assistButton",
              "assistToggle",
              hapticEnabled ? "assistToggleOn" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-pressed={hapticEnabled}
            onClick={toggleHaptic}
          >
            {hapticEnabled ? "켜짐" : "꺼짐"}
          </button>
        </div>

        <div className="settingsRow">
          <div className="settingsRowText">
            <strong>타이머 표시</strong>
            <span>
              {timerVisible
                ? "풀이 화면에 경과 시간을 표시해요"
                : "타이머를 숨겨요. 기록·리더보드는 그대로 계측돼요"}
            </span>
          </div>
          <button
            type="button"
            className={[
              "assistButton",
              "assistToggle",
              timerVisible ? "assistToggleOn" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-pressed={timerVisible}
            onClick={toggleTimerVisible}
          >
            {timerVisible ? "켜짐" : "꺼짐"}
          </button>
        </div>

        <div className="settingsRow">
          <div className="settingsRowText">
            <strong>글자 크기</strong>
            <span>
              {textScale === "large"
                ? "보드 글자·단서를 크게 보여줘요"
                : "보드 글자·단서를 기본 크기로 보여줘요"}
            </span>
          </div>
          <div
            className="settingsSegmented"
            role="group"
            aria-label="글자 크기"
          >
            <button
              type="button"
              className={[
                "assistButton",
                textScale === "normal" ? "assistToggleOn" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-pressed={textScale === "normal"}
              onClick={() => selectTextScale("normal")}
            >
              보통
            </button>
            <button
              type="button"
              className={[
                "assistButton",
                textScale === "large" ? "assistToggleOn" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-pressed={textScale === "large"}
              onClick={() => selectTextScale("large")}
            >
              크게
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
