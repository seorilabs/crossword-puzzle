// 가로세로 낱말 퍼즐의 "게임 세부 지표" 이벤트 계약(3마켓 공통).
//
// 왜 core에 두는가: AGENTS.md의 "telemetry event 계약은 먼저 packages/crossword-core에
// 둔다" 규칙을 따른다. 이벤트 이름·페이로드 스키마·시장(market) 차원을 한곳에서 타입으로
// 고정해, AIT WebView(src/adapters)와 Android/iOS RN(apps/mobile)이 같은 이벤트를 같은
// 파라미터로 전송하도록 강제한다. 백오피스(seorilabs-backoffice)는 이 계약의 이벤트 이름과
// 파라미터 키를 그대로 BigQuery에서 집계한다.
//
// core에는 Firebase/AppsInToss/AdMob SDK import를 넣지 않는다. 이 파일은 "무엇을 보낼지"
// (계약 + 순수 파라미터 빌더)만 정의하고, "어디로 보낼지"(sink)는 각 마켓 adapter가 정한다.

import {
  compactTelemetryParams,
  type CompactTelemetryParams,
  type MarketTarget,
  type TelemetryParam,
} from "./platformContracts.ts";

/**
 * 게임 이벤트가 실린 마켓. 마켓통합(all) 지표와 마켓개별 지표를 동시에 뽑기 위해
 * 모든 게임 이벤트에 필수로 실린다. 값은 core의 MarketTarget과 동일하게 유지한다.
 */
export type GameMarket = MarketTarget;

/**
 * 이벤트 계약 버전. 페이로드 스키마를 바꾸면 올린다. 백오피스가 스키마 변화를 구분해
 * 집계할 수 있게 모든 이벤트에 `schema_version`으로 실린다.
 */
export const GAME_ANALYTICS_SCHEMA_VERSION = 1;

/** 게임 세부 이벤트 이름 접두사. 제품 instrumentation 이벤트는 기존 이름을 유지할 수 있다. */
export const GAME_ANALYTICS_EVENT_PREFIX = "game_";

export type BonusPuzzlePanelStatus =
  | "available"
  | "loading"
  | "unlocked"
  | "used"
  | "waiting";

export type BonusPuzzlePanelImpressionStatus = Exclude<
  BonusPuzzlePanelStatus,
  "loading"
>;

export type BonusPuzzlePanelImpressionGuard = {
  claim(
    status: BonusPuzzlePanelStatus,
  ): BonusPuzzlePanelImpressionStatus | undefined;
};

export function createBonusPuzzlePanelImpressionGuard(): BonusPuzzlePanelImpressionGuard {
  const seenStatuses = new Set<BonusPuzzlePanelImpressionStatus>();

  return {
    claim(status) {
      if (status === "loading" || seenStatuses.has(status)) {
        return undefined;
      }

      seenStatuses.add(status);
      return status;
    },
  };
}

/**
 * 모든 게임 이벤트에 공통으로 실리는 퍼즐(콘텐츠) 컨텍스트. 난이도/테마/팩 단위
 * 콘텐츠 지표를 뽑기 위한 차원(dimension)이다. presentation 레이어가 Puzzle에서
 * 채워 넘긴다(코어는 Puzzle import 순환을 피하려 필요한 값만 받는다).
 */
export type GamePuzzleContext = {
  puzzleId: string;
  difficulty: string;
  gridSize: number;
  wordCount: number;
  packId?: string | null;
  slotId?: string | null;
  themeTag?: string | null;
};

/**
 * 이벤트 이름 → 페이로드 타입 매핑. 페이로드는 컨텍스트/마켓을 제외한 이벤트 고유 값만
 * 담는다(컨텍스트와 마켓은 빌더가 항상 병합). 시간 값은 초 단위(`*Sec`)로 통일한다 —
 * 앱이 이미 초 단위로 경과시간을 계산하므로 가짜 정밀도(ms 승산)를 만들지 않는다.
 */
export type GameAnalyticsEventPayloads = {
  // 보너스 퍼즐 패널 발견성: loading을 제외한 세션 내 상태별 최초 노출.
  bonus_puzzle_panel_impression: {
    status: BonusPuzzlePanelImpressionStatus;
  };
  // 완료 퍼널: 시도 시작. attemptKind로 첫 도전/재도전을 구분한다.
  game_puzzle_start: {
    attemptKind: "first" | "retry";
    attemptNumber: number;
  };
  // 완료 퍼널: 첫 정답 입력(참여 시작 신호). 시작→첫입력 소요로 초반 이탈을 본다.
  game_first_input: {
    timeToFirstInputSec: number;
    attemptNumber: number;
  };
  // 완료 퍼널: 진행 마일스톤 도달(예: 25/50/75%).
  game_progress: {
    completedWordCount: number;
    totalWordCount: number;
    progressPercent: number;
    attemptNumber: number;
  };
  // 완료 퍼널 종점 + 풀이 성과: 미션 완료.
  game_puzzle_complete: {
    solveTimeSec: number;
    hintCount: number;
    revealUsed: boolean;
    attemptNumber: number;
    completedWordCount: number;
  };
  // 완료 퍼널 이탈: 시작했으나 미완료로 이탈.
  game_puzzle_abandon: {
    elapsedSec: number;
    completedWordCount: number;
    totalWordCount: number;
    progressPercent: number;
    hadFirstInput: boolean;
  };
  // 힌트/보조 사용: 힌트 공개 / 단어 정답 보기 / 막힘 힌트.
  game_hint_use: {
    hintType: "hint" | "reveal_word" | "stuck_hint";
    hintRemainingAfter?: number | null;
  };
  // 힌트/보조 사용: 리워드 광고 기반 보조(힌트/보너스 퍼즐/추가 시도)의 단계.
  game_assist_ad: {
    assistType: "rewarded_hint" | "bonus_puzzle" | "extra_attempt";
    result: "request" | "reward" | "dismiss" | "error";
  };
};

