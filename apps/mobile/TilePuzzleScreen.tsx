import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  buildCellEntries,
  buildStartLabels,
  chooseLetterTile,
  clearLetterTile,
  getCellKey,
  getCompletedEntries,
  getEntryCells,
  getLetterTiles,
  selectLetterEntry,
  type LetterTileState,
  type Puzzle,
} from '../../packages/crossword-core/src';

export type TileInputAction = 'choice' | 'clear' | 'select';
type Props = {
  puzzle: Puzzle;
  state: LetterTileState;
  hints: number;
  hasStarted: boolean;
  isPaused: boolean;
  onChange: (state: LetterTileState, action: TileInputAction) => void;
  onHint: () => void;
  onBack: () => void;
  onStart: () => void;
  onResume: () => void;
  onSettings: () => void;
  onPause?: () => void;
  guide?: { completed: number; total: number; onSkip: () => void };
  timer?: string;
  textScale?: number;
  feedback?: string;
  assistance?: React.ReactNode;
};
export function TilePuzzleScreen({
  puzzle,
  state,
  hints,
  hasStarted,
  isPaused,
  onChange,
  onHint,
  onBack,
  onStart,
  onResume,
  onSettings,
  onPause,
  guide,
  timer,
  textScale = 1,
  feedback,
  assistance,
}: Props) {
  const [frame, setFrame] = useState({ width: 390, height: 844 });
  const [cluesOpen, setCluesOpen] = useState(false);
  const compact = frame.height <= 780;
  const boardSize = Math.max(
    96,
    Math.min(frame.width - 32, frame.height - (compact ? 421 : 549)),
  );
  const trayWidth = Math.min(316, frame.width - 36),
    gap = compact ? 6 : 10;
  const entry =
    puzzle.entries.find(item => item.id === state.progress.entryId) ??
    puzzle.entries[0];
  const completed = getCompletedEntries(puzzle.entries, state.cellValues);
  const solved = completed.some(item => item.id === entry?.id);
  const keys = entry
    ? getEntryCells(entry).map(cell => getCellKey(cell.row, cell.col))
    : [];
  const selected = new Set(keys),
    locked = new Set(state.progress.confirmedCells);
  const labels = useMemo(
    () => buildStartLabels(puzzle.entries),
    [puzzle.entries],
  );
  const cellEntries = useMemo(
    () => buildCellEntries(puzzle.entries),
    [puzzle.entries],
  );
  const tiles = getLetterTiles(puzzle, state, entry?.id);
  const editable = hasStarted && !isPaused && !solved;
  const message =
    feedback ||
    (state.status === 'repair'
      ? '맞는 글자는 그대로! 빈칸만 다시 골라봐요.'
      : state.status === 'correct'
      ? '단어 완성!'
      : solved
      ? '이미 완성한 단어예요.'
      : '타일을 눌러 빈칸을 채워봐요.');
  function select(id: string, key = '') {
    onChange(selectLetterEntry(puzzle, state, id, key), 'select');
    setCluesOpen(false);
  }
  function adjacent(delta: number) {
    const index = puzzle.entries.findIndex(item => item.id === entry?.id);
    for (let i = 1; i <= puzzle.entries.length; i++) {
      const next =
        puzzle.entries[
          (index + i * delta + puzzle.entries.length * 2) %
            puzzle.entries.length
        ];
      if (!completed.some(item => item.id === next.id)) {
        select(next.id);
        return;
      }
    }
  }
  return (
    <View
      style={s.screen}
      onLayout={event => {
        const { width, height } = event.nativeEvent.layout;
        if (width > 0 && height > 0)
          setFrame(previous =>
            previous.width === width && previous.height === height
              ? previous
              : { width, height },
          );
      }}
      testID="tile-game"
    >
      <View style={[s.nav, { height: compact ? 44 : 48 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="홈으로"
          style={s.iconButton}
          onPress={onBack}
        >
          <Text style={s.back}>‹</Text>
        </Pressable>
        <Text style={s.title}>
          오늘의 퍼즐
          {compact ? `  ${completed.length}/${puzzle.entries.length}` : ''}
        </Text>
        {onPause ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="일시정지"
            style={s.iconButton}
            onPress={onPause}
          >
            <Text style={s.ink}>Ⅱ</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`힌트 ${hints}개`}
          disabled={!hasStarted || isPaused || solved}
          style={s.hint}
          onPress={onHint}
        >
          <Text style={s.ink}>♧ {hints}</Text>
        </Pressable>
      </View>
      {!compact ? (
        <View style={s.progress}>
          <Text style={s.progressLabel}>
            {completed.length} / {puzzle.entries.length} 단어
            {timer ? ` · ${timer}` : ''}
          </Text>
          <View style={s.progressTrack}>
            <View
              style={[
                s.progressFill,
                {
                  width: `${
                    (completed.length / Math.max(1, puzzle.entries.length)) *
                    100
                  }%`,
                },
              ]}
            />
          </View>
          {guide ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="첫 세 단어 안내 건너뛰기"
              onPress={guide.onSkip}
              style={s.guide}
            >
              <Text style={s.guideText}>
                첫걸음 {guide.completed}/{guide.total} ×
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View
        style={[s.board, { width: boardSize, height: boardSize }]}
        testID="tile-board"
        accessibilityLabel="퍼즐판"
      >
        {puzzle.grid.map((row, y) => (
          <View key={y} style={s.boardRow}>
            {row.map((value, x) => {
              const key = getCellKey(y, x),
                text = state.cellValues[key] ?? '';
              if (!value) return <View key={key} style={[s.cell, s.block]} />;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={`${y + 1}행 ${x + 1}열${
                    text ? `, ${text}` : ''
                  }`}
                  disabled={isPaused}
                  style={[
                    s.cell,
                    selected.has(key) && s.selected,
                    locked.has(key) && s.confirmed,
                    state.progress.activeCellKey === key && s.current,
                  ]}
                  onPress={() => {
                    const matches = cellEntries.get(key) ?? [];
                    const current = matches.find(item => item.id === entry?.id);
                    const next =
                      key === state.progress.activeCellKey
                        ? matches.find(item => item.id !== entry?.id) ?? current
                        : current ?? matches[0];
                    if (next) select(next.id, key);
                  }}
                >
                  <Text style={s.cellNumber}>{labels.get(key)}</Text>
                  <Text
                    style={[
                      s.cellLetter,
                      {
                        fontSize:
                          Math.max(
                            9,
                            Math.min(
                              20,
                              ((boardSize - 18) / puzzle.gridSize) * 0.57,
                            ),
                          ) * textScale,
                      },
                    ]}
                  >
                    {text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <View
        style={[
          s.clue,
          { height: compact ? 76 : 98, marginTop: compact ? 8 : 12 },
        ]}
      >
        <View style={s.clueHeader}>
          <Text style={s.clueNumber}>
            {entry ? labels.get(getCellKey(entry.row, entry.col)) : ''}
          </Text>
          <Text style={s.clueMeta}>
            {entry?.direction === 'across' ? '가로' : '세로'}
          </Text>
          <Text style={[s.clueMeta, s.length]}>{keys.length} 글자</Text>
        </View>
        <ScrollView style={s.clueScroll} nestedScrollEnabled>
          <Text
            style={[s.clueText, { fontSize: (compact ? 14 : 16) * textScale }]}
          >
            {entry?.clue}
          </Text>
        </ScrollView>
      </View>
      <View
        style={[
          s.answer,
          { height: compact ? 48 : 52, marginTop: compact ? 6 : 8 },
        ]}
        accessibilityLabel="현재 단어 답칸"
      >
        {keys.map((key, i) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={`${i + 1}번째 글자 ${
              state.cellValues[key] || '비어 있음'
            }${locked.has(key) ? ', 확정' : ''}`}
            disabled={!editable || locked.has(key)}
            onPress={() =>
              onChange(clearLetterTile(puzzle, state, key), 'clear')
            }
            style={[
              s.answerCell,
              { height: compact ? 47 : 51, maxWidth: 52 },
              locked.has(key) && s.answerConfirmed,
              state.progress.activeCellKey === key && s.answerCurrent,
            ]}
          >
            <Text style={[s.answerLetter, locked.has(key) && s.confirmedInk]}>
              {state.cellValues[key]}
            </Text>
            {locked.has(key) ? <Text style={s.check}>✓</Text> : null}
          </Pressable>
        ))}
      </View>
      <View style={[s.traySection, { marginTop: compact ? 8 : 10 }]}>
        <View
          style={[
            s.trayHeading,
            { height: compact ? 16 : 19, marginBottom: compact ? 8 : 11 },
          ]}
        >
          <Text style={s.trayTitle}>✦ 글자를 골라보세요</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="단서 목록"
            style={s.clueListButton}
            onPress={() => setCluesOpen(true)}
          >
            <Text style={s.small}>☷ 단서 목록</Text>
          </Pressable>
        </View>
        <ScrollView
          style={{
            height: compact ? 123 : 129,
            width: trayWidth,
            alignSelf: 'center',
          }}
          nestedScrollEnabled
          testID="tile-tray"
        >
          <View style={[s.pieces, { gap, paddingBottom: 5 }]}>
            {tiles.map(tile => (
              <Pressable
                key={tile.id}
                accessibilityRole="button"
                accessibilityLabel={`${tile.letter}${
                  tile.used ? ', 사용함' : ', 선택 가능'
                }`}
                disabled={!editable || tile.used}
                onPress={() =>
                  onChange(chooseLetterTile(puzzle, state, tile.id), 'choice')
                }
                style={({ pressed }) => [
                  s.piece,
                  {
                    width: (trayWidth - gap * 4) / 5,
                    height: compact ? 56 : 57,
                  },
                  tile.used && s.used,
                  pressed && !tile.used && s.pressed,
                ]}
              >
                <Text style={s.pieceLetter}>{tile.letter}</Text>
                {tile.used ? <Text style={s.check}>✓</Text> : null}
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>
      <ScrollView
        style={[
          s.feedback,
          { height: compact ? 22 : 44, marginTop: compact ? 6 : 8 },
        ]}
        nestedScrollEnabled
      >
        {assistance ?? (
          <Text
            accessibilityLiveRegion="polite"
            style={[s.feedbackText, state.status === 'repair' && s.repair]}
          >
            {message}
          </Text>
        )}
      </ScrollView>
      <View
        style={[
          s.tools,
          { minHeight: compact ? 56 : 74, paddingBottom: compact ? 4 : 18 },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          disabled={isPaused}
          style={s.toolButton}
          onPress={() => adjacent(-1)}
        >
          <Text style={s.toolText}>‹ 이전</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="지우기"
          disabled={
            !editable ||
            !keys.some(key => state.cellValues[key] && !locked.has(key))
          }
          style={[s.toolButton, s.undo]}
          onPress={() => onChange(clearLetterTile(puzzle, state), 'clear')}
        >
          <Text style={s.toolText}>⌫ 지우기</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={isPaused}
          style={s.toolButton}
          onPress={() => adjacent(1)}
        >
          <Text style={s.toolText}>다음 ›</Text>
        </Pressable>
      </View>
      {!hasStarted || isPaused ? (
        <View style={s.pauseShade}>
          <View style={s.pauseCard}>
            <Text style={s.pauseTitle}>
              {isPaused ? '잠시 쉬어가요' : '오늘 한 판, 시작해볼까요?'}
            </Text>
            <Pressable
              accessibilityRole="button"
              style={s.primary}
              onPress={isPaused ? onResume : onStart}
            >
              <Text style={s.primaryText}>
                {isPaused ? '이어서 풀기' : '퍼즐 시작'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={s.toolButton}
              onPress={onBack}
            >
              <Text style={s.toolText}>홈으로</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {cluesOpen ? (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={() => setCluesOpen(false)}
        >
          <View style={s.sheetShade}>
            <Pressable
              style={StyleSheet.absoluteFill}
              accessibilityRole="button"
              accessibilityLabel="단서 목록 닫기"
              onPress={() => setCluesOpen(false)}
            />
            <View style={s.sheet}>
              <Text style={s.sheetTitle}>원하는 단서를 골라보세요</Text>
              <ScrollView>
                {puzzle.entries.map(item => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={item.clue}
                    style={s.clueItem}
                    onPress={() => select(item.id)}
                  >
                    <Text style={s.clueItemNumber}>
                      {labels.get(getCellKey(item.row, item.col))}
                    </Text>
                    <Text style={s.clueItemText}>{item.clue}</Text>
                    <Text style={s.small}>
                      {completed.some(done => done.id === item.id)
                        ? '✓'
                        : `${[...item.answer].length} 글자`}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={s.sheetFooter}>
                <Pressable
                  accessibilityRole="button"
                  style={s.toolButton}
                  onPress={() => {
                    setCluesOpen(false);
                    onSettings();
                  }}
                >
                  <Text style={s.toolText}>설정</Text>
                </Pressable>
                {compact && guide ? (
                  <Pressable
                    accessibilityRole="button"
                    style={s.toolButton}
                    onPress={guide.onSkip}
                  >
                    <Text style={s.toolText}>
                      첫걸음 {guide.completed}/{guide.total} 건너뛰기
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  style={s.toolButton}
                  onPress={() => setCluesOpen(false)}
                >
                  <Text style={s.toolText}>닫기</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}
const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8f3e7',
    maxWidth: 430,
    width: '100%',
    alignSelf: 'center',
  },
  ink: { color: '#254344' },
  nav: { paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center' },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#254344',
    letterSpacing: -0.6,
  },
  iconButton: {
    height: 44,
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: { fontSize: 28, color: '#254344' },
  hint: {
    height: 44,
    minWidth: 59,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eee9d8',
    borderRadius: 11,
  },
  progress: {
    height: 36,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressLabel: { fontSize: 11, color: '#708176' },
  progressTrack: {
    height: 7,
    flex: 1,
    backgroundColor: '#dcddcd',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: { height: 7, backgroundColor: '#4b7858', borderRadius: 5 },
  guide: { minHeight: 36, justifyContent: 'center' },
  guideText: { fontSize: 10, color: '#60745b' },
  board: {
    alignSelf: 'center',
    padding: 9,
    gap: 3,
    backgroundColor: '#d8decd',
    borderRadius: 18,
    borderBottomWidth: 5,
    borderBottomColor: '#a3ae94',
  },
  boardRow: { flex: 1, flexDirection: 'row', gap: 3 },
  cell: {
    flex: 1,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 5,
    backgroundColor: '#fffdf4',
    borderBottomWidth: 2,
    borderBottomColor: '#c4ccb5',
  },
  block: { backgroundColor: '#c7d0ba', borderBottomWidth: 0 },
  selected: { backgroundColor: '#f4cc7d', borderBottomColor: '#b18d47' },
  confirmed: { backgroundColor: '#e4dcb5' },
  current: { borderWidth: 2, borderColor: '#96642d' },
  cellNumber: {
    position: 'absolute',
    top: 1,
    left: 2,
    fontSize: 6,
    color: '#5c7359',
  },
  cellLetter: { fontWeight: '700', color: '#254344' },
  clue: {
    marginHorizontal: 18,
    paddingHorizontal: 13,
    paddingVertical: 10,
    backgroundColor: '#fffdf6',
    borderWidth: 1,
    borderColor: '#d9ddca',
    borderRadius: 15,
  },
  clueHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clueNumber: {
    minWidth: 22,
    height: 21,
    textAlign: 'center',
    textAlignVertical: 'center',
    backgroundColor: '#f9e5b9',
    borderRadius: 6,
    fontSize: 11,
    color: '#7e5b2d',
  },
  clueMeta: { fontSize: 10, color: '#74816e' },
  length: { marginLeft: 'auto' },
  clueScroll: { flex: 1, marginTop: 6 },
  clueText: {
    fontWeight: '600',
    color: '#254344',
    lineHeight: 23,
    letterSpacing: -0.5,
  },
  answer: {
    marginHorizontal: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  answerCell: {
    flex: 1,
    minWidth: 0,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#c9cfb9',
    backgroundColor: '#fffdf5',
    borderBottomWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerLetter: { fontSize: 24, fontWeight: '700', color: '#254344' },
  answerConfirmed: { backgroundColor: '#e7ecdc', borderColor: '#bfcfb7' },
  confirmedInk: { color: '#4c7557' },
  answerCurrent: { backgroundColor: '#f9e6b7', borderColor: '#b5722d' },
  check: {
    position: 'absolute',
    bottom: 3,
    right: 5,
    fontSize: 9,
    color: '#4c7557',
  },
  traySection: { paddingHorizontal: 18 },
  trayHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trayTitle: { fontSize: 11, fontWeight: '600', color: '#61765e' },
  clueListButton: {
    position: 'absolute',
    right: -5,
    top: -13,
    height: 44,
    minWidth: 88,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  small: { fontSize: 10, color: '#73816c' },
  pieces: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  piece: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d7d8c7',
    backgroundColor: '#fffef8',
    borderBottomWidth: 5,
    borderBottomColor: '#b5bea4',
  },
  pieceLetter: { fontSize: 26, fontWeight: '700', color: '#254344' },
  used: { opacity: 0.28, backgroundColor: '#e6e8da' },
  pressed: { transform: [{ translateY: 4 }], borderBottomWidth: 1 },
  feedback: { marginHorizontal: 18, flexGrow: 0, flexShrink: 0 },
  feedbackText: {
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    color: '#75816e',
  },
  repair: { color: '#a36b35' },
  tools: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'auto',
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  toolButton: {
    minHeight: 44,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  toolText: { fontSize: 11, color: '#71816d' },
  undo: { minWidth: 90, backgroundColor: '#eeeede', borderRadius: 10 },
  pauseShade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#26402caa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pauseCard: {
    width: '85%',
    padding: 25,
    backgroundColor: '#fffdf3',
    borderRadius: 20,
  },
  pauseTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    color: '#254344',
    marginBottom: 25,
  },
  primary: {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: '#bc5b32',
    borderBottomWidth: 5,
    borderBottomColor: '#914326',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { fontSize: 16, fontWeight: '700', color: '#fffdf5' },
  sheetShade: {
    flex: 1,
    backgroundColor: '#26402c55',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '76%',
    paddingTop: 22,
    paddingHorizontal: 17,
    paddingBottom: 18,
    backgroundColor: '#fffdf3',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#254344',
    marginBottom: 15,
  },
  clueItem: {
    flexDirection: 'row',
    gap: 9,
    minHeight: 53,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#d4ddc5',
    borderRadius: 11,
    alignItems: 'center',
  },
  clueItemNumber: { minWidth: 18, color: '#a26c35' },
  clueItemText: { flex: 1, fontSize: 12, lineHeight: 20, color: '#38533f' },
  sheetFooter: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 8,
  },
});
