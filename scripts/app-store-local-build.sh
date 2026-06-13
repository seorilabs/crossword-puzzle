#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

mode="unsigned"
tag=""
marketing_version=""
build_number=""
install_deps="false"
skip_pods="false"
export_upload="false"
archive_path=""

usage() {
  cat <<'EOF'
Usage: scripts/app-store-local-build.sh [options]

Default:
  unsigned Release build를 로컬에서 수행합니다.

Options:
  --archive             Apple Distribution signed archive를 생성합니다.
  --export-upload       --archive 후 App Store Connect로 export/upload합니다.
  --tag vX.Y.Z          MARKETING_VERSION=X.Y.Z, build=major*1000000+minor*1000+patch
  --marketing-version X 직접 MARKETING_VERSION을 지정합니다.
  --build-number N      직접 CURRENT_PROJECT_VERSION을 지정합니다.
  --archive-path PATH   archive 출력 경로를 지정합니다.
  --install-deps        npm ci / npm ci --prefix apps/mobile을 먼저 실행합니다.
  --skip-pods           bundle install / pod install을 건너뜁니다.

Signing env for --archive:
  APPLE_TEAM_ID
  IOS_PROVISIONING_PROFILE_NAME
  Optional: APPLE_DISTRIBUTION_CERTIFICATE_BASE64, APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD,
            APPLE_PROVISIONING_PROFILE_BASE64, APPLE_KEYCHAIN_PASSWORD

Upload env for --export-upload:
  APP_STORE_CONNECT_API_KEY_ID
  APP_STORE_CONNECT_ISSUER_ID
  APP_STORE_CONNECT_PRIVATE_KEY_BASE64 or APP_STORE_CONNECT_PRIVATE_KEY_PATH
  If present, ~/.config/seorilabs/app-store-connect.env is loaded automatically.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --archive)
      mode="archive"
      shift
      ;;
    --export-upload)
      mode="archive"
      export_upload="true"
      shift
      ;;
    --tag)
      tag="${2:-}"
      shift 2
      ;;
    --tag=*)
      tag="${1#--tag=}"
      shift
      ;;
    --marketing-version)
      marketing_version="${2:-}"
      shift 2
      ;;
    --marketing-version=*)
      marketing_version="${1#--marketing-version=}"
      shift
      ;;
    --build-number)
      build_number="${2:-}"
      shift 2
      ;;
    --build-number=*)
      build_number="${1#--build-number=}"
      shift
      ;;
    --archive-path)
      archive_path="${2:-}"
      shift 2
      ;;
    --archive-path=*)
      archive_path="${1#--archive-path=}"
      shift
      ;;
    --install-deps)
      install_deps="true"
      shift
      ;;
    --skip-pods)
      skip_pods="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

read_config() {
  node --input-type=module -e "const c=JSON.parse(await import('node:fs').then(fs=>fs.readFileSync('app-store/app-store.config.json','utf8'))); console.log($1)"
}

workspace="$(read_config 'c.ios.workspace')"
scheme="$(read_config 'c.ios.scheme')"
bundle_id="$(read_config 'c.bundleId')"
config_team_id="$(read_config 'c.ios.teamId')"
config_profile_name="$(read_config 'c.ios.provisioningProfileSpecifier')"

app_store_connect_env="$HOME/.config/seorilabs/app-store-connect.env"
if [[ -f "$app_store_connect_env" ]] && {
  [[ -z "${APP_STORE_CONNECT_API_KEY_ID:-}" ]] ||
    [[ -z "${APP_STORE_CONNECT_ISSUER_ID:-}" ]] ||
    {
      [[ -z "${APP_STORE_CONNECT_PRIVATE_KEY_BASE64:-}" ]] &&
        [[ -z "${APP_STORE_CONNECT_PRIVATE_KEY_PATH:-}" ]]
    }
}; then
  # shellcheck disable=SC1090
  source "$app_store_connect_env"
fi

if [[ -n "$tag" ]]; then
  version_values="$(TAG="$tag" node --input-type=module <<'NODE'
const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(process.env.TAG);
if (match == null) {
  throw new Error(`release tag must match vX.Y.Z. Received: ${process.env.TAG}`);
}
const major = Number(match[1]);
const minor = Number(match[2]);
const patch = Number(match[3]);
console.log(`${major}.${minor}.${patch} ${Math.max(major * 1000000 + minor * 1000 + patch, 1)}`);
NODE
)"
  marketing_version="${version_values%% *}"
  build_number="${version_values##* }"
fi

if [[ -z "$marketing_version" ]]; then
  marketing_version="$(node --input-type=module -e "const p=JSON.parse(await import('node:fs').then(fs=>fs.readFileSync('package.json','utf8'))); console.log(p.version)")"
