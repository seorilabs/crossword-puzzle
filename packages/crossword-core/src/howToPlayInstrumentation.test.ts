import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  HOW_TO_PLAY_COMPLETE_EVENT,
  HOW_TO_PLAY_DISMISS_EVENT,
  HOW_TO_PLAY_SHOWN_EVENT,
  buildHowToPlayParams,
  getHowToPlayOutcomeEvent,
} from "./howToPlayInstrumentation.ts";

describe("플레이 방법 안내 이벤트 이름", () => {
  it("첫 입력 가이드(onboarding_guide_*)와 겹치지 않는다", () => {
    for (const name of [
      HOW_TO_PLAY_SHOWN_EVENT,
      HOW_TO_PLAY_COMPLETE_EVENT,
      HOW_TO_PLAY_DISMISS_EVENT,
    ]) {
      assert.match(name, /^how_to_play_/);
      assert.equal(name.startsWith("onboarding_guide"), false);
    }
  });

  it("이탈 방식에 따라 완료/중도이탈 이벤트를 고른다", () => {
    assert.equal(
      getHowToPlayOutcomeEvent("complete"),
      HOW_TO_PLAY_COMPLETE_EVENT,
    );
    assert.equal(
      getHowToPlayOutcomeEvent("dismiss"),
      HOW_TO_PLAY_DISMISS_EVENT,
    );
  });
});

describe("안내 진행 파라미터", () => {
  it("0-based 인덱스와 1-based 번호를 함께 보낸다", () => {
    assert.deepEqual(buildHowToPlayParams({ stepIndex: 0, stepCount: 4 }), {
      step_index: 0,
      step_count: 4,
      step_number: 1,
      progress_percent: 25,
    });
  });

  it("마지막 단계는 진행률 100%다", () => {
    assert.deepEqual(buildHowToPlayParams({ stepIndex: 3, stepCount: 4 }), {
      step_index: 3,
      step_count: 4,
      step_number: 4,
      progress_percent: 100,
    });
  });

  it("단일 화면 안내(RN)는 1단계로 기록된다", () => {
    assert.deepEqual(buildHowToPlayParams({ stepIndex: 0, stepCount: 1 }), {
      step_index: 0,
      step_count: 1,
      step_number: 1,
      progress_percent: 100,
    });
  });

  it("경과 시간은 정수 초로 반올림해 덧붙인다", () => {
    assert.equal(
      buildHowToPlayParams({ stepIndex: 1, stepCount: 4, elapsedSeconds: 6.4 })
        .elapsed_seconds,
      6,
    );
  });

  it("경과 시간이 없거나 비정상이면 생략한다", () => {
    assert.equal(
      "elapsed_seconds" in
        buildHowToPlayParams({ stepIndex: 1, stepCount: 4 }),
      false,
    );
    assert.equal(
      "elapsed_seconds" in
        buildHowToPlayParams({
          stepIndex: 1,
          stepCount: 4,
          elapsedSeconds: Number.NaN,
        }),
      false,
    );
    assert.equal(
      "elapsed_seconds" in
        buildHowToPlayParams({
          stepIndex: 1,
          stepCount: 4,
          elapsedSeconds: -3,
        }),
      false,
    );
  });

  it("범위를 벗어난 입력을 안전하게 보정한다", () => {
    // 단계 수보다 큰 인덱스는 마지막 단계로 자른다.
    assert.equal(
      buildHowToPlayParams({ stepIndex: 9, stepCount: 4 }).step_index,
      3,
    );
    // 음수 인덱스와 0 이하 단계 수는 최소값으로 되돌린다.
    assert.deepEqual(buildHowToPlayParams({ stepIndex: -2, stepCount: 0 }), {
      step_index: 0,
      step_count: 1,
      step_number: 1,
      progress_percent: 100,
    });
  });
});
