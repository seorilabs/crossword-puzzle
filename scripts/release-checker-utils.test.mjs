import assert from "node:assert/strict";
import test from "node:test";

import {
  findPackageImports,
  validateNativeStartupSurfaces,
} from "./release-checker-utils.mjs";

const brandedStartupSurfaces = Object.freeze({
  aitIndexHtml:
    '<!doctype html><html lang="ko-KR"><head><title>가로세로 낱말 퍼즐</title></head><body><div id="root"></div></body></html>',
  androidManifest:
    '<application android:icon="@mipmap/ic_launcher" android:theme="@style/AppTheme" />',
  androidColors:
    '<resources><color name="crossword_launch_background">#F7F3E8</color></resources>',
  androidLaunchDrawable:
    '<layer-list><item android:drawable="@color/crossword_launch_background"/><item><bitmap android:src="@mipmap/ic_launcher"/></item></layer-list>',
  androidStrings:
    '<resources><string name="app_name">가로세로 낱말 퍼즐</string></resources>',
  androidStyles:
    '<resources><style name="AppTheme"><item name="android:windowBackground">@drawable/crossword_launch_background</item></style></resources>',
  androidStylesV31:
    '<resources><style name="AppTheme"><item name="android:windowSplashScreenBackground">@color/crossword_launch_background</item><item name="android:windowSplashScreenAnimatedIcon">@mipmap/ic_launcher</item></style></resources>',
  iosInfoPlist:
    "<plist><dict><key>CFBundleDisplayName</key><string>가로세로 낱말 퍼즐</string><key>UILaunchStoryboardName</key><string>LaunchScreen</string></dict></plist>",
  iosLaunchStoryboard:
    '<document><label text="가로세로 낱말 퍼즐"/><color red="0" green="0.6588235294" blue="0.5607843137"/><color key="backgroundColor" red="0.968627451" green="0.9529411765" blue="0.9098039216"/></document>',
});

test("three-market startup surfaces accept the crossword brand contract", () => {
  assert.deepEqual(validateNativeStartupSurfaces(brandedStartupSurfaces), []);
});

test("iOS framework starter text and missing launch binding fail closed", () => {
  const failures = validateNativeStartupSurfaces({
    ...brandedStartupSurfaces,
    iosInfoPlist: "<plist><dict></dict></plist>",
    iosLaunchStoryboard: brandedStartupSurfaces.iosLaunchStoryboard.replace(
      "가로세로 낱말 퍼즐",
      "Powered by React Native",
    ),
  });

  assert.equal(failures.length, 4);
  assert.match(failures.join("\n"), /CFBundleDisplayName/);
  assert.match(failures.join("\n"), /UILaunchStoryboardName/);
  assert.match(failures.join("\n"), /missing product title/);
  assert.match(failures.join("\n"), /framework or technical starter text/);
});

test("brand colors, Android launch theme, and AppsInToss locale fail closed", () => {
  const failures = validateNativeStartupSurfaces({
    ...brandedStartupSurfaces,
    aitIndexHtml: brandedStartupSurfaces.aitIndexHtml.replace(
      'lang="ko-KR"',
      'lang="en"',
    ),
    androidManifest: '<application android:theme="@style/AppTheme" />',
    androidColors: "<resources />",
    androidLaunchDrawable: "<layer-list />",
    androidStyles: '<resources><style name="AppTheme" /></resources>',
    androidStylesV31: '<resources><style name="AppTheme" /></resources>',
    iosLaunchStoryboard:
      '<document><label text="가로세로 낱말 퍼즐"/></document>',
  });

  assert.match(failures.join("\n"), /#00A88F/);
  assert.match(failures.join("\n"), /#F7F3E8/);
  assert.match(failures.join("\n"), /launch icon/);
  assert.match(failures.join("\n"), /branded launch window background/);
  assert.match(failures.join("\n"), /launch drawable/);
  assert.match(failures.join("\n"), /Android 12 launch screen/);
  assert.match(failures.join("\n"), /startup locale/);
});

test("package import detection ignores comments and prose strings", () => {
  const source = `
    // \`@apps-in-toss/web-framework\` is implemented by the AIT adapter.
    const note = "import('@toss/tds-mobile-ait')";
    export const value = note.length;
  `;

  assert.deepEqual(
    findPackageImports(source, ["@apps-in-toss", "@toss/tds-mobile-ait"]),
    [],
  );
});

test("package import detection finds static, dynamic, export, and require", () => {
  const source = `
    import { app } from "@apps-in-toss/web-framework";
    export { Button } from "@toss/tds-mobile-ait";
    const lazy = import("@apps-in-toss/framework/runtime", { with: { type: "json" } });
    const legacy = require("@toss/tds-mobile-ait/internal");
  `;

  assert.deepEqual(
    findPackageImports(source, ["@apps-in-toss", "@toss/tds-mobile-ait"]),
    [
      "@apps-in-toss/framework/runtime",
      "@apps-in-toss/web-framework",
      "@toss/tds-mobile-ait",
      "@toss/tds-mobile-ait/internal",
    ],
  );
});
