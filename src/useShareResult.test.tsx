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

// AIT 네이티브 공유 시트 어댑터를 목킹한다(#320). 기본값은 unsupported로, 기존
// navigator.share→클립보드 분기가 그대로 검증되게 한다. AIT shared 경로는 개별
// 테스트에서 mockResolvedValueOnce로 덮어쓴다.
const { aitShareMock } = vi.hoisted(() => ({
  aitShareMock: vi.fn(() => Promise.resolve("unsupported")),
}));

vi.mock("./adapters/aitShare", () => ({
  shareViaAitSheet: aitShareMock,
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
  // AIT 어댑터 목은 기본 unsupported로 원복한다(개별 테스트 격리).
  aitShareMock.mockReset();
  aitShareMock.mockResolvedValue("unsupported");
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

  it("AIT 네이티브 공유 시트 성공 시 shared를 반환하고 navigator/클립보드를 쓰지 않는다 (#320)", async () => {
    aitShareMock.mockResolvedValueOnce("shared");
    const navShare = vi.fn(() => Promise.resolve());
    const writeText = vi.fn(() => Promise.resolve());
    patchNavigator({ share: navShare, clipboard: { writeText } });

    await expect(deliverShareText("본문")).resolves.toBe("shared");
    expect(aitShareMock).toHaveBeenCalledWith("본문");
    expect(navShare).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("AIT 미지원이면 기존 navigator.share→클립보드 순서로 폴백한다 (#320)", async () => {
    aitShareMock.mockResolvedValueOnce("unsupported");
    const writeText = vi.fn(() => Promise.resolve());
    // navigator.share 미존재 → 클립보드 복사로 폴백(copied).
    patchNavigator({ clipboard: { writeText } });

    await expect(deliverShareText("본문")).resolves.toBe("copied");
    expect(aitShareMock).toHaveBeenCalledWith("본문");
    expect(writeText).toHaveBeenCalledWith("본문");
  });
});

describe("useShareResult 텔레메트리(#299)", () => {
  it("surface 컨텍스트가 result_screen·completion_dialog 두 표면 모두에서 이벤트에 실린다(AC-1)", async () => {
    // AC-1: useShareResult(surface) 시그니처가 표면을 받아 클릭·전달결과 이벤트에
    // 그대로 싣는다. 두 호출부가 넘기는 리터럴(result_screen/completion_dialog)이
    // 각각 이벤트 surface로 관측됨을 검증한다(완료 다이얼로그 실호출부 검증은
    // CompletionCelebrationDialog.test.tsx의 AC-1 테스트가 실제 렌더로 담당).
    for (const surface of ["result_screen", "completion_dialog"] as const) {
      clickMock.mockReset();
      impressionMock.mockReset();
      patchNavigator({ share: vi.fn(() => Promise.resolve()) });
      const { result, unmount } = renderHook(() => useShareResult(surface));

      act(() => {
        result.current.share("본문", { puzzle_id: "p1" });
      });
      await flushShare();

      expect(clickMock).toHaveBeenCalledWith(
        "share_result_click",
        expect.objectContaining({ surface }),
      );
      expect(impressionMock).toHaveBeenCalledWith("share_result_outcome", {
        surface,
        outcome: "shared",
      });
      unmount();
    }
  });

  it("공유 클릭 시 share_result_click을 surface·puzzle_id·difficulty로 발화한다(AC-2)", async () => {
    // result_screen 호출부 파라미터 형태.
    patchNavigator({ share: vi.fn(() => Promise.resolve()) });
    const rs = renderHook(() => useShareResult("result_screen"));

    act(() => {
      rs.result.current.share("본문", { puzzle_id: "p1", difficulty: "easy" });
    });
    await flushShare();

    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(clickMock).toHaveBeenCalledWith("share_result_click", {
      surface: "result_screen",
      puzzle_id: "p1",
      difficulty: "easy",
    });
    rs.unmount();

    // completion_dialog 호출부 파라미터 형태(다른 puzzle_id·difficulty).
    clickMock.mockReset();
    patchNavigator({ share: vi.fn(() => Promise.resolve()) });
    const cd = renderHook(() => useShareResult("completion_dialog"));

    act(() => {
      cd.result.current.share("본문", {
        puzzle_id: "26060114",
        difficulty: "hard",
      });
    });
    await flushShare();

    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(clickMock).toHaveBeenCalledWith("share_result_click", {
      surface: "completion_dialog",
      puzzle_id: "26060114",
      difficulty: "hard",
    });
  });

  it("outcome 4분기 shared·aborted·copied·failed 각각을 share_result_outcome으로 발화한다(훅 단위 계약)", async () => {
    // 분기 1/4: navigator.share 성공 → outcome=shared.
    patchNavigator({ share: vi.fn(() => Promise.resolve()) });
    const shared = renderHook(() => useShareResult("result_screen"));
    act(() => {
      shared.result.current.share("본문");
    });
    await flushShare();
    expect(impressionMock).toHaveBeenCalledWith("share_result_outcome", {
      surface: "result_screen",
      outcome: "shared",
    });
    shared.unmount();

    // 분기 2/4: 사용자가 공유 시트를 닫음(AbortError) → outcome=aborted.
    impressionMock.mockReset();
    const abort = new Error("cancelled");
    abort.name = "AbortError";
    patchNavigator({ share: vi.fn(() => Promise.reject(abort)) });
    const aborted = renderHook(() => useShareResult("result_screen"));
    act(() => {
      aborted.result.current.share("본문");
    });
    await flushShare();
    expect(impressionMock).toHaveBeenCalledWith("share_result_outcome", {
      surface: "result_screen",
      outcome: "aborted",
    });
    aborted.unmount();

    // 분기 3/4: 공유 시트 미지원 → 클립보드 복사 성공 → outcome=copied.
    impressionMock.mockReset();
    patchNavigator({
      clipboard: { writeText: vi.fn(() => Promise.resolve()) },
    });
    const copied = renderHook(() => useShareResult("result_screen"));
    act(() => {
      copied.result.current.share("본문");
    });
    await flushShare();
    expect(impressionMock).toHaveBeenCalledWith("share_result_outcome", {
      surface: "result_screen",
      outcome: "copied",
    });
    copied.unmount();

    // 분기 4/4: 공유·클립보드 모두 미지원 → outcome=failed.
    impressionMock.mockReset();
    patchNavigator({});
    const failed = renderHook(() => useShareResult("result_screen"));
    act(() => {
      failed.result.current.share("본문");
    });
    await flushShare();
    expect(impressionMock).toHaveBeenCalledWith("share_result_outcome", {
      surface: "result_screen",
      outcome: "failed",
    });
    failed.unmount();
  });

  it("AIT 네이티브 공유 시트 성공 시 outcome=shared 발화 + 토스트 없음 (#320)", async () => {
    aitShareMock.mockResolvedValueOnce("shared");
    // navigator.share가 없어도(AIT 웹뷰) AIT 어댑터 성공으로 shared가 나온다.
    patchNavigator({ clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
    const { result } = renderHook(() => useShareResult("completion_dialog"));

    act(() => {
      result.current.share("본문", { puzzle_id: "p9" });
    });
    await flushShare();

    expect(impressionMock).toHaveBeenCalledWith("share_result_outcome", {
      surface: "completion_dialog",
      outcome: "shared",
    });
    // shared는 클립보드 폴백이 아니므로 어떤 토스트도 켜지 않는다.
    expect(result.current.shareCopied).toBe(false);
    expect(result.current.shareFailed).toBe(false);
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

  it("클립보드 폴백 복사(copied) 시 outcome=copied 발화 + 복사 토스트를 켠다(AC-4)", async () => {
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
    // 복사 성공 토스트 상태(회귀 없음).
    expect(result.current.shareCopied).toBe(true);
    expect(result.current.shareFailed).toBe(false);
  });

  it("공유·클립보드 모두 미지원(failed) 시 outcome=failed 발화 + 실패 토스트를 켠다(AC-4)", async () => {
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
    // 실패 토스트 상태(회귀 없음).
    expect(result.current.shareFailed).toBe(true);
    expect(result.current.shareCopied).toBe(false);
  });

  it("공유 시트 전달(shared)·닫힘(aborted) 시에는 어떤 토스트도 켜지 않는다(AC-4)", async () => {
    patchNavigator({ share: vi.fn(() => Promise.resolve()) });
    const { result } = renderHook(() => useShareResult("result_screen"));

    act(() => {
      result.current.share("본문");
    });
    await flushShare();

    expect(result.current.shareCopied).toBe(false);
    expect(result.current.shareFailed).toBe(false);
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
