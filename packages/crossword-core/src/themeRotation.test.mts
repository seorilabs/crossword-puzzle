import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  resolveScheduledTheme,
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
