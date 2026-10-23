import { configureFirebaseUsageStatistics } from "./firebaseClient";
import {
  createUsageStatisticsPreference,
  USAGE_STATISTICS_KEY,
} from "../../packages/crossword-core/src/usageStatistics";

export const usageStatistics = createUsageStatisticsPreference({
  read: async () => window.localStorage.getItem(USAGE_STATISTICS_KEY),
  write: async (value) =>
    window.localStorage.setItem(USAGE_STATISTICS_KEY, value),
  apply: (enabled) => configureFirebaseUsageStatistics(enabled),
});
