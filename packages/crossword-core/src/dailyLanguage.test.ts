import assert from "node:assert/strict";
import { test } from "node:test";
import {
  contentDate,
  contentDateRefreshDelay,
  defaultLanguage,
  dailyPuzzles,
  normalizeEnglishAnswer,
  dailyCompletionDates,
  languageTelemetry,
  languagePolicy,
} from "./dailyLanguage.ts";

test("AC-1 language defaults, KST and local dates include DST without timezone-specific puzzle identities", () => {
  assert.equal(defaultLanguage("ko-KR"), "ko");
  assert.equal(defaultLanguage("fr-FR"), "en");
  const now = new Date("2026-03-08T07:00:00Z");
  assert.equal(contentDate("en", now, "America/Los_Angeles"), "2026-03-07");
  assert.equal(contentDate("en", now, "America/New_York"), "2026-03-08");
  assert.equal(contentDate("ko", now, "America/Los_Angeles"), "2026-03-08");
  assert.equal(
    contentDate("en", new Date("2026-11-01T06:30:00Z"), "America/New_York"),
    "2026-11-01",
  );
});
test("AC-1 daily five are ordered and future/wrong language never substitute", () => {
  const rows = [5, 3, 1, 4, 2].map((dailySequence) => ({
    puzzleId: `en-20261026-${dailySequence}`,
    language: "en" as const,
    dailySequence,
    date: "2026-10-26",
    path: "/p.json",
  }));
  assert.deepEqual(
    dailyPuzzles(
      [
        ...rows,
        { ...rows[0], date: "2026-10-27" },
        { ...rows[0], language: "ko" },
      ],
      "en",
      "2026-10-26",
    ).map((x) => x.dailySequence),
    [1, 2, 3, 4, 5],
  );
  assert.equal(dailyPuzzles(rows, "ko", "2026-10-26").length, 0);
});
test("AC-2 English uses A-Z and independent variety policy", () => {
  assert.equal(normalizeEnglishAnswer(" letter "), "LETTER");
  assert.throws(() => normalizeEnglishAnswer("café"));
  assert.deepEqual(languagePolicy("en").words, [12, 18]);
  assert.deepEqual(languagePolicy("ko").words, [18, 22]);
  assert.equal(languagePolicy("en").hangulVariety, false);
});
test("AC-3 one streak day per content language and date including legacy Korean", () => {
  assert.deepEqual(
    dailyCompletionDates(
      [
        { date: "2026-10-26" },
        { date: "2026-10-26", language: "ko" },
        { date: "2026-10-25", language: "en" },
      ],
      "ko",
    ),
    ["2026-10-26"],
  );
  assert.deepEqual(
    languageTelemetry({ language: "en", dailySequence: 3 }, "en"),
    { content_language: "en", ui_language: "en", daily_sequence: 3 },
  );
});
test("AC-3 a legacy Korean board stays resumable and does not create a sixth daily slot", () => {
  const modern = [1, 2, 3, 4, 5].map((dailySequence) => ({
    puzzleId: `ko-day-${dailySequence}`,
    language: "ko" as const,
    dailySequence,
    date: "2026-10-26",
    path: "/x",
  }));
  const legacy = { puzzleId: "26102601", date: "2026-10-26", path: "/old" };
  assert.equal(dailyPuzzles([legacy, ...modern], "ko", "2026-10-26").length, 5);
  assert.ok(
    !dailyPuzzles([legacy, ...modern], "ko", "2026-10-26").some(
      (p) => p.puzzleId === legacy.puzzleId,
    ),
  );
});

test("AC-1 date refresh waits exactly for KST midnight", () => {
  assert.equal(
    contentDateRefreshDelay("ko", new Date("2026-10-26T14:59:59.500Z")),
    500,
  );
  assert.equal(
    contentDateRefreshDelay("ko", new Date("2026-10-26T15:00:00Z")),
    86400000,
  );
});
