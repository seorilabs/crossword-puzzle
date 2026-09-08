import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  buildStreakCalendarMonthLabels,
  formatBestTime,
  SHARE_GRID_CORRECT,
  SHARE_GRID_INCOMPLETE,
  type PersonalStats,
  type SolveTimeDistribution,
  type StreakCalendarWeek,
} from '../../packages/crossword-core/src';

// 기록·통계·공유 표시용 RN 컴포넌트. 웹 PersonalStatsCard / StreakHeatmap /
// ShareGridPreview 를 같은 core 데이터 계약 위에 RN 프리미티브로 옮긴 것이다.
// 집계·격자 배치는 core 가 끝내고 여기서는 렌더만 한다.

export type ShareGridPreviewProps = {
  shareGrid: string;
};

// 공유 텍스트의 이모지 격자를 타일로 미리 보여 준다. 줄은 개행, 칸은 코드포인트 단위다.
export function ShareGridPreview({ shareGrid }: ShareGridPreviewProps) {
  if (shareGrid === '') {
    return null;
  }
  const rows = shareGrid.split('\n');
  return (
    <View
      accessibilityLabel="완성한 퍼즐 결과 격자"
      accessibilityRole="image"
      style={styles.shareGrid}
    >
      {rows.map((row, rowIndex) => (
        <View key={`share-row-${rowIndex}`} style={styles.shareGridRow}>
          {[...row].map((cell, cellIndex) => (
            <View
              key={`share-cell-${rowIndex}-${cellIndex}`}
              style={[
                styles.shareGridCell,
                cell === SHARE_GRID_CORRECT ? styles.shareGridCellDone : null,
                cell === SHARE_GRID_INCOMPLETE
                  ? styles.shareGridCellIncomplete
                  : null,
              ]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export type PersonalStatsCardProps = {
  stats: PersonalStats;
  consecutiveStreak: number;
  longestStreak: number;
  solveTimeDistribution: SolveTimeDistribution;
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

// "내 기록" 누적 통계 요약 카드. 완료 1건 이상이면 지표와(보유 최고 기록이 있으면)
// 실제 풀이 시간을 보여 주고, 0건이면 빈 상태 안내를 보여 준다.
export function PersonalStatsCard({
  stats,
  consecutiveStreak,
  longestStreak,
  solveTimeDistribution,
}: PersonalStatsCardProps) {
  const completionPercent = Math.round(stats.completionRate * 100);
  const hasBestTime = stats.fastestBestTimeMs != null;
  const hasDistribution = solveTimeDistribution.total > 0;

  return (
    <View accessibilityLabel="내 기록 요약" style={styles.card}>
      <Text style={styles.cardTitle}>내 기록</Text>
      {stats.completedCount > 0 ? (
        <View style={styles.metricGrid}>
          <Metric label="총 완료" value={`${stats.completedCount}판`} />
          <Metric label="완료율" value={`${completionPercent}%`} />
          <Metric label="현재 스트릭" value={`${consecutiveStreak}일`} />
          <Metric label="최장 스트릭" value={`${longestStreak}일`} />
          <Metric label="노힌트 완료" value={`${stats.noHintCompletedCount}판`} />
          {hasBestTime ? (
            <>
              <Metric
                label="최고 기록"
                value={formatBestTime(stats.fastestBestTimeMs as number)}
              />
              <Metric
                label="평균 기록"
                value={formatBestTime(stats.averageBestTimeMs as number)}
              />
            </>
          ) : null}
        </View>
      ) : (
        <Text style={styles.emptyText}>
          첫 퍼즐을 완료하면 누적 기록이 여기에 쌓여요.
          {consecutiveStreak > 0 ? ` 🔥 ${consecutiveStreak}일째 도전 중!` : ''}
        </Text>
      )}
      {hasDistribution ? (
        <View
          accessibilityLabel={`풀이 시간 분포 (총 ${solveTimeDistribution.total}판)`}
          style={styles.distribution}
        >
          <Text style={styles.distributionTitle}>풀이 시간 분포</Text>
          {solveTimeDistribution.buckets.map(bucket => {
            const widthPercent =
              bucket.count > 0
                ? Math.max(
                    6,
                    Math.round(
                      (bucket.count / solveTimeDistribution.maxCount) * 100,
                    ),
                  )
                : 0;
            return (
              <View key={bucket.label} style={styles.distributionRow}>
                <Text style={styles.distributionLabel}>{bucket.label}</Text>
                <View style={styles.distributionTrack}>
                  <View
                    style={[
                      styles.distributionFill,
                      { width: `${widthPercent}%` },
                    ]}
                  />
                </View>
                <Text style={styles.distributionCount}>{bucket.count}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export type StreakHeatmapProps = {
  weeks: StreakCalendarWeek[];
};

// 좌측 요일 축은 GitHub 컨트리뷰션 그래프처럼 격행(일/수/금)만 적는다.
const WEEKDAY_AXIS_LABELS = ['일', '', '', '수', '', '금', ''];

// 최근 N주 완료 여부를 열=주, 행=요일(일→토) 격자로 보여 주는 히트맵.
export function StreakHeatmap({ weeks }: StreakHeatmapProps) {
  const monthLabels = buildStreakCalendarMonthLabels(weeks);
  return (
    <View accessibilityLabel="최근 완료 달력 히트맵" style={styles.card}>
      <Text style={styles.cardTitle}>완료 달력</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={styles.heatmapMonthRow}>
            <View style={styles.heatmapDayAxis} />
            {monthLabels.map((label, weekIndex) => (
              <Text
                key={weeks[weekIndex]?.[0]?.date ?? `month-${weekIndex}`}
                style={styles.heatmapMonth}
              >
                {label}
              </Text>
            ))}
          </View>
          <View style={styles.heatmapBody}>
            <View style={styles.heatmapDayAxis}>
              {WEEKDAY_AXIS_LABELS.map((label, dayIndex) => (
                <Text key={`day-${dayIndex}`} style={styles.heatmapDayLabel}>
                  {label}
                </Text>
              ))}
            </View>
            {weeks.map((week, weekIndex) => (
              <View
                key={week[0]?.date ?? `week-${weekIndex}`}
                style={styles.heatmapWeek}
              >
                {week.map(cell =>
                  cell.isFuture ? (
                    <View
                      key={cell.date}
                      accessibilityElementsHidden
                      style={[styles.heatmapCell, styles.heatmapCellFuture]}
                    />
                  ) : (
                    <View
                      key={cell.date}
                      accessibilityLabel={`${cell.date} ${
                        cell.completed ? '완료' : '미완료'
                      }${cell.isToday ? ' · 오늘' : ''}`}
                      style={[
                        styles.heatmapCell,
                        cell.completed ? styles.heatmapCellDone : null,
                        cell.isToday ? styles.heatmapCellToday : null,
                      ]}
                    />
                  ),
                )}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      <View style={styles.heatmapLegend}>
        <View style={styles.heatmapLegendSwatch} />
        <Text style={styles.heatmapLegendLabel}>미완료</Text>
        <View style={[styles.heatmapLegendSwatch, styles.heatmapCellDone]} />
        <Text style={styles.heatmapLegendLabel}>완료</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    marginBottom: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  cardTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '900',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metric: {
    minWidth: '30%',
    flexGrow: 1,
    gap: 2,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
  },
  metricLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
  },
  metricValue: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '900',
  },
  emptyText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  distribution: {
    gap: 6,
  },
  distributionTitle: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '800',
  },
  distributionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  distributionLabel: {
    width: 64,
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
  },
  distributionTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
  },
  distributionFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00a88f',
  },
  distributionCount: {
    width: 24,
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  heatmapMonthRow: {
    flexDirection: 'row',
    gap: 2,
    marginBottom: 4,
  },
  heatmapMonth: {
    width: 12,
    color: '#64748b',
    fontSize: 9,
    fontWeight: '700',
  },
  heatmapBody: {
    flexDirection: 'row',
    gap: 2,
  },
  heatmapDayAxis: {
    width: 16,
    gap: 2,
  },
  heatmapDayLabel: {
    height: 12,
    color: '#64748b',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
  },
  heatmapWeek: {
    gap: 2,
  },
  heatmapCell: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: '#e2e8f0',
  },
  heatmapCellDone: {
    backgroundColor: '#00a88f',
  },
  heatmapCellToday: {
    borderWidth: 1.5,
    borderColor: '#0f766e',
  },
  heatmapCellFuture: {
    backgroundColor: 'transparent',
  },
  heatmapLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heatmapLegendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: '#e2e8f0',
  },
  heatmapLegendLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
  },
  shareGrid: {
    alignSelf: 'center',
    gap: 2,
    marginVertical: 6,
  },
  shareGridRow: {
    flexDirection: 'row',
    gap: 2,
  },
  shareGridCell: {
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: 'transparent',
  },
  shareGridCellDone: {
    backgroundColor: '#00a88f',
  },
  shareGridCellIncomplete: {
    backgroundColor: '#e2e8f0',
  },
});
