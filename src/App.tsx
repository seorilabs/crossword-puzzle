import { Top } from "@toss/tds-mobile";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { fallbackPuzzle, type Puzzle, type PuzzleEntry } from "./data/fallbackPuzzle";

type Direction = PuzzleEntry["direction"];

type Manifest = {
  puzzles: Array<{
    date: string;
    path: string;
    puzzleId: string;
  }>;
};

type Bounds = {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
};

const directionLabels: Record<Direction, string> = {
  across: "가로",
  down: "세로",
};

function getCellKey(row: number, col: number) {
  return `${row}:${col}`;
}

function getTodayKst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function getEntryCells(entry: PuzzleEntry) {
  return [...entry.answer].map((_, index) => ({
    row: entry.direction === "across" ? entry.row : entry.row + index,
    col: entry.direction === "across" ? entry.col + index : entry.col,
  }));
}

function getBounds(puzzle: Puzzle): Bounds {
  const occupiedCells = puzzle.grid.flatMap((row, rowIndex) =>
    row.flatMap((cell, colIndex) =>
      cell === "" ? [] : [{ row: rowIndex, col: colIndex }],
    ),
  );

  return {
    minRow: Math.min(...occupiedCells.map((cell) => cell.row)),
    maxRow: Math.max(...occupiedCells.map((cell) => cell.row)),
    minCol: Math.min(...occupiedCells.map((cell) => cell.col)),
    maxCol: Math.max(...occupiedCells.map((cell) => cell.col)),
  };
}

function getInitialEntryId(puzzle: Puzzle) {
  return puzzle.entries[0]?.id ?? "";
}

