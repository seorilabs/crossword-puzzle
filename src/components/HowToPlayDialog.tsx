import { useCallback, useEffect, useRef, useState } from "react";

import type { HowToPlayOutcome } from "../../packages/crossword-core/src";

// 첫 실행 사용법 안내(#234). 기존 정적 텍스트 목록 대신, 온보딩 퍼즐의 좌상단
// 코너(가로 "토끼" · 세로 "토마토"가 "토"를 공유)를 소형 예시 격자로 재사용해
// (1) 칸 탭으로 단어 선택, (2) 재탭으로 방향 전환, (3) 글자 입력을 스텝형으로
// 시연한다. 상태와 영속(seen)은 상위(App)에서 주입받고, 여기서는 스텝 진행과
// 하이라이트 표시만 담당한다. 애니메이션은 CSS에서 prefers-reduced-motion으로
// 정지 프레임으로 대체한다.

type DemoCell = {
  row: number;
  col: number;
  letter: string;
};

// 온보딩 퍼즐 좌상단 코너의 4칸(가로 "토끼" · 세로 "토마토", "토" 공유).
const DEMO_CELLS: DemoCell[] = [
  { row: 0, col: 0, letter: "토" },
  { row: 0, col: 1, letter: "끼" },
  { row: 1, col: 0, letter: "마" },
  { row: 2, col: 0, letter: "토" },
];

const DEMO_ROWS = 3;
const DEMO_COLS = 2;

function cellKey(row: number, col: number): string {
  return `${row}-${col}`;
}

type DemoStep = {
  title: string;
  description: string;
  // 이번 스텝에서 강조할 단어(선택된 칸들).
  highlightKeys: Set<string>;
  // 이번 스텝의 기준 칸(포인터·입력 강조 위치).
  activeKey: string;
  // 글자 입력 시연 여부(3스텝).
  showInput: boolean;
  // 격자 전체를 대신 읽어 줄 스크린리더 설명.
  gridLabel: string;
};

const ACROSS_KEYS = new Set([cellKey(0, 0), cellKey(0, 1)]);
const DOWN_KEYS = new Set([cellKey(0, 0), cellKey(1, 0), cellKey(2, 0)]);

const HOW_TO_PLAY_STEPS: DemoStep[] = [
  {
    title: "칸을 탭해 단어를 선택해요",
    description:
      "격자의 칸을 탭하면 그 칸이 속한 단어가 선택돼요. 지금은 가로 단어 ‘토끼’가 선택됐어요.",
    highlightKeys: ACROSS_KEYS,
    activeKey: cellKey(0, 0),
    showInput: false,
    gridLabel: "예시 격자에서 가로 단어 ‘토끼’가 선택된 상태",
  },
  {
    title: "다시 탭하면 방향이 바뀌어요",
    description:
      "같은 칸을 다시 탭하면 가로↔세로 방향이 전환돼요. 이제 세로 단어 ‘토마토’가 선택됐어요.",
    highlightKeys: DOWN_KEYS,
    activeKey: cellKey(0, 0),
    showInput: false,
    gridLabel: "예시 격자에서 세로 단어 ‘토마토’가 선택된 상태",
  },
  {
    title: "선택한 칸에 글자를 입력해요",
    description:
      "선택한 칸에 글자를 입력하면 채워져요. 단서를 보고 한 글자씩 채워 나가면 돼요.",
    highlightKeys: DOWN_KEYS,
    activeKey: cellKey(0, 0),
    showInput: true,
    gridLabel: "예시 격자의 선택한 칸에 글자 ‘토’가 입력된 상태",
  },
];

export type HowToPlayCloseContext = {
  outcome: HowToPlayOutcome;
  stepIndex: number;
  stepCount: number;
};

