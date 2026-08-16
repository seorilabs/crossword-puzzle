// 한 퍼즐 안에 담기는 정답들의 어휘 다양성 규칙.
//
// 기존 중복 차단(hasDuplicateAnswers, puzzleDiversity)은 "정답 문자열이 완전히
// 같은가"만 본다. 그래서 `대학생 / 여학생 / 유학생 / 학생 / 대학`처럼 어근을
// 공유하는 단어 묶음은 전부 서로 다른 정답으로 취급돼 한 판에 함께 실렸다.
// 교차 최적화 점수(교차 수·auto run 보너스)가 음절을 공유하는 단어를 선호하기
// 때문에, 제약이 없으면 생성기는 이런 군집으로 수렴한다.
//
// 여기서는 두 가지 규칙으로 군집을 차단한다.
//   1) 공유 조각: 서로 다른 정답이 2음절 이상 연속으로 겹치면 위반
//      (대학생∩여학생="학생", 음료∩음료수="음료", 요일∩수요일="요일")
//   2) 음절 과다: 한 음절이 지나치게 많은 정답에 등장하면 위반
//      ("학" 이 유학/대학생/여학생/유학생/학생/대학 6개 정답에 등장)
// 1음절 공유는 크로스워드의 교차 그 자체이므로 규칙 1에서 허용한다.

// 규칙 1에서 "겹친다"고 판정할 최소 연속 음절 수. 길이 3 이상 조각이 겹치면
// 그 안의 길이 2 조각도 반드시 겹치므로, 2음절 조각만 비교해도 모든 위반을
// 빠짐없이 찾는다.
export const DEFAULT_SHARED_FRAGMENT_LENGTH = 2;
// 규칙 2에서 한 음절이 등장해도 되는 최대 정답 수.
export const DEFAULT_MAX_ANSWERS_PER_SYLLABLE = 3;

export type AnswerVarietyThresholds = {
  sharedFragmentLength: number;
  maxAnswersPerSyllable: number;
};

export type SharedAnswerFragment = {
  fragment: string;
  answers: string[];
};

export type OverusedSyllable = {
  syllable: string;
  answers: string[];
};

export type AnswerVarietyResult = {
  sharedFragments: SharedAnswerFragment[];
  overusedSyllables: OverusedSyllable[];
  pass: boolean;
};

export const DEFAULT_ANSWER_VARIETY_THRESHOLDS: AnswerVarietyThresholds = {
  sharedFragmentLength: DEFAULT_SHARED_FRAGMENT_LENGTH,
  maxAnswersPerSyllable: DEFAULT_MAX_ANSWERS_PER_SYLLABLE,
};

function toSyllables(answer: string) {
  return [...answer.trim()];
}

function normalizeAnswers(answers: Iterable<string>) {
  const unique = new Set<string>();

  for (const answer of answers) {
    const normalized = answer.trim();
    if (normalized !== "") {
      unique.add(normalized);
    }
  }

  return [...unique];
}

// 정답 하나에서 뽑은 길이 fragmentLength 의 연속 음절 조각 집합.
export function getAnswerFragments(answer: string, fragmentLength: number) {
  const syllables = toSyllables(answer);
  const size = Math.max(1, Math.floor(fragmentLength));
  const fragments = new Set<string>();

  for (let start = 0; start + size <= syllables.length; start += 1) {
    fragments.add(syllables.slice(start, start + size).join(""));
  }

  return fragments;
}

// 2개 이상의 정답이 공유하는 조각을 찾는다(규칙 1 위반 목록).
export function findSharedAnswerFragments(
  answers: Iterable<string>,
  fragmentLength: number = DEFAULT_SHARED_FRAGMENT_LENGTH,
): SharedAnswerFragment[] {
  const uniqueAnswers = normalizeAnswers(answers);
  const answersByFragment = new Map<string, string[]>();

  for (const answer of uniqueAnswers) {
    for (const fragment of getAnswerFragments(answer, fragmentLength)) {
      const bucket = answersByFragment.get(fragment) ?? [];
      bucket.push(answer);
      answersByFragment.set(fragment, bucket);
    }
  }

  return [...answersByFragment.entries()]
    .filter(([, sharedAnswers]) => sharedAnswers.length > 1)
    .map(([fragment, sharedAnswers]) => ({ fragment, answers: sharedAnswers }));
}

// 상한을 넘겨 등장하는 음절을 찾는다(규칙 2 위반 목록). 한 정답 안에서 같은
// 음절이 여러 번 나와도(일주일의 "일") 정답 1개로 센다.
export function findOverusedSyllables(
  answers: Iterable<string>,
  maxAnswersPerSyllable: number = DEFAULT_MAX_ANSWERS_PER_SYLLABLE,
): OverusedSyllable[] {
  const uniqueAnswers = normalizeAnswers(answers);
  const limit = Math.max(1, Math.floor(maxAnswersPerSyllable));
  const answersBySyllable = new Map<string, string[]>();

  for (const answer of uniqueAnswers) {
    for (const syllable of new Set(toSyllables(answer))) {
      const bucket = answersBySyllable.get(syllable) ?? [];
      bucket.push(answer);
      answersBySyllable.set(syllable, bucket);
    }
  }

  return [...answersBySyllable.entries()]
    .filter(([, sharedAnswers]) => sharedAnswers.length > limit)
    .map(([syllable, sharedAnswers]) => ({ syllable, answers: sharedAnswers }));
}

export function evaluateAnswerVariety(
  answers: Iterable<string>,
  thresholds: AnswerVarietyThresholds = DEFAULT_ANSWER_VARIETY_THRESHOLDS,
): AnswerVarietyResult {
  const uniqueAnswers = normalizeAnswers(answers);
  const sharedFragments = findSharedAnswerFragments(
    uniqueAnswers,
    thresholds.sharedFragmentLength,
  );
  const overusedSyllables = findOverusedSyllables(
    uniqueAnswers,
    thresholds.maxAnswersPerSyllable,
  );

  return {
    sharedFragments,
    overusedSyllables,
    pass: sharedFragments.length === 0 && overusedSyllables.length === 0,
  };
}

// 최근 퍼즐에서 이미 쓴 정답과 어근을 공유하는 후보를 제외한다. 정답 문자열이
// 같은 것만 빼면 어제 "대학생"을 쓰고 오늘 "학생"이 나오는 반복을 막지 못한다.
export function excludeAnswersSharingFragments<T extends { answer: string }>(
  words: readonly T[],
  usedAnswers: Iterable<string>,
  fragmentLength: number = DEFAULT_SHARED_FRAGMENT_LENGTH,
) {
  const usedFragments = new Set<string>();

  for (const answer of normalizeAnswers(usedAnswers)) {
    for (const fragment of getAnswerFragments(answer, fragmentLength)) {
      usedFragments.add(fragment);
    }
  }

  if (usedFragments.size === 0) {
    return [...words];
  }

  return words.filter((word) => {
    for (const fragment of getAnswerFragments(word.answer, fragmentLength)) {
      if (usedFragments.has(fragment)) {
        return false;
      }
    }

    return true;
  });
}
