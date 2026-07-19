import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildGameRuntimeAnalyticsEvent,
  createGameRuntimeAnalyticsSession,
  GAME_RUNTIME_ANALYTICS_EVENT_NAMES,
  isGameRuntimeAnalyticsEvent,
  type GameRuntimeAnalyticsEvent,
} from "./gameRuntimeAnalytics.ts";
import type { GameContentV1 } from "./gameContent.ts";
import { GameController, type GameCommand } from "./gameController.ts";
import { koKrLanguageProfile } from "./languageProfile.ts";

function attribution(sourceEntryId: string) {
  return {
    shortExplanation: "비공개 설명 원문",
    source: "fixture",
    sourceEntryId,
    sourceUrl: "https://example.com/source",
    licenseId: "fixture-license",
    domainTags: ["fixture"],
  };
}

function createContent(): GameContentV1 {
  const answers = ["가나", "다라", "마바", "사아"];
  return {
    schemaVersion: "game-content/1",
    contentLocale: "ko-KR",
    releaseTimeZone: "Asia/Seoul",
    languageProfile: { id: "ko-KR", version: 1 },
    puzzleId: "analytics-fixture-01",
    packId: "analytics-pack",
    slotId: "2026-07-19T00",
    grid: answers.map((answer) => [...answer]),
    entries: answers.map((answer, index) => ({
      id: `entry-${index + 1}`,
      answer,
      answerCells: [...answer],
      clue: `민감 단서 원문 ${index + 1}`,
      clueSource: "manual",
      needsManualClue: false,
      direction: "across" as const,
      row: index,
      col: 0,
      generatedBy: "placed" as const,
      ...attribution(`source-${index + 1}`),
    })),
    difficulty: "normal",
    themeId: "table-kitchen",
    chapterId: "chapter-01",
    worldTriggerSet: [],
    generatorCommit: "fixture",
    generatorConfigHash: "fixture",
    contentChecksum: "sha256:fixture",
    licenseManifestId: "fixture-license",
    licenseManifestChecksum: "sha256:fixture-license",
    review: {
      reviewerId: "fixture-reviewer",
      reviewedAt: "2026-07-19T00:00:00.000Z",
      manualCoverage: 1,
    },
    minClientVersion: "0.1.0",
  };
}

function dispatch(
  controller: GameController,
  session: ReturnType<typeof createGameRuntimeAnalyticsSession>,
  command: GameCommand,
) {
  const previous = controller.getSnapshot();
  const result = controller.dispatch(command);
  session.recordTransition(previous, result.snapshot, result.events);
  return result;
}

