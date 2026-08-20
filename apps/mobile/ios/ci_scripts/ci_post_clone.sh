#!/bin/sh

# Xcode Cloud — crossword-puzzle(React Native, npm) iOS 빌드 사전 준비.
#
# 이 스크립트는 반드시 .xcworkspace 와 같은 디렉터리(apps/mobile/ios/ci_scripts/)에
# 있어야 하며, Xcode Cloud 가 저장소 클론 직후 자동 실행한다. Xcode Cloud 환경에는
# Node/CocoaPods 가 기본 제공되지 않으므로 여기서 설치하고 의존성 + Pods 를 구성한다.
# 코드 서명은 Xcode Cloud 매니지드 서명이 처리한다.
#
# 필요 환경변수(Xcode Cloud workflow의 Secret):
#   GITHUB_PACKAGES_TOKEN — (필수) GitHub Packages read:packages token.
#   FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64 — (선택)
#     미설정 시 저장소에 커밋된 GoogleService-Info.plist 를 사용한다.

set -e

export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1

REPO="${CI_PRIMARY_REPOSITORY_PATH}"
MOBILE="${REPO}/apps/mobile"
IOS="${MOBILE}/ios"

echo "▸ Node / CocoaPods 설치 (Homebrew)"
brew install node cocoapods

echo "▸ GitHub Packages 인증 (@seorilabs 비공개 패키지)"
if [ -z "${GITHUB_PACKAGES_TOKEN}" ]; then
  echo "❌ GITHUB_PACKAGES_TOKEN 이 없습니다. Xcode Cloud workflow의 Secret으로" >&2
  echo "   read:packages token을 추가하세요. 없으면 npm ci가 실패합니다." >&2
  exit 1
fi
printf '//npm.pkg.github.com/:_authToken=%s\n' "${GITHUB_PACKAGES_TOKEN}" >> "${HOME}/.npmrc"

echo "▸ JS 의존성 설치 (npm ci — root + apps/mobile)"
npm --prefix "${REPO}" ci
npm --prefix "${MOBILE}" ci

echo "▸ Firebase iOS 설정 확인 (GoogleService-Info.plist)"
GS_PLIST="${IOS}/CrosswordPuzzleMobile/GoogleService-Info.plist"
if [ -n "${FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64}" ]; then
  printf '%s' "${FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64}" | base64 --decode > "${GS_PLIST}"
  plutil -lint "${GS_PLIST}"
  echo "  시크릿에서 복원"
elif [ -f "${GS_PLIST}" ]; then
  echo "  저장소 커밋본 사용"
else
  echo "  경고: GoogleService-Info.plist 없음(시크릿 미설정 + 미커밋)" >&2
fi

echo "▸ CocoaPods 설치"
cd "${IOS}"
pod install

echo "✅ ci_post_clone 완료"