export function HowToPlayDialog({
  onClose,
  onShown,
}: {
  onClose: (context: HowToPlayCloseContext) => void;
  // 노출 시점을 상위에 알린다. 단계 수를 상수로 내보내면 Fast Refresh 가 깨지고,
  // 마운트 시점과 계측 시점이 어긋날 수 있어 콜백으로 전달한다.
  onShown?: (stepCount: number) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const dialogRef = useRef<HTMLElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);

  const step = HOW_TO_PLAY_STEPS[stepIndex];
  const isLastStep = stepIndex === HOW_TO_PLAY_STEPS.length - 1;

  const goNext = useCallback(() => {
    setStepIndex((prev) => {
      if (prev >= HOW_TO_PLAY_STEPS.length - 1) {
        return prev;
      }
      return prev + 1;
    });
  }, []);

  // 어디까지 보고 떠났는지가 이탈 지점 분석의 핵심이라, 닫기 사유와 단계를 함께 넘긴다.
  const close = useCallback(
    (outcome: HowToPlayOutcome) => {
      onClose({ outcome, stepIndex, stepCount: HOW_TO_PLAY_STEPS.length });
    },
    [onClose, stepIndex],
  );

  const handlePrimary = useCallback(() => {
    if (isLastStep) {
      close("complete");
      return;
    }
    goNext();
  }, [close, goNext, isLastStep]);

  useEffect(() => {
    onShown?.(HOW_TO_PLAY_STEPS.length);
    // 마운트 1회만 알린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 스텝이 바뀔 때마다 주 액션 버튼으로 포커스를 이동해, 키보드/스크린리더
  // 사용자가 진행 상태를 따라갈 수 있게 한다.
  useEffect(() => {
    primaryButtonRef.current?.focus();
  }, [stepIndex]);

  // 간단한 포커스 트랩 + Esc 종료. 다이얼로그 내부의 포커스 가능한 요소 사이에서만
  // Tab 순환하도록 가둔다.
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close("dismiss");
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const container = dialogRef.current;
      if (container == null) {
        return;
      }
      const focusable = container.querySelectorAll<HTMLElement>(
        'button:not([disabled])',
      );
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !container.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [close],
  );

  return (
    <div className="rewardDialogScrim">
      <section
        ref={dialogRef}
        className="rewardDialog howToPlayDialog howToPlayInteractive"
        role="dialog"
        aria-modal="true"
        aria-labelledby="howToPlayTitle"
        onKeyDown={handleKeyDown}
      >
        <div className="rewardDialogText">
          <h2 id="howToPlayTitle">크로스워드 어떻게 풀까요?</h2>
          <p className="howToPlayStepTitle">{step.title}</p>
        </div>

        <div
          className={[
            "howToPlayDemoGrid",
            step.showInput ? "howToPlayDemoInput" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          role="img"
          aria-label={step.gridLabel}
        >
          {Array.from({ length: DEMO_ROWS }).flatMap((_, row) =>
            Array.from({ length: DEMO_COLS }).map((__, col) => {
              const key = cellKey(row, col);
              const cell = DEMO_CELLS.find(
                (candidate) => candidate.row === row && candidate.col === col,
              );
              if (cell == null) {
                return (
                  <div
                    key={key}
                    className="howToPlayDemoCell howToPlayDemoCellBlock"
                    aria-hidden="true"
                  />
                );
              }
              const isHighlighted = step.highlightKeys.has(key);
              const isActive = step.activeKey === key;
              return (
                <div
                  key={key}
                  className={[
                    "howToPlayDemoCell",
                    isHighlighted ? "howToPlayDemoCellOn" : "",
                    isActive ? "howToPlayDemoCellActive" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-hidden="true"
                >
                  {cell.letter}
                  {isActive ? (
                    <span className="howToPlayDemoPointer" aria-hidden="true" />
                  ) : null}
                </div>
              );
            }),
          )}
        </div>

        {/* 스텝 설명은 시각 텍스트이자 스크린리더 안내로 함께 쓴다. */}
        <p className="howToPlayStepDescription" aria-live="polite">
          {step.description}
        </p>

        <div
          className="howToPlayDots"
          role="group"
          aria-label={`전체 ${HOW_TO_PLAY_STEPS.length}단계 중 ${stepIndex + 1}단계`}
        >
          {HOW_TO_PLAY_STEPS.map((_, index) => (
            <span
              key={index}
              className={[
                "howToPlayDot",
                index === stepIndex ? "howToPlayDotOn" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-hidden="true"
            />
          ))}
        </div>

        <div className="rewardDialogActions howToPlayActions">
          <button
            className="ghostButton"
            type="button"
            onClick={() => close("dismiss")}
          >
            건너뛰기
          </button>
          <button
            ref={primaryButtonRef}
            className="primaryButton"
            type="button"
            onClick={handlePrimary}
          >
            {isLastStep ? "시작할게요!" : "다음"}
          </button>
        </div>
      </section>
    </div>
  );
}
