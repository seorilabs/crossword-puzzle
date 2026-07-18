import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { GameDomainEvent } from "./gameController.ts";
import { projectGameFeedbackActions } from "./gameFeedback.ts";

const enabled = Object.freeze({ sfxEnabled: true, hapticEnabled: true });

describe("game feedback event projection", () => {
  it("부분 입력은 80ms 종이 탭이며 진동하지 않는다", () => {
    const events: GameDomainEvent[] = [
      {
        type: "game.input.committed",
        entryId: "entry-1",
        committedCellCount: 1,
        commandSequence: 1,
      },
    ];
    assert.deepEqual(projectGameFeedbackActions(events, enabled), [
      {
        cue: "cell-commit",
        commandSequence: 1,
        durationMs: 80,
        playSound: true,
        haptic: null,
      },
    ]);
  });

  it("오답은 input 탭을 덮고 warning 피드백 한 번만 만든다", () => {
    const events: GameDomainEvent[] = [
      {
        type: "game.input.committed",
        entryId: "entry-1",
        committedCellCount: 2,
        commandSequence: 2,
      },
      {
        type: "game.entry.incorrect",
        entryId: "entry-1",
        commandSequence: 2,
      },
    ];
    assert.deepEqual(projectGameFeedbackActions(events, enabled), [
      {
        cue: "incorrect",
        commandSequence: 2,
        durationMs: 180,
        playSound: true,
        haptic: "warning",
      },
    ]);
  });

  it("교차 성공과 선택 말길 오답이 겹치면 warning을 우선한다", () => {
    const events: GameDomainEvent[] = [
      {
        type: "game.word.resolved",
        entryIds: ["entry-2"],
        commandSequence: 3,
      },
      {
        type: "game.entry.incorrect",
        entryId: "entry-1",
        commandSequence: 3,
      },
    ];

    assert.deepEqual(projectGameFeedbackActions(events, enabled), [
      {
        cue: "incorrect",
        commandSequence: 3,
        durationMs: 180,
        playSound: true,
        haptic: "warning",
      },
    ]);
  });

  it("단어와 교차 연쇄의 시간·햅틱 예산을 구분한다", () => {
    const word: GameDomainEvent[] = [
      {
        type: "game.word.resolved",
        entryIds: ["entry-1"],
        commandSequence: 3,
      },
    ];
    const chain: GameDomainEvent[] = [
      {
        type: "game.word.resolved",
        entryIds: ["entry-1", "entry-2"],
        commandSequence: 4,
      },
    ];
    assert.equal(projectGameFeedbackActions(word, enabled)[0]?.durationMs, 450);
    assert.equal(
      projectGameFeedbackActions(word, enabled)[0]?.haptic,
      "success",
    );
    assert.equal(
      projectGameFeedbackActions(chain, enabled)[0]?.durationMs,
      700,
    );
    assert.equal(
      projectGameFeedbackActions(chain, enabled)[0]?.haptic,
      "light",
    );
  });

  it("보드 완료는 2초 완결 피드백이고 채널 설정을 각각 존중한다", () => {
    const events: GameDomainEvent[] = [
      { type: "game.board.resolved", commandSequence: 5 },
    ];
    assert.deepEqual(
      projectGameFeedbackActions(events, {
        sfxEnabled: false,
        hapticEnabled: true,
      }),
      [
        {
          cue: "board-complete",
          commandSequence: 5,
          durationMs: 2_000,
          playSound: false,
          haptic: "heavy",
        },
      ],
    );
    assert.equal(
      projectGameFeedbackActions(events, {
        sfxEnabled: true,
        hapticEnabled: false,
      })[0]?.haptic,
      null,
    );
  });
});