function App() {
  const [puzzle, setPuzzle] = useState<Puzzle>(fallbackPuzzle);
  const [cellValues, setCellValues] = useState<Record<string, string>>({});
  const [selectedDirection, setSelectedDirection] = useState<Direction>("across");
  const [selectedEntryId, setSelectedEntryId] = useState(getInitialEntryId(fallbackPuzzle));
  const [loadState, setLoadState] = useState<"fallback" | "remote">("fallback");

  useEffect(() => {
    let isCancelled = false;

    async function loadPuzzlePack() {
      try {
        const manifestResponse = await fetch("/puzzles/manifest.json");
        const manifest = (await manifestResponse.json()) as Manifest;
        const today = getTodayKst();
        const selectedPuzzle =
          manifest.puzzles.find((item) => item.date === today) ?? manifest.puzzles[0];

        if (selectedPuzzle == null) {
          return;
        }

        const puzzleResponse = await fetch(selectedPuzzle.path);
        const nextPuzzle = (await puzzleResponse.json()) as Puzzle;

        if (!isCancelled) {
          setPuzzle(nextPuzzle);
          setCellValues({});
          setSelectedDirection("across");
          setSelectedEntryId(getInitialEntryId(nextPuzzle));
          setLoadState("remote");
        }
      } catch {
        if (!isCancelled) {
          setLoadState("fallback");
        }
      }
    }

    loadPuzzlePack();

    return () => {
      isCancelled = true;
    };
  }, []);

  const bounds = useMemo(() => getBounds(puzzle), [puzzle]);
  const selectedEntry = useMemo(
    () => puzzle.entries.find((entry) => entry.id === selectedEntryId) ?? puzzle.entries[0],
    [puzzle.entries, selectedEntryId],
  );
  const selectedCells = useMemo(
    () => (selectedEntry == null ? new Set<string>() : new Set(getEntryCells(selectedEntry).map((cell) => getCellKey(cell.row, cell.col)))),
    [selectedEntry],
  );
  const cellEntries = useMemo(() => {
    const entriesByCell = new Map<string, PuzzleEntry[]>();

    for (const entry of puzzle.entries) {
      for (const cell of getEntryCells(entry)) {
        const key = getCellKey(cell.row, cell.col);
        entriesByCell.set(key, [...(entriesByCell.get(key) ?? []), entry]);
      }
    }

    return entriesByCell;
  }, [puzzle.entries]);
  const startLabels = useMemo(() => {
    const labels = new Map<string, number>();

    puzzle.entries.forEach((entry, index) => {
      const key = getCellKey(entry.row, entry.col);
      if (!labels.has(key)) {
        labels.set(key, index + 1);
      }
    });

    return labels;
  }, [puzzle.entries]);
  const completedEntries = useMemo(
    () =>
      puzzle.entries.filter((entry) =>
        getEntryCells(entry).every((cell, index) => {
          const answerLetter = [...entry.answer][index];
          return cellValues[getCellKey(cell.row, cell.col)] === answerLetter;
        }),
      ),
    [cellValues, puzzle.entries],
  );
  const selectedAnswer = useMemo(() => {
    if (selectedEntry == null) {
      return "";
    }

    return getEntryCells(selectedEntry)
      .map((cell) => cellValues[getCellKey(cell.row, cell.col)] ?? "")
      .join("");
  }, [cellValues, selectedEntry]);

  const rows = Array.from(
    { length: bounds.maxRow - bounds.minRow + 1 },
    (_, index) => bounds.minRow + index,
  );
  const cols = Array.from(
    { length: bounds.maxCol - bounds.minCol + 1 },
    (_, index) => bounds.minCol + index,
  );
  const clueEntries = puzzle.entries.filter((entry) => entry.direction === selectedDirection);

  function selectEntry(entry: PuzzleEntry) {
    setSelectedEntryId(entry.id);
    setSelectedDirection(entry.direction);
  }

  function selectCell(row: number, col: number) {
    const key = getCellKey(row, col);
    const entries = cellEntries.get(key);
    const currentEntry = entries?.find((entry) => entry.id === selectedEntry?.id);
    const nextEntry =
      currentEntry ??
      entries?.find((entry) => entry.direction === selectedDirection) ??
      entries?.[0];

    if (nextEntry != null) {
      selectEntry(nextEntry);
    }
  }

  function applyAnswer(entry: PuzzleEntry, value: string) {
    const nextLetters = [...value.replace(/\s/g, "")].slice(0, [...entry.answer].length);
    const cells = getEntryCells(entry);

    setCellValues((prev) => {
      const next = { ...prev };
      cells.forEach((cell, index) => {
        const key = getCellKey(cell.row, cell.col);
        const nextLetter = nextLetters[index];

        if (nextLetter == null) {
          delete next[key];
        } else {
          next[key] = nextLetter;
        }
      });
      return next;
    });
  }

  function revealLetter() {
    if (selectedEntry == null) {
      return;
    }

    const cells = getEntryCells(selectedEntry);
    const answerLetters = [...selectedEntry.answer];
    const targetIndex = cells.findIndex(
      (cell, index) =>
        cellValues[getCellKey(cell.row, cell.col)] !== answerLetters[index],
    );

    if (targetIndex === -1) {
      return;
    }

    const targetCell = cells[targetIndex];
    setCellValues((prev) => ({
      ...prev,
      [getCellKey(targetCell.row, targetCell.col)]: answerLetters[targetIndex],
    }));
  }

  function revealSelected() {
    if (selectedEntry != null) {
      applyAnswer(selectedEntry, selectedEntry.answer);
    }
  }

  function revealAll() {
    const nextValues: Record<string, string> = {};

    for (const entry of puzzle.entries) {
      getEntryCells(entry).forEach((cell, index) => {
        nextValues[getCellKey(cell.row, cell.col)] = [...entry.answer][index];
      });
    }

    setCellValues(nextValues);
  }

  function resetPuzzle() {
    setCellValues({});
  }

  return (
    <main className="appShell">
      <Top
        title={<Top.TitleParagraph size={24}>가로세로낱말퍼즐</Top.TitleParagraph>}
        subtitleBottom={
          <Top.SubtitleParagraph size={15}>
            {puzzle.date} · {loadState === "remote" ? "서버 pack" : "fallback"} · 교차율{" "}
            {Math.round(puzzle.metrics.crossRatio * 100)}%
          </Top.SubtitleParagraph>
        }
      />

      <section className="metricsBar" aria-label="퍼즐 품질 지표">
        <div>
          <strong>{puzzle.metrics.wordCount}</strong>
          <span>단어</span>
        </div>
        <div>
          <strong>{puzzle.metrics.autoRunCount}</strong>
          <span>자동</span>
        </div>
        <div>
          <strong>{Math.round(puzzle.metrics.bboxDensity * 100)}%</strong>
          <span>밀도</span>
        </div>
        <div>
          <strong>
            {completedEntries.length}/{puzzle.entries.length}
          </strong>
          <span>완료</span>
        </div>
      </section>

      <section
        className="puzzleBoard"
        style={{ "--board-cols": cols.length } as CSSProperties}
        aria-label="가로세로 퍼즐판"
      >
        {rows.flatMap((row) =>
          cols.map((col) => {
            const answer = puzzle.grid[row]?.[col] ?? "";
            const key = getCellKey(row, col);
            const entries = cellEntries.get(key) ?? [];
            const isFilled = cellValues[key] != null;
            const isSelected = selectedCells.has(key);
            const isCross = entries.length > 1;

            if (answer === "") {
              return <div key={key} className="cell cellBlock" />;
            }

            return (
              <button
                key={key}
                className={[
                  "cell",
                  isSelected ? "cellSelected" : "",
                  isCross ? "cellCross" : "",
                  isFilled ? "cellFilled" : "",
                ].join(" ")}
                type="button"
                onClick={() => selectCell(row, col)}
                aria-label={`${row + 1}행 ${col + 1}열`}
              >
                <span className="cellNumber">{startLabels.get(key) ?? ""}</span>
                <span className="cellLetter">{cellValues[key] ?? ""}</span>
              </button>
            );
          }),
        )}
      </section>

      {selectedEntry != null ? (
        <section className="answerPanel">
          <div className="selectedClue">
            <span>
              {directionLabels[selectedEntry.direction]} · {selectedEntry.answer.length}글자
            </span>
            <strong>{selectedEntry.clue}</strong>
          </div>
          <input
            className="answerInput"
            inputMode="text"
            maxLength={selectedEntry.answer.length}
            placeholder={`${selectedEntry.answer.length}글자 입력`}
            value={selectedAnswer}
            onChange={(event) => applyAnswer(selectedEntry, event.target.value)}
          />
          <div className="actionRow">
            <button className="toolButton" type="button" onClick={revealLetter}>
              힌트 글자
            </button>
            <button className="toolButton" type="button" onClick={revealSelected}>
              선택 정답
            </button>
            <button className="toolButton" type="button" onClick={resetPuzzle}>
              초기화
            </button>
          </div>
        </section>
      ) : null}

      <section className="clueSection">
        <div className="segmentedControl" role="tablist" aria-label="힌트 방향">
          {(["across", "down"] as Direction[]).map((direction) => (
            <button
              key={direction}
              className={selectedDirection === direction ? "segmentActive" : ""}
              type="button"
              onClick={() => setSelectedDirection(direction)}
            >
              {directionLabels[direction]}
            </button>
          ))}
        </div>

        <div className="clueList">
          {clueEntries.map((entry) => {
            const isComplete = completedEntries.some((completed) => completed.id === entry.id);
            return (
              <button
                key={entry.id}
                className={[
                  "clueItem",
                  entry.id === selectedEntry?.id ? "clueSelected" : "",
                ].join(" ")}
                type="button"
                onClick={() => selectEntry(entry)}
              >
                <span className="clueIndex">
                  {puzzle.entries.findIndex((candidate) => candidate.id === entry.id) + 1}
                </span>
                <span className="clueText">{entry.clue}</span>
                <span className="clueMeta">
                  {entry.generatedBy === "auto" ? "자동" : `${entry.answer.length}자`}
                  {isComplete ? " · 완료" : ""}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="bottomAction">
        <button className="primaryButton" type="button" onClick={revealAll}>
          전체 정답 보기
        </button>
      </div>
    </main>
  );
}

export default App;
