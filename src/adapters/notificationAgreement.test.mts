// notificationAgreement 어댑터: 동의 결과 분기(동의/거부/미지원/error/timeout)
// 회귀 테스트(#253). 실제 AIT SDK 대신 주입 가능한 fake 로 콜백 경로를 구동한다.
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  requestReturnReminderAgreement,
  resolveReturnReminderTemplateCode,
  DEFAULT_RETURN_REMINDER_TEMPLATE_CODE,
  RETURN_REMINDER_TEMPLATE_CODE,
} from "./notificationAgreement.ts";

type AgreementConfig = {
  options: { templateCode: string };
  onEvent: (result: { type: string }) => void;
  onError: (error: unknown) => void;
};

// requestReturnReminderAgreement 의 첫 인자(SDK 호출부) 타입.
type RequestAgreement = Parameters<typeof requestReturnReminderAgreement>[0];

// 실제 AIT SDK 처럼 콜백을 비동기로(호출부가 cleanup 을 받은 뒤에) 발화하는 fake.
// drive 는 config 를 받아 어떤 콜백을 언제 부를지 정한다. cleanup 호출 여부를 센다.
function makeFake(
  drive: (config: AgreementConfig) => void,
): { fake: RequestAgreement; cleanupCalls: () => number } {
  let cleaned = 0;
  const fake = ((config: AgreementConfig) => {
    // 마이크로태스크로 미뤄, 어댑터가 cleanup 을 할당하고 타이머를 건 뒤 콜백이
    // 발화하도록 한다(실제 브리지 콜백과 동일한 순서).
    queueMicrotask(() => drive(config));
    return () => {
      cleaned += 1;
    };
  }) as unknown as RequestAgreement;
  return { fake, cleanupCalls: () => cleaned };
}

describe("requestReturnReminderAgreement (#253)", () => {
  it("newAgreement/alreadyAgreed 이벤트는 agreed 로 해석한다", async () => {
    for (const type of ["newAgreement", "alreadyAgreed"]) {
      const { fake } = makeFake((config) => config.onEvent({ type }));
      const result = await requestReturnReminderAgreement(fake);
      assert.deepEqual(result, { outcome: "agreed" });
    }
  });

  it("agreementRejected 이벤트는 rejected 로 해석한다", async () => {
    const { fake } = makeFake((config) =>
      config.onEvent({ type: "agreementRejected" }),
    );
    const result = await requestReturnReminderAgreement(fake);
    assert.deepEqual(result, { outcome: "rejected" });
  });

  it("onError 는 error + error_reason 요약 + error_code 를 담는다 (#288)", async () => {
    const { fake } = makeFake((config) =>
      config.onError({ code: "E_BRIDGE", message: "not connected" }),
    );
    const result = await requestReturnReminderAgreement(fake);
    assert.equal(result.outcome, "error");
    assert.equal(result.errorReason, "E_BRIDGE: not connected");
    assert.equal(result.errorCode, "E_BRIDGE");
  });

  it("코드 없는 onError(Error 인스턴스)는 error_code 없이 error_reason만 담는다 (#288)", async () => {
    const { fake } = makeFake((config) =>
      config.onError(new Error("알림 동의에 실패하였습니다.")),
    );
    const result = await requestReturnReminderAgreement(fake);
    assert.equal(result.outcome, "error");
    assert.equal(result.errorReason, "알림 동의에 실패하였습니다.");
    assert.equal(result.errorCode, undefined);
  });

  it("동기 throw(미지원 환경)는 unsupported 로 폴백한다", async () => {
    const fake = (() => {
      throw new Error("unsupported host");
    }) as unknown as RequestAgreement;
    const result = await requestReturnReminderAgreement(fake);
    assert.deepEqual(result, { outcome: "unsupported" });
  });

  it("콜백이 돌아오지 않으면 안전망 타이머가 timeout 으로 종료한다", async () => {
    // onEvent/onError 를 호출하지 않는 fake + 짧은 timeoutMs.
    const { fake } = makeFake(() => {});
    const result = await requestReturnReminderAgreement(fake, 5);
    assert.deepEqual(result, { outcome: "timeout" });
  });

  it("결과 확정 시 cleanup 을 한 번 호출한다", async () => {
    const { fake, cleanupCalls } = makeFake((config) =>
      config.onEvent({ type: "newAgreement" }),
    );
    await requestReturnReminderAgreement(fake);
    assert.equal(cleanupCalls(), 1);
  });

  it("환경변수 미설정(node)에서는 템플릿 코드가 기본값으로 폴백한다 (#288)", () => {
    // import.meta.env 부재(node) 환경이므로 옵셔널 체이닝으로 기본값을 쓴다.
    assert.equal(
      resolveReturnReminderTemplateCode(),
      DEFAULT_RETURN_REMINDER_TEMPLATE_CODE,
    );
    assert.equal(
      RETURN_REMINDER_TEMPLATE_CODE,
      DEFAULT_RETURN_REMINDER_TEMPLATE_CODE,
    );
  });

  it("해석된 템플릿 코드를 SDK 동의 요청 options에 넘긴다 (#288)", async () => {
    // 환경변수 → resolveReturnReminderTemplateCode → SDK 요청까지의 배선을
    // 고정한다. node 환경이라 값은 기본값이며, 환경변수 주입 시 이 경로로 전달된다.
    let sentTemplateCode: string | undefined;
    const { fake } = makeFake((config) => {
      sentTemplateCode = config.options.templateCode;
      config.onEvent({ type: "newAgreement" });
    });
    await requestReturnReminderAgreement(fake);
    assert.equal(sentTemplateCode, RETURN_REMINDER_TEMPLATE_CODE);
    assert.equal(sentTemplateCode, DEFAULT_RETURN_REMINDER_TEMPLATE_CODE);
  });

  it("먼저 확정된 결과만 반영하고 이후 콜백은 무시한다(중복 resolve 방지)", async () => {
    let capturedOnError: ((error: unknown) => void) | undefined;
    const { fake } = makeFake((config) => {
      capturedOnError = config.onError;
      config.onEvent({ type: "agreementRejected" });
    });
    const result = await requestReturnReminderAgreement(fake);
    // 확정 후 늦게 온 onError 는 결과를 바꾸지 않는다.
    capturedOnError?.(new Error("late"));
    assert.deepEqual(result, { outcome: "rejected" });
  });
});
