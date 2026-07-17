#!/bin/sh

# Xcode Cloud — crossword-puzzle(React Native, npm) iOS 빌드 사전 준비.
#
# 이 스크립트는 반드시 .xcworkspace 와 같은 디렉터리(apps/mobile/ios/ci_scripts/)에
# 있어야 하며, Xcode Cloud 가 저장소 클론 직후 자동 실행한다. Xcode Cloud 환경에는
# Node/CocoaPods 가 기본 제공되지 않으므로 여기서 설치하고 의존성 + Pods 를 구성한다.
# 코드 서명은 Xcode Cloud 매니지드 서명이 처리한다.
#
# 필수 환경변수: FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64 —
#   저장소에는 GoogleService-Info.plist 를 커밋하지 않고 이 값에서 복구한다.

set -e

export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1

REPO="${CI_PRIMARY_REPOSITORY_PATH}"
MOBILE="${REPO}/apps/mobile"
IOS="${MOBILE}/ios"

echo "▸ Node / CocoaPods 설치 (Homebrew)"
brew install node cocoapods

echo "▸ JS 의존성 설치 (npm ci — root + apps/mobile)"
npm --prefix "${REPO}" ci
npm --prefix "${MOBILE}" ci

echo "▸ iOS 내장 게임 번들 생성·검증"
npm --prefix "${REPO}" run build:game:mobile

echo "▸ Firebase iOS 설정 확인 (GoogleService-Info.plist)"
GS_PLIST="${IOS}/CrosswordPuzzleMobile/GoogleService-Info.plist"
cd "${REPO}"
node scripts/restore-mobile-firebase-config.mjs --ios --require
plutil -lint "${GS_PLIST}"
echo "  시크릿에서 복원·검증 완료"

echo "▸ CocoaPods 설치"
cd "${IOS}"
pod install

echo "✅ ci_post_clone 완료"