fi

if [[ -z "$build_number" ]]; then
  build_number="$(VERSION="$marketing_version" node --input-type=module <<'NODE'
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(process.env.VERSION);
if (match == null) {
  throw new Error(`MARKETING_VERSION must match X.Y.Z. Received: ${process.env.VERSION}`);
}
const major = Number(match[1]);
const minor = Number(match[2]);
const patch = Number(match[3]);
console.log(Math.max(major * 1000000 + minor * 1000 + patch, 1));
NODE
)"
fi

if [[ -n "${FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64:-}" ]]; then
  node scripts/restore-mobile-firebase-config.mjs --ios --require
fi

if [[ "$install_deps" == "true" ]]; then
  npm ci
  npm ci --prefix apps/mobile
fi

if [[ "$skip_pods" != "true" ]]; then
  (
    cd apps/mobile
    bundle check >/dev/null 2>&1 || bundle install
    bundle exec pod install --project-directory=ios
  )
fi

if [[ "$mode" == "unsigned" ]]; then
  xcodebuild \
    -workspace "$workspace" \
    -scheme "$scheme" \
    -configuration Release \
    -destination 'generic/platform=iOS' \
    -derivedDataPath "$repo_root/tmp/xcode-derived-data" \
    CODE_SIGNING_ALLOWED=NO \
    build
  exit 0
fi

team_id="${APPLE_TEAM_ID:-$config_team_id}"
profile_name="${IOS_PROVISIONING_PROFILE_NAME:-$config_profile_name}"
temporary_dir=""
keychain_path=""
api_key_path=""

cleanup() {
  if [[ -n "$temporary_dir" ]]; then
    rm -rf "$temporary_dir"
  fi
}
trap cleanup EXIT

prepare_app_store_connect_api_key() {
  if [[ -n "$api_key_path" ]]; then
    return
  fi

  for var_name in APP_STORE_CONNECT_API_KEY_ID APP_STORE_CONNECT_ISSUER_ID; do
    if [[ -z "${!var_name:-}" ]]; then
      echo "$var_name is required for App Store Connect API authentication." >&2
      exit 1
    fi
  done

  if [[ -z "${APP_STORE_CONNECT_PRIVATE_KEY_BASE64:-}" && -z "${APP_STORE_CONNECT_PRIVATE_KEY_PATH:-}" ]]; then
    echo "APP_STORE_CONNECT_PRIVATE_KEY_BASE64 or APP_STORE_CONNECT_PRIVATE_KEY_PATH is required for App Store Connect API authentication." >&2
    exit 1
  fi

  if [[ -z "$temporary_dir" ]]; then
    temporary_dir="$(mktemp -d)"
  fi

  api_key_path="$temporary_dir/AuthKey_${APP_STORE_CONNECT_API_KEY_ID}.p8"
  if [[ -n "${APP_STORE_CONNECT_PRIVATE_KEY_BASE64:-}" ]]; then
    printf '%s' "$APP_STORE_CONNECT_PRIVATE_KEY_BASE64" | base64 --decode > "$api_key_path" 2>/dev/null || \
      printf '%s' "$APP_STORE_CONNECT_PRIVATE_KEY_BASE64" | base64 -D > "$api_key_path"
  else
    cp "$APP_STORE_CONNECT_PRIVATE_KEY_PATH" "$api_key_path"
  fi
  chmod 600 "$api_key_path"
}

if [[ -z "$team_id" || -z "$profile_name" ]]; then
  echo "APPLE_TEAM_ID and IOS_PROVISIONING_PROFILE_NAME are required for --archive." >&2
  exit 1
fi

if [[ -z "$archive_path" ]]; then
  archive_path="$repo_root/tmp/CrosswordPuzzleMobile-v${marketing_version}-build${build_number}.xcarchive"
fi
mkdir -p "$(dirname "$archive_path")"

