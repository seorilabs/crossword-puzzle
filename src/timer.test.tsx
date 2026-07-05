// 일시정지 경과 표시 헬퍼(timer.ts) 회귀 테스트.
// App.tsx의 완료 텔레메트리(elapsed_seconds)·결과 화면 경과 라벨 경로가 모두
// 일시정지 누적(pausedMs)을 제외함을 고정한다. best-time 비교는 코어
// computeElapsedMs(별도 단위 테스트)와 같은 입력을 쓰므로 함께 보장된다.
import { describe, expect, it } from "vitest";

import { togglePauseState } from "../packages/crossword-core/src";

import {
  formatElapsedTime,
  formatLiveTimer,
  getElapsedSeconds,
  shouldShowLiveTimer,
} from "./timer";

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

// #232 회귀: 백그라운드 전환 시 타이머 자동 일시정지. App.tsx의
// visibilitychange 핸들러는 hidden에서 togglePauseState로 정지하고 visible
// 복귀 시 다시 togglePauseState로 재개한다(정지 구간은 pausedMs에 누적).
// 여기서는 그 상태 전이 시퀀스를 그대로 모사해, hidden→visible 사이 시간이
// pausedMs로 반영되어 완료·최고 기록·리더보드 경과(getElapsedSeconds)에서
// 제외됨을 고정한다.
describe("백그라운드 자동 일시정지 시나리오 (#232)", () => {
  it("hidden→visible 사이 시간이 pausedMs로 누적되어 경과에서 제외된다", () => {
    // 00:00 시작 → 00:00:30 백그라운드(hidden, 자동 정지)
    let pause = togglePauseState(
      { pausedMs: 0, pausedAt: null },
      new Date("2026-06-29T00:00:30.000Z"),
    );
    expect(pause.pausedAt).toBe("2026-06-29T00:00:30.000Z");

    // 00:01:30 복귀(visible, 자동 재개) → 60s가 pausedMs로 누적
    pause = togglePauseState(pause, new Date("2026-06-29T00:01:30.000Z"));
    expect(pause.pausedAt).toBeNull();
    expect(pause.pausedMs).toBe(60_000);

    // 00:02:00 완료: 벽시계 120s - 백그라운드 60s = 순수 60s
    expect(
      getElapsedSeconds(startedAt, completedAt, { pausedMs: pause.pausedMs }),
    ).toBe(60);
  });

  it("여러 번 백그라운드로 오가도 모든 이탈 시간이 합산 제외된다", () => {
    let pause: { pausedMs: number; pausedAt: string | null } = {
      pausedMs: 0,
      pausedAt: null,
    };
    // 20s 이탈
    pause = togglePauseState(pause, new Date("2026-06-29T00:00:10.000Z"));
    pause = togglePauseState(pause, new Date("2026-06-29T00:00:30.000Z"));
    // 10s 이탈
    pause = togglePauseState(pause, new Date("2026-06-29T00:01:00.000Z"));
    pause = togglePauseState(pause, new Date("2026-06-29T00:01:10.000Z"));

    expect(pause.pausedMs).toBe(30_000);
    // 120s - 30s = 90s
    expect(
      getElapsedSeconds(startedAt, completedAt, { pausedMs: pause.pausedMs }),
    ).toBe(90);
  });

  it("정지 중(pausedAt 존재)에도 경과는 진행 중 정지 구간을 제외한다", () => {
    // 자동 정지 상태에서 아직 재개 전이라면, pausedAt이 남아 경과 계산이
    // 정지 시작 이후 시간을 더하지 않는다(백그라운드 중 기록 부풀림 방지).
    const pause = togglePauseState(
      { pausedMs: 0, pausedAt: null },
      new Date("2026-06-29T00:00:30.000Z"),
    );
    // endedAt 없이 now=00:02:00에서 조회해도, 30s 이후는 정지로 제외 → 30s
    expect(
      getElapsedSeconds(startedAt, undefined, {
        pausedMs: pause.pausedMs,
        pausedAt: pause.pausedAt,
      }),
    ).toBe(30);
  });
});

// #233 회귀: 헤더 라이브 타이머 노출 분기(shouldShowLiveTimer). App.tsx 헤더
// eyebrow가 이 순수 함수로 노출 여부를 결정하므로, 분기 조건이 뒤집히거나 순서가
// 바뀌면 이 테스트가 잡는다.
describe("shouldShowLiveTimer (헤더 타이머 노출 분기, #233)", () => {
  it("타이머 표시 꺼짐이면 시작됐어도 노출하지 않는다", () => {
    expect(shouldShowLiveTimer(startedAt, false)).toBe(false);
  });

  it("타이머 표시 켜짐이고 미션이 시작됐으면 노출한다", () => {
    expect(shouldShowLiveTimer(startedAt, true)).toBe(true);
  });

  it("미션 미시작(lastStartedAt null/undefined)이면 표시 켜짐이어도 노출하지 않는다", () => {
    expect(shouldShowLiveTimer(null, true)).toBe(false);
    expect(shouldShowLiveTimer(undefined, true)).toBe(false);
  });
});

describe("formatLiveTimer", () => {
  it("m:ss 포맷으로 표시한다", () => {
    expect(formatLiveTimer(0)).toBe("0:00");
    expect(formatLiveTimer(75)).toBe("1:15");
  });
});
