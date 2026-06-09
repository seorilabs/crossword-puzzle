# 릴리즈 버저닝

## 정책

- `main`에 push되면 `CI`가 `lint`, `validate:puzzles`를 수행한다. AIT 빌드는 CI에서 제외하고 배포 workflow에서만 수행한다.
- `CI`가 성공한 push commit에만 `Release Tag` workflow가 semver 태그를 만든다.
- 자동 태그는 항상 patch 증가다. 예: `v0.1.1` -> `v0.1.2`.
- minor/major 증가는 `Release Tag` workflow를 수동 실행할 때만 선택한다.
- 태그 생성 이후 실제 배포는 자동으로 트리거하지 않는다. `Deploy All`(묶음) 또는 개별 `Deploy *` workflow를 수동 실행한다.
- 기존 `crossword-puzzle-release-*` 태그는 보존하되, 새 버전 계산에서는 제외한다.
- semver 태그가 아직 없으면 `package.json`의 `version`을 기준으로 첫 patch 태그를 만든다.

```mermaid
flowchart LR
  Push["main push"] --> CI["CI (lint, validate:puzzles)"]
  CI -->|success| Tag["Release Tag (patch 자동)"]
  Tag --> Semver["vX.Y.Z tag"]
  Semver --> DeployAll["Deploy All (수동)"]
  DeployAll --> AIT["Deploy AIT"]
  DeployAll --> Play["Deploy Google Play"]
  DeployAll --> Store["Deploy App Store"]
```

## 수동 minor/major 태그

```bash
gh workflow run release-tag.yml \
  -f bump=minor \
  -f target_ref=main
```

`bump=major`도 같은 방식으로 실행한다.

## Deploy All (묶음 배포)

`Deploy All` workflow는 `release_tag` 하나로 세 배포(`Deploy AIT`, `Deploy Google Play`, `Deploy App Store`)를 `workflow_call`로 한 번에 트리거한다. 각 배포는 토글로 켜고 끌 수 있다.

```bash
gh workflow run deploy-all.yml \
  -f release_tag=v0.1.1 \
  -f deploy_ait=true \
  -f deploy_google_play=true \
  -f deploy_app_store=true \
  -f memo="릴리즈 v0.1.1"
```

## AIT

`Deploy AIT` workflow는 전달받은 `release_tag`를 checkout하고 다음 값을 빌드/업로드에 사용한다.

- `npm version --no-git-tag-version <version>`
- `VITE_APP_VERSION=<version>`
- `VITE_RELEASE_TAG=<tag>`
- AppsInToss deploy memo: `<tag> · <memo>` 또는 `릴리즈 <tag> (<sha>)`

개별 재배포:

```bash
gh workflow run deploy-apps-in-toss.yml \
  -f release_tag=v0.1.1 \
  -f memo="릴리즈 v0.1.1 재배포"
```

## Google Play

`Deploy Google Play` workflow는 `release_tag`를 받으면 Android 빌드 버전을 해당 태그에서 계산한다.

- `versionName`: `v`를 뺀 semver. 예: `0.1.1`
- `versionCode`: `major * 1000000 + minor * 1000 + patch`. 예: `v0.1.1` -> `1001`
- Android Publisher API release name: 태그 문자열. 예: `v0.1.1`

업로드까지 실행할 때는 `release_tag`가 필수다.

```bash
gh workflow run deploy-google-play.yml \
  -f release_tag=v0.1.1 \
  -f upload_to_internal=true \
  -f release_status=draft
```

## App Store

`Deploy App Store` workflow는 `release_tag`를 checkout해 iOS archive를 만들고, `upload_to_testflight=true`이면 App Store Connect/TestFlight에 업로드한다.

```bash
gh workflow run deploy-app-store.yml \
  -f release_tag=v0.1.1 \
  -f upload_to_testflight=true
```
