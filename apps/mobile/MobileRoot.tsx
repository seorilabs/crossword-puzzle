import React from 'react';

import App from './App';
import { MobileRuntimeHost } from './MobileRuntimeHost';

export type MobileRootProps = Readonly<{
  nativeGameBundle?: unknown;
}>;

export default function MobileRoot({ nativeGameBundle }: MobileRootProps) {
  return (
    <MobileRuntimeHost nativeGameBundle={nativeGameBundle} legacy={<App />} />
  );
}
