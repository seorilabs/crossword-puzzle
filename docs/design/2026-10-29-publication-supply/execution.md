# 실행 기록

- 실행 이슈: https://github.com/seorilabs/crossword-puzzle/issues/462
- 사용자 지시: 2026-10-29 대화의 “실패는 왜 한거야? 예비분 누락은 액션할게 있어? 액션할게 있다면 대응해”. 기존 서비스 장애 대응과 예비분 보충 범위이며 앱 마켓 제출은 포함하지 않는다.
- 설계와 테스트 계획 기록 커밋: `28e4c67`. L1 서비스 런타임, 서비스 적용까지.
- 원본 장애: `crossword-puzzle-pack-generator-hzvgd`. 2026-10-29 00:11:04 KST Hosting release 생성 뒤 00:11:05 당일 easy와 hard 누락으로 실패. 00:40 자동 health는 통과했다. 이전 목록 응답 또는 게시 전파 지연이 의심되나 당시 응답 원문이 없어 확정하지 않는다.
- 예비 공급 원인: UTC 날짜가 바뀌는 KST 09:00에 영어 검사 범위가 하루 이동한다. KST 00:05 생성의 25판으로 다음 KST 자정 전 범위를 충족하지 못했다.
- 우선 복구: 기존 이미지로 `crossword-puzzle-pack-generator-5k6nx` 실행, 2026-10-29 18:45:47 KST 성공. 11월 1일 영어 5판 발행, 기존 공개 보드 74개 SHA-256 전부 보존. 전체 공개 health 통과, 영어 40판과 한국어 25판 검증.
- 실패 재현: 운영 회귀에서 게시 반영 대기 호출 누락과 다음 KST 자정 전 영어 준비 범위 부족 두 조건이 실패했다. 수정 뒤 운영 테스트 52개 통과.
- 공통 검사: release parity, AIT build, mobile lint와 typecheck, mobile 21 suites 및 130 tests, 루트 lint와 typecheck 통과.
- 증적 원본은 작업 종료 시 NAS1dual로 이관하고 크기와 SHA-256을 직접 읽어 검증한다. 최종 경로와 서비스 이미지 결과는 후속 기록에 남긴다.
