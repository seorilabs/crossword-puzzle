import AsyncStorage from '@react-native-async-storage/async-storage';

export type BonusPuzzleUnlock = {
  date: string;
  puzzleId: string;
  unlockedAt: string;
};

const BONUS_UNLOCK_KEY_PREFIX = 'crossword-puzzle:bonus-unlock';

export function getBonusUnlockKey(date: string) {
  return `${BONUS_UNLOCK_KEY_PREFIX}:${date}`;
}

function normalizeBonusPuzzleUnlocks(
  value: unknown,
  date: string,
): BonusPuzzleUnlock[] {
  const rawUnlocks = Array.isArray(value) ? value : value == null ? [] : [value];
  const seenPuzzleIds = new Set<string>();
  const unlocks: BonusPuzzleUnlock[] = [];

  for (const rawUnlock of rawUnlocks) {
    if (rawUnlock == null || typeof rawUnlock !== 'object') {
      continue;
    }

    const unlock = rawUnlock as Partial<BonusPuzzleUnlock>;

    if (
      unlock.date !== date ||
      typeof unlock.puzzleId !== 'string' ||
      typeof unlock.unlockedAt !== 'string' ||
      seenPuzzleIds.has(unlock.puzzleId)
    ) {
      continue;
    }

    seenPuzzleIds.add(unlock.puzzleId);
    unlocks.push({
      date: unlock.date,
      puzzleId: unlock.puzzleId,
      unlockedAt: unlock.unlockedAt,
    });
  }

  return unlocks;
}

export async function loadBonusPuzzleUnlocks(date: string) {
  try {
    const raw = await AsyncStorage.getItem(getBonusUnlockKey(date));

    return normalizeBonusPuzzleUnlocks(
      raw == null ? null : JSON.parse(raw),
      date,
    );
  } catch {
    return [];
  }
}

export async function saveBonusPuzzleUnlock(unlock: BonusPuzzleUnlock) {
  const existingUnlocks = await loadBonusPuzzleUnlocks(unlock.date);
  const nextUnlocks = [
    ...existingUnlocks.filter(
      existingUnlock => existingUnlock.puzzleId !== unlock.puzzleId,
    ),
    unlock,
  ];

  try {
    await AsyncStorage.setItem(
      getBonusUnlockKey(unlock.date),
      JSON.stringify(nextUnlocks),
    );
  } catch {
    // Bonus unlock persistence is best-effort.
  }

  return nextUnlocks;
}
