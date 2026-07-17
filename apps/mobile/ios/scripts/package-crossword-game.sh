#!/bin/sh
set -eu

REPOSITORY_ROOT="${PROJECT_DIR}/../../.."
SOURCE_DIRECTORY="${PROJECT_DIR}/../game-bundle"
RESOURCE_ROOT="${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}"
DESTINATION_DIRECTORY="${RESOURCE_ROOT}/CrosswordGame"

if [ ! -d "${SOURCE_DIRECTORY}" ]; then
  echo "error: Native game bundle is missing: ${SOURCE_DIRECTORY}" >&2
  echo "error: Run 'npm run build:game:mobile' from the repository root before the iOS build." >&2
  exit 1
fi

if [ -L "${SOURCE_DIRECTORY}" ] || [ -n "$(find "${SOURCE_DIRECTORY}" -type l -print -quit)" ]; then
  echo "error: Native game bundle must not contain symbolic links." >&2
  exit 1
fi

if [ -z "${NODE_BINARY:-}" ] || [ ! -x "${NODE_BINARY}" ]; then
  echo "error: NODE_BINARY is unavailable; the native game manifest cannot be verified." >&2
  exit 1
fi

"${NODE_BINARY}" "${REPOSITORY_ROOT}/scripts/build-native-game-bundle.mjs" check

case "${DESTINATION_DIRECTORY}" in
  "${TARGET_BUILD_DIR}"/*/CrosswordGame) ;;
  *)
    echo "error: Refusing to replace unexpected resource path: ${DESTINATION_DIRECTORY}" >&2
    exit 1
    ;;
esac

/bin/mkdir -p "${RESOURCE_ROOT}"
/bin/rm -rf "${DESTINATION_DIRECTORY}"
/usr/bin/ditto --noqtn "${SOURCE_DIRECTORY}" "${DESTINATION_DIRECTORY}"

if [ ! -f "${DESTINATION_DIRECTORY}/index.html" ] || [ ! -f "${DESTINATION_DIRECTORY}/asset-manifest.json" ]; then
  echo "error: CrosswordGame resources were not copied completely." >&2
  exit 1
fi

echo "Native game resources packaged at ${DESTINATION_DIRECTORY}"
