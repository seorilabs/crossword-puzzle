import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const settingsSheetSource = readFileSync(
  "src/components/SettingsSheet.tsx",
  "utf8",
);

describe("SettingsSheet AnswerInputMode 타입 계약(#269)", () => {
  it("answerInputModeRepository 모듈을 한 번만 import한다", () => {
    expect(
      settingsSheetSource.match(
        /from "\.\.\/adapters\/answerInputModeRepository"/g,
      ),
    ).toHaveLength(1);
  });

  it("SettingsSheetProps가 AnswerInputMode를 계속 사용한다", () => {
    expect(settingsSheetSource).toMatch(
      /answerInputMode:\s*AnswerInputMode;/,
    );
    expect(settingsSheetSource).toMatch(
      /selectAnswerInputMode:\s*\(mode:\s*AnswerInputMode\)\s*=>\s*void;/,
    );
  });

  it("SettingsSheet가 AnswerInputMode 타입 재노출 API를 유지한다", () => {
    expect(settingsSheetSource).toMatch(/export type \{ AnswerInputMode \};/);
  });
});
