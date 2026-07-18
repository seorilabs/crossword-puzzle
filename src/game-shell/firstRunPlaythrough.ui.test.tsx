import { fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("../../packages/crossword-game/src/index.ts", () => ({
  createCrosswordGameRuntime(options: {
    parent: HTMLElement;
    onCommand(request: {
      commandSequence: number;
      command: { type: string };
    }): void;
    onInteractive(ack: {
      renderer: string;
      firstFrameAt: number;
      canvasWidth: number;
      canvasHeight: number;
    }): void;
  }) {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    options.parent.append(canvas);
    queueMicrotask(() =>
      options.onInteractive({
        renderer: "mock-webgl",
        firstFrameAt: Date.now(),
        canvasWidth: 360,
        canvasHeight: 640,
      }),
    );
    return {
      update(
        snapshot: { commandSequence: number },
        events: { type: string }[],
      ) {
        if (events.some((event) => event.type === "game.word.resolved")) {
          queueMicrotask(() =>
            options.onCommand({
              commandSequence: snapshot.commandSequence,
              command: { type: "resolution.complete" },
            }),
          );
        } else if (
          events.some((event) => event.type === "game.board.resolved")
        ) {
          queueMicrotask(() =>
            options.onCommand({
              commandSequence: snapshot.commandSequence,
              command: { type: "board.presentation.complete" },
            }),
          );
        }
      },
      updateVisualPreferences() {},
      suspend() {},
      resume() {},
      destroy() {
        canvas.remove();
      },
    };
  },
}));

import { defaultLaunchConfig } from "../../packages/crossword-core/src/launchConfig.ts";
import type { GameContentV1 } from "../../packages/crossword-core/src/gameContent.ts";
import type { KeyValueStoragePort } from "./gameSaveRepository.ts";
import { mountGameExperience } from "./GameExperience.tsx";
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

let activeSession: ReturnType<typeof mountGameExperience> | null = null;

function disposeActiveSession() {
  activeSession?.dispose();
  activeSession = null;
}

afterEach(() => {
  disposeActiveSession();
  document.body.replaceChildren();
});

function mount(storage: KeyValueStoragePort) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  activeSession = mountGameExperience(container, {
    hostKind: "web",
    storage,
    launchConfig: defaultLaunchConfig,
  });
  return container;
}

async function expectActiveContentIdentity(content: GameContentV1) {
  const session = activeSession;
  expect(session).not.toBeNull();
  await expect(session!.waitForActiveContentIdentity()).resolves.toEqual({
    puzzleId: content.puzzleId,
    contentChecksum: content.contentChecksum,
    contentLocale: content.contentLocale,
  });
}

async function solveVisibleBoard(
  container: HTMLElement,
  content: GameContentV1,
) {
  const view = within(container);
  for (const [index, entry] of content.entries.entries()) {
    if (container.querySelector("#game-result-title") != null) break;
    const clueButton = await waitFor(() => {
      const candidate = container.querySelector<HTMLButtonElement>(
        `.gameClueRail button:nth-of-type(${index + 1})`,
      );
      expect(candidate).not.toBeNull();
      return candidate!;
    });
    if (clueButton.getAttribute("aria-label")?.includes("완료")) continue;

    fireEvent.click(clueButton);
    const tapInput = container.querySelector<HTMLElement>(".gameTapInput");
    if (tapInput != null && index === 0) {
      for (const cell of entry.answerCells) {
        fireEvent.click(within(tapInput).getByRole("button", { name: cell }));
      }
    } else {
      const input = await view.findByLabelText("선택한 단어 답");
      fireEvent.change(input, { target: { value: entry.answer } });
      fireEvent.click(view.getByRole("button", { name: "확인" }));
    }

    await waitFor(() => {
      const label = clueButton.getAttribute("aria-label") ?? "";
      const resultOpen = container.querySelector("#game-result-title") != null;
      expect(label.includes("완료") || resultOpen).toBe(true);
    });
  }

  await view.findByRole("heading", {
    name: "기억의 정원이 더 밝아졌어요",
  });
  const continueButton = view.getByRole("button", {
    name: "지도에서 계속하기",
  }) as HTMLButtonElement;
  await waitFor(() => expect(continueButton.disabled).toBe(false));
  fireEvent.click(continueButton);
  await view.findByRole("heading", {
    name: /번째 말길을 복원했어요/,
  });
}

describe("첫 실행 3보드 화면 플레이스루", () => {
  test("결과·지도·다음 보드와 화면 재마운트 이어하기를 실제 shell에서 연결한다", async () => {
    const storage = new MemoryStorage();
    const contents = loadBundledFirstRunGameContents();
    let container = mount(storage);

    await within(container).findByText("기억의 정원 · 1번째 말길");
    await expectActiveContentIdentity(contents[0]!);
    await solveVisibleBoard(container, contents[0]!);
    fireEvent.click(
      within(container).getByRole("button", { name: "다음 보드 시작" }),
    );
    await within(container).findByText("기억의 정원 · 2번째 말길");

    const boardTwoFirst = contents[1]!.entries[0]!;
    const tapInput = await waitFor(() => {
      const candidate = container.querySelector<HTMLElement>(".gameTapInput");
      expect(candidate).not.toBeNull();
      return candidate!;
    });
    for (const cell of boardTwoFirst.answerCells) {
      fireEvent.click(within(tapInput).getByRole("button", { name: cell }));
    }
    await waitFor(() =>
      expect(
        container
          .querySelector(".gameClueRail button")
          ?.getAttribute("aria-label"),
      ).toContain("완료"),
    );

    disposeActiveSession();
    container = mount(storage);
    await within(container).findByText("기억의 정원 · 2번째 말길");
    await expectActiveContentIdentity(contents[1]!);
    await solveVisibleBoard(container, contents[1]!);

    fireEvent.click(
      within(container).getByRole("button", { name: "다음 보드 시작" }),
    );
    await within(container).findByText("기억의 정원 · 3번째 말길");
    await solveVisibleBoard(container, contents[2]!);
    await within(container).findByText("입문 말길 3개를 모두 복원했어요");

    disposeActiveSession();
    container = mount(storage);
    await within(container).findByText("기억의 정원 · 3번째 말길");
    await expectActiveContentIdentity(contents[2]!);
  });
});
