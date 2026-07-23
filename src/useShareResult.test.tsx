// 공유 전달 공통 로직(deliverShareText) 폴백 계약 + 공유 CTA 텔레메트리(#299) 테스트.
// navigator.share 우선 → 실패 시 클립보드 폴백 → 미지원/실패 시 failed. 그리고
// useShareResult가 surface·outcome을 share_result_click/share_result_outcome로 발화한다.
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { deliverShareText, useShareResult } from "./useShareResult";

// telemetry 파사드를 목킹해 발화된 이벤트 이름·파라미터를 검사한다.
const { clickMock, impressionMock } = vi.hoisted(() => ({
  clickMock: vi.fn(),
  impressionMock: vi.fn(),
}));

vi.mock("./adapters/telemetry", () => ({
  telemetry: {
    screen: vi.fn(),
    click: clickMock,
    impression: impressionMock,
  },
}));

type NavigatorPatch = {
  share?: (data: { text: string }) => Promise<void>;
  clipboard?: { writeText?: (text: string) => Promise<void> };
};

// jsdom navigator에 share/clipboard를 주입한다(테스트 후 원복).
function patchNavigator(patch: NavigatorPatch) {
  vi.stubGlobal("navigator", { ...patch });
}

afterEach(() => {
  vi.unstubAllGlobals();
  clickMock.mockReset();
  impressionMock.mockReset();
});

// share()가 예약한 deliverShareText 프라미스 체인이 끝나도록 마이크로/매크로태스크를 비운다.
async function flushShare() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("deliverShareText", () => {
  it("navigator.share 성공 시 shared를 반환하고 클립보드를 쓰지 않는다", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    patchNavigator({
      share: vi.fn(() => Promise.resolve()),
      clipboard: { writeText },
    });

    await expect(deliverShareText("본문")).resolves.toBe("shared");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("사용자가 공유 시트를 닫으면(AbortError) aborted — 폴백 없음", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const abort = new Error("cancelled");
    abort.name = "AbortError";
    patchNavigator({
      share: vi.fn(() => Promise.reject(abort)),
      clipboard: { writeText },
    });

    await expect(deliverShareText("본문")).resolves.toBe("aborted");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("share가 다른 오류로 실패하면 클립보드로 폴백해 copied", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    patchNavigator({
      share: vi.fn(() => Promise.reject(new Error("boom"))),
      clipboard: { writeText },
    });

    await expect(deliverShareText("본문")).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("본문");
  });

  it("share 미지원이면 클립보드 복사로 copied", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    patchNavigator({ clipboard: { writeText } });

    await expect(deliverShareText("본문")).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("본문");
  });

  it("클립보드 미지원이면 failed", async () => {
    patchNavigator({});
    await expect(deliverShareText("본문")).resolves.toBe("failed");
  });

  it("클립보드 쓰기가 실패하면 failed", async () => {
    patchNavigator({
      clipboard: { writeText: vi.fn(() => Promise.reject(new Error("nope"))) },
    });
    await expect(deliverShareText("본문")).resolves.toBe("failed");
  });
});

describe("useShareResult 텔레메트리(#299)", () => {
  it("공유 클릭 시 surface·puzzle_id·difficulty를 share_result_click으로 발화한다", async () => {
    patchNavigator({ share: vi.fn(() => Promise.resolve()) });
    const { result } = renderHook(() => useShareResult("result_screen"));

    act(() => {
      result.current.share("본문", { puzzle_id: "p1", difficulty: "easy" });
    });
    await flushShare();

    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(clickMock).toHaveBeenCalledWith("share_result_click", {
      surface: "result_screen",
      puzzle_id: "p1",
      difficulty: "easy",
    });
  });

  it("공유 시트 전달(shared) 시 surface·outcome을 share_result_outcome으로 발화한다", async () => {
    patchNavigator({ share: vi.fn(() => Promise.resolve()) });
    const { result } = renderHook(() => useShareResult("completion_dialog"));

    act(() => {
      result.current.share("본문", { puzzle_id: "p2" });
    });
    await flushShare();

    expect(impressionMock).toHaveBeenCalledTimes(1);
    expect(impressionMock).toHaveBeenCalledWith("share_result_outcome", {
      surface: "completion_dialog",
      outcome: "shared",
    });
  });

  it("사용자가 공유 시트를 닫으면(aborted) outcome=aborted를 발화한다", async () => {
    const abort = new Error("cancelled");
    abort.name = "AbortError";
    patchNavigator({ share: vi.fn(() => Promise.reject(abort)) });
    const { result } = renderHook(() => useShareResult("result_screen"));

    act(() => {
      result.current.share("본문");
    });
    await flushShare();

    expect(impressionMock).toHaveBeenCalledWith("share_result_outcome", {
      surface: "result_screen",
      outcome: "aborted",
    });
  });

  it("클립보드 폴백 복사(copied) 시 outcome=copied를 발화한다", async () => {
    patchNavigator({
      clipboard: { writeText: vi.fn(() => Promise.resolve()) },
    });
    const { result } = renderHook(() => useShareResult("completion_dialog"));

    act(() => {
      result.current.share("본문");
    });
    await flushShare();

    expect(impressionMock).toHaveBeenCalledWith("share_result_outcome", {
      surface: "completion_dialog",
      outcome: "copied",
    });
  });

  it("공유·클립보드 모두 미지원(failed) 시 outcome=failed를 발화한다", async () => {
    patchNavigator({});
    const { result } = renderHook(() => useShareResult("result_screen"));

    act(() => {
      result.current.share("본문");
    });
    await flushShare();

    expect(impressionMock).toHaveBeenCalledWith("share_result_outcome", {
      surface: "result_screen",
      outcome: "failed",
    });
  });

  it("클릭 발화 시 아직 outcome은 발화되지 않는다(전달 결과는 이후에)", async () => {
    patchNavigator({ share: vi.fn(() => Promise.resolve()) });
    const { result } = renderHook(() => useShareResult("result_screen"));

    act(() => {
      result.current.share("본문");
    });
    // 동기 클릭은 즉시, outcome impression은 프라미스 해소 후에만.
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(impressionMock).not.toHaveBeenCalled();

    await flushShare();
    expect(impressionMock).toHaveBeenCalledTimes(1);
  });
});
