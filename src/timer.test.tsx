// 일시정지 경과 표시 헬퍼(timer.ts) 회귀 테스트.
// App.tsx의 완료 텔레메트리(elapsed_seconds)·결과 화면 경과 라벨 경로가 모두
// 일시정지 누적(pausedMs)을 제외함을 고정한다. best-time 비교는 코어
// computeElapsedMs(별도 단위 테스트)와 같은 입력을 쓰므로 함께 보장된다.
import { describe, expect, it } from "vitest";

import { formatElapsedTime, formatLiveTimer, getElapsedSeconds } from "./timer";

const startedAt = "2026-06-29T00:00:00.000Z";
const completedAt = "2026-06-29T00:02:00.000Z"; // +120s

describe("getElapsedSeconds (완료/텔레메트리 경로)", () => {
  it("일시정지 누적(pausedMs)을 제외한 초를 반환한다", () => {
    // 120s 풀이 중 30s 정지 → 90s
    expect(getElapsedSeconds(startedAt, completedAt, { pausedMs: 30_000 })).toBe(
      90,
    );
  });

  it("pause 인자가 없으면 단순 경과(기존 동작 유지)", () => {
    expect(getElapsedSeconds(startedAt, completedAt)).toBe(120);
  });

  it("시작 시각이 없으면 undefined", () => {
    expect(getElapsedSeconds(undefined, completedAt)).toBeUndefined();
  });
});

describe("formatElapsedTime (결과 화면 라벨)", () => {
  it("일시정지 누적을 제외하고 라벨을 만든다", () => {
    // 120s - 65s = 55s
    expect(formatElapsedTime(startedAt, completedAt, 65_000)).toBe("55초");
  });

  it("분 단위 라벨도 정지 구간 제외로 계산한다", () => {
    // +200s 완료, 20s 정지 → 180s = 3분 00초
    expect(
      formatElapsedTime(startedAt, "2026-06-29T00:03:20.000Z", 20_000),
    ).toBe("3분 00초");
  });

  it("정지가 없으면 전체 경과로 라벨을 만든다", () => {
    expect(formatElapsedTime(startedAt, completedAt)).toBe("2분 00초");
  });

  it("시작/완료 누락이면 null", () => {
    expect(formatElapsedTime(undefined, completedAt)).toBeNull();
    expect(formatElapsedTime(startedAt, undefined)).toBeNull();
  });
});

describe("formatLiveTimer", () => {
  it("m:ss 포맷으로 표시한다", () => {
    expect(formatLiveTimer(0)).toBe("0:00");
    expect(formatLiveTimer(75)).toBe("1:15");
  });
});
