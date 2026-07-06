import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

// cwd 에 의존하지 않도록 이 테스트 파일 위치(packages/crossword-core/src)에서
// 리포 루트를 상대 해소한다. 어떤 디렉터리에서 test:core 를 실행해도 데이터 파일을
// 안정적으로 찾는다.
const PUZZLE_WORD_FILTER_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "data",
  "lexicon",
  "puzzle-word-filter.json",
);

import {
  isKnownThemeCategory,
  resolveScheduledTheme,
  THEME_CATEGORY_IDS,
  THEMED_SLOT_HOUR,
  WEEKDAY_THEME_ROTATION,
} from "./themeRotation.ts";

describe("resolveScheduledTheme (#249)", () => {
  it("배정 슬롯이 아닌 시각에는 항상 null 을 반환한다", () => {
    for (let hour = 0; hour < 24; hour += 1) {
      if (hour === THEMED_SLOT_HOUR) continue;
      assert.equal(
        resolveScheduledTheme({ weekday: 1, slotHour: hour }),
        null,
        `slotHour=${hour} 는 주제 미배정이어야 한다`,
      );
    }
  });

  it("정오 슬롯에서 요일 로테이션 표의 주제를 반환한다", () => {
    for (let weekday = 0; weekday < 7; weekday += 1) {
      assert.equal(
        resolveScheduledTheme({ weekday, slotHour: THEMED_SLOT_HOUR }),
        WEEKDAY_THEME_ROTATION[weekday],
      );
    }
  });

  it("모든 요일이 정오에 하나 이상의 주제를 배정받아 매일 최소 1개의 주제 퍼즐이 보장된다", () => {
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const theme = resolveScheduledTheme({
        weekday,
        slotHour: THEMED_SLOT_HOUR,
      });
      assert.ok(
        theme != null && theme.length > 0,
        `weekday=${weekday} 정오 슬롯에 주제가 배정돼야 한다`,
      );
    }
  });

  it("범위를 벗어난 요일도 modulo 로 표 안으로 정규화한다", () => {
    assert.equal(
      resolveScheduledTheme({ weekday: 7, slotHour: THEMED_SLOT_HOUR }),
      WEEKDAY_THEME_ROTATION[0],
    );
    assert.equal(
      resolveScheduledTheme({ weekday: -6, slotHour: THEMED_SLOT_HOUR }),
      WEEKDAY_THEME_ROTATION[1],
    );
  });

  it("로테이션 표는 기본 4개 카테고리 안에서만 배정한다", () => {
    const allowed = new Set(["food", "animal", "nature", "body", null]);
    for (const tag of WEEKDAY_THEME_ROTATION) {
      assert.ok(allowed.has(tag), `예상치 못한 주제 태그: ${tag}`);
    }
  });
});

describe("주제 카테고리 단일 출처 계약(#257)", () => {
  it("THEME_CATEGORY_IDS 가 puzzle-word-filter.json 의 themeCategories 와 일치한다", () => {
    // 워드뱅크 필터 데이터가 단일 출처이며, core 는 fs 를 못 쓰므로 상수로 미러링한다.
    // 이 테스트가 데이터↔core 드리프트(카테고리 추가/이름 변경)를 잡는 가드다.
    const filter = JSON.parse(
      readFileSync(PUZZLE_WORD_FILTER_PATH, "utf8"),
    ) as { themeCategories: { id: string }[] };
    const dataIds = new Set(filter.themeCategories.map((category) => category.id));
    const coreIds = new Set<string>(THEME_CATEGORY_IDS);
    assert.deepEqual(
      [...coreIds].sort(),
      [...dataIds].sort(),
      "THEME_CATEGORY_IDS 와 themeCategories[].id 집합이 어긋납니다",
    );
  });

  it("로테이션 표의 모든 태그가 화이트리스트(isKnownThemeCategory)를 통과한다", () => {
    for (const tag of WEEKDAY_THEME_ROTATION) {
      if (tag === null) continue;
      assert.ok(
        isKnownThemeCategory(tag),
        `로테이션 태그 ${tag} 가 화이트리스트 밖입니다`,
      );
    }
  });

  it("isKnownThemeCategory 는 미등록 태그·null·undefined 를 거부한다", () => {
    assert.equal(isKnownThemeCategory("food"), true);
    assert.equal(isKnownThemeCategory("space"), false);
    assert.equal(isKnownThemeCategory(null), false);
    assert.equal(isKnownThemeCategory(undefined), false);
  });
});
