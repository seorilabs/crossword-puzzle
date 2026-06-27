// 사운드·햅틱 피드백 정책 단위 테스트
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { resolveFeedbackActions } from "./feedbackPolicy.ts";

describe("resolveFeedbackActions", () => {
  const both = { soundEnabled: true, hapticEnabled: true };

  it("단어 완성: 소리·진동 모두 발생(둘 다 ON)", () => {
    assert.deepEqual(resolveFeedbackActions("wordComplete", both), {
      playSound: true,
      vibrate: true,
    });
  });

  it("퍼즐 완료: 소리·진동 모두 발생(둘 다 ON)", () => {
    assert.deepEqual(resolveFeedbackActions("puzzleComplete", both), {
      playSound: true,
      vibrate: true,
    });
  });

  it("오답: 소리만 발생하고 진동은 발생하지 않는다", () => {
    assert.deepEqual(resolveFeedbackActions("wrong", both), {
      playSound: true,
      vibrate: false,
    });
  });

  it("사운드 OFF면 어떤 시점에도 소리가 발생하지 않는다", () => {
    const settings = { soundEnabled: false, hapticEnabled: true };
    assert.equal(resolveFeedbackActions("wordComplete", settings).playSound, false);
    assert.equal(resolveFeedbackActions("wrong", settings).playSound, false);
  });

  it("햅틱 OFF면 성취 시점에도 진동이 발생하지 않는다", () => {
    const settings = { soundEnabled: true, hapticEnabled: false };
    assert.equal(
      resolveFeedbackActions("puzzleComplete", settings).vibrate,
      false,
    );
  });

  it("둘 다 OFF면 아무 피드백도 없다", () => {
    const off = { soundEnabled: false, hapticEnabled: false };
    assert.deepEqual(resolveFeedbackActions("wordComplete", off), {
      playSound: false,
      vibrate: false,
    });
  });
});
