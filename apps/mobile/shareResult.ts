import { Share } from 'react-native';

import {
  buildShareGrid,
  buildShareResultClickParams,
  buildShareResultOutcomeParams,
  buildShareText,
  SHARE_RESULT_CLICK_EVENT,
  SHARE_RESULT_OUTCOME_EVENT,
  type Puzzle,
  type ShareDeliveryOutcome,
  type ShareSurface,
} from '../../packages/crossword-core/src';

import { telemetry as mobileTelemetry } from './telemetry';

type ShareTelemetry = {
  click(name: string, params?: Record<string, unknown>): void;
  impression(name: string, params?: Record<string, unknown>): void;
};

type ShareFn = (content: { message: string }) => Promise<{ action: string }>;

// RN 은 웹의 공유 랜딩 URL(VITE_SHARE_LANDING_URL)에 대응하는 값이 없어 링크 줄을
// 생략한다. core buildShareText 는 undefined 면 그 줄을 넣지 않는다.
export const SHARE_LANDING_URL: string | undefined = undefined;

export type MobileShareTextInput = {
  puzzle: Puzzle;
  cellValues: Record<string, string>;
  puzzleLabel: string;
  elapsedLabel: string | null;
  hintCount: number;
  attemptsUsed: number;
  completedCount: number;
  totalCount: number;
  consecutiveStreak: number;
  isComplete: boolean;
  revealUsed: boolean;
};

// 웹과 같은 core 문구·이모지 격자로 공유 텍스트를 만든다.
export function buildMobileShareText(input: MobileShareTextInput): string {
  return buildShareText({
    puzzleLabel: input.puzzleLabel,
    elapsedLabel: input.elapsedLabel,
    hintCount: input.hintCount,
    attemptsUsed: input.attemptsUsed,
    completedCount: input.completedCount,
    totalCount: input.totalCount,
    consecutiveStreak: input.consecutiveStreak,
    isComplete: input.isComplete,
    revealUsed: input.revealUsed,
    shareGrid: buildShareGrid(input.puzzle, input.cellValues),
    shareLandingUrl: SHARE_LANDING_URL,
  });
}

// 클릭 → OS 공유 시트 → 결과 계측. 절대 throw 하지 않는다(플레이 흐름 보호).
export async function shareResultText(
  {
    text,
    surface,
    clickParams,
  }: {
    text: string;
    surface: ShareSurface;
    clickParams?: { puzzleId?: string; difficulty?: string };
  },
  {
    share = content => Share.share(content),
    telemetry = mobileTelemetry,
  }: { share?: ShareFn; telemetry?: ShareTelemetry } = {},
): Promise<ShareDeliveryOutcome> {
  telemetry.click(
    SHARE_RESULT_CLICK_EVENT,
    buildShareResultClickParams(surface, clickParams),
  );
  let outcome: ShareDeliveryOutcome;
  try {
    const result = await share({ message: text });
    outcome = result.action === Share.dismissedAction ? 'aborted' : 'shared';
  } catch {
    outcome = 'failed';
  }
  telemetry.impression(
    SHARE_RESULT_OUTCOME_EVENT,
    buildShareResultOutcomeParams(surface, outcome),
  );
  return outcome;
}
