import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type {
  GameDomainEvent,
  GameSnapshot,
} from "../../crossword-core/src/gameController.ts";
import type { GameContentV1 } from "../../crossword-core/src/gameContent.ts";
import {
  ABBREVIATED_VFX_DURATION_MS,
  createCrosswordGameSceneUpdate,
  DEFAULT_CROSSWORD_GAME_VISUAL_PREFERENCES,
  INCORRECT_FEEDBACK_DURATION_MS,
  INPUT_SETTLE_DURATION_MS,
  planCrosswordGamePresentationCues,
  resolveCrosswordGamePalette,
  shouldAbbreviateCrosswordGameVfx,
  updateCrosswordGameVisualPreferences,
} from "./presentationPolicy.ts";

function createContent(): GameContentV1 {
  return {
    schemaVersion: "game-content/1",
    contentLocale: "ko-KR",
    releaseTimeZone: "Asia/Seoul",
    languageProfile: { id: "ko-KR", version: 1 },
    puzzleId: "runtime-policy-fixture",
    packId: "runtime-policy-pack",
    slotId: "runtime-policy-slot",
    grid: [
      ["가", "나"],
      ["다", ""],
    ],
    entries: [
      {
        id: "a1",
        answer: "가나",
        answerCells: ["가", "나"],
        clue: "가로 단서",
        clueSource: "manual",
        shortExplanation: "가로 단서 설명",
        source: "fixture source",
        sourceEntryId: "fixture-a1",
        sourceUrl: "https://example.com/fixture",
        licenseId: "fixture-license",
        domainTags: ["fixture"],
        direction: "across",
        row: 0,
        col: 0,
        generatedBy: "placed",
        needsManualClue: false,
      },
      {
        id: "d1",
        answer: "가다",
        answerCells: ["가", "다"],
        clue: "세로 단서",
        clueSource: "manual",
        shortExplanation: "세로 단서 설명",
        source: "fixture source",
        sourceEntryId: "fixture-d1",
        sourceUrl: "https://example.com/fixture",
        licenseId: "fixture-license",
        domainTags: ["fixture"],
        direction: "down",
        row: 0,
        col: 0,
        generatedBy: "placed",
        needsManualClue: false,
      },
    ],
    difficulty: "easy",
    themeId: "fixture-theme",
    chapterId: "fixture-chapter",
    worldTriggerSet: [{ at: 0.5 }, { at: 1 }],
    generatorCommit: "fixture-commit",
    generatorConfigHash: "fixture-config",
    contentChecksum: "fixture-checksum",
    licenseManifestId: "fixture-license",
    licenseManifestChecksum:
      "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    review: {
      reviewerId: "fixture-reviewer",
      reviewedAt: "2026-07-17T00:00:00.000Z",
      manualCoverage: 1,
    },
    minClientVersion: "0.1.0",
  };
}

function createSnapshot(patch: Partial<GameSnapshot> = {}): GameSnapshot {
  return Object.freeze({
    phase: "active",
    suspendedFrom: null,
    puzzleId: "runtime-policy-fixture",
    contentLocale: "ko-KR",
    contentChecksum: "fixture-checksum",
    languageProfileId: "ko-KR",
    languageProfileVersion: 1,
    selectedEntryId: "a1",
    cellValues: Object.freeze({ "0:0": "가", "0:1": "나" }),
    completedEntryIds: Object.freeze([]),
    lastResolvedEntryIds: Object.freeze([]),
    commandSequence: 2,
    lastError: null,
    ...patch,
  });
}

const noEffect = Object.freeze({
  kind: "none" as const,
  sequence: 0,
  entryIds: Object.freeze([]),
});

