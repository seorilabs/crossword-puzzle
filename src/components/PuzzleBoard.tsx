import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  getCellKey,
  getEntryCells,
  isWrongCellVisible,
  shouldRenderTentative,
  type Puzzle,
  type PuzzleEntry,
} from "../../packages/crossword-core/src";

// 비강조 상태는 항상 동일한 빈 Set 참조를 써서 불필요한 참조 변경을 막는다.
const EMPTY_CELL_KEY_SET: ReadonlySet<string> = new Set();

export type PuzzleBoardProps = {
  // 현재 입력 커서가 놓인 셀 키. 선택 단어(selectedCells)의 연한 강조와 별개로
  // 이 한 셀만 더 진하게(cellActive) 구분해 커서 위치를 보이게 한다. 미지정이면
  // 활성 셀 강조 없이 기존 렌더와 동일하다(하위호환).
  activeCellKey?: string;
  // 상시 오답표시 설정. 꺼지면 cellWrong 빨간 표시를 자동 적용하지 않는다.
  // 미지정(개발 시뮬레이터 등)은 기존 동작대로 항상 표시(true)로 본다.
  autocheckEnabled?: boolean;
  cellEntries: Map<string, PuzzleEntry[]>;
  cellValues: Record<string, string>;
  // "이 단어 확인"으로 일시 강조 중인 셀. 이 셀들은 autocheck가 꺼져 있어도
  // 오답을 잠시 표시한다.
  checkedCellKeys?: ReadonlySet<string>;
  cols: number[];
  completedEntries: PuzzleEntry[];
  pendingCellValues: Record<string, string>;
  puzzle: Puzzle;
  rows: number[];
  selectedCells: Set<string>;
  selectCell: (row: number, col: number) => void;
  startLabels: Map<string, number>;
  // 연필(임시) 모드로 입력된 셀 키. 채워졌지만 아직 정답이 아닌 셀을 회색으로
  // 구분 렌더한다. 미지정(개발 시뮬레이터 등)은 빈 집합으로 본다.
  tentativeCellKeys?: ReadonlySet<string>;
};

