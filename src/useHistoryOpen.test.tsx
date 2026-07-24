// 기록 진입 공통 로직(openHistory) 텔레메트리·전환 계약(#300, AC-3) 테스트.
// history_open 을 진입 소스별(source=home_card|completion_dialog)로 정확히 1회
// 발화하고 navigate("history")로 화면을 전환하는지 실제 emit 경로로 검증한다.
import { afterEach, describe, expect, it, vi } from "vitest";

import { openHistory } from "./useHistoryOpen";

// telemetry 파사드를 목킹해 발화된 이벤트 이름·파라미터를 검사한다(#299 동일 패턴).
const { clickMock } = vi.hoisted(() => ({ clickMock: vi.fn() }));

vi.mock("./adapters/telemetry", () => ({
  telemetry: {
    screen: vi.fn(),
    click: clickMock,
    impression: vi.fn(),
  },
}));

afterEach(() => {
  clickMock.mockReset();
});

describe("openHistory", () => {
  it("home_card 진입 시 history_open을 source=home_card로 1회 발화하고 navigate(history)한다(AC-3)", () => {
    const navigate = vi.fn();
    openHistory("home_card", navigate);
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(clickMock).toHaveBeenCalledWith("history_open", {
      source: "home_card",
    });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("history");
  });

  it("completion_dialog 진입 시 history_open을 source=completion_dialog로 1회 발화하고 navigate(history)한다(AC-3)", () => {
    const navigate = vi.fn();
    openHistory("completion_dialog", navigate);
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(clickMock).toHaveBeenCalledWith("history_open", {
      source: "completion_dialog",
    });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("history");
  });

  it("계측이 화면 전환보다 먼저 발화한다(전환 중 유실 방지)", () => {
    const order: string[] = [];
    clickMock.mockImplementation(() => order.push("click"));
    const navigate = vi.fn(() => order.push("navigate"));
    openHistory("home_card", navigate);
    expect(order).toEqual(["click", "navigate"]);
  });
});
