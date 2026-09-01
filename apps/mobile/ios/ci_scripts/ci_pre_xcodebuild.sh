#!/bin/sh

# exact stable tag의 중앙 release binding을 archive Info.plist에 주입한다.
set -eu

REPO="${CI_PRIMARY_REPOSITORY_PATH:?CI_PRIMARY_REPOSITORY_PATH is required}"
RELEASE_TAG="${CI_TAG:?exact stable CI_TAG is required}"
AUTHORITY_SHA="9afa357f9ba6c8d6a813c7cec7ad3d35c626bdd5"
APPLIER_SHA256="b399afde0016e23947e173437e266aa83071079d1345b41ff580ebfe63357d6f"
AUTHORITY_SHA256="ca9ef5b4fe326323840b171f9e6ed069cb182d2aee8e88b72e352c57514d466b"

authority_dir="$(mktemp -d)"
trap 'rm -rf -- "$authority_dir"' EXIT INT TERM
base_url="https://raw.githubusercontent.com/seorilabs/.github/${AUTHORITY_SHA}/scripts/release"
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  "${base_url}/xcode-cloud-apply-tag-version.mjs" \
  --output "${authority_dir}/xcode-cloud-apply-tag-version.mjs"
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  "${base_url}/tag-version-authority.mjs" \
  --output "${authority_dir}/tag-version-authority.mjs"
(
  cd "$authority_dir"
  printf '%s  %s\n' "$APPLIER_SHA256" xcode-cloud-apply-tag-version.mjs | shasum -a 256 -c
  printf '%s  %s\n' "$AUTHORITY_SHA256" tag-version-authority.mjs | shasum -a 256 -c
)

git -C "$REPO" fetch --force --tags origin >/dev/null 2>&1
node "${authority_dir}/xcode-cloud-apply-tag-version.mjs" \
  --tag "$RELEASE_TAG" \
  --repository "$REPO" \
  --info-plist "$REPO/apps/mobile/ios/CrosswordPuzzleMobile/Info.plist" \
  > "$REPO/apps/mobile/ios/.seori-release-binding.json"

echo "✅ 중앙 release version 주입 완료: ${RELEASE_TAG}"
