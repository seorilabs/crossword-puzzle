import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  consumeDailyHintCredit,
  createDailyHintWallet,
  DEFAULT_DAILY_FREE_HINT_CREDITS,
  DEFAULT_REWARDED_HINT_CREDITS,
  getDailyHintBalance,
  grantDailyHintCredits,
  loadOrMigrateDailyHintWallet,
  migrateLegacyDailyHintWallet,
  normalizeDailyHintWallet,
} from "./dailyHintWallet.ts";

describe("dailyHintWallet", () => {
  it("AC-1: 하루 무료 힌트는 모든 퍼즐이 공유하는 3개로 시작한다", () => {
    const wallet = createDailyHintWallet("2026-07-26");

    assert.equal(DEFAULT_DAILY_FREE_HINT_CREDITS, 3);
    assert.deepEqual(getDailyHintBalance(wallet), {
      dailyCredits: 3,
      earnedCredits: 0,
      remainingCredits: 3,
      totalCredits: 3,
      usedCredits: 0,
    });
  });

  it("AC-1: 쉬움·보통·어려움·지난 퍼즐이 같은 지갑의 3개만 사용한다", () => {
    const puzzleContexts = ["easy", "normal", "hard", "archive"] as const;
    let wallet = createDailyHintWallet("2026-07-26");

    for (const puzzleContext of puzzleContexts.slice(0, 3)) {
      assert.ok(puzzleContext);
      const consumed = consumeDailyHintCredit(wallet);
      assert.notEqual(consumed, null);
      wallet = consumed!;
    }

    assert.equal(getDailyHintBalance(wallet).remainingCredits, 0);
    assert.equal(puzzleContexts[3], "archive");
    assert.equal(consumeDailyHintCredit(wallet), null);
  });

  it("AC-4: 광고 1회 보상은 공용 지갑에 힌트 1개를 더한다", () => {
    const spent = {
      ...createDailyHintWallet("2026-07-26"),
      usedCredits: 3,
    };
    const rewarded = grantDailyHintCredits(
      spent,
      DEFAULT_REWARDED_HINT_CREDITS,
    );

    assert.equal(DEFAULT_REWARDED_HINT_CREDITS, 1);
    assert.equal(getDailyHintBalance(rewarded).remainingCredits, 1);
  });

  it("KST 날짜 키가 바뀌면 이전 잔액과 광고 보상을 이월하지 않는다", () => {
    const previous = {
      date: "2026-07-26",
      earnedCredits: 2,
      usedCredits: 4,
    };

    assert.deepEqual(normalizeDailyHintWallet(previous, "2026-07-27"), {
      date: "2026-07-27",
      earnedCredits: 0,
      usedCredits: 0,
    });
  });

  it("AC-5: 구버전 퍼즐별 사용량과 광고 보상을 합산해 중복 지급을 막는다", () => {
    const migrated = migrateLegacyDailyHintWallet("2026-07-26", [
      { earnedHintCredits: 2, hintCount: 2 },
      { earnedHintCredits: 0, hintCount: 1 },
      { earnedHintCredits: 0, hintCount: 0 },
    ]);

    assert.deepEqual(migrated, {
      date: "2026-07-26",
      earnedCredits: 2,
      usedCredits: 3,
    });
    assert.equal(getDailyHintBalance(migrated).remainingCredits, 2);
  });

  it("AC-5: 저장된 일일 지갑이 있으면 구버전 이관을 다시 실행하지 않는다", async () => {
    let savedWallet = null as ReturnType<typeof createDailyHintWallet> | null;
    let legacyLoadCount = 0;
    let saveCount = 0;
    const repository = {
      async loadWallet() {
        return savedWallet;
      },
      async saveWallet(wallet: ReturnType<typeof createDailyHintWallet>) {
        saveCount += 1;
        savedWallet = wallet;
      },
    };
    const loadLegacyProgresses = async () => {
      legacyLoadCount += 1;
      return [{ earnedHintCredits: 1, hintCount: 2 }];
    };

    const first = await loadOrMigrateDailyHintWallet({
      date: "2026-07-26",
      loadLegacyProgresses,
      repository,
    });
    const reopened = await loadOrMigrateDailyHintWallet({
      date: "2026-07-26",
      loadLegacyProgresses,
      repository,
    });

    assert.deepEqual(first, reopened);
    assert.equal(legacyLoadCount, 1);
    assert.equal(saveCount, 1);
  });
});
