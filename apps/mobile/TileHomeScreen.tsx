import { t } from './languageRepository';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type {
  PuzzleManifestItem,
  WeeklyStreakStripDay,
} from '../../packages/crossword-core/src';
type Props = {
  completedToday: number;
  summary?: PuzzleManifestItem;
  allComplete: boolean;
  loading: boolean;
  notice?: string;
  date: string;
  started: boolean;
  streak: number;
  week: WeeklyStreakStripDay[];
  offline: boolean;
  loadError?: boolean;
  onRetry: () => void;
  onStart: () => void;
  onResume: () => void;
  onHistory: () => void;
  onSettings: () => void;
  onLicense: () => void;
};
export function TileHomeScreen({
  completedToday,
  summary,
  allComplete,
  loading,
  notice,
  date,
  started,
  streak,
  week,
  offline,
  loadError = false,
  onRetry,
  onStart,
  onResume,
  onHistory,
  onSettings,
  onLicense,
}: Props) {
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <View style={s.nav}>
        <View>
          <Text style={s.brand}>{t('낱말 한 판')}</Text>
          <Text style={s.brandEnglish}>DAILY WORD PLAY</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('설정')}
          style={s.icon}
          onPress={onSettings}
        >
          <Text style={s.gear}>⚙</Text>
        </Pressable>
      </View>
      <Text style={s.eyebrow}>
        {date.replaceAll('-', '. ')} · {completedToday}/5
      </Text>
      <Text accessibilityRole="header" style={s.title}>
        {t('생각을 맞추는\n오늘의 한 판.')}
      </Text>
      <Text style={s.lead}>{t('단서를 읽고, 글자 타일을 골라보세요.')}</Text>
      <View style={s.card}>
        <View style={s.cardHeading}>
          <Text style={s.cardTitle}>{t('오늘 진행')}</Text>
          <Text style={s.wordCount}>{completedToday}/5</Text>
        </View>
        <View
          style={s.progress}
          accessibilityLabel={t('오늘 {0}/5판 완료', completedToday)}
        >
          {[1, 2, 3, 4, 5].map(n => (
            <View key={n} style={[s.step, n <= completedToday && s.done]}>
              <Text style={n <= completedToday ? s.doneText : s.dayText}>
                {n <= completedToday ? '✓' : n}
              </Text>
            </View>
          ))}
        </View>
        <Text style={s.caption} accessibilityLiveRegion="polite">
          {notice ||
            (loading
              ? t('불러오는 중')
              : loadError
                ? t('오프라인에서 풀 수 있는 판이 없어요.')
                : !summary
                  ? t(
                      allComplete
                        ? '모든 판을 완성했어요'
                        : '지금 풀 수 있는 판이 없어요.',
                    )
                  : summary.date < date
                    ? t('지난 판을 이어서 풀어보세요.')
                    : offline
                      ? t('연결이 어려워 저장된 퍼즐을 보여드려요.')
                      : started
                        ? t('고른 글자는 그대로, 이어서 완성해요.')
                        : t('한 단어씩, 다음 판을 완성해요.'))}
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={loading || (!loadError && !summary && allComplete)}
          style={s.primary}
          onPress={loadError || !summary ? onRetry : onStart}
        >
          <Text style={s.primaryText}>
            {loading
              ? t('불러오는 중')
              : loadError || (!summary && !allComplete)
                ? t('다시 불러오기')
                : !summary
                  ? t('모두 완료')
                  : started
                    ? t('이어서 풀기')
                    : t('다음 판 풀기')}{' '}
            ›
          </Text>
        </Pressable>
      </View>
      <View style={s.streak}>
        <Text style={s.streakTitle}>
          ✦ {streak}
          {t('일의 낱말 습관')}
        </Text>
        <View style={s.week}>
          {week.map(day => (
            <View
              key={day.date}
              accessibilityLabel={t(
                '{0}{1}',
                day.date,
                day.completed ? t(' 완료') : '',
              )}
              style={[s.day, day.completed && s.done]}
            >
              <Text style={[s.dayText, day.completed && s.doneText]}>
                {day.completed ? '✓' : day.isToday ? t('오늘') : '·'}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <View style={s.links}>
        <Pressable accessibilityRole="button" style={s.link} onPress={onResume}>
          <Text style={s.linkText}>{t('⌁ 이어 풀기')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={s.link}
          onPress={onHistory}
        >
          <Text style={s.linkText}>{t('▤ 나의 기록')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={s.link}
          onPress={onLicense}
        >
          <Text style={s.linkText}>{t('ⓘ 안내')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8f3e7' },
  content: {
    paddingTop: 15,
    paddingHorizontal: 24,
    paddingBottom: 24,
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
  },
  nav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 46,
  },
  brand: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.8,
    color: '#28483e',
  },
  brandEnglish: {
    fontSize: 8,
    letterSpacing: 1.2,
    color: '#89917b',
    marginTop: 4,
  },
  icon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gear: { fontSize: 20, color: '#6c7c69' },
  eyebrow: {
    marginTop: 25,
    marginBottom: 14,
    fontSize: 10,
    letterSpacing: 1,
    color: '#9a7545',
  },
  title: {
    fontSize: 34,
    lineHeight: 45,
    letterSpacing: -1.7,
    fontWeight: '800',
    color: '#254344',
  },
  lead: {
    fontSize: 13,
    lineHeight: 23,
    color: '#788470',
    marginTop: 13,
    marginBottom: 24,
  },
  card: {
    borderWidth: 1,
    borderColor: '#d9ddc9',
    borderBottomWidth: 6,
    borderBottomColor: '#e0e1cf',
    borderRadius: 24,
    padding: 20,
    backgroundColor: '#fffdf4',
  },
  cardHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.6,
    color: '#254344',
  },
  wordCount: {
    fontSize: 10,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#e9eddd',
    color: '#63805e',
  },
  progress: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginVertical: 24,
  },
  step: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: '#e9eddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    fontSize: 11,
    lineHeight: 19,
    textAlign: 'center',
    color: '#7a866d',
    marginTop: 2,
    marginBottom: 20,
  },
  primary: {
    minHeight: 59,
    backgroundColor: '#bb5c35',
    borderRadius: 14,
    borderBottomWidth: 5,
    borderBottomColor: '#914326',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { fontSize: 15, fontWeight: '700', color: '#fffdf5' },
  streak: { marginTop: 25, marginHorizontal: 5 },
  streakTitle: { fontSize: 11, color: '#677e5d', fontWeight: '600' },
  week: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginVertical: 13,
  },
  day: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eeeede',
  },
  done: { backgroundColor: '#4a7357' },
  dayText: { fontSize: 9, color: '#a1aa91' },
  doneText: { color: '#fffdf0', fontSize: 14 },
  links: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 23,
    gap: 8,
  },
  link: { minHeight: 46, justifyContent: 'center', alignItems: 'center' },
  linkText: { fontSize: 11, color: '#76836e' },
});
