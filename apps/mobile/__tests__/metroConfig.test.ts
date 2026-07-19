export {};

declare const __dirname: string;
declare const require: (moduleName: string) => unknown;

const { readFileSync } = require('fs') as Readonly<{
  readFileSync(path: string, encoding: 'utf8'): string;
}>;
const { join } = require('path') as Readonly<{
  join(...paths: string[]): string;
}>;

describe('Metro monorepo source contract', () => {
  test('native host가 import하는 저장소 src를 watch folder에 포함한다', () => {
    const source = readFileSync(
      join(__dirname, '..', 'metro.config.js'),
      'utf8',
    );

    expect(source).toMatch(/path\.resolve\(repoRoot, ['"]src['"]\)/);
  });
});
