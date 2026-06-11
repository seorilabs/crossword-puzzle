import { Analytics as AppsInTossAnalytics } from "@apps-in-toss/web-framework";
import {
  compactTelemetryParams,
  type CompactTelemetryParams,
  type TelemetryParams,
} from "../../packages/crossword-core/src";
import { logFirebaseAnalyticsEvent } from "./firebaseClient";

function logAppsInToss(
  method: "screen" | "impression" | "click",
  logName: string,
  params: CompactTelemetryParams,
) {
  try {
    void AppsInTossAnalytics[method]({
      log_name: logName,
      ...params,
    });
  } catch {
    // AppsInToss analytics is unavailable in local browsers and QR sandbox.
  }
}

export const telemetry = {
  screen(name: string, params?: TelemetryParams) {
    const compacted = compactTelemetryParams(params);
    logAppsInToss("screen", name, compacted);
    void logFirebaseAnalyticsEvent("screen_view", {
      firebase_screen: name,
      ...compacted,
    });
  },

  impression(name: string, params?: TelemetryParams) {
    const compacted = compactTelemetryParams(params);
    logAppsInToss("impression", name, compacted);
    void logFirebaseAnalyticsEvent(name, compacted);
  },

  click(name: string, params?: TelemetryParams) {
    const compacted = compactTelemetryParams(params);
    logAppsInToss("click", name, compacted);
    void logFirebaseAnalyticsEvent(name, compacted);
  },
};
