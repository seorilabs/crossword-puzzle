# 중앙 검사 실행 기록 정정

v1.3.1 소스 `5910893f4b5615bd588763ebc49a45910d540432`의 실제 제품 L3 실행은 통과했다. 자동 1,185개와 30판의 실제 입력, 서비스 재실행 보존 검사는 원래 결과를 유지한다.

로컬 중앙 검사 12개는 macOS `/tmp` 별칭으로 verifier를 호출했다. Node가 해석한 `/private/tmp`의 import.meta.url과 process.argv[1]이 달라 CLI 진입 조건이 실행되지 않았는데 종료 코드 0만 확인했다. 작성자와 독립 검증 모두 이 오류를 놓쳤다. 이전 중앙 통과 주장은 철회하며 원본 빈 로그, 보고서와 최초 첨부 자료를 보존한다.

실제 AIT CI 40344315439는 중앙 검사를 실행했고 runs/0의 plannedAt, startedAt, completedAt UTC 표기에서 schema 오류를 보고 빌드 전에 중단했다. 기존 자료는 `+00:00`이며 계약은 `Z` 종료 표기를 요구한다. 실행 순간과 정밀도를 바꾸지 않는 직렬화만 별도 파생 자료에 적용한다. 소스, 계약과 파이프라인을 바꾸거나 검사를 생략하지 않는다.

중앙 검증은 exported CLI를 명시 호출하거나 정규 경로로 호출하고 실제 반환값과 성공 문구를 확인해 다시 실행한다. 원본과 파생 자료의 차이, 실제 실행 시각과 결과를 별도 기록한다. 새 UI 검수 회차는 시작하지 않는다.

서버는 실제 중앙 검사 전에 공개됐다. 생성 실행2qbjf와 health6v55m은 성공했고 공개 KO/EN manifest와 기존 14판 및 manifest와 이력의 원문 보존은 독립 HTTP로 확인했다. 이 운영 성공을 누락된 중앙 검사로 대신하지 않는다. 마켓 제출은 실제 중앙 검사 완료까지 보류했다.

정정 후 실제 CLI 반환값 `ok: true`와 성공 문구를 확인해 12개 검사를 통과했다. UTC Z 호환본 12개는 실행 순간과 소수 정밀도를 유지하며 run 0의 세 시각 필드만 바뀌었다. 이전 GitHub 첨부 원문도 로컬과 기존 NAS에 보존했다. 바꾼 Release 자산을 직접 내려받아 해시를 대조하고 실제 remote Release 검사도 통과했다. AIT 두 번째 CI 실행에서 before-build와 before-deploy가 실제 통과한 후 테스트 업로드에 성공했다. iOS는 App Review 제출 직전에 실제 before-release를 다시 실행했다.

정정 원본 및 실제 검증: `/Volumes/Data/Backup/agent-artifacts/crossword-puzzle/2026-10-27/5910893/central-verification-correction-20261026T151242Z/correction-ready-nas.json`. 이 검증 시점을 이미 끝난 서버 배포 전으로 소급하지 않는다.
