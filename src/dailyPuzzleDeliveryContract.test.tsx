import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DAILY_PUZZLE_TIERS,
  DIFFICULTY_PROFILES,
  PUZZLE_KEEP_COUNT,
} from "../packages/crossword-core/src";

const root = process.cwd();
const runnerSource = readFileSync(
  join(root, "server/batch/run-puzzle-pack-job.mjs"),
  "utf8",
);
const generatorSource = readFileSync(
  join(root, "server/batch/generate-puzzle-pack.mjs"),
  "utf8",
);
const webSource = readFileSync(join(root, "src/App.tsx"), "utf8");
const mobileSource = readFileSync(join(root, "apps/mobile/App.tsx"), "utf8");

describe("일간 퍼즐 전달 계약", () => {
  it("AC-3: Job은 매일 세 난이도를 생성하고 최근 7일치 21판을 유지한다", () => {
    expect(DAILY_PUZZLE_TIERS.map((tier) => tier.difficulty)).toEqual([
      "easy",
      "normal",
      "hard",
    ]);
    expect(PUZZLE_KEEP_COUNT).toBe(DAILY_PUZZLE_TIERS.length * 7);
    expect(runnerSource).toContain("DAILY_PUZZLE_TIERS.entries()");
    expect(runnerSource).toContain('process.env.PUZZLE_KEEP ?? "21"');
  });

  it("AC-4: Hard 기본 프로파일은 생성 검증값인 8×8과 11개 배치를 사용한다", () => {
    expect(DIFFICULTY_PROFILES.hard.boardSize).toBe(8);
    expect(DIFFICULTY_PROFILES.hard.maxWords).toBe(11);
    expect(DIFFICULTY_PROFILES.hard.minWordCount).toBe(12);
  });

  it("AC-5: Web과 Mobile은 난이도 선택을 퍼즐 변경과 스캐폴드 렌더에 연결한다", () => {
    expect(webSource).toContain("onClick={() => selectPuzzle(summary.puzzleId)}");
    expect(webSource).toContain('className="selectedPuzzleScaffold"');
    expect(webSource).toContain("<MiniPuzzlePreview puzzle={puzzle}");
    expect(mobileSource).toContain("void selectPuzzle(summary.puzzleId)");
    expect(mobileSource).toContain("renderSelectedPuzzleScaffold()");
    expect(mobileSource).toContain("styles.selectedPuzzleScaffold");
  });

  it("AC-6: manifest와 생성 리포트에 다양성 기준과 채택 지표를 기록한다", () => {
    expect(generatorSource).toContain("diversityThresholds: {");
    expect(generatorSource).toContain("diversity: selectedDiversity");
    expect(generatorSource).toContain(
      "diversityThresholds: manifest.diversityThresholds",
    );
  });
});
