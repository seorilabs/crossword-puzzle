#!/bin/sh

# Xcode Cloud — archive 직전 릴리즈 버전 설정.
#
# exact stable tag(vX.Y.Z) 트리거 빌드만 App Store archive를 허용하고,
# CFBundleShortVersionString에는 tag 자체의 X.Y.Z를 반영한다.
# 없으면 프로젝트 기본값(1.0)이 아카이브돼 App Store Connect 의 기존 버전 train 과
# 충돌해 TestFlight 업로드가 거부된다. (node 는 ci_post_clone 에서 설치됨.)

set -e

REPO="${CI_PRIMARY_REPOSITORY_PATH}"

if [ -z "${CI_TAG}" ]; then
  if [ "${CI_XCODEBUILD_ACTION:-}" = "archive" ]; then
    echo "CI_TAG가 없는 App Store archive는 허용하지 않습니다." >&2
    exit 1
  fi
  echo "▸ CI_TAG 없음 — 비 archive 검증 빌드"
  exit 0
fi

if ! printf '%s\n' "${CI_TAG}" | grep -Eq '^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'; then
  echo "stable SemVer 태그 vX.Y.Z만 허용합니다: ${CI_TAG}" >&2
  exit 1
fi

TAG_COMMIT="$(git -C "${REPO}" rev-parse --verify "refs/tags/${CI_TAG}^{commit}")" || {
  echo "체크아웃에서 exact tag commit을 확인할 수 없습니다: ${CI_TAG}" >&2
  exit 1
}
HEAD_COMMIT="$(git -C "${REPO}" rev-parse --verify 'HEAD^{commit}')"
if [ "${TAG_COMMIT}" != "${HEAD_COMMIT}" ]; then
  echo "Xcode Cloud HEAD가 exact tag commit과 다릅니다: tag=${TAG_COMMIT} HEAD=${HEAD_COMMIT}" >&2
  exit 1
fi

MARKETING="${CI_TAG#v}"
BUILD="${CI_BUILD_NUMBER:-}"

if [ -z "${MARKETING}" ] || [ -z "${BUILD}" ]; then
  echo "  릴리즈 버전 산출 실패 (tag=${CI_TAG})" >&2
  exit 1
fi

echo "  marketing=${MARKETING} build=${BUILD}"
if [ "${CI_PRE_XCODEBUILD_DRY_RUN:-}" = "1" ]; then
  echo "DRY_RUN resolved marketing=${MARKETING} build=${BUILD} tag=${CI_TAG}"
  exit 0
fi
cd "${REPO}/apps/mobile/ios"
agvtool new-marketing-version "${MARKETING}"
agvtool new-version -all "${BUILD}"
echo "✅ 버전 설정 완료: ${MARKETING} (${BUILD})"
