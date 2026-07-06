// SafeArea 브리지 판정 로직 단위 테스트(#246)
// Node.js 22+ built-in test runner + --experimental-strip-types
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { resolveSafeAreaBridge, initSafeAreaInsets } from "./safeArea.ts";

const insets = { top: 10, bottom: 20, left: 0, right: 0 };

describe("resolveSafeAreaBridge", () => {
  it("null/undefined 후보는 브리지가 아니다(null)", () => {
    assert.equal(resolveSafeAreaBridge(null), null);
    assert.equal(resolveSafeAreaBridge(undefined), null);
  });

  it("객체가 아닌 값은 브리지가 아니다(null)", () => {
    assert.equal(resolveSafeAreaBridge(42), null);
    assert.equal(resolveSafeAreaBridge("bridge"), null);
    assert.equal(
      resolveSafeAreaBridge(() => {}),
      null,
    );
  });

  it("get이 없거나 함수가 아니면 브리지가 아니다(null)", () => {
    assert.equal(resolveSafeAreaBridge({}), null);
    assert.equal(resolveSafeAreaBridge({ get: 123 }), null);
    assert.equal(
      resolveSafeAreaBridge({ subscribe: () => {} }),
      null,
    );
  });

  it("get이 함수면 subscribe가 없어도 브리지로 인정한다(일회성 반영 허용)", () => {
    const candidate = { get: () => insets };
    const bridge = resolveSafeAreaBridge(candidate);
    assert.notEqual(bridge, null);
    // 후보 객체를 그대로 돌려줘 get의 this 바인딩이 유지된다.
    assert.equal(bridge, candidate);
  });

  it("get·subscribe가 모두 함수면 브리지로 인정한다", () => {
    const candidate = { get: () => insets, subscribe: () => () => {} };
    const bridge = resolveSafeAreaBridge(candidate);
    assert.equal(bridge, candidate);
  });

  it("get은 후보 객체 문맥(this)에서 호출된다", () => {
    const candidate = {
      value: insets,
      get() {
        return this.value;
      },
    };
    const bridge = resolveSafeAreaBridge(candidate);
    assert.deepEqual(bridge?.get(), insets);
  });
});

describe("initSafeAreaInsets", () => {
  it("비-AIT 환경(SafeAreaInsets 미노출)에서는 no-op 구독 해제 함수를 돌려준다", () => {
    // 테스트 런타임에는 AIT SDK의 SafeAreaInsets가 없어 브리지가 없다.
    const cleanup = initSafeAreaInsets();
    assert.equal(typeof cleanup, "function");
    assert.doesNotThrow(() => cleanup());
  });
});
