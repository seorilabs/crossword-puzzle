import { describe, expect, test } from "vitest";

import type { GameCommand } from "../../packages/crossword-core/src/gameController.ts";
import { defaultLaunchConfig } from "../../packages/crossword-core/src/launchConfig.ts";
import { BUNDLED_FIRST_RUN_CONTENT_IDENTITIES } from "../../packages/crossword-core/src/launchContentCatalog.ts";
import type { KeyValueStoragePort } from "./gameSaveRepository.ts";
import { createGameModel, persistGameTransition } from "./firstRunGameModel.ts";

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
});
