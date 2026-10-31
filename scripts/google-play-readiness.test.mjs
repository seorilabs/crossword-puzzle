import test from "node:test";
import assert from "node:assert/strict";
import { hasAppsInTossImport } from "./lib/native-imports.mjs";

test("SDK documentation and string values are not native imports", () => {
  assert.equal(
    hasAppsInTossImport(
      '// Adapter uses `@apps-in-toss/web-framework`.\nconst note = "@apps-in-toss/web-framework";',
    ),
    false,
  );
});

test("actual SDK imports remain forbidden, including type, dynamic and require forms", () => {
  for (const source of [
    'import { foo } from "@apps-in-toss/web-framework";',
    'import type { Foo } from "@apps-in-toss/web-framework";',
    'export * from "@toss/tds-mobile-ait";',
    'const sdk = import("@apps-in-toss/web-framework");',
    'const sdk = require("@apps-in-toss/web-framework");',
    'import sdk = require("@apps-in-toss/web-framework");',
    'type Foo = import("@apps-in-toss/web-framework").Foo;',
  ])
    assert.equal(hasAppsInTossImport(source), true, source);
  assert.equal(
    hasAppsInTossImport('import { View } from "react-native";'),
    false,
  );
});
