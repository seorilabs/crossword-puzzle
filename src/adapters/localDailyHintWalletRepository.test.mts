import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createLocalDailyHintWalletRepository } from "./localDailyHintWalletRepository.ts";

function createStorage() {
  const values = new Map<string, string>();

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("localDailyHintWalletRepository", () => {
  it("날짜별 공용 지갑을 저장하고 복원한다", async () => {
    const storage = createStorage();
    const repository = createLocalDailyHintWalletRepository({ storage });

    await repository.saveWallet({
      date: "2026-07-26",
      earnedCredits: 1,
      usedCredits: 3,
    });

    assert.deepEqual(await repository.loadWallet("2026-07-26"), {
      date: "2026-07-26",
      earnedCredits: 1,
      usedCredits: 3,
    });
    assert.equal(await repository.loadWallet("2026-07-27"), null);
  });

  it("오염된 값은 안전하게 정규화한다", async () => {
    const storage = createStorage();
    storage.setItem(
      "crossword-puzzle:daily-hints:2026-07-26",
      JSON.stringify({
        date: "2026-07-26",
        earnedCredits: -4,
        usedCredits: 1.9,
      }),
    );

    const repository = createLocalDailyHintWalletRepository({ storage });
    assert.deepEqual(await repository.loadWallet("2026-07-26"), {
      date: "2026-07-26",
      earnedCredits: 0,
      usedCredits: 1,
    });
  });
});
