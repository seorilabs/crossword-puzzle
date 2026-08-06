import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  isSupported(): boolean;
  submitScore(score: number): Promise<void>;
  openLeaderboard(): Promise<void>;
}

// 값이 주입되지 않은 개발/테스트 빌드도 앱 자체는 실행돼야 하므로 getEnforcing을
// 쓰지 않는다. adapter가 null 또는 isSupported=false를 공통 unsupported로 변환한다.
export default TurboModuleRegistry.get<Spec>('NativeLeaderboard');
