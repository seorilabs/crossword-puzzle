import { createAsyncStorageGateStore } from '../platformUpdateGateStore';

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => store.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

test('저장한 노출 이력을 그대로 복원한다', async () => {
  const storage = memoryStorage();
  const gateStore = createAsyncStorageGateStore(storage);

  await gateStore.save({ version: '1.2.0', promptedAt: 1000 });

  await expect(gateStore.load()).resolves.toEqual({
    version: '1.2.0',
    promptedAt: 1000,
  });
});

test('저장된 값이 없으면 null이다', async () => {
  const gateStore = createAsyncStorageGateStore(memoryStorage());

  await expect(gateStore.load()).resolves.toBeNull();
});

test('저장된 값이 손상되면 null로 흡수한다', async () => {
  const storage = memoryStorage();
  await storage.setItem('crossword-puzzle:update-gate', '{not json');
  const gateStore = createAsyncStorageGateStore(storage);

  await expect(gateStore.load()).resolves.toBeNull();
});

test('필드가 빠진 값은 null로 흡수한다', async () => {
  const storage = memoryStorage();
  await storage.setItem(
    'crossword-puzzle:update-gate',
    JSON.stringify({ version: '1.0.0' }),
  );
  const gateStore = createAsyncStorageGateStore(storage);

  await expect(gateStore.load()).resolves.toBeNull();
});

test('저장이 실패해도 던지지 않는다', async () => {
  const storage = {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {
      throw new Error('quota');
    }),
  };
  const gateStore = createAsyncStorageGateStore(storage);

  await expect(
    gateStore.save({ version: '1', promptedAt: 1 }),
  ).resolves.toBeUndefined();
});

test('조회가 실패해도 null로 흡수한다', async () => {
  const storage = {
    getItem: jest.fn(async () => {
      throw new Error('boom');
    }),
    setItem: jest.fn(async () => {}),
  };
  const gateStore = createAsyncStorageGateStore(storage);

  await expect(gateStore.load()).resolves.toBeNull();
});
