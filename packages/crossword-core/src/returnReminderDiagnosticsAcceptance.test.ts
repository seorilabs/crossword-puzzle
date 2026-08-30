import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("#339 복귀 리마인더 실패 진단 인수조건", () => {
  const policy = read("packages/crossword-core/src/returnReminder.ts");
  const policyTests = read(
    "packages/crossword-core/src/returnReminder.test.ts",
  );
  const agreementAdapter = read("src/adapters/notificationAgreement.ts");
  const repository = read("src/adapters/returnReminderRepository.ts");
  const app = read("src/App.tsx");

  it("AC-1: cause·data·response와 숫자형 코드를 순회해 추출한다", () => {
    assert.match(policy, /"cause",\s*"data"/);
    assert.match(policy, /"response"/);
    assert.match(policyTests, /cause: \{ status: 503/);
    assert.match(policyTests, /status: 400/);
  });

  it("AC-2·3: 미매핑 코드는 unmapped와 키 이름만 담은 제한 길이 shape로 기록한다", () => {
    assert.match(policy, /codeCandidate\?\.code \?\? "unmapped"/);
    assert.match(policy, /Object\.getOwnPropertyNames\(error\)\.sort\(\)/);
    assert.match(policy, /ERROR_SHAPE_MAX_LENGTH = 100/);
    assert.match(policyTests, /private-message-value/);
    assert.match(policyTests, /shape\?\.length, 100/);
  });

  it("AC-4: onError와 예기치 않은 onEvent error 모두 sdk_callback stage를 기록한다", () => {
    assert.match(
      agreementAdapter,
      /onEvent:[\s\S]*?outcome !== "error"[\s\S]*?failureStage: "sdk_callback"/,
    );
    assert.match(
      agreementAdapter,
      /onError:[\s\S]*?failureStage: "sdk_callback"/,
    );
    assert.match(policy, /params\.outcome === "error"/);
  });

  it("AC-5: unmapped는 기존 익일 재시도와 총 3회 상한 정책을 유지한다", () => {
    assert.match(policyTests, /unmapped는 일반 일시 실패처럼 익일 재시도/);
    assert.match(policyTests, /RETURN_REMINDER_MAX_PROMPT_COUNT/);
  });

  it("AC-6: errorShape가 어댑터·상태 저장·앱·GA4 파라미터까지 연결된다", () => {
    assert.match(agreementAdapter, /errorShape: shape/);
    assert.match(repository, /raw\.errorShape/);
    assert.match(app, /errorShape,/);
    assert.match(policy, /params\.error_shape = state\.errorShape/);
  });
});
