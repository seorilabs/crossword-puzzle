import ts from "typescript";

const isAppsInToss = (name) =>
  name.startsWith("@apps-in-toss/") || name.startsWith("@toss/tds-mobile-ait");

export function hasAppsInTossImport(source, fileName = "source.tsx") {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  let found = false;
  const check = (literal) => {
    if (
      literal &&
      ts.isStringLiteralLike(literal) &&
      isAppsInToss(literal.text)
    )
      found = true;
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      check(node.moduleSpecifier);
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    )
      check(node.moduleReference.expression);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      check(node.argument.literal);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    )
      check(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}
