import { t } from './languageRepository';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getCellKey,
  LEADERBOARD_OPEN_FAILURE_MESSAGE,
  RETURN_REMINDER_PREPROMPT_COPY,
  type Puzzle,
} from '../../packages/crossword-core/src';
type Props = {
  busy?: boolean;
  adPending?: boolean;
  emptyMessage?: string;
  primaryLabel?: string;
  notice?: string;
  onPrimary?: () => void;
  puzzle: Puzzle;
  values: Record<string, string>;
  completed: number;
  elapsed: string | null;
  streak: number;
  best: boolean;
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
  busy = false,
  adPending = false,
  emptyMessage,
  primaryLabel,
  onPrimary,
  notice,
  puzzle,
  values,
  completed,
  elapsed,
  streak,
  best,
  onHome,
  onHistory,
  onReview,
  onShare,
  onLeaderboard,
  leaderboardOpenFailed = false,
  onRetry,
  reminder,
}: Props) {
  const insets = useSafeAreaInsets();
  const complete = completed === puzzle.entries.length;
  return (
    <View style={s.screen}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content}>
        <View style={s.nav}>
          <Pressable
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('홈으로')}
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
          {complete ? t('한 판, 완성!') : t('여기까지 잘했어요')}
        </Text>
        <Text style={s.lead}>
          {complete
            ? t('차곡차곡 맞춘 단어가 한 판이 되었어요.')
            : t('고른 글자는 저장돼 있어요.')}
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
            [`${completed}/${puzzle.entries.length}`, t('단어 완성')],
            [elapsed ?? '—', t('풀이 시간')],
          ].map(([value, label]) => (
            <View key={label}>
              <Text style={s.statValue}>{value}</Text>
              <Text style={s.statLabel}>{label}</Text>
            </View>
          ))}
        </View>
        {complete && best ? (
          <Text style={s.badge}>{best ? t('✧ 나의 최고 기록! ') : ''}</Text>
        ) : null}
        {notice ? (
          <Text accessibilityRole="alert" style={s.lead}>
            {notice}
          </Text>
        ) : null}
        {leaderboardOpenFailed ? (
          <Text accessibilityRole="alert" style={s.lead}>
            {LEADERBOARD_OPEN_FAILURE_MESSAGE}
          </Text>
        ) : null}
        <View style={s.links}>
          <Pressable
            disabled={busy}
            accessibilityRole="button"
            style={s.link}
            onPress={onHistory}
          >
            <Text style={s.linkText}>{t('나의 기록')}</Text>
          </Pressable>
          <Pressable
            disabled={busy}
            accessibilityRole="button"
            style={s.link}
            onPress={onShare}
          >
            <Text style={s.linkText}>{t('결과 공유')}</Text>
          </Pressable>
          {onLeaderboard ? (
            <Pressable
              disabled={busy}
              accessibilityRole="button"
              style={s.link}
              onPress={onLeaderboard}
            >
              <Text style={s.linkText}>{t('순위 보기')}</Text>
            </Pressable>
          ) : null}
        </View>
        {onRetry ? (
          <Pressable
            disabled={busy}
            accessibilityRole="button"
            style={s.link}
            onPress={onRetry}
          >
            <Text style={s.linkText}>{t('새로 도전하기')}</Text>
          </Pressable>
        ) : null}
        <Pressable
          disabled={busy}
          accessibilityRole="button"
          style={s.link}
          onPress={onReview}
        >
          <Text style={s.linkText}>
            {complete ? t('완성한 단어 살펴보기') : t('이어서 풀기')}
          </Text>
        </Pressable>
        {reminder ? (
          <View style={s.reminder}>
            <Text style={s.lead}>{reminder.body}</Text>
            <View style={s.links}>
              <Pressable
                disabled={busy}
                accessibilityRole="button"
                style={s.link}
                onPress={reminder.accept}
              >
                <Text style={s.linkText}>
                  {t(RETURN_REMINDER_PREPROMPT_COPY.accept)}
                </Text>
              </Pressable>
              <Pressable
                disabled={busy}
                accessibilityRole="button"
                style={s.link}
                onPress={reminder.decline}
              >
                <Text style={s.linkText}>
                  {t(RETURN_REMINDER_PREPROMPT_COPY.decline)}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>
      <View style={[s.footer, { paddingBottom: Math.max(12, insets.bottom) }]}>
        {adPending ? (
          <Text accessibilityLiveRegion="polite" style={s.footerNotice}>
            {t('잠시 광고가 표시될 수 있어요.')}
          </Text>
        ) : emptyMessage ? (
          <Text style={s.footerNotice}>{emptyMessage}</Text>
        ) : null}
        <Pressable
          disabled={busy}
          accessibilityRole="button"
          style={s.primary}
          onPress={onPrimary ?? onHome}
        >
          <Text style={s.primaryText}>
            {primaryLabel ?? t('홈으로 돌아가기')}
          </Text>
        </Pressable>
      </View>
    </View>
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
    width: 56,
    height: 56,
    marginTop: 8,
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
  star: { fontSize: 36, color: '#b5732f' },
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
    width: 140,
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
  footer: {
    paddingTop: 8,
    paddingHorizontal: 24,
    backgroundColor: '#f8f3e7',
    borderTopWidth: 1,
    borderColor: '#d9ddc9',
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
  },
  footerNotice: {
    color: '#54715c',
    textAlign: 'center',
    fontSize: 12,
    marginBottom: 4,
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
