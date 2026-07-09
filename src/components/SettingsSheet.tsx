import { Paragraph } from "@toss/tds-mobile";

import type { TextScale } from "../../packages/crossword-core/src";

// 입력 방식 타입은 어댑터(answerInputModeRepository)를 단일 출처로 재노출한다.
export type { AnswerInputMode } from "../adapters/answerInputModeRepository";
import type { AnswerInputMode } from "../adapters/answerInputModeRepository";

export type SettingsSheetProps = {
  answerInputMode: AnswerInputMode;
  autocheckEnabled: boolean;
  hapticEnabled: boolean;
  onClose: () => void;
  selectAnswerInputMode: (mode: AnswerInputMode) => void;
  selectTextScale: (scale: TextScale) => void;
  soundEnabled: boolean;
  textScale: TextScale;
  timerVisible: boolean;
  toggleAutocheck: () => void;
  toggleHaptic: () => void;
  toggleSound: () => void;
  toggleTimerVisible: () => void;
};

// 풀이 화면 설정 시트. 입력 방식·오답 자동 표시·사운드·햅틱·글자 크기를 조정한다.
// 상태와 영속은 전부 상위(App)에서 주입받고 렌더만 담당한다.
export function SettingsSheet({
  answerInputMode,
  autocheckEnabled,
  hapticEnabled,
  onClose,
  selectAnswerInputMode,
  selectTextScale,
  soundEnabled,
  textScale,
  timerVisible,
  toggleAutocheck,
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
            입력 방식 · 오답 표시 · 사운드 · 햅틱 · 타이머 · 글자 크기
          </Paragraph>
        </div>
        <button className="ghostButton" type="button" onClick={onClose}>
          닫기
        </button>
      </div>

      <div className="settingsSheetBody">
        <div className="settingsRow">
          <div className="settingsRowText">
            <strong>입력 방식</strong>
            <span>
              {answerInputMode === "box"
                ? "입력창에 한 번에 입력해요"
                : "칸을 눌러 한 글자씩 입력해요"}
            </span>
          </div>
          <div
            className="settingsSegmented"
            role="group"
            aria-label="입력 방식"
          >
            <button
              type="button"
              className={[
                "assistButton",
                answerInputMode === "box" ? "assistToggleOn" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-pressed={answerInputMode === "box"}
              onClick={() => selectAnswerInputMode("box")}
            >
              입력창
            </button>
            <button
              type="button"
              className={[
                "assistButton",
                answerInputMode === "cell" ? "assistToggleOn" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-pressed={answerInputMode === "cell"}
              onClick={() => selectAnswerInputMode("cell")}
            >
              칸별
            </button>
          </div>
        </div>

        <div className="settingsRow">
          <div className="settingsRowText">
            <strong>오답 자동 표시</strong>
            <span>
              {autocheckEnabled
                ? "틀린 글자를 바로 빨간색으로 표시해요"
                : "오답을 표시하지 않아요. '이 단어 확인'으로 직접 확인할 수 있어요"}
            </span>
          </div>
          <button
            type="button"
            className={[
              "assistButton",
              "assistToggle",
              autocheckEnabled ? "assistToggleOn" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-pressed={autocheckEnabled}
            onClick={toggleAutocheck}
          >
            {autocheckEnabled ? "켜짐" : "꺼짐"}
          </button>
        </div>

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
