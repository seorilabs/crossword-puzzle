import {
  loadFirstInputGuideSeen,
  markFirstInputGuideSeen,
} from '../firstInputGuideRepository';

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

test('첫 입력 가이드 열람 상태를 저장해 재진입 시 복원한다', async () => {
  const storage = createStorage();
  await expect(loadFirstInputGuideSeen(storage)).resolves.toBe(false);
  await markFirstInputGuideSeen(storage);
  await expect(loadFirstInputGuideSeen(storage)).resolves.toBe(true);
});

test('저장소 오류는 미열람으로 폴백하고 플레이를 막지 않는다', async () => {
  const storage = {
    async getItem() {
      throw new Error('read failed');
    },
    async setItem() {
      throw new Error('write failed');
    },
  };

  await expect(loadFirstInputGuideSeen(storage)).resolves.toBe(false);
  await expect(markFirstInputGuideSeen(storage)).resolves.toBeUndefined();
});
