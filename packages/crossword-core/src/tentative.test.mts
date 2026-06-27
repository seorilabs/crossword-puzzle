// 연필(임시) 입력 표시 순수 로직 단위 테스트
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  applyTentativeUpdate,
  computeTentativeUpdate,
  selectPromotableTentativeKeys,
  shouldRenderTentative,
} from "./tentative.ts";

describe("shouldRenderTentative — 임시(회색) 렌더 가드", () => {
  const base = {
    isFilled: true,
    isCorrect: false,
    isPending: false,
    isTentative: true,
  };

  it("채워진 임시 셀(정답 아님·미확정 아님)은 임시로 렌더한다", () => {
    assert.equal(shouldRenderTentative(base), true);
  });

  it("정답으로 잠긴 셀은 임시 표시를 적용하지 않는다", () => {
    assert.equal(shouldRenderTentative({ ...base, isCorrect: true }), false);
  });

  it("IME 미확정(pending) 셀은 임시 표시를 적용하지 않는다", () => {
    assert.equal(shouldRenderTentative({ ...base, isPending: true }), false);
  });

  it("값이 없는 셀은 임시 표시를 적용하지 않는다", () => {
    assert.equal(shouldRenderTentative({ ...base, isFilled: false }), false);
  });

  it("임시 셋에 없는 셀은 임시 표시를 적용하지 않는다", () => {
    assert.equal(shouldRenderTentative({ ...base, isTentative: false }), false);
  });

  it("autocheck(오답 강조)와 독립적이다 — isWrong 입력을 받지 않으므로 영향 없음", () => {
    // showWrong 여부와 무관하게, 위 4개 조건만으로 판정된다.
    assert.equal(shouldRenderTentative(base), true);
  });
});

describe("computeTentativeUpdate — 입력에 따른 임시 셋 변화량", () => {
  it("연필 ON + 값이 채워진 셀은 임시로 추가된다", () => {
    const { adds, removes } = computeTentativeUpdate(
      [
        { key: "0,0", hasValue: true },
        { key: "0,1", hasValue: true },
      ],
      true,
    );
    assert.deepEqual(adds, ["0,0", "0,1"]);
    assert.deepEqual(removes, []);
  });

  it("연필 OFF(펜 모드)면 값이 채워져도 확정 처리(제거)된다", () => {
    const { adds, removes } = computeTentativeUpdate(
      [{ key: "0,0", hasValue: true }],
      false,
    );
    assert.deepEqual(adds, []);
    assert.deepEqual(removes, ["0,0"]);
  });

  it("값이 지워진 셀은 연필 모드와 무관하게 항상 제거된다", () => {
    const onPencil = computeTentativeUpdate(
      [{ key: "0,0", hasValue: false }],
      true,
    );
    assert.deepEqual(onPencil.adds, []);
    assert.deepEqual(onPencil.removes, ["0,0"]);
  });
});

describe("selectPromotableTentativeKeys — 승격 대상 선별", () => {
  const keys = ["0,0", "0,1", "0,2"];

  it("임시 셋에 있고 잠기지 않은 셀만 고른다", () => {
    const tentative = new Set(["0,0", "0,1"]);
    const locked = new Set(["0,1"]); // 0,1은 정답으로 잠김
    const result = selectPromotableTentativeKeys(keys, tentative, (k) =>
      locked.has(k),
    );
    assert.deepEqual(result, ["0,0"]);
  });

  it("임시 셀이 없으면 빈 배열", () => {
    const result = selectPromotableTentativeKeys(keys, new Set(), () => false);
    assert.deepEqual(result, []);
  });

  it("모든 임시 셀이 잠겨 있으면 빈 배열", () => {
    const tentative = new Set(["0,0"]);
    const result = selectPromotableTentativeKeys(keys, tentative, () => true);
    assert.deepEqual(result, []);
  });
});

describe("applyTentativeUpdate — 임시 셋 적용", () => {
  it("removes를 먼저, adds를 나중에 적용한다", () => {
    const prev = new Set(["0,0", "0,1"]);
    const next = applyTentativeUpdate(prev, ["0,2"], ["0,0"]);
    assert.deepEqual([...next].sort(), ["0,1", "0,2"]);
  });

  it("원본 Set을 변경하지 않는다(불변)", () => {
    const prev = new Set(["0,0"]);
    applyTentativeUpdate(prev, ["1,1"], ["0,0"]);
    assert.deepEqual([...prev], ["0,0"]);
  });

  it("같은 키가 adds·removes에 모두 있으면 add가 최종 반영된다", () => {
    const next = applyTentativeUpdate(new Set(), ["0,0"], ["0,0"]);
    assert.deepEqual([...next], ["0,0"]);
  });
});
