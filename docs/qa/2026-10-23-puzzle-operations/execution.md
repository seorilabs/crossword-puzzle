# 이미지 보관과 알림 실행 기록

- 실행 티켓: [#434](https://github.com/seorilabs/crossword-puzzle/issues/434)
- 승인 설계와 테스트 계획: `5f4fd115d7fbcb6be88a71b76ccfc9cd6850acd9`의 `docs/design/2026-10-23-puzzle-operations`. 대화의 “설계 문서 승인했고”를 같은 폴더 approval.md에 기록했다.
- 등급과 범위: L1, 개발 환경 서비스 런타임, service 공개까지. 운영과 제품 변경은 별도 PR로 진행한다. 기기 사용 없음.
- 구현 순서: 삭제 후보와 보호 전이 테스트 실패 확인, 최소 정책과 전이 구현, 모의 gcloud로 실제 배포 CLI의 성공과 실패, 설정 복원을 실행한다. 모니터링 dry-run에서 00:40과 OPENED만 통지하는 정책을 확인한다.
- 격리: OS 임시 폴더의 가짜 gcloud와 Job 설정만 사용한다. 사용자 저장과 실제 Job은 바꾸지 않는다. 비밀값을 fixture에 넣지 않는다.
- 검증 명령: `npm run test:operations`, `npm run lint`, `npm run typecheck`, `npm run check:release-parity`, `npm run build`, `npm run check:mobile`. 기존 정적 CI가 나머지 회귀를 포함한다.

## 2026-10-24 실제 운영 적용

프로젝트 `crossword-puzzle-79ae0`, 리전 `asia-northeast3`에서 기존 generator와 health Job을 최종 후보 `1cece06bb64e90ffba7b2406bccab6ac4baa84d6`의 이미지로 갱신했다. 이미지 외 환경 변수, 자원, 서비스 계정, 재시도와 시간 제한은 전후 대조로 보존을 확인했다. 실제 적용 계정은 사용자 로그인으로 확인한 `ih@seorilabs.com`이며 새 IAM이나 키를 만들지 않았다.

- `runtime-current`와 `latest`: `sha256:0cdc467ef51b6113ebf17681c8cd6bc2612b70297a88b66282b25865ec814cf0`.
- `runtime-rollback`: 기존 `sha256:6740fac75b9f0f73088180ca68a8bb7f72939477d70f382443a8937faa41f085`.
- 생성은 매일 00:05, health는 00:40, 시간대는 Asia/Seoul이다. 알림은 `OPENED`만 보내며 기존 1,800초 자동 닫기를 유지한다.
- 모든 태그의 14일 정리, 현재 및 복구 태그 보호, 패키지별 최신 2개 보호가 실제 활성화됐다. 적용 직전 15개 중 11개 정리 후보의 가상 크기는 6,632,816,264바이트다. 레지스트리의 비동기 삭제 완료와 실제 청구 감소는 확인 전이다.
- 10월 24일 자동 생성 `crossword-puzzle-pack-generator-dbrv5`는 7분 38초 뒤 성공했다. 공개 manifest와 실제 퍼즐 두 개를 내려받아 저장소 pack 검증기를 통과했다. 00:40 예약 health `crossword-puzzle-pack-health-4sg8n`도 성공했다.
- 세 클라이언트 공개 전에는 기존 복수 판을 유지한다. 오늘 공개본은 5×5 10단어, 8×8 19단어다. 단일 판 전환과 전날 23시 생성은 아직 적용하지 않았다.

최종 L3 서비스 검수와 운영 기록의 원본은 [출시 기록](../2026-10-23-single-daily-puzzle/release-status.md)의 NAS 검증 위치를 따른다. 아래는 초기 권한 조회 실패와 개발 검수 이력이며 현재 미적용 상태를 뜻하지 않는다.

## 초기 개발 검수 당시 상태

OPS-1부터 OPS-6의 원래 조건은 승인 설계와 실행 이슈에서 유지한다. 단위 및 CLI 실행은 정책과 복원 동작을 확인하지만 live readback을 대체하지 않는다. 현재 공개본은 `node server/batch/check-puzzle-pack-health.mjs`에서 PASS다. 등록된 `shared/gcp/provisioner-session`의 `seorilabs-provisioner@seorilabs-gws.iam.gserviceaccount.com`은 이 프로젝트의 `run.jobs.get`, `run.jobs.list`, `artifactregistry.repositories.get` 조회가 거부됐다. 따라서 실제 사용 이미지와 정책, 스케줄 및 알림의 전후 상태는 미검증이며 실제 변경과 삭제는 수행하지 않았다.

현재 Job과 서비스의 사용처, 초기 current 및 rollback의 digest, 패키지별 최신 두 개를 실제로 다시 대조하기 전에는 정리를 활성화하지 않는다. 기존 승인 대상은 이미 지정된 crossword-puzzle-79ae0, asia-northeast3, crossword-puzzle 저장소다. 최초 정리는 검토한 이미지 digest만 대상으로 한다. 권한 조회 실패를 빈 이미지 목록으로 처리하지 않는다. 청구 감소도 아직 확인하지 않았다.

최종 후보 SHA의 실행 JSON과 원본 로그는 소스 밖에서 작성하고 실제 NAS 검증 위치를 실행 이슈와 Obsidian에 연결한다. 소스 변경과 별개인 실행 기록을 만들려고 가짜 PASS나 상이한 SHA의 결과를 사용하지 않는다.

## 코드 검토 후 보완

기존 Job을 빌드 없이 다시 배포하는 경로를 macOS 기본 Bash에서도 실행했다. 미리보기는 원본 이미지 파일 대신 저장소를 직접 조회하며 `--include-tags`를 강제한다. 실제 CLI와 외부 명령 경계만 대체한 12개 검증에서 사용 중인 이미지와 비활성 rollback 보호, 배포 실패 후 설정 및 태그 복원, 00:40 점검과 OPENED 알림을 확인했다. 실제 운영 권한 문제와 미반영 상태는 그대로 남는다.
