import type {
  GameDomainEvent,
  GameSnapshot,
} from "../../crossword-core/src/gameController.ts";
import type { GameContentV1 } from "../../crossword-core/src/gameContent.ts";
import type {
  CrosswordGameVisualPreferences,
  CrosswordGameVisualPreferenceUpdate,
} from "./contracts.ts";
import {
  projectGameSnapshot,
  type CrosswordPresentation,
  type PresentationEffect,
} from "./projection.ts";

export const INPUT_SETTLE_DURATION_MS = 80;
export const INCORRECT_FEEDBACK_DURATION_MS = 180;
export const ABBREVIATED_VFX_DURATION_MS = 60;

export const DEFAULT_CROSSWORD_GAME_VISUAL_PREFERENCES = Object.freeze({
  highContrast: false,
  reducedMotion: false,
}) satisfies CrosswordGameVisualPreferences;

export type CrosswordGamePalette = Readonly<{
  complete: number;
  completeSoft: number;
  error: number;
  errorSoft: number;
  focus: number;
  focusSoft: number;
  ink: number;
  muted: number;
  paper: number;
  paperShade: number;
  path: number;
  sky: number;
  worldDormant: number;
  worldRestored: number;
}>;

const DEFAULT_PALETTE = Object.freeze({
  complete: 0xd89035,
  completeSoft: 0xffe4b8,
  error: 0xb23a48,
  errorSoft: 0xffe7e9,
  focus: 0x147d7c,
  focusSoft: 0xd9f2ee,
  ink: 0x17243a,
  muted: 0x748093,
  paper: 0xfffbef,
  paperShade: 0xeee5d1,
  path: 0x9aa4ae,
  sky: 0xe6f0eb,
  worldDormant: 0x85908f,
  worldRestored: 0x4e9270,
}) satisfies CrosswordGamePalette;

const HIGH_CONTRAST_PALETTE = Object.freeze({
  complete: 0xa54800,
  completeSoft: 0xffe08a,
  error: 0xa50016,
  errorSoft: 0xffffff,
  focus: 0x005fcc,
  focusSoft: 0xd9edff,
  ink: 0x000000,
  muted: 0x242424,
  paper: 0xffffff,
  paperShade: 0x000000,
  path: 0x242424,
  sky: 0xf2f7ff,
  worldDormant: 0x242424,
  worldRestored: 0x006b3c,
}) satisfies CrosswordGamePalette;

export type CrosswordGamePresentationCue = Readonly<{
  commandSequence: number;
  committedCellCount: number | null;
  entryIds: readonly string[];
  kind: "input-settle" | "incorrect" | "word" | "chain" | "board";
}>;

export type CrosswordGameSceneUpdate = Readonly<{
  events: readonly GameDomainEvent[];
  presentation: CrosswordPresentation;
}>;

export function updateCrosswordGameVisualPreferences(
  current: CrosswordGameVisualPreferences,
  update: CrosswordGameVisualPreferenceUpdate,
): CrosswordGameVisualPreferences {
  return Object.freeze({
    highContrast: update.highContrast ?? current.highContrast,
    reducedMotion: update.reducedMotion ?? current.reducedMotion,
  });
}

export function resolveCrosswordGamePalette(
  preferences: CrosswordGameVisualPreferences,
): CrosswordGamePalette {
  return preferences.highContrast ? HIGH_CONTRAST_PALETTE : DEFAULT_PALETTE;
}

function createCue(
  kind: CrosswordGamePresentationCue["kind"],
  commandSequence: number,
  entryIds: readonly string[] = [],
  committedCellCount: number | null = null,
): CrosswordGamePresentationCue {
  return Object.freeze({
    commandSequence,
    committedCellCount,
    entryIds: Object.freeze([...entryIds]),
    kind,
  });
}

function cueFromFallbackEffect(
  effect: PresentationEffect,
): CrosswordGamePresentationCue | null {
  if (effect.kind === "none") return null;
  return createCue(effect.kind, effect.sequence, effect.entryIds);
}

/**
 * Domain events are the authoritative cause of presentation feedback. The
 * snapshot effect is retained only as a compatibility fallback for hosts that
 * still call runtime.update(snapshot) without an event batch.
 */
export function planCrosswordGamePresentationCues(
  events: readonly GameDomainEvent[],
  fallbackEffect: PresentationEffect,
): readonly CrosswordGamePresentationCue[] {
  const boardResolved = events.find(
    (event) => event.type === "game.board.resolved",
  );
  if (boardResolved?.type === "game.board.resolved") {
    return Object.freeze([createCue("board", boardResolved.commandSequence)]);
  }

  const cues: CrosswordGamePresentationCue[] = [];
  for (const event of events) {
    if (event.type === "game.input.committed") {
      cues.push(
        createCue(
          "input-settle",
          event.commandSequence,
          [event.entryId],
          event.committedCellCount,
        ),
      );
    } else if (event.type === "game.entry.incorrect") {
      cues.push(createCue("incorrect", event.commandSequence, [event.entryId]));
    } else if (event.type === "game.word.resolved") {
      cues.push(
        createCue(
          event.entryIds.length > 1 ? "chain" : "word",
          event.commandSequence,
          event.entryIds,
        ),
      );
    }
  }

  if (cues.length > 0 || events.length > 0) {
    return Object.freeze(cues);
  }

  const fallbackCue = cueFromFallbackEffect(fallbackEffect);
  return fallbackCue == null ? Object.freeze([]) : Object.freeze([fallbackCue]);
}

export function shouldAbbreviateCrosswordGameVfx(
  events: readonly GameDomainEvent[],
): boolean {
  return events.some(
    (event) =>
      event.type === "game.input.committed" ||
      event.type === "game.entry.selected",
  );
}

export function createCrosswordGameSceneUpdate(
  content: GameContentV1,
  snapshot: GameSnapshot,
  events: readonly GameDomainEvent[],
): CrosswordGameSceneUpdate {
  return Object.freeze({
    events: Object.freeze([...events]),
    presentation: projectGameSnapshot(content, snapshot),
  });
}
