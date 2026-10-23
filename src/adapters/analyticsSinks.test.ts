import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  enabled: true,
  ait: vi.fn(),
  firebase: vi.fn(),
}));
vi.mock("./usageStatistics", () => ({
  usageStatistics: { canTrack: () => mocks.enabled },
}));
vi.mock("@apps-in-toss/web-framework", () => ({
  Analytics: { screen: mocks.ait, click: mocks.ait, impression: mocks.ait },
}));
vi.mock("./firebaseClient", () => ({
  logFirebaseAnalyticsEvent: mocks.firebase,
}));
import {
  analyticsSinks,
  dispatchAnalytics,
  gameAnalyticsSinks,
} from "./analyticsSinks";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled = true;
});
test("통계를 끄면 AIT와 Firebase의 UI 및 게임 이벤트를 모두 막는다", () => {
  mocks.enabled = false;
  dispatchAnalytics({ kind: "screen", name: "home", params: {} });
  gameAnalyticsSinks.forEach((sink) => sink.logGameEvent("mission_start", {}));
  analyticsSinks.forEach((sink) =>
    sink.track({ kind: "click", name: "start", params: {} }),
  );
  expect(mocks.ait).not.toHaveBeenCalled();
  expect(mocks.firebase).not.toHaveBeenCalled();
});
test("다시 켜면 두 분석 경로의 전송을 재개한다", () => {
  dispatchAnalytics({ kind: "screen", name: "home", params: {} });
  expect(mocks.ait).toHaveBeenCalledTimes(1);
  expect(mocks.firebase).toHaveBeenCalledTimes(1);
});
