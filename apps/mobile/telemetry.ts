import {
  compactTelemetryParams,
  type TelemetryParams,
} from '../../packages/crossword-core/src';
import { logFirebaseAnalyticsEvent } from './firebaseClient';

export const telemetry = {
  screen(name: string, params?: TelemetryParams) {
    const compacted = compactTelemetryParams(params);
    logFirebaseAnalyticsEvent('screen_view', {
      firebase_screen: name,
      ...compacted,
    });
  },

  impression(name: string, params?: TelemetryParams) {
    logFirebaseAnalyticsEvent(name, compactTelemetryParams(params));
  },

  click(name: string, params?: TelemetryParams) {
    logFirebaseAnalyticsEvent(name, compactTelemetryParams(params));
  },
};
