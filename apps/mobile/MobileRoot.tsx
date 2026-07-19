import React from 'react';

import App from './App';
import { MobileRuntimeHost } from './MobileRuntimeHost';

export type MobileRootProps = Readonly<{
  nativeGameBundle?: unknown;
  nativeDevelopmentGameRuntimeOverride?: unknown;
}>;

export default function MobileRoot({
  nativeGameBundle,
  nativeDevelopmentGameRuntimeOverride,
}: MobileRootProps) {
  return (
    <MobileRuntimeHost
      nativeGameBundle={nativeGameBundle}
      nativeDevelopmentGameRuntimeOverride={
        nativeDevelopmentGameRuntimeOverride
      }
      legacy={<App />}
    />
  );
}