if [[ -n "${APPLE_DISTRIBUTION_CERTIFICATE_BASE64:-}" || -n "${APPLE_PROVISIONING_PROFILE_BASE64:-}" ]]; then
  for var_name in APPLE_DISTRIBUTION_CERTIFICATE_BASE64 APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD APPLE_PROVISIONING_PROFILE_BASE64 APPLE_KEYCHAIN_PASSWORD; do
    if [[ -z "${!var_name:-}" ]]; then
      echo "$var_name is required when restoring signing assets from env." >&2
      exit 1
    fi
  done

  temporary_dir="$(mktemp -d)"
  keychain_path="$temporary_dir/app-store-signing.keychain-db"
  certificate_path="$temporary_dir/apple-distribution.p12"
  profile_path="$temporary_dir/app-store.mobileprovision"
  profile_plist="$temporary_dir/app-store-profile.plist"

  printf '%s' "$APPLE_DISTRIBUTION_CERTIFICATE_BASE64" | base64 --decode > "$certificate_path" 2>/dev/null || \
    printf '%s' "$APPLE_DISTRIBUTION_CERTIFICATE_BASE64" | base64 -D > "$certificate_path"
  printf '%s' "$APPLE_PROVISIONING_PROFILE_BASE64" | base64 --decode > "$profile_path" 2>/dev/null || \
    printf '%s' "$APPLE_PROVISIONING_PROFILE_BASE64" | base64 -D > "$profile_path"

  security create-keychain -p "$APPLE_KEYCHAIN_PASSWORD" "$keychain_path"
  security set-keychain-settings -lut 21600 "$keychain_path"
  security unlock-keychain -p "$APPLE_KEYCHAIN_PASSWORD" "$keychain_path"
  security import "$certificate_path" -P "$APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD" -A -t cert -f pkcs12 -k "$keychain_path"
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$APPLE_KEYCHAIN_PASSWORD" "$keychain_path"
  security list-keychains -d user -s "$keychain_path" $(security list-keychains -d user | sed 's/[ "]//g')

  security cms -D -i "$profile_path" > "$profile_plist"
  profile_uuid="$(plutil -extract UUID raw -o - "$profile_plist")"
  profile_name="$(plutil -extract Name raw -o - "$profile_plist")"
  profiles_dir="$HOME/Library/MobileDevice/Provisioning Profiles"
  mkdir -p "$profiles_dir"
  cp "$profile_path" "$profiles_dir/$profile_uuid.mobileprovision"
fi

code_sign_flags=()
if [[ -n "$keychain_path" ]]; then
  code_sign_flags+=(OTHER_CODE_SIGN_FLAGS="--keychain $keychain_path")
fi

archive_auth_flags=()
if [[ -n "${APP_STORE_CONNECT_API_KEY_ID:-}" || -n "${APP_STORE_CONNECT_ISSUER_ID:-}" || -n "${APP_STORE_CONNECT_PRIVATE_KEY_BASE64:-}" || -n "${APP_STORE_CONNECT_PRIVATE_KEY_PATH:-}" ]]; then
  prepare_app_store_connect_api_key
  archive_auth_flags+=(
    -allowProvisioningUpdates
    -authenticationKeyPath "$api_key_path"
    -authenticationKeyID "$APP_STORE_CONNECT_API_KEY_ID"
    -authenticationKeyIssuerID "$APP_STORE_CONNECT_ISSUER_ID"
  )
fi

APPLE_TEAM_ID="$team_id" IOS_PROVISIONING_PROFILE_NAME="$profile_name" xcodebuild archive \
  -workspace "$workspace" \
  -scheme "$scheme" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$archive_path" \
  "${archive_auth_flags[@]}" \
  MARKETING_VERSION="$marketing_version" \
  CURRENT_PROJECT_VERSION="$build_number" \
  ${code_sign_flags:+"${code_sign_flags[@]}"}

app_info_plist="$archive_path/Products/Applications/CrosswordPuzzleMobile.app/Info.plist"
actual_marketing_version="$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$app_info_plist")"
actual_build_number="$(/usr/libexec/PlistBuddy -c 'Print CFBundleVersion' "$app_info_plist")"

if [[ "$actual_marketing_version" != "$marketing_version" || "$actual_build_number" != "$build_number" ]]; then
  echo "Archive version mismatch: $actual_marketing_version/$actual_build_number != $marketing_version/$build_number" >&2
  exit 1
fi

echo "Archived: $archive_path"

if [[ "$export_upload" != "true" ]]; then
  exit 0
fi

prepare_app_store_connect_api_key

export_options_plist="$temporary_dir/AppStoreExportOptions.plist"
export_path="$repo_root/tmp/app-store-export-v${marketing_version}-build${build_number}"

cat > "$export_options_plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>destination</key>
  <string>upload</string>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
  <key>signingStyle</key>
  <string>manual</string>
  <key>teamID</key>
  <string>${team_id}</string>
  <key>signingCertificate</key>
  <string>Apple Distribution</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>${bundle_id}</key>
    <string>${profile_name}</string>
  </dict>
  <key>stripSwiftSymbols</key>
  <true/>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>
EOF

plutil -lint "$export_options_plist"

xcodebuild -exportArchive \
  -archivePath "$archive_path" \
  -exportOptionsPlist "$export_options_plist" \
  -exportPath "$export_path" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$api_key_path" \
  -authenticationKeyID "$APP_STORE_CONNECT_API_KEY_ID" \
  -authenticationKeyIssuerID "$APP_STORE_CONNECT_ISSUER_ID"
