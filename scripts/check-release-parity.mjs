#!/usr/bin/env node
import { readFileSync } from "node:fs";

const sharedPolicyPath = "packages/crossword-core/src/uiPolicy.ts";
const sharedIndexPath = "packages/crossword-core/src/index.ts";
const webAppPath = "src/App.tsx";
const mobileAppPath = "apps/mobile/App.tsx";
const launchConfigPath = "src/adapters/launchConfig.ts";
const ciWorkflowPath = ".github/workflows/ci.yml";
const deployAllWorkflowPath = ".github/workflows/deploy-all.yml";

const sharedPolicyExports = [
  "DAILY_ATTEMPT_LIMIT",
  "DEFAULT_HINT_CREDITS",
  "DEFAULT_VISIBLE_PUZZLE_COUNT",
  "PUZZLE_GENERATION_INTERVAL_HOURS",
  "PUZZLE_KEEP_COUNT",
  "createPuzzleSummary",
  "getBonusPuzzleCandidateSummary",
  "getDailyFreePuzzleSummaries",
  "getDailyFreePuzzleSummary",
  "sortPuzzleSummariesByRecency",
  "uniquePuzzleSummaries",
];

const requiredWebImports = [
  "DAILY_ATTEMPT_LIMIT",
  "createPuzzleSummary",
  "getBonusPuzzleCandidateSummary",
  "getDailyFreePuzzleSummaries",
  "getDailyFreePuzzleSummary",
  "sortPuzzleSummariesByRecency",
  "uniquePuzzleSummaries",
];

const requiredMobileImports = [
  "DAILY_ATTEMPT_LIMIT",
  "DEFAULT_HINT_CREDITS",
  "DEFAULT_VISIBLE_PUZZLE_COUNT",
  "PUZZLE_GENERATION_INTERVAL_HOURS",
  "PUZZLE_KEEP_COUNT",
  "createPuzzleSummary",
  "getBonusPuzzleCandidateSummary",
  "getDailyFreePuzzleSummaries",
  "getDailyFreePuzzleSummary",
  "sortPuzzleSummariesByRecency",
  "uniquePuzzleSummaries",
];

const forbiddenLocalDefinitions = [
  "DAILY_ATTEMPT_LIMIT",
  "DEFAULT_HINT_CREDITS",
  "DEFAULT_VISIBLE_PUZZLE_COUNT",
  "PUZZLE_GENERATION_INTERVAL_HOURS",
  "PUZZLE_KEEP_COUNT",
  "createPuzzleSummary",
  "getBonusPuzzleCandidateSummary",
  "getDailyFreePuzzleSummaries",
  "getDailyFreePuzzleSummary",
  "sortPuzzleSummariesByRecency",
  "uniquePuzzleSummaries",
];

const failures = [];

function read(path) {
  return readFileSync(path, "utf8");
}

function fail(message) {
  failures.push(message);
}

function assertIncludes(content, needle, label) {
  if (!content.includes(needle)) {
    fail(`${label}: missing ${needle}`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertNamedPolicyExport(content, name, path) {
  const exportPattern = new RegExp(`export\\s+(const|function)\\s+${name}\\b`);

  if (!exportPattern.test(content)) {
    fail(`${path}: missing named export ${name}`);
  }
}

function extractNamedImports(content, importPath) {
  const importPattern = new RegExp(
    `import\\s*\\{([\\s\\S]*?)\\}\\s*from\\s*["']${escapeRegExp(
      importPath,
    )}["']`,
    "g",
  );
  const importedNames = new Set();
  let importCount = 0;
  let match;

  while ((match = importPattern.exec(content)) != null) {
    importCount += 1;

    for (const specifier of match[1].split(",")) {
      const importedName = specifier
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[0]
        ?.trim();

      if (importedName != null && importedName.length > 0) {
        importedNames.add(importedName);
      }
    }
  }

  return { importCount, importedNames };
}

function assertImported(content, names, path, coreImportPath) {
  const { importCount, importedNames } = extractNamedImports(
    content,
    coreImportPath,
  );

  if (importCount === 0) {
    fail(`${path}: missing named import from ${coreImportPath}`);
  }

  for (const name of names) {
    if (!importedNames.has(name)) {
      fail(`${path}: missing ${name} import from ${coreImportPath}`);
    }
  }
}

function assertNoLocalDefinitions(content, names, path) {
  for (const name of names) {
    const definitionPattern = new RegExp(
      `(const|let|var|function)\\s+${name}\\b`,
    );

    if (definitionPattern.test(content)) {
      fail(`${path}: ${name} must come from crossword-core uiPolicy`);
    }
  }
}

const sharedPolicy = read(sharedPolicyPath);
const sharedIndex = read(sharedIndexPath);
const webApp = read(webAppPath);
const mobileApp = read(mobileAppPath);
const launchConfig = read(launchConfigPath);
const ciWorkflow = read(ciWorkflowPath);
const deployAllWorkflow = read(deployAllWorkflowPath);

for (const name of sharedPolicyExports) {
  assertNamedPolicyExport(sharedPolicy, name, sharedPolicyPath);
}

assertIncludes(sharedIndex, 'export * from "./uiPolicy";', sharedIndexPath);
assertImported(
  webApp,
  requiredWebImports,
  webAppPath,
  "../packages/crossword-core/src",
);
assertImported(
  mobileApp,
  requiredMobileImports,
  mobileAppPath,
  "../../packages/crossword-core/src",
);
assertImported(
  launchConfig,
  [
    "DEFAULT_HINT_CREDITS",
    "DEFAULT_VISIBLE_PUZZLE_COUNT",
    "PUZZLE_GENERATION_INTERVAL_HOURS",
    "PUZZLE_KEEP_COUNT",
  ],
  launchConfigPath,
  "../../packages/crossword-core/src",
);
assertNoLocalDefinitions(webApp, forbiddenLocalDefinitions, webAppPath);
assertNoLocalDefinitions(mobileApp, forbiddenLocalDefinitions, mobileAppPath);

assertIncludes(ciWorkflow, "npm run check:release-parity", ciWorkflowPath);
assertIncludes(ciWorkflow, "npm run build", ciWorkflowPath);
assertIncludes(ciWorkflow, "npm run check:mobile", ciWorkflowPath);

const deployAllResolvedTagUsages =
  deployAllWorkflow.match(/release_tag:\s*\${{ needs\.resolve\.outputs\.tag }}/g)
    ?.length ?? 0;

if (deployAllResolvedTagUsages < 3) {
  fail(
    `${deployAllWorkflowPath}: Deploy All must pass the resolved tag to AIT, Google Play, and App Store jobs`,
  );
}

if (failures.length > 0) {
  console.error("Release parity check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Release parity check passed.");
