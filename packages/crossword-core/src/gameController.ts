import type { GameContentV1 } from "./gameContent.ts";
import type { LanguageProfile } from "./languageProfile.ts";
import {
  getCellKey,
  getEntryAnswerCells,
  getEntryCells,
  getNextFocusEntryAfterCompletion,
} from "./puzzle.ts";
import type { PuzzleEntry } from "./types.ts";

export type GamePhase =
  | "loading"
  | "intro"
  | "active"
  | "composing"
  | "word-resolved"
  | "board-resolved"
  | "result"
  | "map"
  | "suspended"
  | "recovery";

export type GameSnapshot = Readonly<{
  phase: GamePhase;
  suspendedFrom: GamePhase | null;
  puzzleId: string;
  contentLocale: string;
  contentChecksum: string;
  languageProfileId: string;
  languageProfileVersion: number;
  selectedEntryId: string | null;
  cellValues: Readonly<Record<string, string>>;
  completedEntryIds: readonly string[];
  lastResolvedEntryIds: readonly string[];
  commandSequence: number;
  lastError: GameCommandError | null;
}>;

export type GameCommandError =
  | "entry-not-found"
  | "input-conflicts-with-completed-word"
  | "input-not-allowed"
  | "invalid-committed-cell"
  | "invalid-transition";

export type GameCommand =
  | { type: "intro.complete" }
  | { type: "entry.select"; entryId: string }
  | { type: "composition.start" }
  | { type: "composition.cancel" }
  | { type: "input.commit"; entryId: string; cells: readonly string[] }
  | { type: "resolution.complete" }
  | { type: "board.presentation.complete" }
  | { type: "result.continue" }
  | { type: "app.suspend" }
  | { type: "app.resume" }
  | {
      type: "recovery.restore";
      cellValues: Readonly<Record<string, string>>;
      selectedEntryId?: string | null;
      commandSequence: number;
    }
  | { type: "recovery.fail" };

export type GameDomainEvent =
  | { type: "game.intro.completed"; commandSequence: number }
  | { type: "game.entry.selected"; entryId: string; commandSequence: number }
  | { type: "game.composition.started"; commandSequence: number }
  | { type: "game.composition.cancelled"; commandSequence: number }
  | {
      type: "game.input.committed";
      entryId: string;
      committedCellCount: number;
      commandSequence: number;
    }
  | {
      type: "game.word.resolved";
      entryIds: readonly string[];
      commandSequence: number;
    }
  | { type: "game.board.resolved"; commandSequence: number }
  | { type: "game.result.opened"; commandSequence: number }
  | { type: "game.map.opened"; commandSequence: number }
  | { type: "game.suspended"; commandSequence: number }
  | { type: "game.resumed"; commandSequence: number }
  | { type: "game.recovered"; commandSequence: number }
  | {
      type: "game.command.rejected";
      command: GameCommand["type"];
      reason: GameCommandError;
      commandSequence: number;
    };

export type GameDispatchResult = {
  snapshot: GameSnapshot;
  events: readonly GameDomainEvent[];
};

export type GameControllerSubscriber = (
  snapshot: GameSnapshot,
  events: readonly GameDomainEvent[],
) => void;

type MutableGameSnapshot = {
  -readonly [Key in keyof GameSnapshot]: GameSnapshot[Key] extends readonly (
    infer Item
  )[]
    ? Item[]
    : GameSnapshot[Key] extends Readonly<Record<string, string>>
      ? Record<string, string>
      : GameSnapshot[Key];
};

function freezeSnapshot(snapshot: MutableGameSnapshot): GameSnapshot {
  return Object.freeze({
    ...snapshot,
    cellValues: Object.freeze({ ...snapshot.cellValues }),
    completedEntryIds: Object.freeze([...snapshot.completedEntryIds]),
    lastResolvedEntryIds: Object.freeze([...snapshot.lastResolvedEntryIds]),
  });
}

function getCompletedEntryIds(
  entries: readonly PuzzleEntry[],
  cellValues: Readonly<Record<string, string>>,
  profile: LanguageProfile,
): string[] {
  return entries
    .filter((entry) => {
      const answerCells = getEntryAnswerCells(entry);
      return getEntryCells(entry).every((cell, index) => {
        const value = cellValues[getCellKey(cell.row, cell.col)];
        const answerCell = answerCells[index];
        return (
          value != null &&
          answerCell != null &&
          profile.cellsEqual(value, answerCell)
        );
      });
    })
    .map((entry) => entry.id);
}

