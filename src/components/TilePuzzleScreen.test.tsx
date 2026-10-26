import { setUiLanguage } from "../adapters/languageRepository";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLetterTileState,
  getCellKey,
  getEntryCells,
  type Puzzle,
} from "../../packages/crossword-core/src";
import source from "../../qa/fixtures/single-daily-18.json";
import {
  TilePuzzleScreen,
  type TilePuzzleScreenProps,
} from "./TilePuzzleScreen";
const puzzle = source as Puzzle;
afterEach(() => {
  cleanup();
  setUiLanguage("ko");
});
function Harness({
  paused = false,
  guide,
}: {
  paused?: boolean;
  guide?: TilePuzzleScreenProps["guide"];
}) {
  const [state, setState] = useState(() => createLetterTileState(puzzle));
  return (
    <TilePuzzleScreen
      puzzle={puzzle}
      state={state}
      hasStarted
      isPaused={paused}
      onChange={setState}
      onBack={() => {}}
      onStart={() => {}}
      onResume={() => {}}
      onSettings={() => {}}
      guide={guide}
    />
  );
}
describe("실제 타일 입력 화면", () => {
  it("시스템 입력칸 없이 타일만 눌러 모든 단어를 완성하고 완료 단서도 다시 열 수 있다", () => {
    const { container } = render(<Harness />);
    expect(container.querySelector("input,textarea")).toBeNull();
    for (const entry of puzzle.entries) {
      fireEvent.click(screen.getByRole("button", { name: /단서 목록/ }));
      const dialog = screen.getByRole("dialog", { name: "단서 목록" });
      const clue = within(dialog).getByText(entry.clue).closest("button")!;
      fireEvent.click(clue);
      const answers = screen
        .getByRole("group", { name: "현재 단어 답칸" })
        .querySelectorAll("button");
      for (const [i, key] of getEntryCells(entry)
        .map((cell) => getCellKey(cell.row, cell.col))
        .entries()) {
        if (answers[i].disabled) continue;
        const tile = within(screen.getByLabelText("글자 후보", { exact: true }))
          .getAllByRole("button", {
            name: `${[...entry.answer][i]}, 선택 가능`,
          })
          .find((button) => !(button as HTMLButtonElement).disabled);
        expect(tile, `${entry.id} ${key}`).toBeTruthy();
        fireEvent.click(tile!);
      }
    }
    expect(screen.getByText("이미 완성한 단어예요.")).toBeTruthy();
    expect(container.querySelectorAll(".tileConfirmed").length).toBeGreaterThan(
      18,
    );
  });
  it("부분 입력을 지운 타일은 같은 자리에 돌아온다", () => {
    const { container } = render(<Harness />);
    const candidate = container.querySelector<HTMLButtonElement>(
      ".tilePiece:not(:disabled)",
    )!;
    const id = candidate.dataset.tileId;
    fireEvent.click(candidate);
    expect(
      container.querySelector(`[data-tile-id="${id}"]`)?.className,
    ).toContain("tileUsed");
    fireEvent.click(screen.getByRole("button", { name: /지우기/ }));
    expect(
      container.querySelector(`[data-tile-id="${id}"]`)?.className,
    ).not.toContain("tileUsed");
  });
  it("힌트와 보상 광고 진입이 없고, 정지 중에는 입력이 막힌다", () => {
    const { rerender, container } = render(<Harness />);
    expect(screen.queryByRole("button", { name: /힌트|광고/ })).toBeNull();
    rerender(<Harness paused />);
    expect(
      [...container.querySelectorAll<HTMLButtonElement>(".tilePiece")].every(
        (tile) => tile.disabled,
      ),
    ).toBe(true);
    expect(screen.getByRole("button", { name: "이어서 풀기" })).toBeTruthy();
  });
  it("안내 건너뛰기는 입력을 바꾸지 않는다", () => {
    const onSkip = vi.fn();
    const { container } = render(
      <Harness guide={{ completed: 0, total: 3, onSkip }} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "첫 세 단어 안내 건너뛰기" }),
    );
    expect(onSkip).toHaveBeenCalledOnce();
    expect(container.querySelectorAll(".tileUsed")).toHaveLength(0);
  });
});

it("AC-6 empty English answer slots have fully translated accessibility labels", () => {
  setUiLanguage("en");
  render(<Harness />);
  const slots = screen.getByRole("group", {
    name: "Current word answer slots",
  });
  expect(
    within(slots)
      .getAllByRole("button")
      .every(
        (button) => !/[가-힣]/.test(button.getAttribute("aria-label") ?? ""),
      ),
  ).toBe(true);
  expect(
    within(slots).getAllByRole("button")[0].getAttribute("aria-label"),
  ).toContain("empty");
});
