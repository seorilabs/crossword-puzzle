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

describe("복귀 리마인더 배포 배선 설정 (#319)", () => {
  it("AC-1: 중앙 custom build 명령에 RETURN_REMINDER_TEMPLATE_CODE를 주입한다", () => {
    assert.match(deployWorkflow, /build_command:\s*\|/);
    assert.match(
      deployWorkflow,
      /template_code="\$\{\{ vars\.RETURN_REMINDER_TEMPLATE_CODE \}\}"/,
    );
    assert.match(deployWorkflow, /VITE_RETURN_REMINDER_TEMPLATE_CODE="\$template_code"/);
    assert.match(deployWorkflow, /npm run build/);
  });

  it("AC-2: repo variable가 비어 있거나 공백이면 빌드 전에 exit 1로 차단한다", () => {
    assert.ok(
      deployWorkflow.includes(
        'if [ -z "${template_code//[[:space:]]/}" ]; then',
      ),
      "공백 제거 후 빈 템플릿 코드를 검증해야 한다",
    );
    assert.match(deployWorkflow, /::error::RETURN_REMINDER_TEMPLATE_CODE/);
    assert.match(deployWorkflow, /exit 1/);
    assert.ok(deployWorkflow.indexOf("if [ -z") < deployWorkflow.indexOf("npm run build"));
    assert.doesNotMatch(deployWorkflow, /Warn on missing return reminder/);
    assert.doesNotMatch(deployWorkflow, /::warning::/);
  });

  it("AIT workflow는 immutable 중앙 caller와 named secret 계약을 사용한다", () => {
    assert.match(
      deployWorkflow,
      /rn-deploy-ait\.yml@[0-9a-f]{40}/,
    );
    assert.match(deployWorkflow, /APPS_IN_TOSS_API_KEY:\s*\$\{\{ secrets\.APPS_IN_TOSS_API_KEY \}\}/);
    assert.doesNotMatch(deployWorkflow, /secrets:\s*inherit/);
    assert.doesNotMatch(deployWorkflow, /uses:\s*actions\//);
    assert.doesNotMatch(deployWorkflow, /runs-on:/);
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
