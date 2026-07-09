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
  /^react-dom$/,
  /^react-dom\//,
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
    .filter((name) => name.endsWith(".ts") || name.endsWith(".mts"))
    .filter((name) => !name.endsWith(".test.ts") && !name.endsWith(".test.mts"))
    .map((name) => join(here, name));
}

// 줄/블록 주석을 제거해, 주석 안의 토큰이 import specifier로 오탐되지 않게 한다.
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// import/export ... from "X" 및 동적 import("X")의 X를 추출한다.
function extractModuleSpecifiers(rawSource: string): string[] {
  const source = stripComments(rawSource);
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

function findsForbidden(source: string): boolean {
  return extractModuleSpecifiers(source).some((specifier) =>
    FORBIDDEN_IMPORT_PATTERNS.some((pattern) => pattern.test(specifier)),
  );
}

test("가드 검출 로직: 금지 import를 형태별로 잡고 주석은 무시한다", () => {
  // 다양한 구문 형태의 금지 import를 모두 잡는다.
  assert.equal(findsForbidden(`import { useState } from "react";`), true);
  assert.equal(findsForbidden(`export type { FC } from "react";`), true);
  assert.equal(findsForbidden(`import { render } from "react-dom";`), true);
  assert.equal(findsForbidden(`import { View } from "react-native";`), true);
  assert.equal(findsForbidden(`const x = await import("firebase/app");`), true);
  assert.equal(findsForbidden(`import "@apps-in-toss/web-framework";`), true);
  assert.equal(findsForbidden(`import { a } from "../../src/adapters/x";`), true);

  // 허용 import는 잡지 않는다.
  assert.equal(findsForbidden(`import { getCellKey } from "./puzzle.ts";`), false);
  assert.equal(findsForbidden(`import assert from "node:assert/strict";`), false);

  // 주석·문자열 안의 토큰은 위반이 아니다(오탐 방지).
  assert.equal(findsForbidden(`// import { x } from "react";`), false);
  assert.equal(findsForbidden(`/* from "react-native" */`), false);
  assert.equal(findsForbidden(`const label = "from react to core";`), false);
});
