// returnReminderRepository 저장/복원 단위 테스트
import { describe, it, beforeEach } from "node:test";
import { strict as assert } from "node:assert";

import {
  loadReturnReminderState,
  saveReturnReminderState,
} from "./returnReminderRepository.ts";

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    raw: store,
  };
}

describe("returnReminderRepository", () => {
  let storage: ReturnType<typeof createMemoryStorage>;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  it("저장된 값이 없으면 초기 상태(promptCount 0)를 반환한다", () => {
    assert.deepEqual(loadReturnReminderState(storage), { promptCount: 0 });
  });

  it("저장 후 promptCount·outcome·날짜가 복원된다", () => {
    saveReturnReminderState(
      { promptCount: 1, lastPromptDate: "2026-06-29", outcome: "agreed" },
      storage,
    );
    assert.deepEqual(loadReturnReminderState(storage), {
      promptCount: 1,
      lastPromptDate: "2026-06-29",
      outcome: "agreed",
    });
  });

  it("알 수 없는 outcome 문자열은 제거하고 복원한다", () => {
    storage.raw.set(
      "crossword:return-reminder",
      JSON.stringify({ promptCount: 2, outcome: "bogus" }),
    );
    const loaded = loadReturnReminderState(storage);
    assert.equal(loaded.promptCount, 2);
    assert.equal(loaded.outcome, undefined);
  });

  it("promptCount가 숫자가 아니면 0으로 정규화한다", () => {
    storage.raw.set(
      "crossword:return-reminder",
      JSON.stringify({ promptCount: "x", outcome: "rejected" }),
    );
    assert.equal(loadReturnReminderState(storage).promptCount, 0);
  });

  it("깨진 JSON이면 초기 상태로 폴백한다", () => {
    storage.raw.set("crossword:return-reminder", "{not json");
    assert.deepEqual(loadReturnReminderState(storage), { promptCount: 0 });
  });

  it("storage가 null이면 초기 상태를 반환하고 저장은 무시된다", () => {
    assert.deepEqual(loadReturnReminderState(null), { promptCount: 0 });
    saveReturnReminderState({ promptCount: 1, outcome: "agreed" }, null);
  });

  it("setItem이 예외를 던져도 throw 없이 무시된다", () => {
    const failStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked");
      },
    };
    saveReturnReminderState({ promptCount: 1, outcome: "agreed" }, failStorage);
  });
});