describe("GameExperience analytics v2 contract", () => {
  test("실제 controller lifecycle을 기존 이벤트 이름·v2 공통 문맥으로 투영한다", () => {
    const content = createContent();
    const controller = new GameController({
      content,
      profile: koKrLanguageProfile,
    });
    const transcript: GameRuntimeAnalyticsEvent[] = [];
    let now = 10_000;
    let sequence = 0;
    const session = createGameRuntimeAnalyticsSession({
      content,
      initialSnapshot: controller.getSnapshot(),
      market: "apps-in-toss",
      uiLocale: "ko-KR",
      port: { log: (event) => transcript.push(event) },
      nowEpochMs: () => now,
      createEventId: () => `deterministic-event-${++sequence}`,
    });

    for (const entry of content.entries) {
      now += 1_000;
      dispatch(controller, session, {
        type: "input.commit",
        entryId: entry.id,
        cells: entry.answerCells,
      });
      now += 500;
      dispatch(controller, session, { type: "resolution.complete" });
    }

    assert.deepEqual(
      transcript.map((event) => event.name),
      [
        "game_puzzle_start",
        "game_first_input",
        "game_progress",
        "game_progress",
        "game_progress",
        "game_puzzle_complete",
      ],
    );
    assert.deepEqual(
      transcript
        .filter((event) => event.name === "game_progress")
        .map((event) => event.params.progress_percent),
      [25, 50, 75],
    );

    for (const event of transcript) {
      assert.equal(isGameRuntimeAnalyticsEvent(event), true);
      assert.equal(event.params.schema_version, 2);
      assert.equal(event.params.event_id, event.eventId);
      assert.equal(event.params.ui_locale, "ko-KR");
      assert.equal(event.params.content_locale, "ko-KR");
      assert.equal(event.params.language_profile_id, "ko-KR");
      assert.equal(event.params.language_profile_version, 1);
      assert.equal(event.params.puzzle_id, content.puzzleId);
      assert.equal(event.params.pack_id, content.packId);
      assert.equal(event.params.slot_id, content.slotId);
      assert.equal(event.params.theme_tag, content.themeId);
    }
    assert.equal(new Set(transcript.map((event) => event.eventId)).size, 6);

    const contractOnlyEvents = [
      buildGameRuntimeAnalyticsEvent("game_hint_use", {
        eventId: "contract-hint-1",
        market: "apps-in-toss",
        uiLocale: "ko-KR",
        contentLocale: content.contentLocale,
        languageProfileId: content.languageProfile.id,
        languageProfileVersion: content.languageProfile.version,
        context: {
          puzzleId: content.puzzleId,
          difficulty: content.difficulty,
          gridSize: content.grid.length,
          wordCount: content.entries.length,
          packId: content.packId,
          slotId: content.slotId,
          themeTag: content.themeId,
        },
        payload: { hintType: "hint", hintRemainingAfter: 2 },
      }),
      buildGameRuntimeAnalyticsEvent("game_assist_ad", {
        eventId: "contract-assist-1",
        market: "apps-in-toss",
        uiLocale: "ko-KR",
        contentLocale: content.contentLocale,
        languageProfileId: content.languageProfile.id,
        languageProfileVersion: content.languageProfile.version,
        context: {
          puzzleId: content.puzzleId,
          difficulty: content.difficulty,
          gridSize: content.grid.length,
          wordCount: content.entries.length,
          packId: content.packId,
          slotId: content.slotId,
          themeTag: content.themeId,
        },
        payload: { assistType: "rewarded_hint", result: "request" },
      }),
    ];
    assert.deepEqual(GAME_RUNTIME_ANALYTICS_EVENT_NAMES, [
      "game_puzzle_start",
      "game_first_input",
      "game_progress",
      "game_puzzle_complete",
      "game_puzzle_abandon",
      "game_hint_use",
      "game_assist_ad",
    ]);
    assert.ok(contractOnlyEvents.every(isGameRuntimeAnalyticsEvent));

    const serialized = JSON.stringify(transcript);
    for (const forbidden of [
      ...content.entries.map((entry) => entry.answer),
      ...content.entries.map((entry) => entry.clue),
      "비공개 설명 원문",
      "advertising_id",
    ]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  });

  test("실제 이탈은 시도당 한 번 기록하고 설정용 suspend 자체는 이탈을 만들지 않는다", () => {
    const content = createContent();
    const controller = new GameController({
      content,
      profile: koKrLanguageProfile,
    });
    const transcript: GameRuntimeAnalyticsEvent[] = [];
    let now = 0;
    let sequence = 0;
    const session = createGameRuntimeAnalyticsSession({
      content,
      initialSnapshot: controller.getSnapshot(),
      market: "google-play",
      uiLocale: "ko-KR",
      port: { log: (event) => transcript.push(event) },
      nowEpochMs: () => now,
      createEventId: () => `abandon-event-${++sequence}`,
    });

    now = 2_000;
    dispatch(controller, session, { type: "app.suspend" });
    assert.deepEqual(
      transcript.map((event) => event.name),
      ["game_puzzle_start"],
    );

    session.abandon(controller.getSnapshot());
    session.abandon(controller.getSnapshot());
    assert.deepEqual(
      transcript.map((event) => event.name),
      ["game_puzzle_start", "game_puzzle_abandon"],
    );
    assert.equal(transcript[1]?.params.elapsed_sec, 2);
    assert.equal(transcript[1]?.params.had_first_input, false);
  });

  test("schema 밖 field·eventId 불일치를 거부하고 sink 실패는 controller를 막지 않는다", () => {
    const content = createContent();
    const controller = new GameController({
      content,
      profile: koKrLanguageProfile,
    });
    const errors: unknown[] = [];
    const session = createGameRuntimeAnalyticsSession({
      content,
      initialSnapshot: controller.getSnapshot(),
      market: "app-store",
      uiLocale: "ko-KR",
      port: {
        log() {
          throw new Error("analytics sink unavailable");
        },
      },
      createEventId: () => "duplicate-event-id",
      onError: (error) => errors.push(error),
    });

    assert.doesNotThrow(() => {
      dispatch(controller, session, {
        type: "input.commit",
        entryId: content.entries[0]!.id,
        cells: content.entries[0]!.answerCells,
      });
    });
    assert.ok(errors.length >= 2);

    const valid = {
      eventId: "event-1",
      name: "game_puzzle_start",
      params: {
        schema_version: 2,
        event_id: "event-1",
        market: "apps-in-toss",
        puzzle_id: "puzzle-1",
        difficulty: "normal",
        grid_size: 9,
        word_count: 4,
        ui_locale: "ko-KR",
        content_locale: "ko-KR",
        language_profile_id: "ko-KR",
        language_profile_version: 1,
        attempt_kind: "first",
        attempt_number: 1,
      },
    };
    assert.equal(isGameRuntimeAnalyticsEvent(valid), true);
    assert.equal(
      isGameRuntimeAnalyticsEvent({
        ...valid,
        params: { ...valid.params, answer: "금지된 자유입력" },
      }),
      false,
    );
    assert.equal(
      isGameRuntimeAnalyticsEvent({ ...valid, eventId: "event-2" }),
      false,
    );
  });
});
