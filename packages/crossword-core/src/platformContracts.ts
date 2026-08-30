export type MarketTarget = "apps-in-toss" | "google-play" | "app-store";

export type TelemetryParam = string | number | boolean | null | undefined;
export type TelemetryParams = Record<string, TelemetryParam>;
export type CompactTelemetryParams = Record<string, string | number | boolean>;

const PUZZLE_IDENTIFIER_TELEMETRY_KEYS: ReadonlySet<string> = new Set([
  "next_puzzle_id",
  "pack_id",
  "puzzle_alias",
  "puzzle_id",
  "slot_id",
]);

export function normalizePuzzleIdentifierTelemetryParam(
  key: string,
  value: string | number | boolean,
): string | number | boolean;
export function normalizePuzzleIdentifierTelemetryParam(
  key: string,
  value: null | undefined,
): null | undefined;
export function normalizePuzzleIdentifierTelemetryParam(
  key: string,
  value: TelemetryParam,
): TelemetryParam;
export function normalizePuzzleIdentifierTelemetryParam(
  key: string,
  value: TelemetryParam,
): TelemetryParam {
  return value != null && PUZZLE_IDENTIFIER_TELEMETRY_KEYS.has(key)
    ? String(value)
    : value;
}

// 막힘 힌트 퍼널의 기존 GA4 계약(#265). 노출 빈도 정책을 바꿔도 이벤트 이름은
// 유지해 변경 전후 지표를 같은 시계열로 비교할 수 있게 한다.
export const STUCK_HINT_PROMPT_EVENT = "stuck_hint_prompt";
export const STUCK_HINT_PROMPT_ACCEPT_EVENT = "stuck_hint_prompt_accept";
export const STUCK_HINT_PROMPT_REVEAL_WORD_EVENT =
  "stuck_hint_prompt_reveal_word";
export const STUCK_HINT_PROMPT_DISMISS_EVENT = "stuck_hint_prompt_dismiss";

export type TelemetryClient = {
  screen(name: string, params?: TelemetryParams): void;
  impression(name: string, params?: TelemetryParams): void;
  click(name: string, params?: TelemetryParams): void;
};

export function compactTelemetryParams(
  params: TelemetryParams = {},
): CompactTelemetryParams {
  const compact: CompactTelemetryParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (value == null) {
      continue;
    }
    compact[key] = normalizePuzzleIdentifierTelemetryParam(key, value);
  }
  return compact;
}
