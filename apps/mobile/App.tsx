import React, {useMemo, useState} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

type Direction = 'across' | 'down';

type PuzzleEntry = {
  id: string;
  answer: string;
  clue: string;
  direction: Direction;
  row: number;
  col: number;
};

type Puzzle = {
  puzzleId: string;
  date: string;
  difficulty: string;
  gridSize: number;
  grid: string[][];
  entries: PuzzleEntry[];
};

type CellCoordinate = {
  row: number;
  col: number;
};

const puzzle: Puzzle = {
  puzzleId: '2026-05-25-normal-01',
  date: '2026-05-25',
  difficulty: 'normal',
  gridSize: 8,
  grid: [
    ['차', '', '', '가', '방', '', '다', ''],
    ['표', '지', '판', '', '울', '타', '리', ''],
    ['', '우', '', '', '', '자', '', ''],
    ['', '개', '미', '', '일', '기', '', ''],
    ['', '', '소', '나', '기', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
  ],
  entries: [
    {
      id: 'a1',
      answer: '가방',
      clue: '물건을 넣어 들고 다니는 것',
      direction: 'across',
      row: 0,
      col: 3,
    },
    {
      id: 'a2',
      answer: '표지판',
      clue: '길 안내나 주의를 알리는 판',
      direction: 'across',
      row: 1,
      col: 0,
    },
    {
      id: 'a3',
      answer: '울타리',
      clue: '둘레를 막는 경계',
      direction: 'across',
      row: 1,
      col: 4,
    },
    {
      id: 'a4',
      answer: '개미',
      clue: '작고 부지런한 곤충',
      direction: 'across',
      row: 3,
      col: 1,
    },
    {
      id: 'a5',
      answer: '일기',
      clue: '하루 일을 적은 글',
      direction: 'across',
      row: 3,
      col: 4,
    },
    {
      id: 'a6',
      answer: '소나기',
      clue: '갑자기 세게 내리는 비',
      direction: 'across',
      row: 4,
      col: 2,
    },
    {
      id: 'd7',
      answer: '차표',
      clue: '차를 탈 때 필요한 표',
      direction: 'down',
      row: 0,
      col: 0,
    },
    {
      id: 'd8',
      answer: '방울',
      clue: '작고 둥근 물방울 모양',
      direction: 'down',
      row: 0,
      col: 4,
    },
    {
      id: 'd9',
      answer: '다리',
      clue: '건너가게 만든 구조물',
      direction: 'down',
      row: 0,
      col: 6,
    },
    {
      id: 'd10',
      answer: '지우개',
      clue: '글씨를 지우는 도구',
      direction: 'down',
      row: 1,
      col: 1,
    },
    {
      id: 'd11',
      answer: '타자기',
      clue: '글자를 찍어 내던 기계',
      direction: 'down',
      row: 1,
      col: 5,
    },
    {
      id: 'd12',
      answer: '미소',
      clue: '살짝 웃는 표정',
      direction: 'down',
      row: 3,
      col: 2,
    },
    {
      id: 'd13',
      answer: '일기',
      clue: '하루 일을 적은 글',
      direction: 'down',
      row: 3,
      col: 4,
    },
  ],
};

const directionLabels: Record<Direction, string> = {
  across: '가로',
  down: '세로',
};

function getCellKey(row: number, col: number) {
  return `${row}:${col}`;
}

function getEntryCells(entry: PuzzleEntry): CellCoordinate[] {
  return [...entry.answer].map((_, index) => ({
    row: entry.direction === 'across' ? entry.row : entry.row + index,
    col: entry.direction === 'across' ? entry.col + index : entry.col,
  }));
}

function buildCellEntries(entries: PuzzleEntry[]) {
  const result = new Map<string, PuzzleEntry[]>();

  for (const entry of entries) {
    for (const cell of getEntryCells(entry)) {
      const key = getCellKey(cell.row, cell.col);
      result.set(key, [...(result.get(key) ?? []), entry]);
    }
  }

  return result;
}

function buildStartLabels(entries: PuzzleEntry[]) {
  const starts = new Map<string, number>();
  const orderedStarts = Array.from(
    new Set(entries.map(entry => getCellKey(entry.row, entry.col))),
  ).sort((a, b) => {
    const [aRow, aCol] = a.split(':').map(Number);
    const [bRow, bCol] = b.split(':').map(Number);
    return aRow - bRow || aCol - bCol;
  });

  orderedStarts.forEach((key, index) => starts.set(key, index + 1));
  return starts;
}

function normalizeInput(value: string) {
  return value.replace(/\s/g, '').slice(0, 12);
}

function App() {
  const {width} = useWindowDimensions();
  const isWide = width >= 760;
  const [selectedEntryId, setSelectedEntryId] = useState(
    puzzle.entries[0]?.id ?? '',
  );
  const [cellValues, setCellValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('힌트를 고르고 정답을 입력하세요.');

  const cellEntries = useMemo(() => buildCellEntries(puzzle.entries), []);
  const startLabels = useMemo(() => buildStartLabels(puzzle.entries), []);
  const selectedEntry =
    puzzle.entries.find(entry => entry.id === selectedEntryId) ??
    puzzle.entries[0];
  const selectedCells = useMemo(
    () => new Set(getEntryCells(selectedEntry).map(cell => getCellKey(cell.row, cell.col))),
    [selectedEntry],
  );
  const selectedAnswer = getEntryCells(selectedEntry)
    .map(cell => cellValues[getCellKey(cell.row, cell.col)] ?? '')
    .join('');
  const completedCount = puzzle.entries.filter(entry => {
    const answer = getEntryCells(entry)
      .map(cell => cellValues[getCellKey(cell.row, cell.col)] ?? '')
      .join('');
    return answer === entry.answer;
  }).length;
  const progressPercent = Math.round((completedCount / puzzle.entries.length) * 100);

  function selectEntry(entry: PuzzleEntry) {
    setSelectedEntryId(entry.id);
    setMessage(`${directionLabels[entry.direction]} ${entry.answer.length}글자`);
  }

  function selectCell(row: number, col: number) {
    const entries = cellEntries.get(getCellKey(row, col));

    if (entries == null || entries.length === 0) {
      return;
    }

    const nextEntry =
      entries.find(entry => entry.direction === selectedEntry.direction) ?? entries[0];
    selectEntry(nextEntry);
  }

  function updateSelectedAnswer(value: string) {
    const nextValue = normalizeInput(value);
    const cells = getEntryCells(selectedEntry);

    setCellValues(previous => {
      const next = {...previous};
      cells.forEach((cell, index) => {
        const key = getCellKey(cell.row, cell.col);
        const letter = [...nextValue][index];

        if (letter == null) {
          delete next[key];
        } else {
          next[key] = letter;
        }
      });
      return next;
    });
  }

  function revealNextLetter() {
    const cells = getEntryCells(selectedEntry);
    const answerLetters = [...selectedEntry.answer];
    const nextIndex = cells.findIndex(
      (cell, index) => cellValues[getCellKey(cell.row, cell.col)] !== answerLetters[index],
    );
    const targetIndex = nextIndex === -1 ? 0 : nextIndex;
    const targetCell = cells[targetIndex];

    setCellValues(previous => ({
      ...previous,
      [getCellKey(targetCell.row, targetCell.col)]: answerLetters[targetIndex],
    }));
    setMessage('힌트 한 글자를 채웠습니다.');
  }

  function checkSelectedAnswer() {
    if (selectedAnswer === selectedEntry.answer) {
      setMessage('정답입니다.');
      return;
    }

    setMessage(`아직 맞지 않습니다. ${selectedEntry.answer.length}글자를 확인하세요.`);
  }

  function clearSelectedAnswer() {
    setCellValues(previous => {
      const next = {...previous};
      getEntryCells(selectedEntry).forEach(cell => {
        delete next[getCellKey(cell.row, cell.col)];
      });
      return next;
    });
    setMessage('선택한 단어를 비웠습니다.');
  }

  function renderAnswerPanel() {
    return (
      <View style={styles.answerPanel}>
        <Text style={styles.clueMeta}>
          {directionLabels[selectedEntry.direction]} · {selectedEntry.answer.length}글자
        </Text>
        <Text style={styles.currentClue}>{selectedEntry.clue}</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={updateSelectedAnswer}
          placeholder="정답 입력"
          placeholderTextColor="#8a94a6"
          style={styles.answerInput}
          value={selectedAnswer}
        />
        <View style={styles.actions}>
          <Pressable onPress={checkSelectedAnswer} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>정답 확인</Text>
          </Pressable>
          <Pressable onPress={revealNextLetter} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>힌트</Text>
          </Pressable>
          <Pressable onPress={clearSelectedAnswer} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>지우기</Text>
          </Pressable>
        </View>
        <Text style={styles.message}>{message}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoidingView}>
        <View style={[styles.screen, isWide && styles.screenWide]}>
          <View style={[styles.boardPane, isWide && styles.boardPaneWide]}>
            <View style={styles.header}>
              <View>
                <Text style={styles.eyebrow}>{puzzle.date}</Text>
                <Text style={styles.title}>가로세로낱말퍼즐</Text>
              </View>
              <View style={styles.progressBadge}>
                <Text style={styles.progressValue}>{progressPercent}%</Text>
                <Text style={styles.progressLabel}>완료</Text>
              </View>
            </View>

            <View style={styles.board}>
              {puzzle.grid.map((row, rowIndex) => (
                <View key={rowIndex} style={styles.boardRow}>
                  {row.map((cell, colIndex) => {
                    const key = getCellKey(rowIndex, colIndex);
                    const isBlock = cell === '';
                    const isSelected = selectedCells.has(key);
                    const startLabel = startLabels.get(key);

                    return (
                      <Pressable
                        accessibilityRole="button"
                        disabled={isBlock}
                        key={key}
                        onPress={() => selectCell(rowIndex, colIndex)}
                        style={[
                          styles.cell,
                          isBlock && styles.cellBlock,
                          isSelected && styles.cellSelected,
                        ]}>
                        {!isBlock && startLabel != null ? (
                          <Text style={styles.cellNumber}>{startLabel}</Text>
                        ) : null}
                        {!isBlock ? (
                          <Text style={styles.cellLetter}>{cellValues[key] ?? ''}</Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>

            {!isWide ? renderAnswerPanel() : null}
          </View>

          <ScrollView
            contentContainerStyle={styles.clueList}
            style={[styles.cluePane, isWide && styles.cluePaneWide]}>
            {isWide ? renderAnswerPanel() : null}
            {(['across', 'down'] as Direction[]).map(direction => (
              <View key={direction} style={styles.clueSection}>
                <Text style={styles.clueSectionTitle}>{directionLabels[direction]}</Text>
                {puzzle.entries
                  .filter(entry => entry.direction === direction)
                  .map(entry => {
                    const startLabel = startLabels.get(getCellKey(entry.row, entry.col));
                    const isSelected = entry.id === selectedEntry.id;

                    return (
                      <Pressable
                        key={entry.id}
                        onPress={() => selectEntry(entry)}
                        style={[styles.clueItem, isSelected && styles.clueItemSelected]}>
                        <Text style={styles.clueItemNumber}>{startLabel}</Text>
                        <Text style={styles.clueItemText}>{entry.clue}</Text>
                      </Pressable>
                    );
                  })}
              </View>
            ))}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  answerInput: {
    borderColor: '#cbd5e1',
    borderRadius: 8,
    borderWidth: 1,
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '700',
    minHeight: 48,
    paddingHorizontal: 12,
  },
  answerPanel: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  board: {
    alignSelf: 'center',
    backgroundColor: '#1e293b',
    borderColor: '#1e293b',
    borderRadius: 8,
    borderWidth: 2,
    overflow: 'hidden',
  },
  boardPane: {
    gap: 14,
  },
  boardPaneWide: {
    flex: 0.95,
  },
  boardRow: {
    flexDirection: 'row',
  },
  cell: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: '#ffffff',
    borderColor: '#1e293b',
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    position: 'relative',
  },
  cellBlock: {
    backgroundColor: '#1e293b',
  },
  cellLetter: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '800',
  },
  cellNumber: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '700',
    left: 3,
    position: 'absolute',
    top: 2,
  },
  cellSelected: {
    backgroundColor: '#d9f99d',
  },
  clueItem: {
    alignItems: 'flex-start',
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  clueItemNumber: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '800',
    minWidth: 22,
  },
  clueItemSelected: {
    backgroundColor: '#ecfeff',
    borderColor: '#06b6d4',
  },
  clueItemText: {
    color: '#334155',
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  clueList: {
    gap: 14,
    paddingBottom: 28,
  },
  clueMeta: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '800',
  },
  cluePane: {
    flex: 1,
  },
  cluePaneWide: {
    flex: 1,
  },
  clueSection: {
    gap: 8,
  },
  clueSectionTitle: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '800',
  },
  currentClue: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 23,
  },
  eyebrow: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  message: {
    color: '#475569',
    fontSize: 13,
    minHeight: 18,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 8,
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  progressBadge: {
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    minWidth: 66,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  progressLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
  },
  progressValue: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '900',
  },
  safeArea: {
    backgroundColor: '#f8fafc',
    flex: 1,
  },
  screen: {
    flex: 1,
    gap: 16,
    padding: 16,
  },
  screenWide: {
    flexDirection: 'row',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    minHeight: 42,
    minWidth: 74,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '800',
  },
  title: {
    color: '#0f172a',
    fontSize: 24,
    fontWeight: '900',
  },
});

export default App;
