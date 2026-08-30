import { afterEach, describe, expect, it, vi } from "vitest";

const { dispatchMock } = vi.hoisted(() => ({ dispatchMock: vi.fn() }));

vi.mock("./adapters/analyticsSinks", () => ({
  dispatchAnalytics: dispatchMock,
}));

import { telemetry } from "./adapters/telemetry";

afterEach(() => {
  dispatchMock.mockReset();
});

describe("Web 레거시 퍼즐 식별자 telemetry 계약 (#351)", () => {
  it("숫자 퍼즐 mission_start를 문자열 식별자로 sink에 전달한다", () => {
    telemetry.impression("mission_start", {
      attempt_number: 1,
      pack_id: 260821,
      puzzle_alias: 26082100,
      puzzle_id: 26082100,
      slot_id: 26082102,
    });

    expect(dispatchMock).toHaveBeenCalledWith({
      kind: "impression",
      name: "mission_start",
      params: {
        attempt_number: 1,
        pack_id: "260821",
        puzzle_alias: "26082100",
        puzzle_id: "26082100",
        slot_id: "26082102",
      },
    });
  });

  it("next_puzzle_cta의 숫자 ID도 문자열로 sink에 전달한다", () => {
    telemetry.click("next_puzzle_cta", { next_puzzle_id: 26082101 });

    expect(dispatchMock.mock.calls[0]?.[0].params.next_puzzle_id).toBe(
      "26082101",
    );
  });
});
