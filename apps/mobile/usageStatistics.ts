import { configureFirebaseUsageStatistics } from './firebaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createUsageStatisticsPreference,
  USAGE_STATISTICS_KEY,
} from '../../packages/crossword-core/src/usageStatistics';

export const usageStatistics = createUsageStatisticsPreference({
  read: () => AsyncStorage.getItem(USAGE_STATISTICS_KEY),
  write: value => AsyncStorage.setItem(USAGE_STATISTICS_KEY, value),
  apply: enabled => configureFirebaseUsageStatistics(enabled),
});
