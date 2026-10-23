# 공개 저장소 Google Play 러너 분기

공개 앱 저장소의 v1.2.0 실행 39971839829는 public 사용을 허용하지 않는 사내 ARC 러너에서 대기한다. 조직 그룹의 실제 허용값과 최신 global-versions.yaml 및 workflow-routing.md가 같은 제한을 명시한다.

사용자가 /tmp/crossword-implementation-20261023.HQoMZH/release-preparation/play-runner-routing-proposal.md에 “러너 분기 보완 후 진행”을 승인했다. [실행 이슈 #443](https://github.com/seorilabs/crossword-puzzle/issues/443)을 따른다.

build-aab와 upload의 runs-on 두 항목을 github.event.repository.private 조건으로 분기한다. public은 ubuntu-latest, private은 기존 seorilabs-x64를 사용한다. Cloud Build 서명, exact tag checkout, 원장 번호와 Secret 환경은 유지한다. 앱 코드와 v1.2.0 태그, 클러스터 권한과 예산 및 키는 바꾸지 않는다.

AC-1 두 작업의 public 경로는 ubuntu-latest다. AC-2 private 경로는 기존 ARC다. AC-3 태그 source와 원장, 서명 및 Secret 범위가 보존된다. 실제 workflow 식을 두 조건에서 해석하는 Node 회귀를 먼저 실패시키고 최소 변경 뒤 통과시킨다. 기존 test:operations에 해당 테스트를 연결한다. check:release-parity의 기존 ARC 고정 문자열도 승인된 분기식 검사로 맞추고 YAML 및 actionlint와 전체 CI를 확인한다. L1 개발 환경이며 실제 Android SDK와 기기 실행은 이 검사에 포함하지 않는다. 사용자 화면과 데이터 변경은 없다.

로컬 코드 리뷰와 required check 뒤 PR로 병합한다. 이전 실행이 여전히 시작 전인지 확인해 취소하고 같은 v1.2.0으로 새 dispatch를 한다. 앱 source는 1cece06bb64e90ffba7b2406bccab6ac4baa84d6을 유지한다. 실패하면 실제 단계와 원본을 보존해 정지 조건을 판단한다. 복구는 두 runs-on을 되돌리는 PR이다. 이 계획은 파이프라인 PR 병합까지이며 기존 앱의 공개 출시 승인은 별개로 유지한다.
