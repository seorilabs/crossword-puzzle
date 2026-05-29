import { Top } from "@toss/tds-mobile";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import {
  buildCellEntries,
  buildReviewEntries,
  buildStartLabels,
  completeMission,
  createDailyMissionState,
  getBounds,
  getCellKey,
  getCompletedEntries,
  getEntryAnswerValue,
  getEntryCells,
  getInitialEntryId,
  getRemainingAttempts,
  getTodayDateKey,
  startMissionAttempt,
  validatePuzzleSlots,
  type DailyMissionState,
  type Direction,
  type Puzzle,
  type PuzzleEntry,
  type PuzzleManifestItem,
  type PuzzleQualityCheck,
  type PuzzleSlotValidation,
  type ReviewEntry,
  type SavedProgress,
} from "../packages/crossword-core/src";
import { createLocalMissionRepository } from "./adapters/localMissionRepository";
import { createLocalProgressRepository } from "./adapters/localProgressRepository";
import { createStaticPuzzleRepository } from "./adapters/staticPuzzleRepository";
import { fallbackPuzzle } from "./data/fallbackPuzzle";

type AppRoute = "home" | "today" | "result" | "history" | "dev-simulator";

type LoadState = "fallback" | "remote";

type PuzzleViewModel = {
  bounds: ReturnType<typeof getBounds>;
  cellEntries: Map<string, PuzzleEntry[]>;
  clueEntries: PuzzleEntry[];
  completedEntries: PuzzleEntry[];
  cols: number[];
  isComplete: boolean;
  reviewEntries: ReviewEntry[];
  rows: number[];
  selectedAnswer: string;
  selectedCells: Set<string>;
  selectedEntry?: PuzzleEntry;
  slotValidation: PuzzleSlotValidation;
  startLabels: Map<string, number>;
};

type DateCardState = {
  attemptsUsed: number;
  completedAt?: string;
  hasProgress: boolean;
  hintCount: number;
};

type DateSelectionProps = {
  dateCardStates: Record<string, DateCardState>;
  puzzleSummaries: PuzzleManifestItem[];
  selectedDate: string;
  selectPuzzleDate: (date: string) => void;
};

type PuzzleSession = {
  nextPuzzle: Puzzle;
  savedMission: DailyMissionState;
  savedProgress: SavedProgress;
};

const DAILY_ATTEMPT_LIMIT = 3;

const puzzleRepository = createStaticPuzzleRepository();
const progressRepository = createLocalProgressRepository();
const missionRepository = createLocalMissionRepository();

const directionLabels: Record<Direction, string> = {
  across: "가로",
  down: "세로",
};

const qualityLabels: Record<string, string> = {
  maxAutoRunRatio: "자동 단어 비율",
  minBboxDensity: "밀도",
  minCrossRatio: "교차율",
  minMultiCrossRatio: "다중 교차율",
  minWordCount: "단어 수",
};

function getRouteFromPathname(pathname: string): AppRoute {
  if (pathname === "/today") {
    return "today";
  }

  if (pathname === "/result") {
    return "result";
  }

  if (pathname === "/history") {
    return "history";
  }

  if (pathname === "/dev/simulator" && import.meta.env.DEV) {
    return "dev-simulator";
  }

  return "home";
}

function getPathForRoute(route: AppRoute) {
  switch (route) {
    case "today":
      return "/today";
    case "result":
      return "/result";
    case "history":
      return "/history";
    case "dev-simulator":
      return "/dev/simulator";
    case "home":
      return "/";
  }
}

