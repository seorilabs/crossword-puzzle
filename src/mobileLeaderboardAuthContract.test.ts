import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const androidSource = readFileSync(
  join(
    process.cwd(),
    "apps/mobile/android/app/src/main/java/com/seorilabs/crosswordpuzzle/NativeLeaderboardModule.kt",
  ),
  "utf8",
);

describe("Android PGS 인증 경계(#345)", () => {
  it("자동 제출은 비대화형 인증 조회만 하고 signIn을 호출하지 않는다", () => {
    expect(androidSource).toContain(
      "override fun isAuthenticated(promise: Promise)",
    );
    expect(androidSource).toContain(
      "withAuthenticatedActivity(promise, requireInteractiveSignIn = false)",
    );
    expect(androidSource).toMatch(
      /if \(!requireInteractiveSignIn\)[\s\S]*?promise\.reject\(ERROR_AUTH_REQUIRED[\s\S]*?return@addOnSuccessListener[\s\S]*?signInClient\.signIn\(\)/,
    );
  });

  it("사용자가 순위 CTA를 여는 경로만 대화형 signIn을 허용한다", () => {
    expect(androidSource).toContain(
      "withAuthenticatedActivity(promise, requireInteractiveSignIn = true)",
    );
  });
});