export function PuzzleBoard({
  activeCellKey,
  autocheckEnabled = true,
  cellEntries,
  cellValues,
  checkedCellKeys = EMPTY_CELL_KEY_SET,
  cols,
  completedEntries,
  pendingCellValues,
  puzzle,
  rows,
  selectedCells,
  selectCell,
  startLabels,
  tentativeCellKeys = EMPTY_CELL_KEY_SET,
}: PuzzleBoardProps) {
  const completedCellKeys = useMemo(() => {
    const keys = new Set<string>();

    for (const entry of completedEntries) {
      getEntryCells(entry).forEach((cell) => {
        keys.add(getCellKey(cell.row, cell.col));
      });
    }

    return keys;
  }, [completedEntries]);

  const [completionKeyRefCount, setCompletionKeyRefCount] = useState<
    Map<string, number>
  >(new Map());
  const prevPuzzleIdRef = useRef<string>("");
  const prevCompletedIdsRef = useRef<Set<string>>(new Set());
  const animTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (prevPuzzleIdRef.current !== puzzle.puzzleId) {
      prevPuzzleIdRef.current = puzzle.puzzleId;
      prevCompletedIdsRef.current = new Set(completedEntries.map((e) => e.id));
      for (const t of animTimersRef.current) clearTimeout(t);
      animTimersRef.current = [];
      setCompletionKeyRefCount(new Map());
      return;
    }

    const newlyCompleted = completedEntries.filter(
      (e) => !prevCompletedIdsRef.current.has(e.id),
    );
    prevCompletedIdsRef.current = new Set(completedEntries.map((e) => e.id));

    if (newlyCompleted.length === 0) {
      return;
    }

    const animKeys = new Set<string>();

    for (const entry of newlyCompleted) {
      for (const cell of getEntryCells(entry)) {
        animKeys.add(getCellKey(cell.row, cell.col));
      }
    }

    setCompletionKeyRefCount((prev) => {
      const next = new Map(prev);
      for (const key of animKeys) {
        next.set(key, (next.get(key) ?? 0) + 1);
      }
      return next;
    });

    const timer = setTimeout(() => {
      setCompletionKeyRefCount((prev) => {
        const next = new Map(prev);
        for (const key of animKeys) {
          const count = (next.get(key) ?? 1) - 1;
          if (count <= 0) {
            next.delete(key);
          } else {
            next.set(key, count);
          }
        }
        return next;
      });
      animTimersRef.current = animTimersRef.current.filter((t) => t !== timer);
    }, 550);

    animTimersRef.current.push(timer);
  }, [completedEntries, puzzle.puzzleId]);

  useEffect(() => {
    return () => {
      for (const t of animTimersRef.current) clearTimeout(t);
    };
  }, []);

  return (
    <section
      className="puzzleBoard"
      style={{ "--board-cols": cols.length } as CSSProperties}
      tabIndex={-1}
      aria-label="가로세로 퍼즐판"
    >
      {rows.flatMap((row) =>
        cols.map((col) => {
          const answer = puzzle.grid[row]?.[col] ?? "";
          const key = getCellKey(row, col);
          const entries = cellEntries.get(key) ?? [];
          const committedValue = cellValues[key];
          // 확정값이 이미 정답이면(예: "정답 보기"로 채운 셀) 미확정 입력 오버레이를
          // 무시하고 즉시 잠금·정답 표시한다. 잠긴 정답 셀은 편집 대상이 아니므로
          // pending을 버려도 일반 입력 흐름에 영향이 없다.
          const isLockedCorrect =
            committedValue != null && committedValue === answer;
          const pendingValue = isLockedCorrect
            ? ""
            : (pendingCellValues[key] ?? "");
          const displayValue =
            pendingValue !== "" ? pendingValue : (committedValue ?? "");
          const isFilled = committedValue != null;
          const isPending = pendingValue !== "";
          const isComplete = completedCellKeys.has(key);
          const isSelected = selectedCells.has(key);
          // 활성(커서) 셀: 선택 단어 중에서도 지금 입력이 향하는 한 칸.
          const isActive = activeCellKey != null && key === activeCellKey;
          const isCross = entries.length > 1;
          // Pending IME text is temporary, so only committed values get
          // right/wrong styling.
          const isCorrect = !isPending && isFilled && committedValue === answer;
          const isWrong = !isPending && isFilled && committedValue !== answer;
          // autocheck가 꺼져 있으면 오답 빨간 표시를 숨긴다. 단, "이 단어 확인"으로
          // 강조 중인 셀(checkedCellKeys)은 일시적으로 오답을 보여준다.
          const showWrong = isWrongCellVisible({
            isWrong,
            autocheckEnabled,
            isChecked: checkedCellKeys.has(key),
          });
          const isJustCompleted = (completionKeyRefCount.get(key) ?? 0) > 0;
          // 임시(연필) 글자: 채워졌지만 아직 정답이 아니고 IME 미확정도 아닐 때
          // 구분한다. autocheck(오답 강조)와 독립적이라 기본 ON 상태에서도 임시
          // 표시가 노출되며, 오답 색상은 CSS에서 우선 적용된다.
          const isTentative = shouldRenderTentative({
            isFilled,
            isCorrect,
            isPending,
            isTentative: tentativeCellKeys.has(key),
          });

          if (answer === "") {
            return <div key={key} className="cell cellBlock" />;
          }

          return (
            <button
              key={key}
              className={[
                "cell",
                isSelected ? "cellSelected" : "",
                isActive ? "cellActive" : "",
                isCross ? "cellCross" : "",
                isFilled ? "cellFilled" : "",
                isPending ? "cellPending" : "",
                isCorrect ? "cellCorrect" : "",
                isComplete ? "cellComplete" : "",
                isJustCompleted ? "cellJustCompleted" : "",
                showWrong ? "cellWrong" : "",
                isTentative ? "cellTentative" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              onClick={() => selectCell(row, col)}
              aria-current={isActive ? "true" : undefined}
              aria-label={`${row + 1}행 ${col + 1}열${
                showWrong
                  ? " 오답"
                  : isComplete
                    ? " 정답 완료"
                    : isCorrect
                      ? " 정답 잠금"
                      : isTentative
                        ? " 임시 입력"
                        : ""
              }`}
            >
              <span className="cellNumber">{startLabels.get(key) ?? ""}</span>
              <span className="cellLetter">{displayValue}</span>
              {isCorrect && !isComplete ? (
                <span className="cellLockMark" aria-hidden="true" />
              ) : null}
              {/* 오답을 색상뿐 아니라 형태(×) 신호로도 알린다(WCAG 1.4.1).
                  그레이스케일·색각이상에서도 정답 마커(점/자물쇠)와 구분된다. */}
              {showWrong ? (
                <span className="cellWrongMark" aria-hidden="true" />
              ) : null}
            </button>
          );
        }),
      )}
    </section>
  );
}
