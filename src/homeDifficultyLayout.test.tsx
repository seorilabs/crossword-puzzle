import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const indexCss = readFileSync(join(process.cwd(), "src/index.css"), "utf8");

describe("홈 사다리 레이아웃", () => {
  it("AIT 사다리 카드에 좌우 20px 거터를 유지한다", () => {
    const rule = indexCss.match(/\.dailyLadder\s*\{(?<body>[^}]*)\}/u);

    expect(rule?.groups?.body).toMatch(/margin:\s*8px\s+20px\s+18px;/u);
  });
});