describe("Phaser runtime presentation policy", () => {
  test("scene update는 immutable projection과 domain event batch를 함께 보존한다", () => {
    const events: readonly GameDomainEvent[] = [
      {
        type: "game.input.committed",
        entryId: "a1",
        committedCellCount: 2,
        commandSequence: 2,
      },
    ];
    const update = createCrosswordGameSceneUpdate(
      createContent(),
      createSnapshot(),
      events,
    );

    assert.equal(update.presentation.commandSequence, 2);
    assert.deepEqual(update.events, events);
    assert.notEqual(update.events, events);
    assert.equal(Object.isFrozen(update), true);
    assert.equal(Object.isFrozen(update.events), true);
  });

  test("입력 settle 뒤 오답 또는 단어 연출을 같은 sequence로 계획한다", () => {
    const incorrect = planCrosswordGamePresentationCues(
      [
        {
          type: "game.input.committed",
          entryId: "a1",
          committedCellCount: 2,
          commandSequence: 3,
        },
        {
          type: "game.entry.incorrect",
          entryId: "a1",
          commandSequence: 3,
        },
      ],
      noEffect,
    );
    const resolved = planCrosswordGamePresentationCues(
      [
        {
          type: "game.input.committed",
          entryId: "a1",
          committedCellCount: 2,
          commandSequence: 4,
        },
        {
          type: "game.word.resolved",
          entryIds: ["a1", "d1"],
          commandSequence: 4,
        },
      ],
      noEffect,
    );

    assert.deepEqual(
      incorrect.map((cue) => cue.kind),
      ["input-settle", "incorrect"],
    );
    assert.equal(incorrect[0]?.committedCellCount, 2);
    assert.deepEqual(
      resolved.map((cue) => cue.kind),
      ["input-settle", "chain"],
    );
    assert.equal(INPUT_SETTLE_DURATION_MS, 80);
    assert.equal(INCORRECT_FEEDBACK_DURATION_MS, 180);
    assert.equal(ABBREVIATED_VFX_DURATION_MS, 60);
  });

  test("board cue는 같은 batch의 이전 cue를 대체하고 기존 VFX 정리 신호가 된다", () => {
    const cues = planCrosswordGamePresentationCues(
      [
        {
          type: "game.input.committed",
          entryId: "a1",
          committedCellCount: 2,
          commandSequence: 5,
        },
        { type: "game.board.resolved", commandSequence: 6 },
      ],
      noEffect,
    );

    assert.deepEqual(
      cues.map((cue) => cue.kind),
      ["board"],
    );
    assert.equal(cues[0]?.commandSequence, 6);
  });

  test("다음 선택·입력은 active VFX를 축약하고 event 없는 host만 snapshot fallback을 쓴다", () => {
    const fallback = Object.freeze({
      kind: "word" as const,
      sequence: 7,
      entryIds: Object.freeze(["a1"]),
    });
    const entrySelected: readonly GameDomainEvent[] = [
      {
        type: "game.entry.selected",
        entryId: "d1",
        commandSequence: 8,
      },
    ];

    assert.equal(shouldAbbreviateCrosswordGameVfx(entrySelected), true);
    assert.equal(
      shouldAbbreviateCrosswordGameVfx([
        {
          type: "game.entry.incorrect",
          entryId: "a1",
          commandSequence: 8,
        },
      ]),
      false,
    );
    assert.deepEqual(
      planCrosswordGamePresentationCues([], fallback).map((cue) => cue.kind),
      ["word"],
    );
    assert.deepEqual(
      planCrosswordGamePresentationCues(entrySelected, fallback),
      [],
    );
  });

  test("visual preferences는 partial update되고 high contrast palette를 즉시 선택한다", () => {
    const highContrast = updateCrosswordGameVisualPreferences(
      DEFAULT_CROSSWORD_GAME_VISUAL_PREFERENCES,
      { highContrast: true },
    );
    const reduced = updateCrosswordGameVisualPreferences(highContrast, {
      reducedMotion: true,
    });

    assert.deepEqual(highContrast, {
      highContrast: true,
      reducedMotion: false,
    });
    assert.deepEqual(reduced, {
      highContrast: true,
      reducedMotion: true,
    });
    assert.notEqual(
      resolveCrosswordGamePalette(highContrast).ink,
      resolveCrosswordGamePalette(DEFAULT_CROSSWORD_GAME_VISUAL_PREFERENCES)
        .ink,
    );
    assert.equal(resolveCrosswordGamePalette(highContrast).ink, 0x000000);
    assert.equal(Object.isFrozen(reduced), true);
  });
});
