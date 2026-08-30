import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("#351 퍼즐 식별자 문자열 인수조건", () => {
  const contracts = read("packages/crossword-core/src/platformContracts.ts");
  const gameAnalytics = read("packages/crossword-core/src/gameAnalytics.ts");
  const webApp = read("src/App.tsx");
  const mobileApp = read("apps/mobile/App.tsx");
  const webRepository = read("src/adapters/staticPuzzleRepository.ts");
  const gameAnalyticsTests = read(
    "packages/crossword-core/src/gameAnalytics.test.mts",
  );
  const webTelemetryTests = read("src/puzzleIdentifierTelemetry.test.tsx");
  const parityDoc = read("docs/market-parity.md");
  const retrySql = read("scripts/analytics/retry-exhaustion-dropoff.sql");
  const easySql = read("scripts/analytics/easy-serving-verification.sql");

  it("AC-1·2: 공용 계약이 모든 퍼즐 식별자와 next_puzzle_id를 문자열화한다", () => {
    for (const key of [
      "puzzle_id",
      "puzzle_alias",
      "next_puzzle_id",
      "pack_id",
      "slot_id",
    ]) {
      assert.match(contracts, new RegExp(`"${key}"`));
    }
    assert.match(gameAnalytics, /normalizePuzzleIdentifierTelemetryParam/);
  });

  it("AC-3: Web·mobile 직접 telemetry 파라미터와 game context가 공용 정규화를 사용한다", () => {
    for (const app of [webApp, mobileApp]) {
      assert.match(app, /puzzle_id: normalizePuzzleIdentifier/);
      assert.match(app, /puzzle_alias: normalizePuzzleIdentifier/);
      assert.match(app, /puzzleAlias: getPuzzlePackAlias\(puzzle\)/);
    }
  });

  it("AC-4: Web·mobile 원격 manifest와 puzzle loader가 런타임 ID를 정규화한다", () => {
    assert.match(webRepository, /normalizePuzzleManifestIdentifiers/);
    assert.match(webRepository, /normalizePuzzleIdentifiers/);
    assert.match(mobileApp, /normalizePuzzleManifestIdentifiers/);
    assert.match(mobileApp, /normalizePuzzleIdentifiers/);
  });

  it("AC-5·6: core 단위 테스트와 Web 통합 테스트가 숫자형 ID의 문자열 적재를 검증한다", () => {
    assert.match(gameAnalyticsTests, /puzzleId: 26082100/);
    assert.match(gameAnalyticsTests, /params\.puzzle_id, "26082100"/);
    assert.match(webTelemetryTests, /mission_start/);
    assert.match(webTelemetryTests, /next_puzzle_id/);
  });

  it("AC-7·8: 문서 계약과 과거 SQL의 string·int COALESCE를 유지한다", () => {
    assert.match(parityDoc, /퍼즐 식별자 telemetry 문자열 계약/);
    for (const sql of [retrySql, easySql]) {
      assert.match(
        sql,
        /COALESCE\(value\.string_value, CAST\(value\.int_value AS STRING\)\)/,
      );
    }
  });
});
