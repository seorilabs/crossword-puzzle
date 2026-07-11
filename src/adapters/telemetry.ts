import {
  compactTelemetryParams,
  type TelemetryParams,
} from "../../packages/crossword-core/src";
import { dispatchAnalytics } from "./analyticsSinks";

// 범용 UI 텔레메트리 파사드. 이벤트 이름/파라미터는 그대로 두고 전송만 sink 레지스트리로
// 위임한다(analyticsSinks). 팬아웃 대상(AIT/Firebase/자체 서버)은 sink 쪽에서 결정한다.
export const telemetry = {
  screen(name: string, params?: TelemetryParams) {
    dispatchAnalytics({
      kind: "screen",
      name,
      params: compactTelemetryParams(params),
    });
  },

  impression(name: string, params?: TelemetryParams) {
    dispatchAnalytics({
      kind: "impression",
      name,
      params: compactTelemetryParams(params),
    });
  },

  click(name: string, params?: TelemetryParams) {
    dispatchAnalytics({
      kind: "click",
      name,
      params: compactTelemetryParams(params),
    });
  },
};
