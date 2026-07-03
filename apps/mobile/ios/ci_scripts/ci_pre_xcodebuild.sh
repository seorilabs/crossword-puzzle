#!/bin/sh

# Xcode Cloud — archive 직전 릴리즈 버전 설정.
#
# 태그(vX.Y.Z) 트리거 빌드일 때 scripts/resolve-release-version.mjs 로
# CFBundleShortVersionString(marketing)/CFBundleVersion(build)을 산출해 반영한다.
# 없으면 프로젝트 기본값(1.0)이 아카이브돼 App Store Connect 의 기존 버전 train 과
# 충돌해 TestFlight 업로드가 거부된다. (node 는 ci_post_clone 에서 설치됨.)

set -e

REPO="${CI_PRIMARY_REPOSITORY_PATH}"

if [ -z "${CI_TAG}" ]; then
  echo "▸ CI_TAG 없음 — 릴리즈 버전 조정 생략(브랜치/검증 빌드)"
  exit 0
fi

echo "▸ 릴리즈 버전 산출 (tag=${CI_TAG})"
OUTFILE="$(mktemp)"
# resolve-release-version.mjs 는 GITHUB_OUTPUT 이 설정돼 있으면 key=value 를 그 파일에 쓴다.
GITHUB_OUTPUT="${OUTFILE}" node "${REPO}/scripts/resolve-release-version.mjs" --tag "${CI_TAG}"

MARKETING="$(grep '^apple_marketing_version=' "${OUTFILE}" | cut -d= -f2)"
BUILD="$(grep '^apple_build_number=' "${OUTFILE}" | cut -d= -f2)"

if [ -z "${MARKETING}" ] || [ -z "${BUILD}" ]; then
  echo "  릴리즈 버전 산출 실패 (tag=${CI_TAG})" >&2
  exit 1
fi

echo "  marketing=${MARKETING} build=${BUILD}"
cd "${REPO}/apps/mobile/ios"
agvtool new-marketing-version "${MARKETING}"
agvtool new-version -all "${BUILD}"
echo "✅ 버전 설정 완료: ${MARKETING} (${BUILD})"
