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

// #203 회귀: 완료 축하 다이얼로그·홈 완료 카드도 결과 화면과 같은
// pausedMs(세 번째 인자) 경로를 쓴다. 일시정지를 포함한 완료 시나리오에서
// 벽시계 시간이 아닌 순수 풀이 시간이 표기됨을 고정한다.
describe("formatElapsedTime (축하 다이얼로그·홈 카드 표기, #203)", () => {
  it("5분 풀이 + 10분 일시정지 완료 → 15분이 아닌 5분으로 표기한다", () => {
    // 벽시계 15분 경과, 일시정지 10분 → 순수 풀이 5분
    const pausedCompletedAt = "2026-06-29T00:15:00.000Z";
    expect(formatElapsedTime(startedAt, pausedCompletedAt, 10 * 60_000)).toBe(
      "5분 00초",
    );
    // pausedMs 미전달(버그 당시 호출 형태)이면 벽시계 시간이 된다
    expect(formatElapsedTime(startedAt, pausedCompletedAt)).toBe("15분 00초");
  });

  it("일시정지 없이 완료하면 pausedMs=0 전달과 미전달 표기가 동일하다(회귀 없음)", () => {
    expect(formatElapsedTime(startedAt, completedAt, 0)).toBe(
      formatElapsedTime(startedAt, completedAt),
    );
  });
});

describe("formatLiveTimer", () => {
  it("m:ss 포맷으로 표시한다", () => {
    expect(formatLiveTimer(0)).toBe("0:00");
    expect(formatLiveTimer(75)).toBe("1:15");
  });
});
