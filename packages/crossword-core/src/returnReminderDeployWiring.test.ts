import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

// 복귀 리마인더 템플릿 코드 배포 배선(#319)의 인수조건 중 워크플로·README 설정은
// 유닛 테스트 대상이 아니므로, 설정 파일 내용에 대한 assertion으로 각 인수조건을
// 자동 검증한다(ciStaticChecks 패턴).
const repoRoot = new URL("../../../", import.meta.url);
const deployWorkflow = readFileSync(
  new URL(".github/workflows/deploy-apps-in-toss.yml", repoRoot),
  "utf8",
);
const readme = readFileSync(new URL("README.md", repoRoot), "utf8");
const appSource = readFileSync(new URL("src/App.tsx", repoRoot), "utf8");

// 배포 잡의 잡 레벨 env 블록(`    env:` ~ `    steps:`)만 잘라, 주입 라인이
// 실제로 빌드 스텝이 process env로 받는 위치에 있는지 검증한다.
const jobEnvBlock = deployWorkflow.slice(
  deployWorkflow.indexOf("\n    env:"),
  deployWorkflow.indexOf("\n    steps:"),
);

describe("복귀 리마인더 배포 배선 설정 (#319)", () => {
  it("AC-1: 배포 워크플로 빌드 env(잡 레벨 env 블록)에 VITE_RETURN_REMINDER_TEMPLATE_CODE를 repo variable로 주입한다", () => {
    // 슬라이스가 실제로 env 블록을 잡았는지(가드): 두 마커가 모두 존재해야 한다.
    assert.ok(deployWorkflow.includes("\n    env:"));
    assert.ok(deployWorkflow.includes("\n    steps:"));
    assert.ok(jobEnvBlock.length > 0);
    // 주입 라인이 그 env 블록 안에 있고, repo variable 폴백('')까지 정확한지 확인.
    assert.match(
      jobEnvBlock,
      /VITE_RETURN_REMINDER_TEMPLATE_CODE:\s*\$\{\{\s*vars\.RETURN_REMINDER_TEMPLATE_CODE\s*\|\|\s*''\s*\}\}/,
    );
    // 이 env를 소비하는 빌드 스텝이 존재한다(npm run build).
    assert.match(deployWorkflow, /run:\s*npm run build/);
  });

  it("AC-2: repo variable 미설정 시 폴백 빌드 경고 스텝을 조건부로 실행한다", () => {
    // 조건: repo variable가 비어 있을 때만 경고 스텝을 돌린다.
    assert.match(
      deployWorkflow,
      /if:\s*\$\{\{\s*vars\.RETURN_REMINDER_TEMPLATE_CODE\s*==\s*''\s*\}\}/,
    );
    // 경고 메시지: 폴백 빌드로 리마인더 동의가 전건 실패함을 알린다.
    assert.match(deployWorkflow, /::warning::/);
    assert.match(deployWorkflow, /폴백 템플릿 코드로 빌드됨/);
    assert.match(deployWorkflow, /리마인더 동의가 전건 실패함/);
  });

  it("AC-5: README에 repo variable RETURN_REMINDER_TEMPLATE_CODE 등록 절차를 반영한다", () => {
    assert.match(readme, /repository variable/);
    assert.match(readme, /RETURN_REMINDER_TEMPLATE_CODE/);
    // 등록 단계가 콘솔 발급 절차(번호 목록) 안에 있는지 확인한다.
    assert.match(readme, /`RETURN_REMINDER_TEMPLATE_CODE`.*로 등록/s);
  });

  it("AC-3: App.tsx가 prompt·result 두 이벤트 emit에 template_code_source 출처 빌더를 배선한다", () => {
    // 어댑터가 해석한 출처 상수를 두 이벤트 emit이 모두 사용하는지 확인한다.
    assert.match(appSource, /RETURN_REMINDER_TEMPLATE_CODE_SOURCE/);
    // return_reminder_prompt: 프롬프트 파라미터 빌더에 출처 상수를 넘긴다.
    assert.match(
      appSource,
      /RETURN_REMINDER_PROMPT_EVENT,\s*buildReturnReminderPromptParams\(\s*"mission_complete",\s*RETURN_REMINDER_TEMPLATE_CODE_SOURCE/,
    );
    // return_reminder_result: 결과 파라미터 빌더에 출처 상수를 넘긴다.
    assert.match(
      appSource,
      /RETURN_REMINDER_RESULT_EVENT,\s*buildReturnReminderResultParams\(\s*resolved,\s*RETURN_REMINDER_TEMPLATE_CODE_SOURCE/,
    );
  });
});