function rejectCommand(
  snapshot: GameSnapshot,
  command: GameCommand,
  reason: GameCommandError,
): GameDispatchResult {
  const next = freezeSnapshot({
    ...snapshot,
    cellValues: { ...snapshot.cellValues },
    completedEntryIds: [...snapshot.completedEntryIds],
    lastResolvedEntryIds: [...snapshot.lastResolvedEntryIds],
    lastError: reason,
  });

  return {
    snapshot: next,
    events: Object.freeze([
      {
        type: "game.command.rejected",
        command: command.type,
        reason,
        commandSequence: snapshot.commandSequence,
      },
    ]),
  };
}

function commandSnapshot(
  snapshot: GameSnapshot,
  patch: Partial<MutableGameSnapshot>,
): MutableGameSnapshot {
  return {
    ...snapshot,
    cellValues: { ...snapshot.cellValues },
    completedEntryIds: [...snapshot.completedEntryIds],
    lastResolvedEntryIds: [...snapshot.lastResolvedEntryIds],
    ...patch,
    commandSequence: snapshot.commandSequence + 1,
    lastError: null,
  };
}

function isInputPhase(phase: GamePhase) {
  return phase === "active" || phase === "composing";
}

function buildLockedCellValues(
  content: GameContentV1,
  completedEntryIds: readonly string[],
  cellValues: Readonly<Record<string, string>>,
): Map<string, string> {
  const completed = new Set(completedEntryIds);
  const locked = new Map<string, string>();

  for (const entry of content.entries) {
    if (!completed.has(entry.id)) {
      continue;
    }
    for (const cell of getEntryCells(entry)) {
      const key = getCellKey(cell.row, cell.col);
      const value = cellValues[key];
      if (value != null) {
        locked.set(key, value);
      }
    }
  }

  return locked;
}

