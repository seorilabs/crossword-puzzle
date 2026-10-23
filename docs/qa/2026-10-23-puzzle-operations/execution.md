# 이미지 보관과 알림 실행 기록

- 실행 티켓: [#434](https://github.com/seorilabs/crossword-puzzle/issues/434)
- 승인 설계와 테스트 계획: `5f4fd115d7fbcb6be88a71b76ccfc9cd6850acd9`의 `docs/design/2026-10-23-puzzle-operations`. 대화의 “설계 문서 승인했고”를 같은 폴더 approval.md에 기록했다.
- 등급과 범위: L1, 개발 환경 서비스 런타임, service 공개까지. 운영과 제품 변경은 별도 PR로 진행한다. 기기 사용 없음.
- 구현 순서: 삭제 후보와 보호 전이 테스트 실패 확인, 최소 정책과 전이 구현, 모의 gcloud로 실제 배포 CLI의 성공과 실패, 설정 복원을 실행한다. 모니터링 dry-run에서 00:40과 OPENED만 통지하는 정책을 확인한다.
- 격리: OS 임시 폴더의 가짜 gcloud와 Job 설정만 사용한다. 사용자 저장과 실제 Job은 바꾸지 않는다. 비밀값을 fixture에 넣지 않는다.
- 검증 명령: `npm run test:operations`, `npm run lint`, `npm run typecheck`, `npm run check:release-parity`, `npm run build`, `npm run check:mobile`. 기존 정적 CI가 나머지 회귀를 포함한다.

## 실제 운영 반영 전 조건

OPS-1부터 OPS-6의 원래 조건은 승인 설계와 실행 이슈에서 유지한다. 단위 및 CLI 실행은 정책과 복원 동작을 확인하지만 live readback을 대체하지 않는다. 현재 공개본은 `node server/batch/check-puzzle-pack-health.mjs`에서 PASS다. 등록된 `shared/gcp/provisioner-session`의 `seorilabs-provisioner@seorilabs-gws.iam.gserviceaccount.com`은 이 프로젝트의 `run.jobs.get`, `run.jobs.list`, `artifactregistry.repositories.get` 조회가 거부됐다. 따라서 실제 사용 이미지와 정책, 스케줄 및 알림의 전후 상태는 미검증이며 실제 변경과 삭제는 수행하지 않았다.

현재 Job과 서비스의 사용처, 초기 current 및 rollback의 digest, 패키지별 최신 두 개를 실제로 다시 대조하기 전에는 정리를 활성화하지 않는다. 기존 승인 대상은 이미 지정된 crossword-puzzle-79ae0, asia-northeast3, crossword-puzzle 저장소다. 최초 정리는 검토한 이미지 digest만 대상으로 한다. 권한 조회 실패를 빈 이미지 목록으로 처리하지 않는다. 청구 감소도 아직 확인하지 않았다.

최종 후보 SHA의 실행 JSON과 원본 로그는 소스 밖에서 작성하고 실제 NAS 검증 위치를 실행 이슈와 Obsidian에 연결한다. 소스 변경과 별개인 실행 기록을 만들려고 가짜 PASS나 상이한 SHA의 결과를 사용하지 않는다.
