import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

// 복귀 리마인더 템플릿 코드 배포 배선(#319)을 thin caller의 중앙 workflow
// input과 build_command 계약을 기준으로 검증한다.
const repoRoot = new URL("../../../", import.meta.url);
const deployWorkflow = readFileSync(
  new URL(".github/workflows/deploy-apps-in-toss.yml", repoRoot),
  "utf8",
);
const readme = readFileSync(new URL("README.md", repoRoot), "utf8");
const appSource = readFileSync(new URL("src/App.tsx", repoRoot), "utf8");

describe("복귀 리마인더 배포 배선 설정 (#319)", () => {
  it("AC-1: 중앙 AIT workflow의 build_command가 repo variable을 빌드 env로 주입한다", () => {
    assert.match(
      deployWorkflow,
      /uses:\s*seorilabs\/\.github\/\.github\/workflows\/rn-deploy-ait\.yml@c8db7834f6b72198a898f699b6f91e3a185fc7f5/,
    );
    assert.match(
      deployWorkflow,
      /export VITE_RETURN_REMINDER_TEMPLATE_CODE="\$\{\{ vars\.RETURN_REMINDER_TEMPLATE_CODE \|\| '' \}\}"/,
    );
    assert.match(
      deployWorkflow,
      /export VITE_APP_VERSION="\$SEORI_RELEASE_VERSION"/,
    );
    assert.match(
      deployWorkflow,
      /export VITE_RELEASE_TAG="\$SEORI_RELEASE_TAG"/,
    );
    assert.match(deployWorkflow, /npm run build/);
  });

  it("AC-2: repo variable가 비어 있거나 공백이면 빌드 전에 exit 1로 차단한다", () => {
    assert.ok(
      deployWorkflow.includes(
        'if [ -z "${VITE_RETURN_REMINDER_TEMPLATE_CODE//[[:space:]]/}" ]; then',
      ),
      "공백 제거 후 빈 템플릿 코드를 검증해야 한다",
    );
    assert.match(deployWorkflow, /::error::RETURN_REMINDER_TEMPLATE_CODE/);
    assert.match(deployWorkflow, /exit 1/);
    assert.ok(
      deployWorkflow.indexOf(
        "RETURN_REMINDER_TEMPLATE_CODE repository variable is required",
      ) < deployWorkflow.indexOf("npm run build"),
      "필수 변수 검증은 빌드보다 먼저 실행해야 한다",
    );
    assert.doesNotMatch(deployWorkflow, /Warn on missing return reminder/);
    assert.doesNotMatch(deployWorkflow, /::warning::/);
  });

  it("AIT caller는 runner나 action을 재구현하지 않고 named secret만 전달한다", () => {
    assert.doesNotMatch(deployWorkflow, /runs-on:/);
    assert.doesNotMatch(deployWorkflow, /actions\/checkout@/);
    assert.doesNotMatch(deployWorkflow, /actions\/setup-node@/);
    assert.doesNotMatch(deployWorkflow, /secrets:\s*inherit/);
    assert.match(
      deployWorkflow,
      /APPS_IN_TOSS_API_KEY:\s*\$\{\{ secrets\.APPS_IN_TOSS_API_KEY \}\}/,
    );
  });

  it("AC-5: README에 repo variable RETURN_REMINDER_TEMPLATE_CODE 등록 절차를 반영한다", () => {
    assert.match(readme, /repository variable/);
    assert.match(readme, /RETURN_REMINDER_TEMPLATE_CODE/);
    assert.match(readme, /`RETURN_REMINDER_TEMPLATE_CODE`.*로 등록/s);
  });

  it("AC-3: App.tsx가 prompt·result 두 이벤트 emit에 template_code_source 출처 빌더를 배선한다", () => {
    assert.match(appSource, /RETURN_REMINDER_TEMPLATE_CODE_SOURCE/);
    assert.match(
      appSource,
      /RETURN_REMINDER_PROMPT_EVENT,\s*buildReturnReminderPromptParams\(\s*"mission_complete",\s*RETURN_REMINDER_TEMPLATE_CODE_SOURCE/,
    );
    assert.match(
      appSource,
      /RETURN_REMINDER_RESULT_EVENT,\s*buildReturnReminderResultParams\(\s*resolved,\s*RETURN_REMINDER_TEMPLATE_CODE_SOURCE/,
    );
  });
});
