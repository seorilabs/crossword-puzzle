import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  getAppVersion(): string;
}

// 태그 유래 실제 앱 버전(Android versionName / iOS CFBundleShortVersionString)을 JS로
// 노출한다. 모듈이 주입되지 않은 개발/테스트 빌드도 앱 자체는 실행돼야 하므로
// getEnforcing을 쓰지 않는다. 호출부가 null을 패키지 버전 폴백으로 변환한다.
export default TurboModuleRegistry.get<Spec>('NativeAppInfo');
