import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PuzzleMetaChips } from "./PuzzleMetaChips";

afterEach(cleanup);

describe("PuzzleMetaChips (#248)", () => {
  it("renders a theme chip with icon + label when themeLabel is present", () => {
    const { container } = render(
      <PuzzleMetaChips difficulty="normal" themeLabel="음식" themeTag="food" />,
    );

    const themeChip = container.querySelector(".puzzleChipTheme");
    expect(themeChip).not.toBeNull();
    expect(themeChip?.textContent).toBe("🍎 음식");
  });

  it("renders the theme label without icon for an unknown themeTag", () => {
    const { container } = render(
      <PuzzleMetaChips themeLabel="우주" themeTag="space" />,
    );

    expect(container.querySelector(".puzzleChipTheme")?.textContent).toBe(
      "우주",
    );
  });

  it("does not render a theme chip when themeLabel is absent", () => {
    const { container } = render(<PuzzleMetaChips difficulty="normal" />);

    expect(container.querySelector(".puzzleChipTheme")).toBeNull();
    expect(container.querySelector(".puzzleChipDifficulty")?.textContent).toBe(
      "보통",
    );
  });

  it("renders the difficulty chip in Korean for each tier", () => {
    for (const [difficulty, label] of [
      ["easy", "쉬움"],
      ["normal", "보통"],
      ["hard", "어려움"],
    ] as const) {
      const { container } = render(
        <PuzzleMetaChips difficulty={difficulty} />,
      );
      expect(container.querySelector(".puzzleChipDifficulty")?.textContent).toBe(
        label,
      );
      cleanup();
    }
  });

  it("renders nothing when neither theme nor difficulty is available", () => {
    const { container } = render(<PuzzleMetaChips />);

    expect(container.querySelector(".puzzleMetaChips")).toBeNull();
    expect(container.firstChild).toBeNull();
  });
});
