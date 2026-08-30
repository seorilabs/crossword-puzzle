// Presence는 제품 기능과 분리된 선택적 운영 관측이다. 중앙 canary가 끝나기 전에는
// 모든 마켓에서 같은 기본값(false)을 사용하고, SDK 예외가 앱 시작·게임플레이·저장에
// 전파되지 않도록 lifecycle 호출을 fail-open으로 감싼다.

export const PLATFORM_PRESENCE_ENABLED = false;

export type PlatformPresenceHandle = {
  start(): void;
  stop(): void;
  resume(): void;
};

export type PlatformPresenceLifecycle = {
  start(): void;
  stop(): void;
  resume(): void;
};

export function createFailOpenPlatformPresenceLifecycle(
  presence: PlatformPresenceHandle,
): PlatformPresenceLifecycle {
  const invoke = (action: keyof PlatformPresenceHandle) => {
    try {
      presence[action]();
    } catch {
      // Presence는 부가 관측이다. SDK 오류가 제품 흐름을 막아서는 안 된다.
    }
  };

  return {
    start: () => invoke("start"),
    stop: () => invoke("stop"),
    resume: () => {
      // background에서 stop한 뒤 foreground로 돌아온 경우에도 다시 시작한다.
      invoke("start");
      invoke("resume");
    },
  };
}
