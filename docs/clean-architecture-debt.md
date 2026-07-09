# 클린 아키텍처 부채 해소 — 정량 목표

`docs/architecture.md`의 core/adapter 경계는 성숙하나, 프레젠테이션 계층이
모놀리식이고 일부 경계 누수가 있다. 가장 큰 부채 3가지에 대해 정량 인수 조건을
설정하고 달성한다.

## 기준선 (측정 시점)

| 지표 | 값 |
| --- | --- |
| `src/App.tsx` LOC | 7,206 |
| `apps/mobile/App.tsx` LOC | 4,881 |
| 두 App.tsx 간 동일 이름 함수 중복 정의 | 40 |
| `src/App.tsx` 직접 `localStorage.` 호출 | 6 |

## 부채 1 — God Component / 중복

프레젠테이션 계층이 표현 + 상호작용 오케스트레이션 + 순수 로직을 한 파일에
떠안고, 그 순수 로직이 web/mobile에 복붙돼 있다.

**인수 조건 (AC-1)** — ✅ 달성 (2라운드)
- [x] 두 App.tsx 간 동일 이름 함수 중복 정의 40 → **21** (순수 함수 18개 core 승격)
- [x] `src/App.tsx` LOC 7,206 → **7,008**
- [x] `apps/mobile/App.tsx` LOC 4,881 → **4,713**

2라운드에서 라벨/조회 순수 함수 6개(`findPuzzleSummaryById`, `getCompletedPuzzleIds`,
`formatPuzzleAliasLabel`, `formatPuzzleCardSequenceLabel`, `formatDateCardDay`,
`formatDateCardWeekday`)를 `packages/crossword-core/src/puzzleLabels.ts`로 승격.
`formatDateCardWeekday`는 `variant` 기본값 `"short"`로 web/RN 동작을 모두 보존.
`getCompletedPuzzleIds`는 `DateCardState` 전체 형태(web/RN 상이) 대신 `completedAt`만
구조적으로 받아 두 shell에 공용.

남은 중복(21개)은 대부분 React/RN 컴포넌트·훅(`App`, `usePuzzleViewModel`,
`BonusPuzzlePanel` 등)이거나 shell별로 동작이 분기된 함수라, 단순 추출이 아니라
동작 재조정(reconcile)이 필요하다 → 별도 과제로 남긴다.

## 부채 2 — 경계 누수 (스토리지 직접 접근)

`App.tsx`가 `localStorage`를 직접 만져, 포트/어댑터 경계를 우회한다.

**인수 조건 (AC-2)** — ✅ 달성
- [x] `src/App.tsx` 직접 `localStorage.` 호출 6 → **0** (`answerInputModeRepository`,
      `onboardingSeenRepository` 경유, 각 단위 테스트 포함)

## 부채 3 — 입력 정책 중복

방금 고친 "마지막 글자" 버그가 web/mobile 양쪽에 존재했던 게 방증. 플랫폼 무관
입력 규칙이 두 곳에 복붙돼 있다.

**인수 조건 (AC-3)** — ✅ 달성
- [x] `getAnswerInputLetters`, `isHangulJamoLetter`, `getAnswerCommitLetters`,
      `isHangulJamoInput`를 `packages/crossword-core/src/answerInput.ts`에 단일 정의 + 단위 테스트
- [x] 두 App.tsx의 위 4개 로컬 정의 = 0 (core import로 대체)

## 공통 게이트

모든 변경 후 다음이 green이어야 한다:
- `npx tsc --noEmit`
- `npx eslint .`
- `npx vitest run`
- `npm --prefix apps/mobile run typecheck`
- core 테스트 (`node --test`)
</content>
</invoke>
