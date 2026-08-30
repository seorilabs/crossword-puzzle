import {
  createMobileGameplayAttemptTracker,
  type MobilePuzzleAbandonSnapshot,
} from '../gameplayTelemetry';

function createSnapshot(
  overrides: Partial<MobilePuzzleAbandonSnapshot> = {},
): MobilePuzzleAbandonSnapshot {
  return {
    attemptsUsed: 1,
    elapsedSeconds: 42,
    gameContext: {
      difficulty: 'easy',
      gridSize: 5,
      puzzleId: '26083000',
      wordCount: 8,
    },
    hadFirstInput: true,
    hasStarted: true,
    hintCount: 1,
    isCompleted: false,
    progressPercent: 50,
    puzzleId: '26083000',
    remainingAttempts: 2,
    route: 'today',
    telemetryParams: { puzzle_id: '26083000' },
    totalWords: 8,
    wordsFilled: 4,
    ...overrides,
  };
}

function createClients() {
  return {
    telemetry: { impression: jest.fn() },
    gameAnalytics: { track: jest.fn() },
  };
}

describe('RN 퍼즐 이탈·진행 계측 (#338)', () => {
  test('미완료 이탈은 시도당 1회만 Web과 같은 파라미터로 발화한다', () => {
    const tracker = createMobileGameplayAttemptTracker();
    const clients = createClients();
    const snapshot = createSnapshot();

    expect(tracker.emitPuzzleAbandon(snapshot, 'today', clients)).toBe(true);
    expect(tracker.emitPuzzleAbandon(snapshot, 'today', clients)).toBe(false);

    expect(clients.telemetry.impression).toHaveBeenCalledTimes(1);
    expect(clients.telemetry.impression).toHaveBeenCalledWith(
      'puzzle_abandon',
      expect.objectContaining({
        attempt_number: 1,
        elapsed_seconds: 42,
        had_first_input: true,
        hint_count: 1,
        last_screen: 'today',
        progress_percent: 50,
        puzzle_id: '26083000',
        remaining_attempts: 2,
        total_words: 8,
        words_filled: 4,
      }),
    );
    expect(clients.gameAnalytics.track).toHaveBeenCalledTimes(1);
    expect(clients.gameAnalytics.track).toHaveBeenCalledWith(
      'game_puzzle_abandon',
      snapshot.gameContext,
      {
        completedWordCount: 4,
        elapsedSec: 42,
        hadFirstInput: true,
        progressPercent: 50,
        totalWordCount: 8,
      },
    );
  });

  test('완료된 퍼즐에는 abandon을 발화하지 않는다', () => {
    const tracker = createMobileGameplayAttemptTracker();
    const clients = createClients();

    expect(
      tracker.emitPuzzleAbandon(
        createSnapshot({ isCompleted: true, progressPercent: 100 }),
        'today',
        clients,
      ),
    ).toBe(false);
    expect(clients.telemetry.impression).not.toHaveBeenCalled();
    expect(clients.gameAnalytics.track).not.toHaveBeenCalled();
  });

  test('25·50·75%를 새로 넘을 때만 진행 마일스톤을 반환한다', () => {
    const tracker = createMobileGameplayAttemptTracker();

    expect(
      tracker.getNewProgressMilestones({
        attemptKey: '26083000:1',
        isCompleted: false,
        progressPercent: 0,
      }),
    ).toEqual([]);
    expect(
      tracker.getNewProgressMilestones({
        attemptKey: '26083000:1',
        isCompleted: false,
        progressPercent: 55,
      }),
    ).toEqual([25, 50]);
    expect(
      tracker.getNewProgressMilestones({
        attemptKey: '26083000:1',
        isCompleted: false,
        progressPercent: 55,
      }),
    ).toEqual([]);
    expect(
      tracker.getNewProgressMilestones({
        attemptKey: '26083000:1',
        isCompleted: true,
        progressPercent: 100,
      }),
    ).toEqual([]);
  });

  test('이어풀기 첫 스냅샷은 baseline으로 잡아 과거 마일스톤을 재발화하지 않는다', () => {
    const tracker = createMobileGameplayAttemptTracker();

    expect(
      tracker.getNewProgressMilestones({
        attemptKey: '26083000:2',
        isCompleted: false,
        progressPercent: 60,
      }),
    ).toEqual([]);
    expect(
      tracker.getNewProgressMilestones({
        attemptKey: '26083000:2',
        isCompleted: false,
        progressPercent: 80,
      }),
    ).toEqual([75]);
  });
});
