import ts from "typescript";

export const PRODUCT_DISPLAY_NAME = "가로세로 낱말 퍼즐";

const FRAMEWORK_STARTER_MARKERS = [
  /Powered by React Native/i,
  /Welcome to React Native/i,
  /\bReact Native\b/i,
  /\bCrosswordPuzzleMobile\b/,
];

const BRAND_COLOR = Object.freeze([0x00, 0xa8, 0x8f]);
const BOOT_BACKGROUND_COLOR = Object.freeze([0xf7, 0xf3, 0xe8]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function plistHasStringValue(contents, key, value) {
  return new RegExp(
    `<key>\\s*${escapeRegExp(key)}\\s*</key>\\s*<string>\\s*${escapeRegExp(
      value,
    )}\\s*</string>`,
  ).test(contents);
}

function xmlAttributeValues(contents, attributeName) {
  const values = [];
  const pattern = new RegExp(`\\b${attributeName}="([^"]*)"`, "g");
  let match;
  while ((match = pattern.exec(contents)) != null) {
    values.push(match[1]);
  }
  return values;
}

function xmlStringValues(contents) {
  return [...contents.matchAll(/<string\b[^>]*>([^<]*)<\/string>/g)].map(
    (match) => match[1],
  );
}

function htmlTitleValues(contents) {
  return [...contents.matchAll(/<title\b[^>]*>([^<]*)<\/title>/gi)].map(
    (match) => match[1].trim(),
  );
}

function hasFrameworkStarterMarker(values) {
  return values.some((value) =>
    FRAMEWORK_STARTER_MARKERS.some((pattern) => pattern.test(value)),
  );
}

function xmlRgbColors(contents) {
  const colors = [];
  for (const match of contents.matchAll(/<color\b[^>]*>/g)) {
    const tag = match[0];
    const channels = ["red", "green", "blue"].map((channel) => {
      const value = new RegExp(`\\b${channel}="([0-9.]+)"`).exec(tag)?.[1];
      return value == null ? Number.NaN : Number.parseFloat(value);
    });
    if (channels.every(Number.isFinite)) colors.push(channels);
  }
  return colors;
}

function hasRgbColor(contents, rgb) {
  return xmlRgbColors(contents).some((candidate) =>
    candidate.every(
      (channel, index) => Math.abs(channel - rgb[index] / 255) <= 0.002,
    ),
  );
}

export function validateNativeStartupSurfaces({
  aitIndexHtml,
  androidColors,
  androidLaunchDrawable,
  androidManifest,
  androidStrings,
  androidStyles,
  androidStylesV31,
  iosInfoPlist,
  iosLaunchStoryboard,
}) {
  const failures = [];
  const iosVisibleText = xmlAttributeValues(iosLaunchStoryboard, "text");
  const androidVisibleText = xmlStringValues(androidStrings);
  const aitVisibleText = htmlTitleValues(aitIndexHtml);

  if (
    !plistHasStringValue(iosInfoPlist, "UILaunchStoryboardName", "LaunchScreen")
  ) {
    failures.push(
      "apps/mobile/ios/CrosswordPuzzleMobile/Info.plist: UILaunchStoryboardName must remain LaunchScreen",
    );
  }
  if (!plistHasStringValue(iosInfoPlist, "CFBundleDisplayName", PRODUCT_DISPLAY_NAME)) {
    failures.push(
      `apps/mobile/ios/CrosswordPuzzleMobile/Info.plist: CFBundleDisplayName must be ${PRODUCT_DISPLAY_NAME}`,
    );
  }
  if (!iosVisibleText.includes(PRODUCT_DISPLAY_NAME)) {
    failures.push(
      `apps/mobile/ios/CrosswordPuzzleMobile/LaunchScreen.storyboard: missing product title ${PRODUCT_DISPLAY_NAME}`,
    );
  }
  if (hasFrameworkStarterMarker(iosVisibleText)) {
    failures.push(
      "apps/mobile/ios/CrosswordPuzzleMobile/LaunchScreen.storyboard: framework or technical starter text is visible",
    );
  }
  if (!hasRgbColor(iosLaunchStoryboard, BRAND_COLOR)) {
    failures.push(
      "apps/mobile/ios/CrosswordPuzzleMobile/LaunchScreen.storyboard: missing crossword brand color #00A88F",
    );
  }
  if (!hasRgbColor(iosLaunchStoryboard, BOOT_BACKGROUND_COLOR)) {
    failures.push(
      "apps/mobile/ios/CrosswordPuzzleMobile/LaunchScreen.storyboard: launch background must match native boot #F7F3E8",
    );
  }

  if (!androidVisibleText.includes(PRODUCT_DISPLAY_NAME)) {
    failures.push(
      `apps/mobile/android/app/src/main/res/values/strings.xml: missing product title ${PRODUCT_DISPLAY_NAME}`,
    );
  }
  if (hasFrameworkStarterMarker(androidVisibleText)) {
    failures.push(
      "apps/mobile/android/app/src/main/res/values/strings.xml: framework or technical starter text is visible",
    );
  }
  if (!androidManifest.includes('android:icon="@mipmap/ic_launcher"')) {
    failures.push(
      "apps/mobile/android/app/src/main/AndroidManifest.xml: product launch icon is not configured",
    );
  }
  if (!androidManifest.includes('android:theme="@style/AppTheme"')) {
    failures.push(
      "apps/mobile/android/app/src/main/AndroidManifest.xml: app launch theme is not configured",
    );
  }
  if (
    !androidStyles.includes(
      '<item name="android:windowBackground">@drawable/crossword_launch_background</item>',
    )
  ) {
    failures.push(
      "apps/mobile/android/app/src/main/res/values/styles.xml: branded launch window background is not configured",
    );
  }
  if (
    !androidColors.includes(
      '<color name="crossword_launch_background">#F7F3E8</color>',
    )
  ) {
    failures.push(
      "apps/mobile/android/app/src/main/res/values/colors.xml: launch background must match native boot #F7F3E8",
    );
  }
  if (
    !androidLaunchDrawable.includes(
      'android:drawable="@color/crossword_launch_background"',
    ) ||
    !androidLaunchDrawable.includes('android:src="@mipmap/ic_launcher"')
  ) {
    failures.push(
      "apps/mobile/android/app/src/main/res/drawable/crossword_launch_background.xml: launch drawable must use the existing product icon and background",
    );
  }
  if (
    !androidStylesV31.includes(
      '<item name="android:windowSplashScreenBackground">@color/crossword_launch_background</item>',
    ) ||
    !androidStylesV31.includes(
      '<item name="android:windowSplashScreenAnimatedIcon">@mipmap/ic_launcher</item>',
    )
  ) {
    failures.push(
      "apps/mobile/android/app/src/main/res/values-v31/styles.xml: Android 12 launch screen must use the existing product icon and background",
    );
  }
  if (/react[ _-]?native|powered\s+by\s+react/i.test(androidStyles)) {
    failures.push(
      "apps/mobile/android/app/src/main/res/values/styles.xml: framework starter resource is configured",
    );
  }

  if (!/<html\b[^>]*\blang="ko-KR"/i.test(aitIndexHtml)) {
    failures.push("index.html: AppsInToss startup locale must be ko-KR");
  }
  if (!aitVisibleText.includes(PRODUCT_DISPLAY_NAME)) {
    failures.push(`index.html: missing product title ${PRODUCT_DISPLAY_NAME}`);
  }
  if (hasFrameworkStarterMarker(aitVisibleText)) {
    failures.push("index.html: framework or technical starter text is visible");
  }

  return Object.freeze(failures);
}

function importedModuleSpecifier(node) {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier != null &&
    ts.isStringLiteralLike(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier.text;
  }
  if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference) &&
    node.moduleReference.expression != null &&
    ts.isStringLiteralLike(node.moduleReference.expression)
  ) {
    return node.moduleReference.expression.text;
  }
  if (
    ts.isCallExpression(node) &&
    node.arguments.length >= 1 &&
    ts.isStringLiteralLike(node.arguments[0]) &&
    (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === "require"))
  ) {
    return node.arguments[0].text;
  }
  return null;
}

function matchesPackagePrefix(specifier, prefix) {
  return specifier === prefix || specifier.startsWith(`${prefix}/`);
}

export function findPackageImports(
  source,
  packagePrefixes,
  fileName = "source.ts",
) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const matches = new Set();

  function visit(node) {
    const specifier = importedModuleSpecifier(node);
    if (
      specifier != null &&
      packagePrefixes.some((prefix) => matchesPackagePrefix(specifier, prefix))
    ) {
      matches.add(specifier);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return Object.freeze([...matches].sort());
}
