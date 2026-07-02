import { Paragraph } from "@toss/tds-mobile";

// App.tsx 의 로컬 AnswerInputMode 와 동일한 리터럴(구조적 호환). App 이 타입을
// export 하지 않으므로 순환 의존 없이 여기서 같은 형태로 선언한다.
export type AnswerInputMode = "box" | "cell";

export type SettingsSheetProps = {
  answerInputMode: AnswerInputMode;
  autocheckEnabled: boolean;
  hapticEnabled: boolean;
  onClose: () => void;
  selectAnswerInputMode: (mode: AnswerInputMode) => void;
  soundEnabled: boolean;
  toggleAutocheck: () => void;
  toggleHaptic: () => void;
  toggleSound: () => void;
};

// 풀이 화면 설정 시트. 입력 방식·오답 자동 표시·사운드·햅틱을 조정한다.
// 상태와 영속은 전부 상위(App)에서 주입받고 렌더만 담당한다.
export function SettingsSheet({
  answerInputMode,
  autocheckEnabled,
  hapticEnabled,
  onClose,
  selectAnswerInputMode,
  soundEnabled,
  toggleAutocheck,
  toggleHaptic,
  toggleSound,
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
            입력 방식 · 오답 표시 · 사운드 · 햅틱
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
      </div>
    </div>
  );
}
