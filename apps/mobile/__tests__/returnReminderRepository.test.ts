import {
  createMobileReturnReminderRepository,
  normalizeMobileReturnReminderState,
} from '../returnReminderRepository';

function createStorage() {
  const values = new Map<string, string>();
  return {
    async getItem(key: string) {
      return values.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

test('RN 복귀 리마인더 상태를 저장하고 복원한다', async () => {
  const repository = createMobileReturnReminderRepository(createStorage());
  await repository.saveState({
    promptCount: 1,
    lastPromptDate: '2026-08-31',
    outcome: 'error',
    errorCode: 'native_error',
    failureStage: 'sdk_callback',
  });

  await expect(repository.loadState()).resolves.toEqual({
    promptCount: 1,
    lastPromptDate: '2026-08-31',
    outcome: 'error',
    errorCode: 'native_error',
    failureStage: 'sdk_callback',
  });
});

test('손상된 상태는 안전한 초기값으로 정규화한다', () => {
  expect(
    normalizeMobileReturnReminderState({
      promptCount: -3,
      outcome: 'unknown',
      failureStage: 'unknown',
    }),
  ).toEqual({ promptCount: 0 });
  expect(normalizeMobileReturnReminderState(null)).toEqual({ promptCount: 0 });
});

test('저장소 읽기 오류는 퍼즐 플레이를 막지 않고 초기값으로 폴백한다', async () => {
  const repository = createMobileReturnReminderRepository({
    async getItem() {
      throw new Error('storage unavailable');
    },
    async setItem() {
      throw new Error('storage unavailable');
    },
  });

  await expect(repository.loadState()).resolves.toEqual({ promptCount: 0 });
  await expect(
    repository.saveState({ promptCount: 1 }),
  ).resolves.toBeUndefined();
});
