import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chooseFirstWordGuide,
  normalizeFirstWordGuide,
  restoreFirstWordGuide,
} from "./firstWordGuide.ts";
import type { PuzzleEntry } from "./types.ts";
const entry = (id: string, answer: string, vocabularyLevel?: string) =>
  ({
    id,
    answer,
    vocabularyLevel,
    clue: id,
    row: 0,
    col: 0,
    direction: "across",
    generatedBy: "placed",
  }) as PuzzleEntry;
test("첫 세 단서는 익숙한 짧은 단어를 추천하며 원래 단어 목록은 보존한다", () => {
  const entries = [
    entry("long", "가나다라마"),
    entry("advanced", "구조", "고급"),
    entry("short", "나무", "초급"),
    entry("middle", "고등어", "중급"),
    entry("basic", "자동차", "초급"),
  ];
  assert.deepEqual(chooseFirstWordGuide(entries), ["short", "basic", "middle"]);
  assert.equal(entries.length, 5);
});
test("안내 저장은 명시적 상태만 복원하며 전체 퍼즐 완료와 독립이다", () => {
  assert.deepEqual(
    normalizeFirstWordGuide({
      version: 1,
      puzzleId: "p",
      entryIds: ["a", "b", "c"],
      status: "active",
    }),
    { version: 1, puzzleId: "p", entryIds: ["a", "b", "c"], status: "active" },
  );
  assert.equal(normalizeFirstWordGuide({ version: 2 }), undefined);
});

test("같은 어휘 등급에서는 검수한 단서를 먼저 안내한다", () => {
  const reviewed = {
    ...entry("reviewed", "가게", "초급"),
    clueSource: "manual",
  };
  assert.equal(
    chooseFirstWordGuide([entry("dictionary", "주인", "초급"), reviewed])[0],
    "reviewed",
  );
});

test("기존 진행과 완료 판은 열기만 해도 새 첫 세 단어 안내를 완료하지 않는다", () => {
  const entries = [entry("a", "나무")];
  assert.equal(
    restoreFirstWordGuide({
      puzzleId: "old",
      entries,
      legacySeen: false,
      hasProgress: true,
    }),
    undefined,
  );
  const active = restoreFirstWordGuide({
    puzzleId: "today",
    entries,
    legacySeen: false,
    hasProgress: false,
  })!;
  assert.equal(active.status, "active");
  assert.deepEqual(
    restoreFirstWordGuide({
      previous: active,
      puzzleId: "today",
      entries,
      legacySeen: true,
      hasProgress: true,
    }),
    active,
  );
  assert.deepEqual(
    restoreFirstWordGuide({
      previous: active,
      puzzleId: "old",
      entries,
      legacySeen: true,
      hasProgress: true,
    }),
    active,
  );
});

test("지난 미시작 판을 열어도 오늘 진행 중인 첫 안내를 덮어쓰지 않는다", () => {
  const active = restoreFirstWordGuide({
    puzzleId: "today",
    entries: [entry("today-a", "나무")],
    legacySeen: false,
    hasProgress: false,
  })!;
  const afterArchive = restoreFirstWordGuide({
    previous: active,
    puzzleId: "archive",
    entries: [entry("old-a", "하늘")],
    legacySeen: true,
    hasProgress: false,
  });
  assert.deepEqual(afterArchive, active);
  assert.deepEqual(
    restoreFirstWordGuide({
      previous: afterArchive,
      puzzleId: "today",
      entries: [entry("today-a", "나무")],
      legacySeen: true,
      hasProgress: true,
    }),
    active,
  );
});
