// feedbackSettingsRepository 저장/복원 단위 테스트
import { describe, it, beforeEach } from "node:test";
import { strict as assert } from "node:assert";

import {
  loadHapticEnabled,
  loadSoundEnabled,
  saveHapticEnabled,
  saveSoundEnabled,
} from "./feedbackSettingsRepository.ts";

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  };
}

describe("feedbackSettingsRepository", () => {
  let storage: ReturnType<typeof createMemoryStorage>;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  it("기본값은 사운드·햅틱 모두 켜짐", () => {
    assert.equal(loadSoundEnabled(storage), true);
    assert.equal(loadHapticEnabled(storage), true);
  });

  it("사운드 OFF 저장 후 복원되고 햅틱과 독립적이다", () => {
    saveSoundEnabled(false, storage);
    assert.equal(loadSoundEnabled(storage), false);
    assert.equal(loadHapticEnabled(storage), true, "햅틱은 영향 없음");
  });

  it("햅틱 OFF 저장 후 복원되고 사운드와 독립적이다", () => {
    saveHapticEnabled(false, storage);
    assert.equal(loadHapticEnabled(storage), false);
    assert.equal(loadSoundEnabled(storage), true, "사운드는 영향 없음");
  });

  it("OFF 후 다시 ON으로 저장하면 켜짐으로 복원된다", () => {
    saveSoundEnabled(false, storage);
    saveSoundEnabled(true, storage);
    assert.equal(loadSoundEnabled(storage), true);
  });

  it("storage가 null이면 기본값(켜짐)을 반환하고 저장은 무시된다", () => {
    assert.equal(loadSoundEnabled(null), true);
    assert.equal(loadHapticEnabled(null), true);
    saveSoundEnabled(false, null); // throw 없이 무시
    saveHapticEnabled(false, null);
  });

  it("getItem이 예외를 던지면 기본값(켜짐)으로 폴백한다", () => {
    const failStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
    };
    assert.equal(loadSoundEnabled(failStorage), true);
  });
});
