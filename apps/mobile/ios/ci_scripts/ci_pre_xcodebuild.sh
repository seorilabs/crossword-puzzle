#!/bin/sh

# exact stable tag의 중앙 release binding을 archive Info.plist에 주입한다.
set -eu

REPO="${CI_PRIMARY_REPOSITORY_PATH:?CI_PRIMARY_REPOSITORY_PATH is required}"
RELEASE_TAG="${CI_TAG:?exact stable CI_TAG is required}"
CLOUD_BUILD_NUMBER="${CI_BUILD_NUMBER:-}"
# Apple build number 정본을 Xcode Cloud의 CI_BUILD_NUMBER로 옮기고, 심볼릭 링크 경로에서
# 조용히 exit 0 하던 fail-open을 고친 중앙 commit이다. 계약은 seorilabs/.github
# contracts/release-version-authority.yaml schemaVersion 2의 appleBuildNumberExceptions다.
AUTHORITY_SHA="6db01149a7700c0557bbeaf2e045aac7df0e78f2"
APPLIER_SHA256="1da1dce81a5194a37f7a31475c29d899d95eb6da9ae1460927fe439aa329752c"
AUTHORITY_SHA256="ca9ef5b4fe326323840b171f9e6ed069cb182d2aee8e88b72e352c57514d466b"

printf '%s\n' "$RELEASE_TAG" | grep -Eq '^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' \
  || { echo "exact stable SemVer CI_TAG가 필요합니다: $RELEASE_TAG" >&2; exit 1; }

# Apple build number의 정본은 Xcode Cloud가 발급한 CI_BUILD_NUMBER다. 빈 값, 0, leading zero,
# 비정수는 archive를 시작하기 전에 끊는다.
case "$CLOUD_BUILD_NUMBER" in
  ''|*[!0-9]*|0*)
    echo "Xcode Cloud CI_BUILD_NUMBER는 1 이상의 정수여야 합니다: ${CLOUD_BUILD_NUMBER:-missing}" >&2
    exit 1
    ;;
esac

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

git -C "$REPO" fetch --force --tags origin >/dev/null
node "${authority_dir}/xcode-cloud-apply-tag-version.mjs" \
  --tag "$RELEASE_TAG" \
  --repository "$REPO" \
  --info-plist "$REPO/apps/mobile/ios/CrosswordPuzzleMobile/Info.plist" \
  > "$REPO/apps/mobile/ios/.seori-release-binding.json"

# 중앙 binding이 태그 파생 encodedVersion을 돌려주면 pin이 낡은 것이다. 그대로 archive하면
# post-build가 CFBundleVersion 대조에서 막으므로 여기서 먼저 끊는다.
binding_build_number="$(node -e 'process.stdout.write(String(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).appleBuildNumber ?? ""))' \
  "$REPO/apps/mobile/ios/.seori-release-binding.json")"
if [ "$binding_build_number" != "$CLOUD_BUILD_NUMBER" ]; then
  echo "중앙 release binding이 Xcode Cloud build number를 반영하지 않았습니다: binding=${binding_build_number:-empty} CI_BUILD_NUMBER=${CLOUD_BUILD_NUMBER}. pin된 AUTHORITY_SHA와 APPLIER_SHA256을 갱신하세요." >&2
  exit 1
fi

echo "✅ 중앙 release version 주입 완료: ${RELEASE_TAG} (Apple build ${CLOUD_BUILD_NUMBER})"
