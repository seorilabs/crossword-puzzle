// 아키텍처 경계 가드: packages/crossword-core는 플랫폼 무관 도메인/정책 계층이므로
// React/React Native/AppsInToss/Firebase/AdMob 등 UI·SDK 의존을 가져선 안 되고,
// 상위 계층(src, apps/mobile)을 역참조해서도 안 된다(AGENTS.md 규칙의 자동 강제).

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

// core가 import해선 안 되는 대상(정확한 모듈명 또는 스코프 접두).
const FORBIDDEN_IMPORT_PATTERNS: RegExp[] = [
  /^react$/,
  /^react\//,
  /^react-native$/,
  /^react-native\//,
  /^@apps-in-toss\//,
  /^firebase$/,
  /^firebase\//,
  /^@react-native-firebase\//,
  /^react-native-google-mobile-ads/,
  // 상위 계층 역참조(의존성 규칙 위반).
  /(^|\/)(\.\.\/)+src\//,
  /(^|\/)apps\/mobile/,
];

function listSourceFiles(): string[] {
  return readdirSync(here)
    .filter((name) => name.endsWith(".ts"))
    .filter((name) => !name.endsWith(".test.ts"))
    .map((name) => join(here, name));
}

// import/export ... from "X" 및 동적 import("X")의 X를 추출한다.
function extractModuleSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\b(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s*["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) != null) {
      specifiers.push(match[1]);
    }
  }
  return specifiers;
}

test("crossword-core는 UI·SDK·상위 계층을 import하지 않는다", () => {
  const violations: string[] = [];

  for (const file of listSourceFiles()) {
    const source = readFileSync(file, "utf8");
    for (const specifier of extractModuleSpecifiers(source)) {
      const forbidden = FORBIDDEN_IMPORT_PATTERNS.find((pattern) =>
        pattern.test(specifier),
      );
      if (forbidden != null) {
        violations.push(`${file.split("/").at(-1)} → "${specifier}"`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `core 순수성 위반(금지된 import):\n${violations.join("\n")}`,
  );
});
