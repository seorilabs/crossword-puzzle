import type { SavedProgress } from "./types";

export const DEFAULT_DAILY_FREE_HINT_CREDITS = 3;
export const DEFAULT_REWARDED_HINT_CREDITS = 1;

export type DailyHintWallet = {
  date: string;
  earnedCredits: number;
  usedCredits: number;
};

export type DailyHintBalance = {
  dailyCredits: number;
  earnedCredits: number;
  remainingCredits: number;
  totalCredits: number;
  usedCredits: number;
};

type DailyHintWalletStorage = {
  loadWallet(date: string): Promise<DailyHintWallet | null>;
  saveWallet(wallet: DailyHintWallet): Promise<void>;
};

function normalizeCreditCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

export function createDailyHintWallet(date: string): DailyHintWallet {
  return {
    date,
    earnedCredits: 0,
    usedCredits: 0,
  };
}

export function normalizeDailyHintWallet(
  value: Partial<DailyHintWallet> | null,
  date: string,
): DailyHintWallet {
  if (value == null || value.date !== date) {
    return createDailyHintWallet(date);
  }

  return {
    date,
    earnedCredits: normalizeCreditCount(value.earnedCredits),
    usedCredits: normalizeCreditCount(value.usedCredits),
  };
}

export function getDailyHintBalance(
  wallet: DailyHintWallet,
  dailyCredits = DEFAULT_DAILY_FREE_HINT_CREDITS,
): DailyHintBalance {
  const normalizedDailyCredits = normalizeCreditCount(dailyCredits);
  const totalCredits = normalizedDailyCredits + wallet.earnedCredits;

  return {
    dailyCredits: normalizedDailyCredits,
    earnedCredits: wallet.earnedCredits,
    remainingCredits: Math.max(0, totalCredits - wallet.usedCredits),
    totalCredits,
    usedCredits: wallet.usedCredits,
  };
}

export function consumeDailyHintCredit(
  wallet: DailyHintWallet,
  dailyCredits = DEFAULT_DAILY_FREE_HINT_CREDITS,
): DailyHintWallet | null {
  if (getDailyHintBalance(wallet, dailyCredits).remainingCredits === 0) {
    return null;
  }

  return {
    ...wallet,
    usedCredits: wallet.usedCredits + 1,
  };
}

export function grantDailyHintCredits(
  wallet: DailyHintWallet,
  credits: number,
): DailyHintWallet {
  return {
    ...wallet,
    earnedCredits: wallet.earnedCredits + normalizeCreditCount(credits),
  };
}

// 구버전은 퍼즐마다 기본 크레딧과 광고 크레딧을 따로 저장했다. 일일 지갑이 아직
// 없는 기기에서는 같은 날짜의 진행상태를 합산해, 업데이트 직후 기본 3개가 다시
// 생기거나 이미 받은 광고 보상이 사라지지 않게 한다.
export function migrateLegacyDailyHintWallet(
  date: string,
  progresses: readonly Pick<SavedProgress, "earnedHintCredits" | "hintCount">[],
): DailyHintWallet {
  return progresses.reduce<DailyHintWallet>(
    (wallet, progress) => ({
      date,
      earnedCredits:
        wallet.earnedCredits + normalizeCreditCount(progress.earnedHintCredits),
      usedCredits:
        wallet.usedCredits + normalizeCreditCount(progress.hintCount),
    }),
    createDailyHintWallet(date),
  );
}

export async function loadOrMigrateDailyHintWallet({
  date,
  loadLegacyProgresses,
  repository,
}: {
  date: string;
  loadLegacyProgresses: () => Promise<
    Pick<SavedProgress, "earnedHintCredits" | "hintCount">[]
  >;
  repository: DailyHintWalletStorage;
}): Promise<DailyHintWallet> {
  const savedWallet = await repository.loadWallet(date);
  if (savedWallet != null) {
    return savedWallet;
  }

  const migratedWallet = migrateLegacyDailyHintWallet(
    date,
    await loadLegacyProgresses(),
  );
  await repository.saveWallet(migratedWallet);
  return migratedWallet;
}
