import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  getCellKey,
  LEADERBOARD_OPEN_FAILURE_MESSAGE,
  RETURN_REMINDER_PREPROMPT_COPY,
  type Puzzle,
} from '../../packages/crossword-core/src';
type Props = {
  puzzle: Puzzle;
  values: Record<string, string>;
  completed: number;
  elapsed: string | null;
  hints: number;
  streak: number;
  best: boolean;
  noHint: boolean;
  onHome: () => void;
  onHistory: () => void;
  onReview: () => void;
  onShare: () => void;
  onLeaderboard?: () => void;
  leaderboardOpenFailed?: boolean;
  onRetry?: () => void;
  reminder?: { body: string; accept: () => void; decline: () => void };
};
export function TileResultScreen({
  puzzle,
  values,
  completed,
  elapsed,
  hints,
  streak,
  best,
  noHint,
  onHome,
  onHistory,
  onReview,
  onShare,
  onLeaderboard,
  leaderboardOpenFailed = false,
  onRetry,
  reminder,
}: Props) {
  const complete = completed === puzzle.entries.length;
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <View style={s.nav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="홈으로"
          style={s.icon}
          onPress={onHome}
        >
          <Text style={s.back}>‹</Text>
        </Pressable>
        <Text style={s.navText}>{puzzle.date.replaceAll('-', '. ')}</Text>
        <Text style={s.navText}>✦ {streak}</Text>
      </View>
      <View style={s.medal}>
        <Text style={s.star}>{complete ? '✦' : '⌁'}</Text>
      </View>
      <Text style={s.eyebrow}>
        {complete ? 'TODAY’S LITTLE WIN' : 'YOUR WORD JOURNEY'}
      </Text>
      <Text accessibilityRole="header" style={s.title}>
        {complete ? '한 판, 완성!' : '여기까지 잘했어요'}
      </Text>
      <Text style={s.lead}>
        {complete
          ? '차곡차곡 맞춘 단어가 한 판이 되었어요.'
          : '고른 글자는 저장돼 있어요.'}
      </Text>
      <View style={s.board}>
        {puzzle.grid.map((row, y) => (
          <View key={y} style={s.boardRow}>
            {row.map((letter, x) => (
              <View key={x} style={[s.cell, !letter && s.block]}>
                <Text style={s.letter}>
                  {letter ? values[getCellKey(y, x)] : ''}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
      <View style={s.stats}>
        {[
          [`${completed}/${puzzle.entries.length}`, '단어 완성'],
          [elapsed ?? '—', '풀이 시간'],
          [String(hints), '사용한 힌트'],
        ].map(([value, label]) => (
          <View key={label}>
            <Text style={s.statValue}>{value}</Text>
            <Text style={s.statLabel}>{label}</Text>
          </View>
        ))}
      </View>
      {complete && (best || noHint) ? (
        <Text style={s.badge}>
          {best ? '✧ 나의 최고 기록! ' : ''}
          {noHint ? '힌트 없이 완성' : ''}
        </Text>
      ) : null}
      {leaderboardOpenFailed ? (
        <Text accessibilityRole="alert" style={s.lead}>
          {LEADERBOARD_OPEN_FAILURE_MESSAGE}
        </Text>
      ) : null}
      <Pressable accessibilityRole="button" style={s.primary} onPress={onHome}>
        <Text style={s.primaryText}>홈으로 돌아가기</Text>
      </Pressable>
      <View style={s.links}>
        <Pressable
          accessibilityRole="button"
          style={s.link}
          onPress={onHistory}
        >
          <Text style={s.linkText}>나의 기록</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={s.link} onPress={onShare}>
          <Text style={s.linkText}>결과 공유</Text>
        </Pressable>
        {onLeaderboard ? (
          <Pressable
            accessibilityRole="button"
            style={s.link}
            onPress={onLeaderboard}
          >
            <Text style={s.linkText}>순위 보기</Text>
          </Pressable>
        ) : null}
      </View>
      {onRetry ? (
        <Pressable accessibilityRole="button" style={s.link} onPress={onRetry}>
          <Text style={s.linkText}>새로 도전하기</Text>
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" style={s.link} onPress={onReview}>
        <Text style={s.linkText}>
          {complete ? '완성한 단어 살펴보기' : '이어서 풀기'}
        </Text>
      </Pressable>
      {reminder ? (
        <View style={s.reminder}>
          <Text style={s.lead}>{reminder.body}</Text>
          <View style={s.links}>
            <Pressable
              accessibilityRole="button"
              style={s.link}
              onPress={reminder.accept}
            >
              <Text style={s.linkText}>
                {RETURN_REMINDER_PREPROMPT_COPY.accept}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={s.link}
              onPress={reminder.decline}
            >
              <Text style={s.linkText}>
                {RETURN_REMINDER_PREPROMPT_COPY.decline}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8f3e7' },
  content: {
    paddingTop: 15,
    paddingHorizontal: 24,
    paddingBottom: 24,
    maxWidth: 430,
    width: '100%',
    alignSelf: 'center',
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 46,
  },
  icon: {
    minWidth: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: { fontSize: 28, color: '#6c7c69' },
  navText: { fontSize: 12, color: '#6e816d' },
  medal: {
    width: 80,
    height: 80,
    marginTop: 28,
    marginBottom: 16,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f6dc9d',
    borderBottomWidth: 5,
    borderBottomColor: '#d2af66',
    borderRadius: 27,
    transform: [{ rotate: '-6deg' }],
  },
  star: { fontSize: 53, color: '#b5732f' },
  eyebrow: {
    fontSize: 9,
    letterSpacing: 1,
    color: '#9a7545',
    marginTop: 7,
    marginBottom: 14,
    textAlign: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#254344',
    letterSpacing: -1.7,
    textAlign: 'center',
  },
  lead: {
    fontSize: 12,
    lineHeight: 21,
    color: '#788470',
    marginTop: 13,
    marginBottom: 25,
    textAlign: 'center',
  },
  board: {
    width: 220,
    aspectRatio: 1,
    padding: 9,
    gap: 3,
    marginTop: 15,
    marginBottom: 22,
    alignSelf: 'center',
    backgroundColor: '#d7dfca',
    borderRadius: 15,
    borderBottomWidth: 4,
    borderBottomColor: '#aab99c',
  },
  boardRow: { flex: 1, flexDirection: 'row', gap: 3 },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fffdf2',
    borderRadius: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#b8c4a8',
  },
  block: { backgroundColor: '#c2ccb4', borderBottomWidth: 0 },
  letter: { fontSize: 12, fontWeight: '700', color: '#54715c' },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 18,
    marginTop: 4,
    marginBottom: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#d9ddc9',
  },
  statValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#426549',
    textAlign: 'center',
    marginBottom: 7,
  },
  statLabel: { fontSize: 10, color: '#8b947e', textAlign: 'center' },
  badge: {
    color: '#a27636',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 15,
    marginBottom: 24,
  },
  primary: {
    minHeight: 59,
    borderRadius: 14,
    backgroundColor: '#bb5c35',
    borderBottomWidth: 5,
    borderBottomColor: '#914326',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  primaryText: { fontSize: 15, fontWeight: '700', color: '#fffdf5' },
  links: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 8,
    marginTop: 16,
  },
  link: { minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontSize: 11, color: '#76836e' },
  reminder: {
    padding: 15,
    backgroundColor: '#fffdf3',
    borderRadius: 15,
    marginTop: 20,
  },
});
