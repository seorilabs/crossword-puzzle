import {
  compactTelemetryParams,
  type TelemetryParams,
} from '../../packages/crossword-core/src';
import {dispatchAnalytics} from './analyticsSinks';

// 범용 UI 텔레메트리 파사드(RN). 전송은 sink 레지스트리(analyticsSinks)로 위임한다.
export const telemetry = {
  screen(name: string, params?: TelemetryParams) {
    dispatchAnalytics({
      kind: 'screen',
      name,
      params: compactTelemetryParams(params),
    });
  },

  impression(name: string, params?: TelemetryParams) {
    dispatchAnalytics({
      kind: 'impression',
      name,
      params: compactTelemetryParams(params),
    });
  },

  click(name: string, params?: TelemetryParams) {
    dispatchAnalytics({
      kind: 'click',
      name,
      params: compactTelemetryParams(params),
    });
  },
};