/** 전송 가능한 게임 이벤트 이름의 유니온. */
export type GameAnalyticsEventName = keyof GameAnalyticsEventPayloads;

/**
 * 진척(progression) 이벤트 페이로드. game_* 완료 퍼널이 특정 퍼즐(콘텐츠) 차원을
 * 재는 것과 달리, 이 이벤트들은 "장기 리텐션 장치"(스트릭·개인 통계)의 노출/달성을
 * 재는 화면·계정 단위 신호라 GamePuzzleContext를 싣지 않는다. D2~D7 복귀를 "장치가
 * 노출되는데 효과가 없는지 vs 노출 자체가 안 되는지"로 분해하기 위한 계측이다(#292).
 * 모든 파라미터는 숫자형으로 유지한다(string 적재 금지 — BigQuery 수치 집계 보존).
 */
export type GameProgressionEventPayloads = {
  // 스트릭 서피스(캘린더/통계 화면) 노출. 화면 노출당 1회.
  streak_view: {
    currentStreak: number;
    longestStreak: number;
  };
  // 스트릭이 마일스톤(7/30/100일 등)에 도달. streakLength는 도달 시점의 실제 스트릭.
  streak_milestone: {
    streakLength: number;
  };
  // 개인 통계(기록) 화면 노출. 화면 노출당 1회.
  personal_stats_view: {
    totalPuzzles: number;
    completedCount: number;
  };
};

/** 전송 가능한 진척 이벤트 이름의 유니온. */
export type GameProgressionEventName = keyof GameProgressionEventPayloads;

/**
 * presentation 레이어가 쓰는 게임 분석 포트. 마켓은 adapter가 주입하므로 호출부는
 * 넘기지 않는다(호출부는 어떤 마켓에서 도는지 몰라도 된다). fire-and-forget이며
 * 절대 throw하지 않는다(분석이 퍼즐 플레이를 끊으면 안 된다).
 */
export type GameAnalyticsClient = {
  track<E extends GameAnalyticsEventName>(
    name: E,
    context: GamePuzzleContext,
    payload: GameAnalyticsEventPayloads[E],
  ): void;
  /**
   * 퍼즐과 무관한 진척(스트릭/개인 통계) 이벤트를 보낸다. 컨텍스트 없이 마켓만
   * 주입되며, track과 동일하게 fire-and-forget이고 절대 throw하지 않는다.
   */
  trackProgression<E extends GameProgressionEventName>(
    name: E,
    payload: GameProgressionEventPayloads[E],
  ): void;
};

/**
 * 패널이 실제 표시되는 화면에서 호출하는 공용 계측 헬퍼. loading은 제외하고,
 * 같은 세션에서 같은 상태는 한 번만 전송한다. 상태 전이는 각각 새 노출로 인정한다.
 */
export function trackBonusPuzzlePanelImpression(
  client: GameAnalyticsClient,
  guard: BonusPuzzlePanelImpressionGuard,
  context: GamePuzzleContext,
  status: BonusPuzzlePanelStatus,
): boolean {
  const claimedStatus = guard.claim(status);
  if (claimedStatus == null) {
    return false;
  }

  client.track("bonus_puzzle_panel_impression", context, {
    status: claimedStatus,
  });
  return true;
}

/** 게임 이벤트를 실제 sink로 보낼 sink 계약. adapter가 마켓별로 구현한다. */
export type GameAnalyticsSink = {
  readonly id: string;
  logGameEvent(name: string, params: CompactTelemetryParams): void;
};

const CONTEXT_KEYS: Array<[keyof GamePuzzleContext, string]> = [
  ["puzzleId", "puzzle_id"],
  ["difficulty", "difficulty"],
  ["gridSize", "grid_size"],
  ["wordCount", "word_count"],
  ["packId", "pack_id"],
  ["slotId", "slot_id"],
  ["themeTag", "theme_tag"],
];

// camelCase 페이로드 키 → snake_case 파라미터 키. GA4/BigQuery 파라미터 관례에 맞춘다.
function toSnakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
}

function contextParams(
  context: GamePuzzleContext,
): Record<string, TelemetryParam> {
  const params: Record<string, TelemetryParam> = {};
  for (const [key, paramKey] of CONTEXT_KEYS) {
    params[paramKey] = context[key];
  }
  return params;
}

