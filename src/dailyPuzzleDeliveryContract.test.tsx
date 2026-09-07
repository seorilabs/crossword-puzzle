import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DAILY_PUZZLE_TIERS,
  DIFFICULTY_PROFILES,
  formatDifficultyLabel,
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
const prototypeSource = readFileSync(
  join(root, "scripts/crossword-generator-prototype.mjs"),
  "utf8",
);
const validatorSource = readFileSync(
  join(root, "scripts/validate-puzzle-pack.mjs"),
  "utf8",
);
const profileSource = readFileSync(
  join(root, "packages/crossword-core/src/difficultyProfiles.ts"),
  "utf8",
);
const webSource = readFileSync(join(root, "src/App.tsx"), "utf8");
const webLabelSource = readFileSync(join(root, "src/puzzleLabels.ts"), "utf8");
const mobileSource = readFileSync(join(root, "apps/mobile/App.tsx"), "utf8");
const aitWorkflowSource = readFileSync(
  join(root, ".github/workflows/deploy-apps-in-toss.yml"),
  "utf8",
);

describe("일간 퍼즐 전달 계약", () => {
  it("AC-3: Job은 매일 두 난이도를 생성하고 최근 7일치 14판을 유지한다", () => {
    expect(DAILY_PUZZLE_TIERS.map((tier) => tier.difficulty)).toEqual([
      "easy",
      "hard",
    ]);
    expect(PUZZLE_KEEP_COUNT).toBe(DAILY_PUZZLE_TIERS.length * 7);
    expect(runnerSource).toContain("DAILY_PUZZLE_TIERS.entries()");
    expect(runnerSource).toContain('process.env.PUZZLE_KEEP ?? "14"');
  });

  it("AC-2: 검수 제한 완화 뒤에도 출처·차단·길이·구조 검증을 유지한다", () => {
    expect(generatorSource).toContain(
      "words: words.filter((word) => word.allowForPuzzle !== false)",
    );
    expect(generatorSource).toContain(
      'clueSource: sourceWord?.clueSource ?? "unknown"',
    );
    expect(prototypeSource).toContain(
      "(word) => splitWord(word.answer).length >= options.minWordLength",
    );
    expect(validatorSource).toContain("answerMismatches.length === 0");
    expect(validatorSource).toContain("selfReferentialEntries.length === 0");
  });

  it("AC-3: Hard 기본 프로파일은 생성 검증값인 8×8과 11개 배치를 사용한다", () => {
    expect(DIFFICULTY_PROFILES.hard.boardSize).toBe(8);
    expect(DIFFICULTY_PROFILES.hard.maxWords).toBe(11);
    expect(DIFFICULTY_PROFILES.hard.minWordCount).toBe(12);
  });

  it("AC-4: Web과 Mobile은 오늘의 두 난이도를 사다리 단계로 시작하고 스캐폴드를 렌더한다", () => {
    expect(
      DAILY_PUZZLE_TIERS.map((tier) => formatDifficultyLabel(tier.difficulty)),
    ).toEqual(["쉬움", "어려움"]);
    // 병렬 난이도 선택 대신 core 사다리(buildDailyLadder)로 단계를 만들고, 단계 탭이
    // 곧 시작이 되도록 home_quick_start(source=ladder_step_N)로 계측한다.
    for (const source of [webSource, mobileSource]) {
      expect(source).toContain("buildDailyLadder(");
      expect(source).toContain("buildDailyLadderCtaParams(");
      expect(source).toContain("buildWeeklyStreakStrip(");
    }
    expect(webSource).toContain('className="selectedPuzzleScaffold"');
    expect(webSource).toContain("<MiniPuzzlePreview puzzle={puzzle}");
    expect(mobileSource).toContain("renderSelectedPuzzleScaffold()");
    expect(mobileSource).toContain("styles.selectedPuzzleScaffold");
  });

  it("AC-5: AIT·Android·iOS는 같은 manifest와 공용 난이도 라벨을 사용한다", () => {
    expect(webLabelSource).toContain(
      'export { formatDifficultyLabel } from "../packages/crossword-core/src"',
    );
    expect(mobileSource).toContain("formatDifficultyLabel,");
    expect(mobileSource).toContain("from '../../packages/crossword-core/src';");
    expect(aitWorkflowSource).toContain(
      "https://crossword-puzzle-79ae0.web.app",
    );
    expect(mobileSource).toContain(
      "const REMOTE_PUZZLE_PACK_BASE_URL = 'https://crossword-puzzle-79ae0.web.app';",
    );
  });

  it("AC-7: 사전 뜻풀이 전체 풀을 seed별 후보 추출에 사용한다", () => {
    expect(generatorSource).toContain("? wordBank.words");
    expect(generatorSource).not.toContain("selectWordsForManualClueCoverage(");
  });

  it("AC-12: 플레이 방법 안내의 노출·이탈 단계를 Web/Mobile 모두 계측한다", () => {
    // 무입력 이탈(93명·중앙 7초)이 이 구간에 몰려 있어, 안내를 어디까지 보고
    // 떠났는지를 두 마켓이 같은 이벤트·파라미터로 보내야 한다.
    for (const source of [webSource, mobileSource]) {
      expect(source).toContain("HOW_TO_PLAY_SHOWN_EVENT");
      expect(source).toContain("getHowToPlayOutcomeEvent(");
      expect(source).toContain("buildHowToPlayParams({");
    }
    // 노출은 최초 1회만 남아야 재노출/리렌더로 지표가 부풀지 않는다.
    for (const source of [webSource, mobileSource]) {
      expect(source).toContain("howToPlayShownRef.current");
    }
    // 완료와 중도 이탈이 구분되어야 이탈 지점 분석이 성립한다.
    expect(webSource).toContain("type HowToPlayCloseContext");
    expect(mobileSource).toContain("dismissHowToPlay('complete')");
  });

  it("AC-11: 모든 난이도가 어휘 제한 없이 같은 워드뱅크를 후보로 쓴다", () => {
    // 난이도는 보드 크기와 배치 단어 수로만 가른다. 어휘 등급으로 후보를 나누던
    // 경로(selectWordsForProfile/filterWordsByDifficulty)가 남아 있으면 안 된다.
    expect(generatorSource).not.toContain("selectWordsForProfile");
    expect(generatorSource).not.toContain("filterWordsByDifficulty");
    expect(generatorSource).not.toContain("wordDifficulties");
    expect(profileSource).not.toContain("wordDifficulties");
  });

  it("AC-6: manifest와 생성 리포트에 다양성 기준과 채택 지표를 기록한다", () => {
    expect(generatorSource).toContain("diversityThresholds: {");
    expect(generatorSource).toContain("diversity: selectedDiversity");
    expect(generatorSource).toContain(
      "diversityThresholds: manifest.diversityThresholds",
    );
  });

  it("AC-8: 같은 날짜의 앞 난이도 정답은 다음 난이도 후보에서 제외한다", () => {
    expect(generatorSource).toContain(
      "const slotGenerationWords = excludeAnswersSharingFragments(",
    );
    expect(generatorSource).toContain(
      "sameDateAnswerHistory.answers.has(answer)",
    );
    expect(generatorSource).toContain("maxSameDateSharedAnswers: 0");
  });

  it("AC-9: 최근 발행 정답과 어근을 공유하는 후보도 제외한다", () => {
    expect(generatorSource).toContain(
      "...slotDiversityHistory.flatMap((snapshot) => snapshot.answers),",
    );
    expect(generatorSource).toContain(
      "answerVarietyThresholds.sharedFragmentLength,",
    );
  });

  it("AC-10: 한 판 안의 어근 군집을 배치 단계와 발행 직전에 모두 막는다", () => {
    expect(prototypeSource).toContain(
      "violatesAnswerVariety(runAnalysis.runs, options)",
    );
    expect(prototypeSource).toContain(
      "!violatesAnswerVariety(boardRuns, options)",
    );
    expect(generatorSource).toContain("if (!publishedVariety.pass) {");
    expect(generatorSource).toContain('"sharedAnswerFragment"');
    expect(generatorSource).toContain('"maxAnswersPerSyllable"');
  });
});
