import { readFileSync } from "node:fs";

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
import type { GameJourneyItem } from "./firstRunGameModel.ts";
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

function mount(
  storage: KeyValueStoragePort,
  journeyItems?: readonly GameJourneyItem[],
  journeyMode?: "launch-preview",
) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  activeSession = mountGameExperience(container, {
    analytics: { log: () => undefined },
    analyticsMarket: "apps-in-toss",
    hostKind: "web",
    storage,
    journeyItems,
    journeyMode,
    launchConfig: defaultLaunchConfig,
    uiLocale: "ko-KR",
  });
  return container;
}

function createLaunchPreviewJourney(): readonly GameJourneyItem[] {
  const bundledContents = loadBundledFirstRunGameContents();
  return Object.freeze(
    Array.from({ length: 7 }, (_, index) => {
      const source = bundledContents[index % bundledContents.length]!;
      const boardNumber = index + 1;
      const content: GameContentV1 = {
        ...source,
        puzzleId: `launch-preview-${boardNumber}`,
        packId: "launch-preview-pack",
        slotId: `2026-07-${String(19 + boardNumber).padStart(2, "0")}`,
        grid: Array.from({ length: 9 }, (_, row) =>
          Array.from({ length: 9 }, (_, col) => source.grid[row]?.[col] ?? ""),
        ),
        entries: source.entries.map((entry) => ({
          ...entry,
          answerCells: [...entry.answerCells],
          domainTags: [...entry.domainTags],
        })),
        themeId: `launch-preview-theme-${boardNumber}`,
        contentChecksum: `preview:launch-candidate-${boardNumber}:v1`,
      };
      return Object.freeze({
        content,
        mapNodeId: `launch-preview-node-${boardNumber}`,
        cardIds: Object.freeze([]) as readonly string[],
      });
    }),
  );
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
  test("모바일 폭에서 캔버스의 intrinsic width가 게임 그리드 열을 넓히지 않는다", () => {
    const gameExperienceCss = readFileSync(
      "src/game-shell/GameExperience.css",
      "utf8",
    );
    const gameExperienceRule = gameExperienceCss.match(
      /\.gameExperience\s*\{(?<declarations>[^}]+)\}/u,
    )?.groups?.declarations;

    expect(gameExperienceRule).toMatch(
      /grid-template-columns:\s*minmax\(0,\s*1fr\);/u,
    );
  });

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

  test("주입한 9×9 생성 후보 7보드를 지도·다음 보드·마지막 재시작까지 연결한다", async () => {
    const storage = new MemoryStorage();
    const journeyItems = createLaunchPreviewJourney();
    const container = mount(storage, journeyItems, "launch-preview");
    const view = within(container);

    await view.findByText("생성 후보 보드 미리보기");
    await view.findByText("1/7 · 검토 후보 · 출시 승인 전");
    await expectActiveContentIdentity(journeyItems[0]!.content);

    for (const [index, journeyItem] of journeyItems.entries()) {
      await view.findByText(`${index + 1}/7 · 검토 후보 · 출시 승인 전`);
      await solveVisibleBoard(container, journeyItem.content);
      expect(container.querySelectorAll(".gameMapPath span")).toHaveLength(7);

      if (index < journeyItems.length - 1) {
        fireEvent.click(view.getByRole("button", { name: "다음 보드 시작" }));
      }
    }

    await view.findByText("생성 후보 보드 7개를 모두 확인했어요");
    await view.findByText(
      "출시 승인 전 검토용 후보이며 정식 콘텐츠 확정을 뜻하지 않습니다.",
    );
    fireEvent.click(view.getByRole("button", { name: "7번째 보드 다시 풀기" }));
    await waitFor(() =>
      expect(container.querySelector(".gameClueRail")).not.toBeNull(),
    );
    expect(view.getByText("7/7 · 검토 후보 · 출시 승인 전")).toBeTruthy();
  }, 15_000);
});