function reduceGameCommand(
  snapshot: GameSnapshot,
  command: GameCommand,
  content: GameContentV1,
  profile: LanguageProfile,
): GameDispatchResult {
  const events: GameDomainEvent[] = [];

  if (command.type === "intro.complete") {
    if (snapshot.phase !== "intro") {
      return rejectCommand(snapshot, command, "invalid-transition");
    }
    const next = freezeSnapshot(commandSnapshot(snapshot, { phase: "active" }));
    events.push({
      type: "game.intro.completed",
      commandSequence: next.commandSequence,
    });
    return { snapshot: next, events: Object.freeze(events) };
  }

  if (command.type === "entry.select") {
    if (
      snapshot.phase !== "active" &&
      snapshot.phase !== "composing" &&
      snapshot.phase !== "word-resolved"
    ) {
      return rejectCommand(snapshot, command, "invalid-transition");
    }
    if (!content.entries.some((entry) => entry.id === command.entryId)) {
      return rejectCommand(snapshot, command, "entry-not-found");
    }
    const next = freezeSnapshot(
      commandSnapshot(snapshot, {
        phase: "active",
        selectedEntryId: command.entryId,
        lastResolvedEntryIds: [],
      }),
    );
    events.push({
      type: "game.entry.selected",
      entryId: command.entryId,
      commandSequence: next.commandSequence,
    });
    return { snapshot: next, events: Object.freeze(events) };
  }

  if (command.type === "composition.start") {
    if (snapshot.phase !== "active") {
      return rejectCommand(snapshot, command, "invalid-transition");
    }
    const next = freezeSnapshot(
      commandSnapshot(snapshot, { phase: "composing" }),
    );
    events.push({
      type: "game.composition.started",
      commandSequence: next.commandSequence,
    });
    return { snapshot: next, events: Object.freeze(events) };
  }

  if (command.type === "composition.cancel") {
    if (snapshot.phase !== "composing") {
      return rejectCommand(snapshot, command, "invalid-transition");
    }
    const next = freezeSnapshot(
      commandSnapshot(snapshot, { phase: "active" }),
    );
    events.push({
      type: "game.composition.cancelled",
      commandSequence: next.commandSequence,
    });
    return { snapshot: next, events: Object.freeze(events) };
  }

  if (command.type === "input.commit") {
    if (!isInputPhase(snapshot.phase)) {
      return rejectCommand(snapshot, command, "input-not-allowed");
    }

    const entry = content.entries.find((item) => item.id === command.entryId);
    if (entry == null) {
      return rejectCommand(snapshot, command, "entry-not-found");
    }

    const normalizedCells = command.cells.map((cell) =>
      profile.normalizeCommittedCell(cell),
    );
    if (
      normalizedCells.length > entry.answerCells.length ||
      normalizedCells.some((cell) => !profile.validateCell(cell))
    ) {
      return rejectCommand(snapshot, command, "invalid-committed-cell");
    }

    const entryCells = getEntryCells(entry);
    const lockedValues = buildLockedCellValues(
      content,
      snapshot.completedEntryIds,
      snapshot.cellValues,
    );
    const nextCellValues = { ...snapshot.cellValues };

    for (const [index, coordinate] of entryCells.entries()) {
      const key = getCellKey(coordinate.row, coordinate.col);
      const nextValue = normalizedCells[index] ?? null;
      const lockedValue = lockedValues.get(key);

      if (
        lockedValue != null &&
        nextValue != null &&
        !profile.cellsEqual(lockedValue, nextValue)
      ) {
        return rejectCommand(
          snapshot,
          command,
          "input-conflicts-with-completed-word",
        );
      }

      if (lockedValue != null) {
        nextCellValues[key] = lockedValue;
      } else if (nextValue == null) {
        delete nextCellValues[key];
      } else {
        nextCellValues[key] = nextValue;
      }
    }

    const completedEntryIds = getCompletedEntryIds(
      content.entries,
      nextCellValues,
      profile,
    );
    const previousCompleted = new Set(snapshot.completedEntryIds);
    const newlyCompleted = completedEntryIds.filter(
      (entryId) => !previousCompleted.has(entryId),
    );
    const next = freezeSnapshot(
      commandSnapshot(snapshot, {
        phase: newlyCompleted.length > 0 ? "word-resolved" : "active",
        selectedEntryId: entry.id,
        cellValues: nextCellValues,
        completedEntryIds,
        lastResolvedEntryIds: newlyCompleted,
      }),
    );

    events.push({
      type: "game.input.committed",
      entryId: entry.id,
      committedCellCount: normalizedCells.length,
      commandSequence: next.commandSequence,
    });
    if (newlyCompleted.length > 0) {
      events.push({
        type: "game.word.resolved",
        entryIds: Object.freeze([...newlyCompleted]),
        commandSequence: next.commandSequence,
      });
    }
    return { snapshot: next, events: Object.freeze(events) };
  }

  if (command.type === "resolution.complete") {
    if (snapshot.phase !== "word-resolved") {
      return rejectCommand(snapshot, command, "invalid-transition");
    }

    const boardComplete =
      snapshot.completedEntryIds.length === content.entries.length;
    const lastResolvedEntryId =
      snapshot.lastResolvedEntryIds[snapshot.lastResolvedEntryIds.length - 1];
    const lastResolvedEntry = content.entries.find(
      (entry) => entry.id === lastResolvedEntryId,
    );
    const nextEntry =
      lastResolvedEntry == null
        ? content.entries.find(
            (entry) => !snapshot.completedEntryIds.includes(entry.id),
          )
        : getNextFocusEntryAfterCompletion(
            content.entries,
            snapshot.cellValues as Record<string, string>,
            lastResolvedEntry,
            null,
          );
    const next = freezeSnapshot(
      commandSnapshot(snapshot, {
        phase: boardComplete ? "board-resolved" : "active",
        selectedEntryId: boardComplete
          ? snapshot.selectedEntryId
          : (nextEntry?.id ?? snapshot.selectedEntryId),
      }),
    );

    if (boardComplete) {
      events.push({
        type: "game.board.resolved",
        commandSequence: next.commandSequence,
      });
    }
    return { snapshot: next, events: Object.freeze(events) };
  }

  if (command.type === "board.presentation.complete") {
    if (snapshot.phase !== "board-resolved") {
      return rejectCommand(snapshot, command, "invalid-transition");
    }
    const next = freezeSnapshot(commandSnapshot(snapshot, { phase: "result" }));
    events.push({
      type: "game.result.opened",
      commandSequence: next.commandSequence,
    });
    return { snapshot: next, events: Object.freeze(events) };
  }

  if (command.type === "result.continue") {
    if (snapshot.phase !== "result") {
      return rejectCommand(snapshot, command, "invalid-transition");
    }
    const next = freezeSnapshot(commandSnapshot(snapshot, { phase: "map" }));
    events.push({
      type: "game.map.opened",
      commandSequence: next.commandSequence,
    });
    return { snapshot: next, events: Object.freeze(events) };
  }

  if (command.type === "app.suspend") {
    if (
      snapshot.phase === "suspended" ||
      snapshot.phase === "loading" ||
      snapshot.phase === "recovery"
    ) {
      return rejectCommand(snapshot, command, "invalid-transition");
    }
    const next = freezeSnapshot(
      commandSnapshot(snapshot, {
        phase: "suspended",
        suspendedFrom: snapshot.phase,
      }),
    );
    events.push({
      type: "game.suspended",
      commandSequence: next.commandSequence,
    });
    return { snapshot: next, events: Object.freeze(events) };
  }

  if (command.type === "app.resume") {
    if (snapshot.phase !== "suspended") {
      return rejectCommand(snapshot, command, "invalid-transition");
    }
    const resumePhase =
      snapshot.suspendedFrom === "composing"
        ? "active"
        : (snapshot.suspendedFrom ?? "active");
    const next = freezeSnapshot(
      commandSnapshot(snapshot, {
        phase: resumePhase,
        suspendedFrom: null,
      }),
    );
    events.push({
      type: "game.resumed",
      commandSequence: next.commandSequence,
    });
    return { snapshot: next, events: Object.freeze(events) };
  }

  if (command.type === "recovery.restore") {
    if (snapshot.phase !== "recovery" && snapshot.phase !== "intro") {
      return rejectCommand(snapshot, command, "invalid-transition");
    }
    const selectedEntryId =
      command.selectedEntryId == null ||
      !content.entries.some((entry) => entry.id === command.selectedEntryId)
        ? (content.entries[0]?.id ?? null)
        : command.selectedEntryId;
    const completedEntryIds = getCompletedEntryIds(
      content.entries,
      command.cellValues,
      profile,
    );
    const next = freezeSnapshot({
      ...snapshot,
      phase: "active",
      suspendedFrom: null,
      selectedEntryId,
      cellValues: { ...command.cellValues },
      completedEntryIds,
      lastResolvedEntryIds: [],
      commandSequence: command.commandSequence,
      lastError: null,
    });
    events.push({
      type: "game.recovered",
      commandSequence: next.commandSequence,
    });
    return { snapshot: next, events: Object.freeze(events) };
  }

  if (command.type === "recovery.fail") {
    if (snapshot.phase !== "recovery") {
      return rejectCommand(snapshot, command, "invalid-transition");
    }
    return rejectCommand(snapshot, command, "invalid-transition");
  }

  return rejectCommand(snapshot, command, "invalid-transition");
}