// 이벤트별 파생 파라미터. 집계 편의를 위해 앱이 아니라 계약에서 계산한다(3마켓 동일 정의).
function derivedParams(
  name: GameAnalyticsEventName,
  payload: Record<string, TelemetryParam>,
): Record<string, TelemetryParam> {
  switch (name) {
    case "game_puzzle_complete": {
      const hintCount = Number(payload.hintCount ?? 0);
      const revealUsed = payload.revealUsed === true;
      const attemptNumber = Number(payload.attemptNumber ?? 0);
      return {
        // 노힌트 완료 = 힌트 0 && 정답 보기 미사용. 콘텐츠 난이도 체감 지표.
        no_hint: hintCount === 0 && !revealUsed,
        // 첫 도전 완료 = 첫 시도에서 완료. 재도전 없이 푼 비율.
        first_try: attemptNumber <= 1,
      };
    }
    default:
      return {};
  }
}

/**
 * 게임 이벤트 → 전송용 파라미터로 변환하는 순수 함수. 마켓·컨텍스트·스키마 버전을 항상
 * 병합하고, null/undefined는 compactTelemetryParams가 제거한다. 어떤 sink든 이 결과를
 * 그대로 실어 보내면 3마켓·백오피스가 같은 파라미터를 본다.
 */
export function buildGameAnalyticsEvent<E extends GameAnalyticsEventName>(
  name: E,
  input: {
    market: GameMarket;
    context: GamePuzzleContext;
    payload: GameAnalyticsEventPayloads[E];
  },
): { name: E; params: CompactTelemetryParams } {
  const payload = input.payload as Record<string, TelemetryParam>;
  const snakeCased: Record<string, TelemetryParam> = {};
  for (const [key, value] of Object.entries(payload)) {
    snakeCased[toSnakeCase(key)] = value;
  }

  const params = compactTelemetryParams({
    schema_version: GAME_ANALYTICS_SCHEMA_VERSION,
    market: input.market,
    ...contextParams(input.context),
    ...snakeCased,
    ...derivedParams(name, payload),
  });

  return { name, params };
}

/**
 * 진척 이벤트 → 전송용 파라미터로 변환하는 순수 함수. 마켓·스키마 버전을 병합하고
 * 페이로드를 snake_case로 변환한다. buildGameAnalyticsEvent와 달리 퍼즐 컨텍스트가
 * 없다(스트릭/개인 통계는 특정 퍼즐이 아니라 사용자 단위 신호). null/undefined는
 * compactTelemetryParams가 제거한다.
 */
export function buildGameProgressionEvent<E extends GameProgressionEventName>(
  name: E,
  input: {
    market: GameMarket;
    payload: GameProgressionEventPayloads[E];
  },
): { name: E; params: CompactTelemetryParams } {
  const payload = input.payload as Record<string, TelemetryParam>;
  const snakeCased: Record<string, TelemetryParam> = {};
  for (const [key, value] of Object.entries(payload)) {
    snakeCased[toSnakeCase(key)] = value;
  }

  const params = compactTelemetryParams({
    schema_version: GAME_ANALYTICS_SCHEMA_VERSION,
    market: input.market,
    ...snakeCased,
  });

  return { name, params };
}

/**
 * adapter가 GameAnalyticsClient를 만들 때 쓰는 팩토리. 마켓과 sink 목록만 주면 core가
 * 파라미터 빌드 + 팬아웃 + throw 차단을 담당한다. adapter는 sink 구현(Firebase/AIT/자체
 * 서버)만 제공하면 된다. 자체 지표 서버는 GameAnalyticsSink를 하나 더 추가하는 것으로 끝난다.
 */
export function createGameAnalyticsClient(config: {
  market: GameMarket;
  sinks: readonly GameAnalyticsSink[];
  onError?: (error: unknown) => void;
}): GameAnalyticsClient {
  // 빌드된 이벤트를 모든 sink로 팬아웃한다. 한 sink가 실패해도 나머지 sink 전송은
  // 계속한다(분석은 절대 플레이를 끊지 않는다). track/trackProgression이 공유한다.
  function fanOut(built: {
    name: string;
    params: CompactTelemetryParams;
  }): void {
    for (const sink of config.sinks) {
      try {
        sink.logGameEvent(built.name, built.params);
      } catch (error) {
        config.onError?.(error);
      }
    }
  }

  return {
    track(name, context, payload) {
      let built: { name: string; params: CompactTelemetryParams };
      try {
        built = buildGameAnalyticsEvent(name, {
          market: config.market,
          context,
          payload,
        });
      } catch (error) {
        config.onError?.(error);
        return;
      }
      fanOut(built);
    },
    trackProgression(name, payload) {
      let built: { name: string; params: CompactTelemetryParams };
      try {
        built = buildGameProgressionEvent(name, {
          market: config.market,
          payload,
        });
      } catch (error) {
        config.onError?.(error);
        return;
      }
      fanOut(built);
    },
  };
}
