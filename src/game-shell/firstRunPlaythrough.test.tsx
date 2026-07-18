import { describe, expect, test } from "vitest";

import {
  calculateGameContentChecksum,
  type GameContentV1,
} from "../../packages/crossword-core/src/gameContent.ts";
import type { GameCommand } from "../../packages/crossword-core/src/gameController.ts";
import { defaultLaunchConfig } from "../../packages/crossword-core/src/launchConfig.ts";
import { BUNDLED_FIRST_RUN_CONTENT_IDENTITIES } from "../../packages/crossword-core/src/launchContentCatalog.ts";
import type { KeyValueStoragePort } from "./gameSaveRepository.ts";
import {
  createGameModel,
  persistGameTransition,
  type GameJourneyItem,
} from "./firstRunGameModel.ts";
import { loadBundledFirstRunGameContents } from "./onboardingGameContent.ts";

class MemoryStorage implements KeyValueStoragePort {
  readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

type PlaythroughModel = Awaited<ReturnType<typeof createGameModel>>;

function createPreviewJourney(): readonly GameJourneyItem[] {
  const templates = loadBundledFirstRunGameContents();
  return Object.freeze(
    Array.from({ length: 7 }, (_, index) => {
      const template = templates[index % templates.length];
      if (template == null) {
        throw new Error("Bundled first-run template is missing");
      }
      const ordinal = String(index + 1).padStart(2, "0");
      const unsealed: GameContentV1 = {
        ...template,
        puzzleId: `preview-journey-${ordinal}`,
        slotId: `2026-07-${ordinal}`,
        contentChecksum: "sha256:unsealed",
      };
      const content = Object.freeze({
        ...unsealed,
        contentChecksum: calculateGameContentChecksum(unsealed),
      });
      return Object.freeze({
        content,
        mapNodeId: `preview-journey:node:${ordinal}`,
        cardIds: Object.freeze([]),
      });
    }),
  );
}

async function dispatchAndPersist(
  model: PlaythroughModel,
  command: GameCommand,
) {
  const previous = model.controller.getSnapshot();
  const result = model.controller.dispatch(command);
  const boardResolved = result.events.some(
    (event) => event.type === "game.board.resolved",
  );
  const reward = await persistGameTransition(
    model.repository,
    previous,
    result.snapshot,
    boardResolved,
    model.content.entries.length,
    defaultLaunchConfig,
    model.identity,
    model.cardIds,
  );
  return { ...result, reward };
}

async function solveCurrentBoardToMap(model: PlaythroughModel) {
  let lastReward = null;
  for (const entry of model.content.entries) {
    if (model.controller.getSnapshot().completedEntryIds.includes(entry.id)) {
      continue;
    }
    const input = await dispatchAndPersist(model, {
      type: "input.commit",
      entryId: entry.id,
      cells: entry.answerCells,
    });
    expect(input.snapshot.phase).toBe("word-resolved");
    const resolution = await dispatchAndPersist(model, {
      type: "resolution.complete",
    });
    lastReward = resolution.reward ?? lastReward;
  }

  expect(model.controller.getSnapshot().phase).toBe("board-resolved");
  expect(lastReward).not.toBeNull();
  expect(
    (await dispatchAndPersist(model, { type: "board.presentation.complete" }))
      .snapshot.phase,
  ).toBe("result");
  expect(
    (await dispatchAndPersist(model, { type: "result.continue" })).snapshot
      .phase,
  ).toBe("map");
}

describe("실제 ko-KR 첫 실행 3보드 플레이스루", () => {
  test("첫 단서→완료→결과→지도→다음 보드와 board 2·3 재실행 이어가기를 보존한다", async () => {
    const storage = new MemoryStorage();
    const expectedIds = BUNDLED_FIRST_RUN_CONTENT_IDENTITIES.map(
      (identity) => identity.puzzleId,
    );

    const boardOne = await createGameModel(storage, defaultLaunchConfig);
    expect(boardOne.content.puzzleId).toBe(expectedIds[0]);
    expect(boardOne.snapshot.selectedEntryId).toBe(
      boardOne.content.entries[0]?.id,
    );
    await solveCurrentBoardToMap(boardOne);

    const boardTwo = await createGameModel(
      storage,
      defaultLaunchConfig,
      expectedIds[1],
    );
    expect(boardTwo.snapshot.selectedEntryId).toBe(
      boardTwo.content.entries[0]?.id,
    );
    const boardTwoFirstEntry = boardTwo.content.entries[0];
    expect(boardTwoFirstEntry).toBeDefined();
    await dispatchAndPersist(boardTwo, {
      type: "input.commit",
      entryId: boardTwoFirstEntry!.id,
      cells: boardTwoFirstEntry!.answerCells,
    });
    await dispatchAndPersist(boardTwo, { type: "resolution.complete" });
    const boardTwoBeforeRestart = boardTwo.controller.getSnapshot();

    const boardTwoRestarted = await createGameModel(
      storage,
      defaultLaunchConfig,
    );
    expect(boardTwoRestarted.content.puzzleId).toBe(expectedIds[1]);
    expect(boardTwoRestarted.snapshot.phase).toBe("active");
    expect(boardTwoRestarted.snapshot.selectedEntryId).toBe(
      boardTwoBeforeRestart.selectedEntryId,
    );
    expect(boardTwoRestarted.snapshot.cellValues).toEqual(
      boardTwoBeforeRestart.cellValues,
    );
    await solveCurrentBoardToMap(boardTwoRestarted);

    const boardThree = await createGameModel(
      storage,
      defaultLaunchConfig,
      expectedIds[2],
    );
    const boardThreeFirstEntry = boardThree.content.entries[0];
    expect(boardThreeFirstEntry).toBeDefined();
    await dispatchAndPersist(boardThree, {
      type: "input.commit",
      entryId: boardThreeFirstEntry!.id,
      cells: boardThreeFirstEntry!.answerCells,
    });
    await dispatchAndPersist(boardThree, { type: "resolution.complete" });
    const boardThreeBeforeRestart = boardThree.controller.getSnapshot();

    const boardThreeRestarted = await createGameModel(
      storage,
      defaultLaunchConfig,
    );
    expect(boardThreeRestarted.content.puzzleId).toBe(expectedIds[2]);
    expect(boardThreeRestarted.snapshot.cellValues).toEqual(
      boardThreeBeforeRestart.cellValues,
    );
    await solveCurrentBoardToMap(boardThreeRestarted);

    const completedJourney = await createGameModel(
      storage,
      defaultLaunchConfig,
    );
    expect(completedJourney.content.puzzleId).toBe(expectedIds[2]);
    expect(completedJourney.snapshot.phase).toBe("map");
    expect(completedJourney.progression.completedPuzzleIds).toEqual(
      expectedIds,
    );
    expect(completedJourney.progression.mapFragmentCount).toBe(3);
    expect(completedJourney.progression.metaUnlocks.knowledgeCollection).toBe(
      true,
    );
    expect(completedJourney.progression.metaUnlocks.pathColorCosmetics).toBe(
      true,
    );
  });

  test("주입한 7보드 여정에서도 첫 미완료·요청 보드·재실행·완료 후 마지막 보드를 선택한다", async () => {
    const storage = new MemoryStorage();
    const journey = createPreviewJourney();
    const expectedIds = journey.map((item) => item.content.puzzleId);

    const boardOne = await createGameModel(
      storage,
      defaultLaunchConfig,
      undefined,
      journey,
    );
    expect(boardOne.content.puzzleId).toBe(expectedIds[0]);
    expect(boardOne.identity).toEqual({
      puzzleId: expectedIds[0],
      contentChecksum: journey[0]?.content.contentChecksum,
      mapNodeId: journey[0]?.mapNodeId,
    });
    await solveCurrentBoardToMap(boardOne);

    const firstIncomplete = await createGameModel(
      storage,
      defaultLaunchConfig,
      undefined,
      journey,
    );
    expect(firstIncomplete.content.puzzleId).toBe(expectedIds[1]);

    const requestedBoardTwo = await createGameModel(
      storage,
      defaultLaunchConfig,
      expectedIds[1],
      journey,
    );
    expect(requestedBoardTwo.content.puzzleId).toBe(expectedIds[1]);
    const boardTwoFirstEntry = requestedBoardTwo.content.entries[0];
    expect(boardTwoFirstEntry).toBeDefined();
    await dispatchAndPersist(requestedBoardTwo, {
      type: "input.commit",
      entryId: boardTwoFirstEntry!.id,
      cells: boardTwoFirstEntry!.answerCells,
    });
    await dispatchAndPersist(requestedBoardTwo, {
      type: "resolution.complete",
    });
    const boardTwoBeforeReload = requestedBoardTwo.controller.getSnapshot();

    const boardTwoReloaded = await createGameModel(
      storage,
      defaultLaunchConfig,
      undefined,
      journey,
    );
    expect(boardTwoReloaded.content.puzzleId).toBe(expectedIds[1]);
    expect(boardTwoReloaded.snapshot.cellValues).toEqual(
      boardTwoBeforeReload.cellValues,
    );
    await solveCurrentBoardToMap(boardTwoReloaded);

    const requestedBoardSeven = await createGameModel(
      storage,
      defaultLaunchConfig,
      expectedIds[6],
      journey,
    );
    expect(requestedBoardSeven.content.puzzleId).toBe(expectedIds[6]);

    for (let index = 2; index < journey.length; index += 1) {
      const nextBoard = await createGameModel(
        storage,
        defaultLaunchConfig,
        undefined,
        journey,
      );
      expect(nextBoard.content.puzzleId).toBe(expectedIds[index]);
      await solveCurrentBoardToMap(nextBoard);
    }

    const completedJourney = await createGameModel(
      storage,
      defaultLaunchConfig,
      undefined,
      journey,
    );
    expect(completedJourney.content.puzzleId).toBe(expectedIds[6]);
    expect(completedJourney.snapshot.phase).toBe("map");
    expect(completedJourney.progression.completedPuzzleIds).toEqual(
      expectedIds,
    );
  });
});
