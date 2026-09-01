#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

mode="all"
skip_upload="false"
use_suggested_urls="false"
release_tag=""
deliver_args=()
prepare_args=()

usage() {
  cat <<'EOF'
Usage: scripts/app-store-local-deliver.sh [options]

Options:
  --metadata-only       App Store metadata만 업로드합니다.
  --screenshots-only    screenshot만 업로드합니다.
  --skip-app-name       metadata 업로드에서 App Store 앱 이름을 제외합니다.
  --skip-upload         deliver 입력 파일만 생성하고 App Store Connect 업로드는 건너뜁니다.
  --tag vX.Y.Z          현재 HEAD를 가리키는 exact stable 태그를 metadata 대상 버전으로 사용합니다.
  --use-suggested-urls  config의 suggestedSupportUrl/suggestedPrivacyPolicyUrl을 deliver에 포함합니다.
  --                    뒤 인자는 fastlane deliver에 그대로 전달합니다.

Required for upload:
  APP_STORE_CONNECT_API_KEY_JSON_PATH
    or
  APP_STORE_CONNECT_API_KEY_ID
  APP_STORE_CONNECT_ISSUER_ID
  APP_STORE_CONNECT_PRIVATE_KEY_BASE64 or APP_STORE_CONNECT_PRIVATE_KEY_PATH
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --metadata-only)
      mode="metadata"
      prepare_args+=("--metadata-only")
      shift
      ;;
    --screenshots-only)
      mode="screenshots"
      prepare_args+=("--screenshots-only")
      shift
      ;;
    --skip-app-name)
      prepare_args+=("--skip-app-name")
      shift
      ;;
    --skip-upload|--prepare-only)
      skip_upload="true"
      shift
      ;;
    --use-suggested-urls)
      use_suggested_urls="true"
      prepare_args+=("--use-suggested-urls")
      shift
      ;;
    --tag)
      release_tag="${2:-}"
      shift 2
      ;;
    --tag=*)
      release_tag="${1#--tag=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      deliver_args+=("$@")
      break
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

node scripts/prepare-app-store-deliver-assets.mjs "${prepare_args[@]}"

if [[ "$skip_upload" == "true" ]]; then
  echo "Prepared App Store deliver assets under app-store/deliver."
  exit 0
fi

if [[ -z "$release_tag" ]]; then
  echo "App Store Connect 업로드에는 현재 HEAD를 가리키는 --tag vX.Y.Z가 필요합니다." >&2
  exit 1
fi

api_key_json_path="${APP_STORE_CONNECT_API_KEY_JSON_PATH:-}"
temporary_dir=""
temporary_deliver_metadata_dir=""
authority_dir=""

cleanup() {
  if [[ -n "$temporary_dir" ]]; then
    rm -rf "$temporary_dir"
  fi
  if [[ -n "$temporary_deliver_metadata_dir" ]]; then
    rm -rf "$temporary_deliver_metadata_dir"
  fi
  if [[ -n "$authority_dir" ]]; then
    rm -rf "$authority_dir"
  fi
}
trap cleanup EXIT

if [[ -z "$api_key_json_path" ]]; then
  if [[ -z "${APP_STORE_CONNECT_API_KEY_ID:-}" || -z "${APP_STORE_CONNECT_ISSUER_ID:-}" ]]; then
    echo "APP_STORE_CONNECT_API_KEY_ID and APP_STORE_CONNECT_ISSUER_ID are required." >&2
    exit 1
  fi
  if [[ -z "${APP_STORE_CONNECT_PRIVATE_KEY_BASE64:-}" && -z "${APP_STORE_CONNECT_PRIVATE_KEY_PATH:-}" ]]; then
    echo "APP_STORE_CONNECT_PRIVATE_KEY_BASE64 or APP_STORE_CONNECT_PRIVATE_KEY_PATH is required." >&2
    exit 1
  fi

  temporary_dir="$(mktemp -d)"
  api_key_json_path="$temporary_dir/app-store-connect-api-key.json"
  API_KEY_JSON_OUT="$api_key_json_path" node --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const key =
  process.env.APP_STORE_CONNECT_PRIVATE_KEY_BASE64 != null &&
  process.env.APP_STORE_CONNECT_PRIVATE_KEY_BASE64.trim() !== ""
    ? Buffer.from(
        process.env.APP_STORE_CONNECT_PRIVATE_KEY_BASE64.trim(),
        "base64",
      ).toString("utf8")
    : readFileSync(process.env.APP_STORE_CONNECT_PRIVATE_KEY_PATH, "utf8");

