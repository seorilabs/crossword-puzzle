#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# shellcheck disable=SC1091
source "$repo_root/build.env"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "필수 빌드 도구가 없습니다: $1" >&2
    exit 1
  }
}

require_value() {
  local name="$1"
  [ -n "${!name:-}" ] || {
    echo "필수 빌드 환경변수가 없습니다: $name" >&2
    exit 1
  }
}

for command_name in node npm java keytool jarsigner unzip; do
  require_command "$command_name"
done
for variable_name in \
  SEORI_RELEASE_TAG SEORI_RELEASE_SOURCE_SHA \
  ANDROID_VERSION_NAME ANDROID_VERSION_CODE \
  GOOGLE_PLAY_UPLOAD_KEY_ALIAS PLAY_GAMES_PROJECT_ID PLAY_GAMES_LEADERBOARD_ID \
  BUILD_CREDENTIAL_DIR; do
  require_value "$variable_name"
done

# 마켓 artifact의 버전 정본은 릴리즈 태그 하나다. 중앙 release authority가 넘긴 값이
# 서로 어긋나면 AAB를 만들기 전에 멈춘다.
[ "$SEORI_RELEASE_TAG" = "v$ANDROID_VERSION_NAME" ] || {
  echo "릴리즈 태그와 versionName이 다릅니다: tag=$SEORI_RELEASE_TAG versionName=$ANDROID_VERSION_NAME" >&2
  exit 1
}
[[ "$ANDROID_VERSION_CODE" =~ ^[1-9][0-9]*$ ]] || {
  echo "versionCode는 양의 정수여야 합니다: $ANDROID_VERSION_CODE" >&2
  exit 1
}
[[ "$SEORI_RELEASE_SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || {
  echo "SEORI_RELEASE_SOURCE_SHA는 40자리 소문자 Git SHA여야 합니다." >&2
  exit 1
}

actual_node="$(node --version)"
[ "$actual_node" = "v$NODE_VERSION" ] || {
  echo "Node 버전 불일치: expected=v$NODE_VERSION actual=$actual_node" >&2
  exit 1
}
actual_java="$(java -version 2>&1 | sed -n '1s/.*version "\([0-9]*\).*/\1/p')"
[ "$actual_java" = "$JDK_VERSION" ] || {
  echo "JDK 버전 불일치: expected=$JDK_VERSION actual=${actual_java:-unknown}" >&2
  exit 1
}
[ -d "$ANDROID_HOME/platforms/android-$ANDROID_PLATFORM" ] || {
  echo "Android platform 불일치: android-$ANDROID_PLATFORM 없음" >&2
  exit 1
}
[ -d "$ANDROID_HOME/build-tools/$ANDROID_BUILD_TOOLS" ] || {
  echo "Android build-tools 불일치: $ANDROID_BUILD_TOOLS 없음" >&2
  exit 1
}

credential_dir="$BUILD_CREDENTIAL_DIR"
firebase_base64="$credential_dir/firebase-android-config.b64"
keystore_base64="$credential_dir/play-keystore.b64"
keystore_password_file="$credential_dir/play-keystore-password"
key_password_file="$credential_dir/play-key-password"
for path in \
  "$firebase_base64" "$keystore_base64" "$keystore_password_file"; do
  [ -s "$path" ] || {
    echo "빌드 자격증명 파일이 없습니다: $(basename "$path")" >&2
    exit 1
  }
done

secret_dir="$(mktemp -d)"
firebase_config="$repo_root/apps/mobile/android/app/google-services.json"
key_properties="$repo_root/apps/mobile/android/key.properties"
keystore_file="$secret_dir/crossword-puzzle-upload.jks"
cleanup() {
  rm -f -- "$firebase_config" "$key_properties"
  rm -rf -- "$secret_dir"
}
trap cleanup EXIT INT TERM

[ ! -e "$firebase_config" ] || {
  echo "기존 Firebase 설정을 덮어쓰지 않습니다: $firebase_config" >&2
  exit 1
}
[ ! -e "$key_properties" ] || {
  echo "기존 Android 서명 설정을 덮어쓰지 않습니다: $key_properties" >&2
  exit 1
}

firebase_value="$(<"$firebase_base64")"
FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64="$firebase_value" \
  node scripts/restore-mobile-firebase-config.mjs --android --require
unset firebase_value

base64 --decode "$keystore_base64" > "$keystore_file"
chmod 0600 "$keystore_file" "$firebase_config"
keystore_password="$(<"$keystore_password_file")"
# key password는 keystore password와 다를 때만 등록한다(docs/google-play-release.md).
if [ -s "$key_password_file" ]; then
  key_password="$(<"$key_password_file")"
else
  key_password="$keystore_password"
fi

keystore_details="$(
  keytool -list -v \
    -J-Duser.language=en -J-Duser.country=US \
    -keystore "$keystore_file" \
    -storepass "$keystore_password" \
    -alias "$GOOGLE_PLAY_UPLOAD_KEY_ALIAS"
)"
actual_fingerprint="$(
  printf '%s\n' "$keystore_details" \
    | sed -n 's/^[[:space:]]*SHA256:[[:space:]]*//p' \
    | head -n 1 \
    | tr -d ':' \
    | tr '[:lower:]' '[:upper:]'
)"
[ "$actual_fingerprint" = "$EXPECTED_PLAY_UPLOAD_CERT_SHA256" ] || {
  echo "Google Play 업로드 인증서 SHA-256이 Play Console 등록값과 일치하지 않습니다." >&2
  exit 1
}
echo "Google Play 업로드 인증서 SHA-256 확인 완료."

{
  printf 'storeFile=%s\n' "$keystore_file"
  printf 'storePassword=%s\n' "$keystore_password"
  printf 'keyAlias=%s\n' "$GOOGLE_PLAY_UPLOAD_KEY_ALIAS"
  printf 'keyPassword=%s\n' "$key_password"
} > "$key_properties"
chmod 0600 "$key_properties"

npm ci
npm ci --prefix apps/mobile

(
  cd apps/mobile/android
  APP_VERSION_NAME="$ANDROID_VERSION_NAME" \
    APP_VERSION_CODE="$ANDROID_VERSION_CODE" \
    PLAY_GAMES_PROJECT_ID="$PLAY_GAMES_PROJECT_ID" \
    PLAY_GAMES_LEADERBOARD_ID="$PLAY_GAMES_LEADERBOARD_ID" \
    ./gradlew :app:bundleRelease --no-daemon --console=plain
)

source_aab="$repo_root/apps/mobile/android/app/build/outputs/bundle/release/app-release.aab"
output_aab="$repo_root/$AAB_PATH"
[ -s "$source_aab" ] || {
  echo "Android App Bundle이 생성되지 않았습니다: $source_aab" >&2
  exit 1
}
mkdir -p "$(dirname "$output_aab")"
install -m 0600 "$source_aab" "$output_aab"

jarsigner -verify -strict \
  -keystore "$keystore_file" \
  -storepass "$keystore_password" \
  "$output_aab" "$GOOGLE_PLAY_UPLOAD_KEY_ALIAS" >/dev/null
unzip -t "$output_aab" >/dev/null

echo "Signed AAB 생성 완료: path=$AAB_PATH bytes=$(wc -c < "$output_aab" | tr -d ' ') release=$SEORI_RELEASE_TAG versionCode=$ANDROID_VERSION_CODE source=$SEORI_RELEASE_SOURCE_SHA"