function formatRatio(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatQualityValue(check: PuzzleQualityCheck) {
  if (
    check.key.toLowerCase().includes("ratio") ||
    check.key.includes("Density")
  ) {
    return `${formatRatio(check.actual)} / ${formatRatio(check.expected)}`;
  }

  return `${check.actual} / ${check.expected}`;
}

function getProgressPercent(completedCount: number, totalCount: number) {
  if (totalCount === 0) {
    return 0;
  }

  return Math.round((completedCount / totalCount) * 100);
}

function createPuzzleSummary(puzzle: Puzzle): PuzzleManifestItem {
  return {
    date: puzzle.date,
    difficulty: puzzle.difficulty,
    metrics: puzzle.metrics,
    path: "",
    puzzleId: puzzle.puzzleId,
    quality: puzzle.quality,
  };
}

function getInitialPuzzleDate(
  puzzleSummaries: PuzzleManifestItem[],
  today: string,
) {
  return (
    puzzleSummaries.find((item) => item.date === today)?.date ??
    puzzleSummaries.find((item) => item.date <= today)?.date ??
    puzzleSummaries[puzzleSummaries.length - 1]?.date ??
    fallbackPuzzle.date
  );
}

function createDateCardState(
  mission: DailyMissionState,
  progress: SavedProgress,
): DateCardState {
  return {
    attemptsUsed: mission.attemptsUsed,
    completedAt: mission.completedAt,
    hasProgress:
      mission.attemptsUsed > 0 ||
      progress.hintCount > 0 ||
      Object.keys(progress.cellValues).length > 0,
    hintCount: progress.hintCount,
  };
}

function createInitialMission() {
  return createDailyMissionState(
    fallbackPuzzle.date,
    fallbackPuzzle.puzzleId,
    DAILY_ATTEMPT_LIMIT,
  );
}

function getEntryStartLabel(
  entry: PuzzleEntry,
  startLabels: Map<string, number>,
) {
  return startLabels.get(getCellKey(entry.row, entry.col));
}

function formatEntryReference(
  entry: PuzzleEntry,
  startLabels: Map<string, number>,
) {
  const startLabel = getEntryStartLabel(entry, startLabels);
  const prefix = startLabel == null ? "" : `${startLabel}번 `;

  return `${prefix}${directionLabels[entry.direction]} · ${entry.answer.length}글자`;
}

function App() {
  const [route, setRoute] = useState<AppRoute>(() =>
    getRouteFromPathname(window.location.pathname),
  );
  const [puzzle, setPuzzle] = useState<Puzzle>(fallbackPuzzle);
  const [cellValues, setCellValues] = useState<Record<string, string>>({});
  const [selectedDirection, setSelectedDirection] =
    useState<Direction>("across");
  const [selectedEntryId, setSelectedEntryId] = useState(
    getInitialEntryId(fallbackPuzzle),
  );
  const [loadState, setLoadState] = useState<LoadState>("fallback");
  const [hintCount, setHintCount] = useState(0);
  const [mission, setMission] =
    useState<DailyMissionState>(createInitialMission);
  const [puzzleSummaries, setPuzzleSummaries] = useState<PuzzleManifestItem[]>(
    () => [createPuzzleSummary(fallbackPuzzle)],
  );
  const [dateCardStates, setDateCardStates] = useState<
    Record<string, DateCardState>
  >({});

  useEffect(() => {
    function syncRoute() {
      setRoute(getRouteFromPathname(window.location.pathname));
    }

    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  const loadPuzzleSession = useCallback(async (date: string) => {
    const nextPuzzle = await puzzleRepository.getPuzzleForDate(date);

    if (nextPuzzle == null) {
      return null;
    }

    const [savedProgress, savedMission] = await Promise.all([
      progressRepository.loadProgress(nextPuzzle.puzzleId),
      missionRepository.loadMission(
        nextPuzzle.date,
        nextPuzzle.puzzleId,
        DAILY_ATTEMPT_LIMIT,
      ),
    ]);

    return {
      nextPuzzle,
      savedMission,
      savedProgress,
    } satisfies PuzzleSession;
  }, []);

  const applyPuzzleSession = useCallback((session: PuzzleSession | null) => {
    if (session == null) {
      return;
    }

    setPuzzle(session.nextPuzzle);
    setCellValues(session.savedProgress.cellValues);
    setHintCount(session.savedProgress.hintCount);
    setSelectedDirection("across");
    setSelectedEntryId(getInitialEntryId(session.nextPuzzle));
    setMission(session.savedMission);
    setDateCardStates((prev) => ({
      ...prev,
      [session.savedMission.date]: createDateCardState(
        session.savedMission,
        session.savedProgress,
      ),
    }));
  }, []);

  const loadDateCardStates = useCallback(
    async (
      summaries: PuzzleManifestItem[],
    ): Promise<Record<string, DateCardState>> => {
      const states = await Promise.all(
        summaries.map(async (summary) => {
          const [savedProgress, savedMission] = await Promise.all([
            progressRepository.loadProgress(summary.puzzleId),
            missionRepository.loadMission(
              summary.date,
              summary.puzzleId,
              DAILY_ATTEMPT_LIMIT,
            ),
          ]);

          return [
            summary.date,
            createDateCardState(savedMission, savedProgress),
          ] as const;
        }),
      );

      return Object.fromEntries(states);
    },
    [],
  );

  useEffect(() => {
    let isCancelled = false;

    async function loadPuzzlePack() {
      try {
        const loadedSummaries = await puzzleRepository.listPuzzleSummaries();
        const nextSummaries =
          loadedSummaries.length > 0
            ? loadedSummaries
            : [createPuzzleSummary(fallbackPuzzle)];
        const today = getTodayDateKey();
        const initialDate = getInitialPuzzleDate(nextSummaries, today);
        const [nextDateCardStates, session] = await Promise.all([
          loadDateCardStates(nextSummaries),
          loadPuzzleSession(initialDate),
        ]);

        if (!isCancelled) {
          setPuzzleSummaries(nextSummaries);
          setDateCardStates(nextDateCardStates);
          applyPuzzleSession(session);
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
  }, [applyPuzzleSession, loadDateCardStates, loadPuzzleSession]);

  const selectPuzzleDate = useCallback(
    async (date: string) => {
      try {
        const session = await loadPuzzleSession(date);
        applyPuzzleSession(session);
        setLoadState(session == null ? "fallback" : "remote");
      } catch {
        setLoadState("fallback");
      }
    },
    [applyPuzzleSession, loadPuzzleSession],
  );

  useEffect(() => {
    void progressRepository.saveProgress(puzzle.puzzleId, {
      cellValues,
      hintCount,
    });
  }, [cellValues, hintCount, puzzle.puzzleId]);

  useEffect(() => {
    setDateCardStates((prev) => ({
      ...prev,
      [mission.date]: createDateCardState(mission, { cellValues, hintCount }),
    }));
  }, [cellValues, hintCount, mission]);

  const viewModel = usePuzzleViewModel(
    puzzle,
    selectedEntryId,
    selectedDirection,
    cellValues,
  );
  const progressPercent = getProgressPercent(
    viewModel.completedEntries.length,
    puzzle.entries.length,
  );
  const remainingAttempts = getRemainingAttempts(mission);
  const hasProgress =
    Object.keys(cellValues).length > 0 ||
    hintCount > 0 ||
    viewModel.completedEntries.length > 0;
  const hasStarted = mission.attemptsUsed > 0 || hasProgress;
  const isCompleted = viewModel.isComplete || mission.completedAt != null;

  useEffect(() => {
    if (!viewModel.isComplete || mission.completedAt != null) {
      return;
    }

    const nextMission = completeMission(mission);
    setMission(nextMission);
    void missionRepository.saveMission(nextMission);

    if (route === "today") {
      navigate("result", { replace: true });
    }
  }, [mission, route, viewModel.isComplete]);

  function navigate(nextRoute: AppRoute, options: { replace?: boolean } = {}) {
    const path = getPathForRoute(nextRoute);
    if (window.location.pathname !== path) {
      if (options.replace) {
        window.history.replaceState(null, "", path);
      } else {
        window.history.pushState(null, "", path);
      }
    }

    setRoute(nextRoute);
  }

  function selectEntry(entry: PuzzleEntry) {
    setSelectedEntryId(entry.id);
    setSelectedDirection(entry.direction);
  }

  function selectCell(row: number, col: number) {
    const key = getCellKey(row, col);
    const entries = viewModel.cellEntries.get(key);
    const currentEntry = entries?.find(
      (entry) => entry.id === viewModel.selectedEntry?.id,
    );
    const nextEntry =
      currentEntry ??
      entries?.find((entry) => entry.direction === selectedDirection) ??
      entries?.[0];

    if (nextEntry != null) {
      selectEntry(nextEntry);
    }
  }

  function applyAnswer(entry: PuzzleEntry, value: string) {
    const nextLetters = [...value.replace(/\s/g, "")].slice(
      0,
      [...entry.answer].length,
    );
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
    const selectedEntry = viewModel.selectedEntry;
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
    setHintCount((prev) => prev + 1);
    setCellValues((prev) => ({
      ...prev,
      [getCellKey(targetCell.row, targetCell.col)]: answerLetters[targetIndex],
    }));
  }

  function revealSelected() {
    if (viewModel.selectedEntry != null) {
      applyAnswer(viewModel.selectedEntry, viewModel.selectedEntry.answer);
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

  function clearProgress() {
    setCellValues({});
    setHintCount(0);
    setSelectedDirection("across");
    setSelectedEntryId(getInitialEntryId(puzzle));
    void progressRepository.clearProgress(puzzle.puzzleId);
  }

  function startOrResumeMission() {
    if (isCompleted) {
      navigate("result");
      return;
    }

    if (!hasStarted) {
      if (remainingAttempts === 0) {
        return;
      }

      const nextMission = startMissionAttempt(mission);
      setMission(nextMission);
      void missionRepository.saveMission(nextMission);
    }

    navigate("today");
  }

  function restartMissionAttempt() {
    if (remainingAttempts === 0) {
      return;
    }

    clearProgress();
    const nextMission = startMissionAttempt(mission);
    setMission(nextMission);
    void missionRepository.saveMission(nextMission);
    navigate("today");
  }

  const commonScreenProps = {
    applyAnswer,
    cellValues,
    clueEntries: viewModel.clueEntries,
    completedEntries: viewModel.completedEntries,
    hintCount,
    mission,
    puzzle,
    remainingAttempts,
    revealLetter,
    selectedAnswer: viewModel.selectedAnswer,
    selectedDirection,
    selectedEntry: viewModel.selectedEntry,
    setSelectedDirection,
    selectCell,
    selectEntry,
    startLabels: viewModel.startLabels,
    viewModel,
  };
  const dateSelectionProps = {
    dateCardStates,
    puzzleSummaries,
    selectedDate: mission.date,
    selectPuzzleDate,
  };

  if (route === "dev-simulator") {
    return (
      <DevSimulatorScreen
        {...commonScreenProps}
        {...dateSelectionProps}
        clearProgress={clearProgress}
        hasStarted={hasStarted}
        isCompleted={isCompleted}
        loadState={loadState}
        navigate={navigate}
        revealAll={revealAll}
        revealSelected={revealSelected}
        restartMissionAttempt={restartMissionAttempt}
        startOrResumeMission={startOrResumeMission}
      />
    );
  }

  return (
    <main className="appShell">
      {route === "today" ? (
        <TodayScreen
          {...commonScreenProps}
          {...dateSelectionProps}
          hasStarted={hasStarted}
          isCompleted={isCompleted}
          navigate={navigate}
          restartMissionAttempt={restartMissionAttempt}
          startOrResumeMission={startOrResumeMission}
        />
      ) : route === "result" ? (
        <ResultScreen
          {...dateSelectionProps}
          hintCount={hintCount}
          mission={mission}
          navigate={navigate}
          progressPercent={progressPercent}
          puzzle={puzzle}
          remainingAttempts={remainingAttempts}
          restartMissionAttempt={restartMissionAttempt}
          completedEntries={viewModel.completedEntries}
        />
      ) : route === "history" ? (
        <HistoryScreen
          {...dateSelectionProps}
          completedEntries={viewModel.completedEntries}
          hintCount={hintCount}
          isCompleted={isCompleted}
          mission={mission}
          navigate={navigate}
          progressPercent={progressPercent}
          puzzle={puzzle}
          remainingAttempts={remainingAttempts}
          startOrResumeMission={startOrResumeMission}
        />
      ) : (
        <HomeScreen
          {...dateSelectionProps}
          completedEntries={viewModel.completedEntries}
          hasStarted={hasStarted}
          hintCount={hintCount}
          isCompleted={isCompleted}
          mission={mission}
          navigate={navigate}
          progressPercent={progressPercent}
          puzzle={puzzle}
          remainingAttempts={remainingAttempts}
          selectedEntry={viewModel.selectedEntry}
          startLabels={viewModel.startLabels}
          startOrResumeMission={startOrResumeMission}
        />
      )}
    </main>
  );
}

function usePuzzleViewModel(
  puzzle: Puzzle,
  selectedEntryId: string,
  selectedDirection: Direction,
  cellValues: Record<string, string>,
): PuzzleViewModel {
  const bounds = useMemo(() => getBounds(puzzle), [puzzle]);
  const selectedEntry = useMemo(
    () =>
      puzzle.entries.find((entry) => entry.id === selectedEntryId) ??
      puzzle.entries[0],
    [puzzle.entries, selectedEntryId],
  );
  const selectedCells = useMemo(
    () =>
      selectedEntry == null
        ? new Set<string>()
        : new Set(
            getEntryCells(selectedEntry).map((cell) =>
              getCellKey(cell.row, cell.col),
            ),
          ),
    [selectedEntry],
  );
  const cellEntries = useMemo(
    () => buildCellEntries(puzzle.entries),
    [puzzle.entries],
  );
  const startLabels = useMemo(
    () => buildStartLabels(puzzle.entries),
    [puzzle.entries],
  );
  const slotValidation = useMemo(() => validatePuzzleSlots(puzzle), [puzzle]);
  const completedEntries = useMemo(
    () => getCompletedEntries(puzzle.entries, cellValues),
    [cellValues, puzzle.entries],
  );
  const reviewEntries = useMemo(
    () => buildReviewEntries(puzzle.entries, cellEntries),
    [cellEntries, puzzle.entries],
  );
  const selectedAnswer = useMemo(() => {
    if (selectedEntry == null) {
      return "";
    }

    return getEntryAnswerValue(selectedEntry, cellValues);
  }, [cellValues, selectedEntry]);
  const rows = useMemo(
    () =>
      Array.from(
        { length: bounds.maxRow - bounds.minRow + 1 },
        (_, index) => bounds.minRow + index,
      ),
    [bounds.maxRow, bounds.minRow],
  );
  const cols = useMemo(
    () =>
      Array.from(
        { length: bounds.maxCol - bounds.minCol + 1 },
        (_, index) => bounds.minCol + index,
      ),
    [bounds.maxCol, bounds.minCol],
  );
  const clueEntries = useMemo(
    () =>
      puzzle.entries.filter((entry) => entry.direction === selectedDirection),
    [puzzle.entries, selectedDirection],
  );

  return {
    bounds,
    cellEntries,
    clueEntries,
    completedEntries,
    cols,
    isComplete: completedEntries.length === puzzle.entries.length,
    reviewEntries,
    rows,
    selectedAnswer,
    selectedCells,
    selectedEntry,
    slotValidation,
    startLabels,
  };
}

type HomeScreenProps = DateSelectionProps & {
  completedEntries: PuzzleEntry[];
  hasStarted: boolean;
  hintCount: number;
  isCompleted: boolean;
  mission: DailyMissionState;
  navigate: (route: AppRoute) => void;
  progressPercent: number;
  puzzle: Puzzle;
  remainingAttempts: number;
  selectedEntry?: PuzzleEntry;
  startLabels: Map<string, number>;
  startOrResumeMission: () => void;
};

function HomeScreen({
  completedEntries,
  dateCardStates,
  hasStarted,
  hintCount,
  isCompleted,
  mission,
  navigate,
  progressPercent,
  puzzle,
  puzzleSummaries,
  remainingAttempts,
  selectedEntry,
  selectedDate,
  selectPuzzleDate,
  startLabels,
  startOrResumeMission,
}: HomeScreenProps) {
  const primaryLabel = isCompleted
    ? "결과 보기"
    : hasStarted
      ? "이어 풀기"
      : remainingAttempts > 0
        ? "미션 시작"
        : "내일 다시";
  const isPrimaryDisabled =
    !isCompleted && !hasStarted && remainingAttempts === 0;

  return (
    <>
      <header className="appHeader homeHeader">
        <div>
          <span>{mission.date}</span>
          <h1>가로세로낱말퍼즐</h1>
        </div>
        <button
          className="ghostButton"
          type="button"
          onClick={() => navigate("history")}
        >
          기록
        </button>
      </header>

      <DateCarousel
        dateCardStates={dateCardStates}
        puzzleSummaries={puzzleSummaries}
        selectedDate={selectedDate}
        selectPuzzleDate={selectPuzzleDate}
      />

      <section className="todayMission" aria-label="선택한 미션">
        <div className="missionLead">
          <span>선택한 미션</span>
          <strong>{puzzle.entries.length}개 낱말</strong>
          <p>
            {isCompleted
              ? "완료"
              : hasStarted
                ? `${progressPercent}% 진행 중`
                : "도전 준비 완료"}
          </p>
        </div>

        <MiniPuzzlePreview puzzle={puzzle} />

        <div className="attemptStrip" aria-label="도전 상태">
          <div>
            <span>남은 도전</span>
            <strong>
              {remainingAttempts}/{mission.maxAttempts}
            </strong>
          </div>
          <div>
            <span>완료</span>
            <strong>
              {completedEntries.length}/{puzzle.entries.length}
            </strong>
          </div>
          <div>
            <span>힌트</span>
            <strong>{hintCount}</strong>
          </div>
        </div>

        <div
          className="progressTrack"
          aria-label={`진행률 ${progressPercent}%`}
        >
          <span style={{ width: `${progressPercent}%` }} />
        </div>

        <button
          className="primaryButton missionCta"
          type="button"
          disabled={isPrimaryDisabled}
          onClick={
            isCompleted ? () => navigate("result") : startOrResumeMission
          }
        >
          {primaryLabel}
        </button>
      </section>

      <button
        className="cluePeek"
        type="button"
        onClick={startOrResumeMission}
        disabled={isPrimaryDisabled}
      >
        <span>
          {selectedEntry == null
            ? "대표 단서"
            : formatEntryReference(selectedEntry, startLabels)}
        </span>
        <strong>{selectedEntry?.clue ?? "단서 준비 중"}</strong>
      </button>

      <section className="homeList" aria-label="진행 정보">
        <button
          type="button"
          onClick={() => navigate(isCompleted ? "result" : "today")}
        >
          <div>
            <strong>{isCompleted ? "미션 결과" : "퍼즐 풀이"}</strong>
            <span>
              {isCompleted ? "완료됨" : hasStarted ? "이어가기" : "시작 전"}
            </span>
          </div>
          <em>{isCompleted ? "보기" : "열기"}</em>
        </button>
        <button type="button" onClick={() => navigate("history")}>
          <div>
            <strong>미션 기록</strong>
            <span>{mission.attemptsUsed}번 도전</span>
          </div>
          <em>보기</em>
        </button>
      </section>
    </>
  );
}

function formatDateCardDay(date: string) {
  const [, month, day] = date.split("-");
  if (month == null || day == null) {
    return date;
  }

  return `${Number(month)}.${Number(day)}`;
}

function formatDateCardWeekday(date: string) {
  const value = new Date(`${date}T00:00:00`);
  if (Number.isNaN(value.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(value);
}

function getDateCardStatus(state?: DateCardState) {
  if (state?.completedAt != null) {
    return "완료";
  }

  if (state?.hasProgress) {
    return "진행";
  }

  return "대기";
}

function DateCarousel({
  dateCardStates,
  puzzleSummaries,
  selectedDate,
  selectPuzzleDate,
}: DateSelectionProps) {
  return (
    <section className="dateRail" aria-label="퍼즐 날짜 선택">
      <div className="dateScroller">
        {puzzleSummaries.map((summary) => {
          const state = dateCardStates[summary.date];
          const isSelected = summary.date === selectedDate;

          return (
            <button
              key={summary.puzzleId}
              className={[
                "dateCard",
                isSelected ? "dateSelected" : "",
                state?.completedAt != null ? "dateCompleted" : "",
              ].join(" ")}
              type="button"
              aria-pressed={isSelected}
              onClick={() => void selectPuzzleDate(summary.date)}
            >
              <span>{formatDateCardWeekday(summary.date)}</span>
              <strong>{formatDateCardDay(summary.date)}</strong>
              <em>
                {getDateCardStatus(state)} · {summary.metrics?.wordCount ?? "-"}
                개
              </em>
            </button>
          );
        })}
      </div>
    </section>
  );
}

type AppHeaderProps = {
  eyebrow?: string;
  title: string;
  onBack?: () => void;
  action?: {
    label: string;
    onClick: () => void;
  };
};

function AppHeader({ action, eyebrow, onBack, title }: AppHeaderProps) {
  return (
    <header className="appHeader screenHeader">
      {onBack == null ? null : (
        <button
          className="backButton"
          type="button"
          onClick={onBack}
          aria-label="뒤로"
        >
          ‹
        </button>
      )}
      <div>
        {eyebrow == null ? null : <span>{eyebrow}</span>}
        <h1>{title}</h1>
      </div>
      {action == null ? null : (
        <button className="ghostButton" type="button" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </header>
  );
}

type MiniPuzzlePreviewProps = {
  puzzle: Puzzle;
};

function MiniPuzzlePreview({ puzzle }: MiniPuzzlePreviewProps) {
  const previewRows = puzzle.grid.slice(0, 7);

  return (
    <div className="miniBoard" aria-hidden="true">
      {previewRows.flatMap((row, rowIndex) =>
        row
          .slice(0, 7)
          .map((cell, colIndex) => (
            <span
              key={`${rowIndex}:${colIndex}`}
              className={cell === "" ? "miniCell miniBlock" : "miniCell"}
            />
          )),
      )}
    </div>
  );
}

type TodayScreenProps = DateSelectionProps & {
  applyAnswer: (entry: PuzzleEntry, value: string) => void;
  cellValues: Record<string, string>;
  clueEntries: PuzzleEntry[];
  completedEntries: PuzzleEntry[];
  hasStarted: boolean;
  hintCount: number;
  isCompleted: boolean;
  mission: DailyMissionState;
  navigate: (route: AppRoute) => void;
  puzzle: Puzzle;
  remainingAttempts: number;
  restartMissionAttempt: () => void;
  revealLetter: () => void;
  selectedAnswer: string;
  selectedDirection: Direction;
  selectedEntry?: PuzzleEntry;
  startLabels: Map<string, number>;
  setSelectedDirection: (direction: Direction) => void;
  selectCell: (row: number, col: number) => void;
  selectEntry: (entry: PuzzleEntry) => void;
  startOrResumeMission: () => void;
  viewModel: PuzzleViewModel;
};

function TodayScreen({
  applyAnswer,
  cellValues,
  clueEntries,
  completedEntries,
  dateCardStates,
  hasStarted,
  hintCount,
  isCompleted,
  mission,
  navigate,
  puzzle,
  puzzleSummaries,
  remainingAttempts,
  restartMissionAttempt,
  revealLetter,
  selectedAnswer,
  selectedDate,
  selectedDirection,
  selectedEntry,
  selectPuzzleDate,
  startLabels,
  setSelectedDirection,
  selectCell,
  selectEntry,
  startOrResumeMission,
  viewModel,
}: TodayScreenProps) {
  const progressPercent = getProgressPercent(
    completedEntries.length,
    puzzle.entries.length,
  );

  if (!hasStarted && !isCompleted) {
    return (
      <>
        <AppHeader
          eyebrow={`남은 도전 ${remainingAttempts}/${mission.maxAttempts}`}
          title="퍼즐 풀기"
          onBack={() => navigate("home")}
        />
        <DateCarousel
          dateCardStates={dateCardStates}
          puzzleSummaries={puzzleSummaries}
          selectedDate={selectedDate}
          selectPuzzleDate={selectPuzzleDate}
        />
        <section className="startPanel" aria-label="미션 시작">
          <strong>도전 {mission.attemptsUsed + 1}</strong>
          <span>
            {puzzle.entries.length}개 단어 · 교차율{" "}
            {formatRatio(puzzle.metrics.crossRatio)}
          </span>
          <button
            className="primaryButton"
            type="button"
            disabled={remainingAttempts === 0}
            onClick={startOrResumeMission}
          >
            시작
          </button>
        </section>
      </>
    );
  }

  return (
    <>
      <AppHeader
        eyebrow={`도전 ${mission.attemptsUsed}/${mission.maxAttempts} · ${progressPercent}%`}
        title="퍼즐 풀기"
        onBack={() => navigate("home")}
        action={{ label: "기록", onClick: () => navigate("history") }}
      />

      <DateCarousel
        dateCardStates={dateCardStates}
        puzzleSummaries={puzzleSummaries}
        selectedDate={selectedDate}
        selectPuzzleDate={selectPuzzleDate}
      />

      <section className="missionCompact" aria-label="진행 상태">
        <div>
          <strong>
            {completedEntries.length}/{puzzle.entries.length}
          </strong>
          <span>완료</span>
        </div>
        <div>
          <strong>{hintCount}</strong>
          <span>힌트</span>
        </div>
        <div>
          <strong>{remainingAttempts}</strong>
          <span>남은 도전</span>
        </div>
      </section>

      <PuzzleBoard
        cellEntries={viewModel.cellEntries}
        cellValues={cellValues}
        cols={viewModel.cols}
        rows={viewModel.rows}
        selectedCells={viewModel.selectedCells}
        selectCell={selectCell}
        startLabels={viewModel.startLabels}
        puzzle={puzzle}
      />

      {selectedEntry != null ? (
        <section className="answerPanel">
          <div className="selectedClue">
            <span>{formatEntryReference(selectedEntry, startLabels)}</span>
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
          <div className="actionRow actionRowUser">
            <button className="toolButton" type="button" onClick={revealLetter}>
              힌트
            </button>
            <button
              className="toolButton"
              type="button"
              onClick={() => applyAnswer(selectedEntry, "")}
            >
              지우기
            </button>
            <button
              className="toolButton dangerButton"
              type="button"
              disabled={remainingAttempts === 0}
              onClick={restartMissionAttempt}
            >
              새 도전
            </button>
          </div>
        </section>
      ) : null}

      <ClueSection
        clueEntries={clueEntries}
        completedEntries={completedEntries}
        puzzle={puzzle}
        selectedDirection={selectedDirection}
        selectedEntry={selectedEntry}
        startLabels={startLabels}
        setSelectedDirection={setSelectedDirection}
        selectEntry={selectEntry}
      />
    </>
  );
}

type ResultScreenProps = DateSelectionProps & {
  completedEntries: PuzzleEntry[];
  hintCount: number;
  mission: DailyMissionState;
  navigate: (route: AppRoute) => void;
  progressPercent: number;
  puzzle: Puzzle;
  remainingAttempts: number;
  restartMissionAttempt: () => void;
};

function ResultScreen({
  completedEntries,
  dateCardStates,
  hintCount,
  mission,
  navigate,
  progressPercent,
  puzzle,
  puzzleSummaries,
  remainingAttempts,
  restartMissionAttempt,
  selectedDate,
  selectPuzzleDate,
}: ResultScreenProps) {
  const isComplete = completedEntries.length === puzzle.entries.length;

  return (
    <>
      <AppHeader
        eyebrow={`${mission.date} · 도전 ${mission.attemptsUsed}/${mission.maxAttempts}`}
        title="미션 결과"
        onBack={() => navigate("home")}
      />

      <DateCarousel
        dateCardStates={dateCardStates}
        puzzleSummaries={puzzleSummaries}
        selectedDate={selectedDate}
        selectPuzzleDate={selectPuzzleDate}
      />

      <section className="resultPanel" aria-label="미션 결과">
        <strong>{isComplete ? "완료" : `${progressPercent}% 진행`}</strong>
        <span>
          {completedEntries.length}/{puzzle.entries.length} 단어 · 힌트{" "}
          {hintCount}회 · 남은 도전 {remainingAttempts}
        </span>
      </section>

      <section className="resultActions" aria-label="결과 메뉴">
        <button
          className="primaryButton"
          type="button"
          onClick={() => navigate("home")}
        >
          홈으로
        </button>
        <button
          className="secondaryButton"
          type="button"
          disabled={isComplete || remainingAttempts === 0}
          onClick={restartMissionAttempt}
        >
          다시 도전
        </button>
      </section>
    </>
  );
}

type HistoryScreenProps = DateSelectionProps & {
  completedEntries: PuzzleEntry[];
  hintCount: number;
  isCompleted: boolean;
  mission: DailyMissionState;
  navigate: (route: AppRoute) => void;
  progressPercent: number;
  puzzle: Puzzle;
  remainingAttempts: number;
  startOrResumeMission: () => void;
};

function HistoryScreen({
  completedEntries,
  dateCardStates,
  hintCount,
  isCompleted,
  mission,
  navigate,
  progressPercent,
  puzzle,
  puzzleSummaries,
  remainingAttempts,
  selectedDate,
  selectPuzzleDate,
  startOrResumeMission,
}: HistoryScreenProps) {
  return (
    <>
      <AppHeader
        eyebrow={`${mission.date} · ${isCompleted ? "완료" : `${progressPercent}%`}`}
        title="기록"
        onBack={() => navigate("home")}
      />

      <DateCarousel
        dateCardStates={dateCardStates}
        puzzleSummaries={puzzleSummaries}
        selectedDate={selectedDate}
        selectPuzzleDate={selectPuzzleDate}
      />

      <section className="historyList" aria-label="미션 기록">
        <button
          className="historyItem"
          type="button"
          onClick={
            isCompleted ? () => navigate("result") : startOrResumeMission
          }
        >
          <span>{mission.date}</span>
          <strong>{isCompleted ? "완료" : "진행 중"}</strong>
          <em>
            {completedEntries.length}/{puzzle.entries.length} 단어 · 힌트{" "}
            {hintCount}회 · 남은 도전 {remainingAttempts}
          </em>
        </button>
      </section>
    </>
  );
}

type DevSimulatorScreenProps = TodayScreenProps & {
  clearProgress: () => void;
  loadState: LoadState;
  revealAll: () => void;
  revealSelected: () => void;
};

function DevSimulatorScreen({
  applyAnswer,
  cellValues,
  clearProgress,
  clueEntries,
  completedEntries,
  hintCount,
  loadState,
  puzzle,
  revealAll,
  revealLetter,
  revealSelected,
  selectedAnswer,
  selectedDirection,
  selectedEntry,
  startLabels,
  setSelectedDirection,
  selectCell,
  selectEntry,
  viewModel,
}: DevSimulatorScreenProps) {
  return (
    <main className="appShell">
      <Top
        title={
          <Top.TitleParagraph size={22}>개발 시뮬레이터</Top.TitleParagraph>
        }
        subtitleBottom={
          <Top.SubtitleParagraph size={15}>
            {puzzle.date} · {loadState === "remote" ? "원격 pack" : "fallback"}{" "}
            · 교차율 {Math.round(puzzle.metrics.crossRatio * 100)}%
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

      <section className="reviewPanel" aria-label="퍼즐 검수">
        <div className="qualitySummary">
          <strong>
            {puzzle.quality?.pass ? "품질 통과" : "품질 확인 필요"}
          </strong>
          <span>
            다중 교차 {puzzle.metrics.multiCrossEntries}/
            {puzzle.metrics.wordCount} · 자동 {puzzle.metrics.autoRunCount}/
            {puzzle.metrics.wordCount} · 힌트 {hintCount}회
          </span>
        </div>

        {puzzle.quality != null ? (
          <div className="qualityGrid">
            {puzzle.quality.checks.map((check) => (
              <div key={check.key} className="qualityItem">
                <span>{qualityLabels[check.key] ?? check.key}</span>
                <strong className={check.pass ? "qualityPass" : "qualityFail"}>
                  {check.pass ? "통과" : "미달"}
                </strong>
                <em>{formatQualityValue(check)}</em>
              </div>
            ))}
          </div>
        ) : (
          <p className="reviewNote">
            fallback puzzle에는 batch 품질 게이트 결과가 없습니다.
          </p>
        )}

        <SlotValidationSummary validation={viewModel.slotValidation} />

        <div className="reviewList">
          {viewModel.reviewEntries.map((entry, index) => (
            <button
              key={entry.id}
              className={[
                "reviewItem",
                entry.id === selectedEntry?.id ? "reviewSelected" : "",
              ].join(" ")}
              type="button"
              onClick={() => selectEntry(entry)}
            >
              <span className="reviewIndex">
                {getEntryStartLabel(entry, startLabels) ?? index + 1}
              </span>
              <span className="reviewWord">{entry.answer}</span>
              <span className="reviewMeta">
                {directionLabels[entry.direction]} ·{" "}
                {entry.generatedBy === "auto" ? "자동" : "배치"} · 교차{" "}
                {entry.crossPoints.length}
              </span>
              <span className="reviewCoords">
                {entry.crossPoints.length === 0
                  ? "-"
                  : entry.crossPoints.join(" ")}
                {entry.needsManualClue ? " · 힌트 재작성 필요" : ""}
              </span>
            </button>
          ))}
        </div>
      </section>

      <PuzzleBoard
        cellEntries={viewModel.cellEntries}
        cellValues={cellValues}
        cols={viewModel.cols}
        rows={viewModel.rows}
        selectedCells={viewModel.selectedCells}
        selectCell={selectCell}
        startLabels={viewModel.startLabels}
        puzzle={puzzle}
      />

      {selectedEntry != null ? (
        <section className="answerPanel">
          <div className="selectedClue">
            <span>{formatEntryReference(selectedEntry, startLabels)}</span>
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
            <button
              className="toolButton"
              type="button"
              onClick={revealSelected}
            >
              선택 정답
            </button>
            <button
              className="toolButton"
              type="button"
              onClick={clearProgress}
            >
              초기화
            </button>
          </div>
        </section>
      ) : null}

      <ClueSection
        clueEntries={clueEntries}
        completedEntries={completedEntries}
        puzzle={puzzle}
        selectedDirection={selectedDirection}
        selectedEntry={selectedEntry}
        startLabels={startLabels}
        setSelectedDirection={setSelectedDirection}
        selectEntry={selectEntry}
      />

      <div className="bottomAction">
        <button className="primaryButton" type="button" onClick={revealAll}>
          전체 정답 보기
        </button>
      </div>
    </main>
  );
}

type SlotValidationSummaryProps = {
  validation: PuzzleSlotValidation;
};

function SlotValidationSummary({ validation }: SlotValidationSummaryProps) {
  const issueCount =
    validation.missingEntries.length +
    validation.entryWithoutSlots.length +
    validation.answerMismatches.length +
    validation.duplicateEntries.length;

  return (
    <div
      className={[
        "slotValidation",
        validation.pass ? "slotValidationPass" : "slotValidationFail",
      ].join(" ")}
    >
      <strong>{validation.pass ? "슬롯 검증 통과" : "슬롯 검증 필요"}</strong>
      <span>
        전체 {validation.slots.length}개 · 미등록{" "}
        {validation.missingEntries.length} · 불일치{" "}
        {validation.answerMismatches.length} · 초과{" "}
        {validation.entryWithoutSlots.length} · 중복{" "}
        {validation.duplicateEntries.length}
      </span>

      {issueCount === 0 ? null : (
        <div className="slotIssueList">
          {validation.missingEntries.slice(0, 3).map((slot) => (
            <em key={`missing:${slot.direction}:${slot.row}:${slot.col}`}>
              미등록 {directionLabels[slot.direction]} {slot.answer}
            </em>
          ))}
          {validation.answerMismatches.slice(0, 3).map(({ entry, slot }) => (
            <em key={`mismatch:${entry.id}`}>
              불일치 {entry.id}: {entry.answer} / 격자 {slot.answer}
            </em>
          ))}
        </div>
      )}
    </div>
  );
}

type PuzzleBoardProps = {
  cellEntries: Map<string, PuzzleEntry[]>;
  cellValues: Record<string, string>;
  cols: number[];
  puzzle: Puzzle;
  rows: number[];
  selectedCells: Set<string>;
  selectCell: (row: number, col: number) => void;
  startLabels: Map<string, number>;
};

function PuzzleBoard({
  cellEntries,
  cellValues,
  cols,
  puzzle,
  rows,
  selectedCells,
  selectCell,
  startLabels,
}: PuzzleBoardProps) {
  return (
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
  );
}

type ClueSectionProps = {
  clueEntries: PuzzleEntry[];
  completedEntries: PuzzleEntry[];
  puzzle: Puzzle;
  selectedDirection: Direction;
  selectedEntry?: PuzzleEntry;
  startLabels: Map<string, number>;
  setSelectedDirection: (direction: Direction) => void;
  selectEntry: (entry: PuzzleEntry) => void;
};

function ClueSection({
  clueEntries,
  completedEntries,
  puzzle,
  selectedDirection,
  selectedEntry,
  startLabels,
  setSelectedDirection,
  selectEntry,
}: ClueSectionProps) {
  return (
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
          const isComplete = completedEntries.some(
            (completed) => completed.id === entry.id,
          );
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
                {getEntryStartLabel(entry, startLabels) ??
                  puzzle.entries.findIndex(
                    (candidate) => candidate.id === entry.id,
                  ) + 1}
              </span>
              <span className="clueText">{entry.clue}</span>
              <span className="clueMeta">
                {entry.answer.length}자{isComplete ? " · 완료" : ""}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default App;
