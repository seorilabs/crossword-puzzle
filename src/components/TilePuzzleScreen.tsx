import { t } from "../adapters/languageRepository";
import { useMemo, useState, type CSSProperties } from "react";
import {
  buildCellEntries,
  buildStartLabels,
  chooseLetterTile,
  clearLetterTile,
  selectLetterEntry,
  getCellKey,
  getCompletedEntries,
  getEntryCells,
  getLetterTiles,
  type LetterTileState,
  type Puzzle,
} from "../../packages/crossword-core/src";
import "./tilePuzzleScreen.css";

export type TileInputAction = "choice" | "clear" | "select";
export type TilePuzzleScreenProps = {
  puzzle: Puzzle;
  state: LetterTileState;
  hasStarted: boolean;
  isPaused: boolean;
  feedback?: string;
  onChange: (state: LetterTileState, action: TileInputAction) => void;
  onBack: () => void;
  onStart: () => void;
  onResume: () => void;
  onSettings: () => void;
  onPause?: () => void;
  timer?: string;
  textScale?: number;
  guide?: { completed: number; total: number; onSkip: () => void };
};

export function TilePuzzleScreen({
  puzzle,
  state,
  hasStarted,
  isPaused,
  feedback,
  onChange,
  onBack,
  onStart,
  onResume,
  onSettings,
  onPause,
  timer,
  textScale = 1,
  guide,
}: TilePuzzleScreenProps) {
  const [cluesOpen, setCluesOpen] = useState(false);
  const completed = getCompletedEntries(puzzle.entries, state.cellValues);
  const entry =
    puzzle.entries.find((e) => e.id === state.progress.entryId) ??
    puzzle.entries[0];
  const labels = useMemo(
    () => buildStartLabels(puzzle.entries),
    [puzzle.entries],
  );
  const cellEntries = useMemo(
    () => buildCellEntries(puzzle.entries),
    [puzzle.entries],
  );
  const keys = entry
    ? getEntryCells(entry).map((c) => getCellKey(c.row, c.col))
    : [];
  const selected = new Set(keys),
    locked = new Set(state.progress.confirmedCells);
  const tiles = getLetterTiles(puzzle, state, entry?.id);
  const solved = completed.some((e) => e.id === entry?.id);
  const canEdit = hasStarted && !isPaused && !solved;
  const message =
    feedback ||
    (state.status === "repair"
      ? t("맞는 글자는 그대로! 빈칸만 다시 골라봐요.")
      : state.status === "correct"
        ? t("단어 완성!")
        : solved
          ? t("이미 완성한 단어예요.")
          : t("타일을 눌러 빈칸을 채워봐요."));

  function select(id: string, cellKey = "") {
    const next = selectLetterEntry(puzzle, state, id, cellKey);
    onChange(next, "select");
    setCluesOpen(false);
  }
  function adjacent(delta: number) {
    const from = puzzle.entries.findIndex((e) => e.id === entry?.id);
    for (let i = 1; i <= puzzle.entries.length; i++) {
      const next =
        puzzle.entries[
          (from + i * delta + puzzle.entries.length * 2) % puzzle.entries.length
        ];
      if (!completed.some((e) => e.id === next.id)) {
        select(next.id);
        return;
      }
    }
  }
  return (
    <section
      className="tileGame"
      aria-label={t("오늘의 타일 퍼즐")}
      style={{ "--tile-text-scale": textScale } as CSSProperties}
    >
      <header className="tileNav">
        <button className="tileIcon" onClick={onBack} aria-label={t("홈으로")}>
          ‹
        </button>
        <h1>
          {t("오늘의 퍼즐")}{" "}
          <small className="tileCompactProgress">
            {completed.length}/{puzzle.entries.length}
          </small>
        </h1>
        {onPause ? (
          <button
            className="tileIcon tilePauseButton"
            onClick={onPause}
            aria-label={t("일시정지")}
          >
            Ⅱ
          </button>
        ) : null}
      </header>
      <div className="tileProgress">
        <span>
          <b>{completed.length}</b> / {puzzle.entries.length}
          {t("단어")}
          {timer ? ` · ${timer}` : ""}
        </span>
        <div className="tileProgressTrack">
          <i
            style={{
              width: `${(completed.length / Math.max(1, puzzle.entries.length)) * 100}%`,
            }}
          />
        </div>
        {guide ? (
          <button
            className="tileGuide"
            onClick={guide.onSkip}
            aria-label={t("첫 세 단어 안내 건너뛰기")}
          >
            {t("첫걸음")}
            {guide.completed}/{guide.total} <span aria-hidden="true">×</span>
          </button>
        ) : (
          <span aria-hidden="true">✓</span>
        )}
      </div>
      <div className="tileBoardWrap">
        <div
          className="tileBoard"
          style={{ "--tile-cols": puzzle.gridSize } as CSSProperties}
          aria-label={t("퍼즐판")}
        >
          {puzzle.grid.flatMap((row, y) =>
            row.map((value, x) => {
              const key = getCellKey(y, x),
                text = state.cellValues[key] ?? "";
              if (!value)
                return <span className="tileBoardCell tileBlock" key={key} />;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={isPaused}
                  className={[
                    "tileBoardCell",
                    selected.has(key) ? "tileSelected" : "",
                    locked.has(key) ? "tileConfirmed" : "",
                    state.progress.activeCellKey === key ? "tileCurrent" : "",
                  ].join(" ")}
                  aria-label={t(
                    "{0}행 {1}열{2}",
                    y + 1,
                    x + 1,
                    text ? `, ${text}` : "",
                  )}
                  onClick={() => {
                    const matches = cellEntries.get(key) ?? [];
                    const next =
                      matches.find((e) => e.id !== entry?.id) ?? matches[0];
                    if (next) select(next.id, key);
                  }}
                >
                  <small>{labels.get(key)}</small>
                  <span>{text}</span>
                </button>
              );
            }),
          )}
        </div>
      </div>
      <section className="tileClue">
        <div className="tileClueLabel">
          <b>{entry ? labels.get(getCellKey(entry.row, entry.col)) : ""}</b>
          <span>{entry?.direction === "across" ? t("가로") : t("세로")}</span>
          <span>
            {keys.length}
            {t("글자")}
          </span>
        </div>
        <p tabIndex={0}>{entry?.clue}</p>
      </section>
      <div className="tileAnswer" role="group" aria-label={t("현재 단어 답칸")}>
        {keys.map((key, i) => (
          <button
            type="button"
            key={key}
            disabled={!canEdit || locked.has(key)}
            className={[
              "tileAnswerCell",
              locked.has(key) ? "tileConfirmed" : "",
              state.progress.activeCellKey === key ? "tileCurrent" : "",
            ].join(" ")}
            aria-label={t(
              "{0}번째 글자 {1}{2}",
              i + 1,
              state.cellValues[key] || "비어 있음",
              locked.has(key) ? t(", 확정") : "",
            )}
            onClick={() =>
              onChange(clearLetterTile(puzzle, state, key), "clear")
            }
          >
            {state.cellValues[key]}
            {locked.has(key) ? <small aria-hidden="true">✓</small> : null}
          </button>
        ))}
      </div>
      <section className="tileTraySection">
        <div className="tileTrayHeading">
          <strong>
            <span aria-hidden="true">✦</span>
            {t("글자를 골라보세요")}
          </strong>
          <button onClick={() => setCluesOpen(true)}>
            {t("☷ 단서 목록")}
          </button>
        </div>
        <div
          className="tileTray"
          aria-label={t("글자 후보")}
          tabIndex={tiles.length > 10 ? 0 : undefined}
        >
          {tiles.map((tile) => (
            <button
              className={`tilePiece ${tile.used ? "tileUsed" : ""}`}
              key={tile.id}
              type="button"
              data-tile-id={tile.id}
              data-letter={tile.letter}
              disabled={!canEdit || tile.used}
              aria-label={t(
                "{0}{1}",
                tile.letter,
                tile.used ? t(", 사용함") : t(", 선택 가능"),
              )}
              onClick={() =>
                onChange(chooseLetterTile(puzzle, state, tile.id), "choice")
              }
            >
              {tile.letter}
              {tile.used ? <small aria-hidden="true">✓</small> : null}
            </button>
          ))}
        </div>
      </section>
      <p
        className={`tileFeedback ${state.status === "repair" ? "tileRepair" : ""}`}
        aria-live="polite"
      >
        {message}
      </p>
      <nav className="tileTools" aria-label={t("단서 이동과 수정")}>
        <button type="button" disabled={isPaused} onClick={() => adjacent(-1)}>
          {t("‹ 이전")}
        </button>
        <button
          className="tileUndo"
          type="button"
          disabled={
            !canEdit || !keys.some((k) => state.cellValues[k] && !locked.has(k))
          }
          onClick={() => onChange(clearLetterTile(puzzle, state), "clear")}
        >
          {t("⌫ 지우기")}
        </button>
        <button type="button" disabled={isPaused} onClick={() => adjacent(1)}>
          {t("다음 ›")}
        </button>
      </nav>
      {!hasStarted || isPaused ? (
        <div className="tilePause">
          <div>
            <h2>
              {isPaused ? t("잠시 쉬어가요") : t("오늘 한 판, 시작해볼까요?")}
            </h2>
            <button
              className="tilePrimary"
              onClick={isPaused ? onResume : onStart}
            >
              {isPaused ? t("이어서 풀기") : t("퍼즐 시작")}
            </button>
            <button onClick={onBack}>{t("홈으로")}</button>
          </div>
        </div>
      ) : null}
      {cluesOpen ? (
        <div className="tileSheetShade" onClick={() => setCluesOpen(false)}>
          <section
            className="tileClueSheet"
            role="dialog"
            aria-modal="true"
            aria-label={t("단서 목록")}
            onClick={(event) => event.stopPropagation()}
          >
            <h2>{t("원하는 단서를 골라보세요")}</h2>
            <div className="tileClueList">
              {puzzle.entries.map((e) => (
                <button key={e.id} onClick={() => select(e.id)}>
                  <b>{labels.get(getCellKey(e.row, e.col))}</b>
                  <span>{e.clue}</span>
                  <small>
                    {completed.some((c) => c.id === e.id)
                      ? "✓"
                      : t("{0} 글자", [...e.answer].length)}
                  </small>
                </button>
              ))}
            </div>
            <footer>
              <button
                onClick={() => {
                  setCluesOpen(false);
                  onSettings();
                }}
              >
                {t("설정")}
              </button>
              {guide ? (
                <button onClick={guide.onSkip}>
                  {t("첫걸음")}
                  {guide.completed}/{guide.total}
                  {t("건너뛰기")}
                </button>
              ) : null}
              <button onClick={() => setCluesOpen(false)}>{t("닫기")}</button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
