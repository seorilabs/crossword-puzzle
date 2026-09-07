import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {
  buildStreakCalendarWeeks,
  computePersonalStats,
  computeSolveTimeDistribution,
  SHARE_GRID_CORRECT,
  SHARE_GRID_INCOMPLETE,
} from '../../../packages/crossword-core/src';
import {
  PersonalStatsCard,
  ShareGridPreview,
  StreakHeatmap,
} from '../recordsComponents';

function collectText(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType('Text' as never)
    .flatMap(node => node.children)
    .filter((child): child is string => typeof child === 'string');
}

function render(element: React.ReactElement) {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(element);
  });
  return renderer as ReactTestRenderer.ReactTestRenderer;
}

test('PersonalStatsCard 는 완료 0건이면 빈 상태 안내만, 기록이 있으면 지표와 분포를 보여 준다', () => {
  const empty = render(
    <PersonalStatsCard
      stats={computePersonalStats([])}
      consecutiveStreak={2}
      longestStreak={2}
      solveTimeDistribution={computeSolveTimeDistribution([])}
    />,
  );
  const emptyText = collectText(empty).join(' ');
  expect(emptyText).toContain('첫 퍼즐을 완료하면 누적 기록이 여기에 쌓여요.');
  expect(emptyText).toContain('2일째 도전 중');
  expect(emptyText).not.toContain('총 완료');
  expect(emptyText).not.toContain('풀이 시간 분포');

  const bestTimes = [45_000, 200_000];
  const populated = render(
    <PersonalStatsCard
      stats={computePersonalStats(
        [
          { completed: true, hintCount: 0, revealUsed: false },
          { completed: true, hintCount: 2, revealUsed: false },
          { completed: false, hintCount: 0, revealUsed: false },
        ],
        bestTimes,
      )}
      consecutiveStreak={3}
      longestStreak={5}
      solveTimeDistribution={computeSolveTimeDistribution(bestTimes)}
    />,
  );
  const text = collectText(populated);
  expect(text).toEqual(
    expect.arrayContaining([
      '총 완료',
      '2판',
      '완료율',
      '67%',
      '현재 스트릭',
      '3일',
      '최장 스트릭',
      '5일',
      '노힌트 완료',
      '1판',
      '최고 기록',
      '평균 기록',
      '풀이 시간 분포',
    ]),
  );
});

test('StreakHeatmap 은 12주 × 7칸을 그리고 오늘 칸을 표시한다', () => {
  const today = '2026-07-01';
  const weeks = buildStreakCalendarWeeks(['2026-06-30', today], today, 12);
  const renderer = render(<StreakHeatmap weeks={weeks} />);
  // host 노드(View)만 센다. react-test-renderer 의 findAll 은 composite 와 host 를 모두 돌려준다.
  const labelled = renderer.root.findAll(
    node =>
      node.type === 'View' &&
      typeof node.props.accessibilityLabel === 'string' &&
      /^\d{4}-\d{2}-\d{2} (완료|미완료)/.test(node.props.accessibilityLabel),
  );
  // 오늘 이후(이번 주 남은 3일)는 접근성 라벨이 없다.
  expect(labelled).toHaveLength(12 * 7 - 3);
  expect(
    labelled.some(node => node.props.accessibilityLabel === `${today} 완료 · 오늘`),
  ).toBe(true);
  expect(
    labelled.some(node => node.props.accessibilityLabel === '2026-06-30 완료'),
  ).toBe(true);
  expect(collectText(renderer)).toEqual(
    expect.arrayContaining(['완료 달력', '미완료', '완료', '일', '수', '금']),
  );
});

test('ShareGridPreview 는 줄·코드포인트 단위로 타일을 그리고 빈 문자열이면 아무것도 그리지 않다', () => {
  const grid = `${SHARE_GRID_CORRECT}${SHARE_GRID_INCOMPLETE}\n${SHARE_GRID_CORRECT}${SHARE_GRID_CORRECT}`;
  const renderer = render(<ShareGridPreview shareGrid={grid} />);
  const rows = renderer.root.findAll(
    node =>
      node.type === 'View' &&
      Array.isArray(node.props.style) === false &&
      node.props.style != null &&
      node.props.style.flexDirection === 'row',
  );
  expect(rows).toHaveLength(2);
  expect(
    renderer.root.find(
      node => node.type === 'View' && node.props.accessibilityRole === 'image',
    ).props.accessibilityLabel,
  ).toBe('완성한 퍼즐 결과 격자');

  const empty = render(<ShareGridPreview shareGrid="" />);
  expect(empty.toJSON()).toBeNull();
});
