import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ANSWER_HISTORY_VERSION,
  collectHistoryAnswers,
  createEmptyAnswerHistory,
  diffDateKeys,
  excludeExactAnswers,
  findAnswerHistoryRepeats,
  isValidDateKey,
  makeAnswerHistoryEntry,
  parseAnswerHistory,
  selectAnswerHistoryWindow,
  shiftDateKey,
  summarizeAnswerExclusion,
  upsertAnswerHistory,
  type AnswerHistoryEntry,
} from "./answerHistory.ts";

function entry(
  puzzleId: string,
  date: string,
  difficulty: "easy" | "hard",
  answers: string[],
  slotId = `${date}-${difficulty === "easy" ? "h00" : "h01"}`,
): AnswerHistoryEntry {
  return { puzzleId, date, difficulty, slotId, answers };
}

describe("answerHistory 날짜 산술", () => {
  it("월·연 경계를 넘어 일 단위로 이동한다", () => {
    assert.equal(shiftDateKey("2026-09-01", -1), "2026-08-31");
    assert.equal(shiftDateKey("2026-12-31", 1), "2027-01-01");
    assert.equal(shiftDateKey("2026-09-07", -90), "2026-06-09");
    assert.equal(diffDateKeys("2026-09-05", "2026-09-01"), 4);
    assert.equal(diffDateKeys("2026-09-01", "2026-09-05"), -4);
  });

  it("YYYY-MM-DD 형식만 유효한 날짜로 본다", () => {
    assert.equal(isValidDateKey("2026-09-07"), true);
    assert.equal(isValidDateKey("2026-02-30"), false);
    assert.equal(isValidDateKey("26090700"), false);
    assert.equal(isValidDateKey(undefined), false);
  });
});

describe("parseAnswerHistory", () => {
  it("객체가 아니거나 puzzles 가 배열이 아니면 null 이다", () => {
    assert.equal(parseAnswerHistory(null), null);
    assert.equal(parseAnswerHistory("x"), null);
    assert.equal(parseAnswerHistory({ puzzles: "nope" }), null);
  });

  it("손상 항목은 버리고 개수를 알리며 정답을 정규화한다", () => {
    const parsed = parseAnswerHistory({
      version: 1,
      updatedAt: "2026-09-07T00:00:00.000Z",
      retentionDays: 30,
      puzzles: [
        {
          puzzleId: "26090700",
          date: "2026-09-07",
          difficulty: "easy",
          slotId: "2026-09-07-h00",
          answers: [" 단면 ", "도사", "단면", "", 3],
        },
        { puzzleId: "bad", date: "26090701", difficulty: "hard", answers: [] },
        { puzzleId: "bad2", date: "2026-09-07", difficulty: "normal", answers: [] },
        "garbage",
      ],
    });

    assert.notEqual(parsed, null);
    assert.equal(parsed?.droppedEntryCount, 3);
    assert.equal(parsed?.history.retentionDays, 30);
    assert.equal(parsed?.history.version, ANSWER_HISTORY_VERSION);
    assert.deepEqual(parsed?.history.puzzles, [
      entry("26090700", "2026-09-07", "easy", ["단면", "도사"]),
    ]);
  });
});

describe("upsertAnswerHistory", () => {
  it("같은 슬롯은 교체하고 보관 기간 이전 항목은 지우며 최신순으로 정렬한다", () => {
    const history = upsertAnswerHistory(
      createEmptyAnswerHistory(90),
      [
        entry("26060100", "2026-06-01", "easy", ["옛말"]),
        entry("26090100", "2026-09-01", "easy", ["기조"]),
        entry("26090101", "2026-09-01", "hard", ["기분파"]),
      ],
      { retentionDays: 90, today: "2026-09-07", updatedAt: "2026-09-07T00:00:00Z" },
    );

    assert.deepEqual(
      history.puzzles.map((item) => item.puzzleId),
      ["26090101", "26090100"],
    );

    const rerun = upsertAnswerHistory(
      history,
      [entry("26090101", "2026-09-01", "hard", ["새정답"])],
      { retentionDays: 90, today: "2026-09-07" },
    );

    assert.equal(rerun.puzzles.length, 2);
    assert.deepEqual(rerun.puzzles[0].answers, ["새정답"]);
    assert.equal(rerun.retentionDays, 90);
  });

  it("today 보다 미래 날짜의 항목은 지우지 않는다", () => {
    const history = upsertAnswerHistory(
      createEmptyAnswerHistory(),
      [entry("26091000", "2026-09-10", "easy", ["미래"])],
      { retentionDays: 7, today: "2026-09-01" },
    );

    assert.equal(history.puzzles.length, 1);
  });
});

