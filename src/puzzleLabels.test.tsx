import { describe, expect, it } from "vitest";

import {
  formatDifficultyLabel,
  formatThemeChipLabel,
  formatThemeHeadline,
  getThemeChipIcon,
} from "./puzzleLabels";

describe("formatDifficultyLabel", () => {
  it("maps each tier to a Korean label", () => {
    expect(formatDifficultyLabel("easy")).toBe("쉬움");
    expect(formatDifficultyLabel("normal")).toBe("보통");
    expect(formatDifficultyLabel("hard")).toBe("어려움");
  });

  it("returns an empty string for an undefined difficulty", () => {
    expect(formatDifficultyLabel(undefined)).toBe("");
  });
});

describe("getThemeChipIcon", () => {
  it("returns an icon for the four base themes", () => {
    expect(getThemeChipIcon("food")).toBe("🍎");
    expect(getThemeChipIcon("animal")).toBe("🐾");
    expect(getThemeChipIcon("nature")).toBe("🌿");
    expect(getThemeChipIcon("body")).toBe("🫀");
  });

  it("returns an empty string for unknown or missing themeTag", () => {
    expect(getThemeChipIcon("space")).toBe("");
    expect(getThemeChipIcon(undefined)).toBe("");
  });
});

describe("formatThemeChipLabel (#248)", () => {
  it("prefixes the icon when the themeTag is known", () => {
    expect(formatThemeChipLabel("음식", "food")).toBe("🍎 음식");
  });

  it("falls back to the bare label for unknown themeTag", () => {
    expect(formatThemeChipLabel("우주", "space")).toBe("우주");
  });

  it("returns null when the label is missing or blank", () => {
    expect(formatThemeChipLabel(undefined, "food")).toBeNull();
    expect(formatThemeChipLabel("   ", "food")).toBeNull();
  });
});

describe("formatThemeHeadline (#248)", () => {
  it("builds the '오늘의 주제' line when a label exists", () => {
    expect(formatThemeHeadline("동물")).toBe("오늘의 주제: 동물");
  });

  it("returns null for missing or blank labels (no line for generic puzzles)", () => {
    expect(formatThemeHeadline(undefined)).toBeNull();
    expect(formatThemeHeadline("")).toBeNull();
    expect(formatThemeHeadline("  ")).toBeNull();
  });
});
