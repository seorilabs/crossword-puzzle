#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

mode="all"
skip_upload="false"
use_suggested_urls="false"
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

api_key_json_path="${APP_STORE_CONNECT_API_KEY_JSON_PATH:-}"
temporary_dir=""
temporary_deliver_metadata_dir=""

cleanup() {
  if [[ -n "$temporary_dir" ]]; then
    rm -rf "$temporary_dir"
  fi
  if [[ -n "$temporary_deliver_metadata_dir" ]]; then
    rm -rf "$temporary_deliver_metadata_dir"
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
app_version="$(node --input-type=module -e "const c=JSON.parse(await import('node:fs').then(fs=>fs.readFileSync('app-store/app-store.config.json','utf8'))); console.log(c.version.marketingVersion)")"

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
