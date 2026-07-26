import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  consumeDailyHintCredit,
  createDailyHintWallet,
  DEFAULT_DAILY_FREE_HINT_CREDITS,
  DEFAULT_REWARDED_HINT_CREDITS,
  getDailyHintBalance,
  grantDailyHintCredits,
  migrateLegacyDailyHintWallet,
  normalizeDailyHintWallet,
} from "./dailyHintWallet.ts";

describe("dailyHintWallet", () => {
  it("하루 무료 힌트는 모든 퍼즐이 공유하는 3개로 시작한다", () => {
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

  it("퍼즐 전환과 무관하게 같은 지갑에서 3번만 사용할 수 있다", () => {
    const first = consumeDailyHintCredit(createDailyHintWallet("2026-07-26"));
    assert.notEqual(first, null);
    const second = consumeDailyHintCredit(first!, 3);
    assert.notEqual(second, null);
    const third = consumeDailyHintCredit(second!, 3);
    assert.notEqual(third, null);

    assert.equal(getDailyHintBalance(third!, 3).remainingCredits, 0);
    assert.equal(consumeDailyHintCredit(third!, 3), null);
  });

  it("광고 1회 보상은 공용 지갑에 힌트 1개를 더한다", () => {
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

  it("구버전 퍼즐별 사용량과 광고 보상을 합산해 중복 지급을 막는다", () => {
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
});