describe("selectAnswerHistoryWindow", () => {
  const history = upsertAnswerHistory(
    createEmptyAnswerHistory(),
    [
      entry("26060900", "2026-06-09", "easy", ["경계"]),
      entry("26060800", "2026-06-08", "hard", ["밖"]),
      entry("26082400", "2026-08-24", "hard", ["십사일"]),
      entry("26082300", "2026-08-23", "easy", ["십오일"]),
      entry("26090700", "2026-09-07", "easy", ["오늘"]),
      entry("26090701", "2026-09-07", "hard", ["오늘하드"]),
    ],
    { retentionDays: 365, today: "2026-09-07" },
  );

  it("90일 창은 포함 경계이고 두 난이도를 모두 담는다", () => {
    const window = selectAnswerHistoryWindow(history, {
      today: "2026-09-07",
      days: 90,
    });

    assert.deepEqual(
      window.map((item) => item.puzzleId).sort(),
      ["26060900", "26082300", "26082400", "26090700", "26090701"],
    );
  });

  it("14일 창은 같은 날짜의 다른 난이도를 포함하고 현재 슬롯은 제외한다", () => {
    const window = selectAnswerHistoryWindow(history, {
      today: "2026-09-07",
      days: 14,
      excludeSlotId: "2026-09-07-h00",
      excludePuzzleId: "26090700",
    });

    assert.deepEqual(
      window.map((item) => item.puzzleId).sort(),
      ["26082400", "26090701"],
    );
    assert.deepEqual([...collectHistoryAnswers(window)].sort(), [
      "십사일",
      "오늘하드",
    ]);
  });

  it("days 가 0이면 아무것도 고르지 않는다", () => {
    assert.deepEqual(
      selectAnswerHistoryWindow(history, { today: "2026-09-07", days: 0 }),
      [],
    );
  });
});

describe("excludeExactAnswers", () => {
  it("정확히 같은 정답만 제외하고 어근만 겹치는 후보는 남긴다", () => {
    const words = [
      { answer: "학생" },
      { answer: "대학생" },
      { answer: "기분파" },
      { answer: "도사" },
    ];

    assert.deepEqual(
      excludeExactAnswers(words, ["학생", " 기분파 "]).map((word) => word.answer),
      ["대학생", "도사"],
    );
    assert.deepEqual(excludeExactAnswers(words, []), words);
  });
});

describe("summarizeAnswerExclusion", () => {
  it("정확 배제와 어근 배제 수를 각각 센다", () => {
    const exact = [entry("a", "2026-09-01", "easy", ["가", "나"])];
    const fragment = [entry("b", "2026-09-06", "hard", ["다"])];

    assert.deepEqual(
      summarizeAnswerExclusion({
        totalWordCount: 100,
        afterExactCount: 98,
        afterFragmentCount: 90,
        exactEntries: exact,
        fragmentEntries: fragment,
        answerHistoryDays: 90,
        fragmentHistoryDays: 14,
      }),
      {
        answerHistoryDays: 90,
        fragmentHistoryDays: 14,
        historyExactPuzzleCount: 1,
        historyExactAnswerCount: 2,
        historyExactExcludedWordCount: 2,
        historyFragmentPuzzleCount: 1,
        historyFragmentAnswerCount: 1,
        historyFragmentExcludedWordCount: 8,
      },
    );
  });
});

describe("findAnswerHistoryRepeats", () => {
  const history = upsertAnswerHistory(
    createEmptyAnswerHistory(),
    [
      entry("26090101", "2026-09-01", "hard", ["기분파", "국문"]),
      entry("26090500", "2026-09-05", "easy", ["기분파", "전구"]),
      entry("26090501", "2026-09-05", "hard", ["전구"]),
      entry("26060100", "2026-06-01", "easy", ["국문"]),
    ],
    { retentionDays: 365, today: "2026-09-07" },
  );

  it("난이도가 다른 날짜 사이의 정확 반복(기분파 9/1 hard → 9/5 easy)을 잡는다", () => {
    const repeats = findAnswerHistoryRepeats(
      [entry("26090500", "2026-09-05", "easy", ["기분파", "전구"])],
      history,
      { days: 90 },
    );

    assert.deepEqual(repeats, [
      {
        answer: "기분파",
        puzzleId: "26090500",
        date: "2026-09-05",
        difficulty: "easy",
        previousPuzzleId: "26090101",
        previousDate: "2026-09-01",
        previousDifficulty: "hard",
        gapDays: 4,
      },
    ]);
  });

  it("같은 퍼즐 자신과 같은 날짜의 다른 난이도, 창 밖의 항목은 무시한다", () => {
    const repeats = findAnswerHistoryRepeats(
      [entry("26090501", "2026-09-05", "hard", ["전구", "국문"])],
      history,
      { days: 30 },
    );

    assert.deepEqual(
      repeats.map((repeat) => [repeat.answer, repeat.previousPuzzleId]),
      [["국문", "26090101"]],
    );
  });
});

describe("makeAnswerHistoryEntry", () => {
  it("퍼즐 entries 에서 정답만 뽑아 항목을 만든다", () => {
    assert.deepEqual(
      makeAnswerHistoryEntry({
        puzzleId: "26090700",
        date: "2026-09-07",
        difficulty: "easy",
        slotId: "2026-09-07-h00",
        entries: [
          { answer: "단면" },
          { answer: "도사 " },
          { answer: "단면" },
        ] as never,
      }),
      entry("26090700", "2026-09-07", "easy", ["단면", "도사"]),
    );
  });
});