writeFileSync(
  process.env.API_KEY_JSON_OUT,
  JSON.stringify(
    {
      key_id: process.env.APP_STORE_CONNECT_API_KEY_ID,
      issuer_id: process.env.APP_STORE_CONNECT_ISSUER_ID,
      key,
      duration: 1200,
      in_house: false,
    },
    null,
    2,
  ),
);
NODE
fi

if [[ ! -f "$api_key_json_path" ]]; then
  echo "App Store Connect API key JSON not found: $api_key_json_path" >&2
  exit 1
fi

app_identifier="$(node --input-type=module -e "const c=JSON.parse(await import('node:fs').then(fs=>fs.readFileSync('app-store/app-store.config.json','utf8'))); console.log(c.bundleId)")"

AUTHORITY_SHA="9afa357f9ba6c8d6a813c7cec7ad3d35c626bdd5"
AUTHORITY_SHA256="ca9ef5b4fe326323840b171f9e6ed069cb182d2aee8e88b72e352c57514d466b"
authority_dir="$(mktemp -d)"
authority_path="$authority_dir/tag-version-authority.mjs"
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  "https://raw.githubusercontent.com/seorilabs/.github/${AUTHORITY_SHA}/scripts/release/tag-version-authority.mjs" \
  --output "$authority_path"
(
  cd "$authority_dir"
  printf '%s  %s\n' "$AUTHORITY_SHA256" tag-version-authority.mjs | shasum -a 256 -c
)

git fetch --force --tags origin >/dev/null 2>&1
head_sha="$(git rev-parse HEAD)"
tag_sha="$(git rev-parse "${release_tag}^{commit}" 2>/dev/null || true)"
if [[ "$tag_sha" != "$head_sha" ]]; then
  echo "release tag가 현재 HEAD를 가리키지 않습니다: ${release_tag}=${tag_sha:-missing}, HEAD=${head_sha}" >&2
  exit 1
fi

app_version="$(node --input-type=module - "$authority_path" "$release_tag" <<'NODE'
import { pathToFileURL } from "node:url";

const authority = await import(pathToFileURL(process.argv[2]));
console.log(authority.deriveReleaseVersion(process.argv[3]).appleMarketingVersion);
NODE
)"

fastlane_deliver_args=(
  deliver
  run
  --api_key_path "$api_key_json_path"
  --app_identifier "$app_identifier"
  --app_version "$app_version"
  --platform ios
  --metadata_path "$repo_root/app-store/deliver/metadata"
  --screenshots_path "$repo_root/app-store/deliver/screenshots"
  --skip_binary_upload true
  --skip_app_version_update false
  --force true
  --run_precheck_before_submit false
)

case "$mode" in
  metadata)
    fastlane_deliver_args+=(--skip_screenshots true)
    ;;
  screenshots)
    fastlane_deliver_args+=(--skip_metadata true --overwrite_screenshots true)
    ;;
  all)
    fastlane_deliver_args+=(--overwrite_screenshots true)
    ;;
esac

if [[ "$use_suggested_urls" == "true" ]]; then
  echo "Using suggested support/privacy URLs from app-store/app-store.config.json."
fi

cd apps/mobile
bundle check >/dev/null 2>&1 || bundle install
if [[ ! -d metadata ]]; then
  temporary_deliver_metadata_dir="$PWD/metadata"
  mkdir -p "$temporary_deliver_metadata_dir"
fi
bundle exec fastlane "${fastlane_deliver_args[@]}" ${deliver_args:+"${deliver_args[@]}"}
