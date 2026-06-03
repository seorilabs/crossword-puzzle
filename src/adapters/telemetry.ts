import { Analytics as AppsInTossAnalytics } from "@apps-in-toss/web-framework";
import { logFirebaseAnalyticsEvent } from "./firebaseClient";

type TelemetryParam = string | number | boolean | null | undefined;
type TelemetryParams = Record<string, TelemetryParam>;
type CompactTelemetryParams = Record<string, string | number | boolean>;

function compactParams(params: TelemetryParams = {}): CompactTelemetryParams {
  return Object.fromEntries(
    Object.entries(params).filter(
      (entry): entry is [string, string | number | boolean] => entry[1] != null,
    ),
  );
}

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
    const compacted = compactParams(params);
    logAppsInToss("screen", name, compacted);
    void logFirebaseAnalyticsEvent("screen_view", {
      firebase_screen: name,
      ...compacted,
    });
  },

  impression(name: string, params?: TelemetryParams) {
    const compacted = compactParams(params);
    logAppsInToss("impression", name, compacted);
    void logFirebaseAnalyticsEvent(name, compacted);
  },

  click(name: string, params?: TelemetryParams) {
    const compacted = compactParams(params);
    logAppsInToss("click", name, compacted);
    void logFirebaseAnalyticsEvent(name, compacted);
  },
};