export function createInitialGameSnapshot(
  content: GameContentV1,
): GameSnapshot {
  return freezeSnapshot({
    phase: "intro",
    suspendedFrom: null,
    puzzleId: content.puzzleId,
    contentLocale: content.contentLocale,
    contentChecksum: content.contentChecksum,
    languageProfileId: content.languageProfile.id,
    languageProfileVersion: content.languageProfile.version,
    selectedEntryId: content.entries[0]?.id ?? null,
    cellValues: {},
    completedEntryIds: [],
    lastResolvedEntryIds: [],
    commandSequence: 0,
    lastError: null,
  });
}

export class GameController {
  readonly #content: GameContentV1;
  readonly #profile: LanguageProfile;
  readonly #subscribers = new Set<GameControllerSubscriber>();
  #snapshot: GameSnapshot;

  constructor(input: {
    content: GameContentV1;
    profile: LanguageProfile;
    initialSnapshot?: GameSnapshot;
  }) {
    if (
      input.profile.id !== input.content.languageProfile.id ||
      input.profile.version !== input.content.languageProfile.version ||
      input.profile.contentLocale !== input.content.contentLocale
    ) {
      throw new Error("GameController language profile does not match content");
    }

    this.#content = input.content;
    this.#profile = input.profile;
    this.#snapshot = input.initialSnapshot ?? createInitialGameSnapshot(input.content);
  }

  getSnapshot(): GameSnapshot {
    return this.#snapshot;
  }

  dispatch(command: GameCommand): GameDispatchResult {
    const result = reduceGameCommand(
      this.#snapshot,
      command,
      this.#content,
      this.#profile,
    );
    this.#snapshot = result.snapshot;

    for (const subscriber of this.#subscribers) {
      subscriber(result.snapshot, result.events);
    }

    return result;
  }

  subscribe(subscriber: GameControllerSubscriber): () => void {
    this.#subscribers.add(subscriber);
    return () => {
      this.#subscribers.delete(subscriber);
    };
  }
}
