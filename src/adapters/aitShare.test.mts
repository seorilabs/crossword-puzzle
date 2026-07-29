// AIT 네이티브 공유 시트 어댑터(#320) 단위 테스트. 실제 SDK 대신 주입 가능한 mock
// share로 성공/미지원(throw) 분기와 message 전달을 고정한다.
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { shareViaAitSheet } from "./aitShare.ts";

// shareViaAitSheet 의 두 번째 인자(SDK 호출부) 타입.
type ShareImpl = Parameters<typeof shareViaAitSheet>[1];

describe("shareViaAitSheet (#320)", () => {
  it("SDK share가 정상 resolve하면 shared를 반환한다", async () => {
    const fake = (async () => {}) as ShareImpl;
    assert.equal(await shareViaAitSheet("본문", fake), "shared");
  });

  it("SDK share가 비동기 reject(미지원)하면 unsupported로 폴백한다", async () => {
    const fake = (async () => {
      throw new Error("bridge not connected");
    }) as ShareImpl;
    assert.equal(await shareViaAitSheet("본문", fake), "unsupported");
  });

  it("SDK share가 동기 throw(미지원)해도 unsupported로 폴백한다", async () => {
    const fake = (() => {
      throw new Error("no bridge");
    }) as unknown as ShareImpl;
    assert.equal(await shareViaAitSheet("본문", fake), "unsupported");
  });

  it("전달한 텍스트를 { message } 형태로 SDK에 넘긴다", async () => {
    let received: { message: string } | undefined;
    const fake = (async (options: { message: string }) => {
      received = options;
    }) as ShareImpl;
    await shareViaAitSheet("공유할 결과", fake);
    assert.deepEqual(received, { message: "공유할 결과" });
  });
});
