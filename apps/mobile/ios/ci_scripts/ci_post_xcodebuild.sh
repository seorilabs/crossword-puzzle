#!/bin/sh

# Xcode Cloud — archive 직후 산출물 검증.
#
# GitHub Actions에서 archive하던 시절 workflow가 하던 검증을 그대로 옮긴 것이다.
# 이 값들은 빌드 시점에 주입되므로(agvtool, react-native-google-mobile-ads의
# Info.plist 패치, GAME_CENTER_LEADERBOARD_ID 빌드 설정) 소스만 봐서는 실제
# 아카이브에 들어갔는지 알 수 없다. 잘못 올라가면 App Store Connect 처리나 광고·
# 리더보드 동작이 조용히 깨지므로 업로드 전에 여기서 막는다.

set -e

if [ "${CI_XCODEBUILD_ACTION}" != "archive" ]; then
  echo "▸ archive 액션이 아님 — 산출물 검증 생략(action=${CI_XCODEBUILD_ACTION:-none})"
  exit 0
fi

if [ -z "${CI_ARCHIVE_PATH}" ]; then
  echo "CI_ARCHIVE_PATH가 없어 아카이브를 검증할 수 없습니다." >&2
  exit 1
fi

REPO="${CI_PRIMARY_REPOSITORY_PATH}"
PLIST="${CI_ARCHIVE_PATH}/Products/Applications/CrosswordPuzzleMobile.app/Info.plist"

if [ ! -f "${PLIST}" ]; then
  echo "아카이브에서 Info.plist를 찾지 못했습니다: ${PLIST}" >&2
  exit 1
fi

read_plist() {
  /usr/libexec/PlistBuddy -c "Print :$1" "${PLIST}" 2>/dev/null || true
}

expect() {
  label="$1"
  actual="$2"
  expected="$3"

  if [ "${actual}" != "${expected}" ]; then
    echo "${label} 불일치: ${actual:-missing} != ${expected}" >&2
    exit 1
  fi
  echo "  ${label}: ${actual}"
}

echo "▸ 아카이브 산출물 검증"

# App Store archive는 exact stable tag/source binding이 확인된 경우만 허용한다.
if [ -z "${CI_TAG:-}" ] || ! printf '%s\n' "${CI_TAG}" | grep -Eq '^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'; then
  echo "archive 검증에는 exact stable CI_TAG가 필요합니다." >&2
  exit 1
fi
TAG_COMMIT="$(git -C "${REPO}" rev-parse --verify "refs/tags/${CI_TAG}^{commit}")" || exit 1
HEAD_COMMIT="$(git -C "${REPO}" rev-parse --verify 'HEAD^{commit}')"
expect "release source commit" "${HEAD_COMMIT}" "${TAG_COMMIT}"
expect "CFBundleShortVersionString" "$(read_plist CFBundleShortVersionString)" "${CI_TAG#v}"
expect "CFBundleVersion" "$(read_plist CFBundleVersion)" "${CI_BUILD_NUMBER}"

expect "GameCenterLeaderboardIdentifier" \
  "$(read_plist GameCenterLeaderboardIdentifier)" \
  "com.seorilabs.crosswordpuzzle.global_score"

EXPECTED_ADMOB_APP_ID="$(node --input-type=module -e "const c=JSON.parse(await import('node:fs').then(fs=>fs.readFileSync('${REPO}/app-store/app-store.config.json','utf8'))); console.log(c.adMob.appId)")"
expect "GADApplicationIdentifier" "$(read_plist GADApplicationIdentifier)" "${EXPECTED_ADMOB_APP_ID}"

expect "SKAdNetworkItems:0:SKAdNetworkIdentifier" \
  "$(read_plist SKAdNetworkItems:0:SKAdNetworkIdentifier)" \
  "cstr6suwn9.skadnetwork"

echo "✅ 아카이브 산출물 검증 완료"
