/**
 * @format
 */

import { AppRegistry, AppState } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import {
  ensurePlatformAuth,
  resumePlatformPresence,
  startPlatformPresence,
  stopPlatformPresence,
} from './platformAuth';
import { registerReturnReminderBackgroundHandler } from './returnReminderNotifications';

// platform 인증(ADR 0013). 게임 진행을 막지 않는 부가 기능이므로 첫 렌더를 기다리게
// 하지 않고 배경에서 시작한다. 실패는 어댑터가 계측만 하고 흡수한다.
void ensurePlatformAuth();
startPlatformPresence();
registerReturnReminderBackgroundHandler();

AppState.addEventListener('change', state => {
  if (state === 'active') {
    resumePlatformPresence();
    return;
  }
  stopPlatformPresence();
});

AppRegistry.registerComponent(appName, () => App);
