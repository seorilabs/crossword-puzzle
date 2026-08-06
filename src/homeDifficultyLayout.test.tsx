import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const indexCss = readFileSync(join(process.cwd(), "src/index.css"), "utf8");

describe("홈 난이도 선택 레이아웃", () => {
  it("AIT 난이도 카드 행에 좌우 20px 거터를 유지한다", () => {
    const rule = indexCss.match(/\.todayStartButtons\s*\{(?<body>[^}]*)\}/u);

    expect(rule?.groups?.body).toMatch(/margin:\s*8px\s+20px\s+18px;/u);
  });
});
