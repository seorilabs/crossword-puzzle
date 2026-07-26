#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID=""
REGION="asia-northeast3"
SCHEDULER_LOCATION="asia-northeast3"
JOB_NAME="crossword-puzzle-pack-generator"
SCHEDULER_JOB_NAME="crossword-puzzle-pack-every-2h"
ARTIFACT_REPOSITORY="crossword-puzzle"
IMAGE_NAME="puzzle-pack-job"
IMAGE_TAG="latest"
RUNTIME_SERVICE_ACCOUNT_ID="crossword-puzzle-pack-job"
SCHEDULER_SERVICE_ACCOUNT_ID="crossword-puzzle-scheduler"
FIREBASE_HOSTING_SITE=""
SCHEDULE="5 0 * * *"
TIME_ZONE="Asia/Seoul"
PUZZLE_DAYS="1"
PUZZLE_KEEP="21"
PUZZLE_INTERVAL_HOURS="1"
MEMORY="1Gi"
CPU="1"
TASK_TIMEOUT="1800s"
DRY_RUN="0"
SKIP_BUILD="0"

usage() {
  cat <<'USAGE'
Usage: scripts/setup-puzzle-pack-cloud-run-job.sh --project-id <id> --firebase-hosting-site <site> [options]

Options:
  --project-id <id>                 Google Cloud / Firebase project ID.
  --firebase-hosting-site <site>    Firebase Hosting site ID that serves /puzzles/*.json.
  --region <region>                 Cloud Run Job region. Default: asia-northeast3.
  --scheduler-location <region>     Cloud Scheduler location. Default: asia-northeast3.
  --job-name <name>                 Cloud Run Job name.
  --scheduler-job-name <name>       Cloud Scheduler job name.
  --schedule <cron>                 Scheduler cron. Default: "5 0 * * *" (매일 00:05 KST).
  --time-zone <zone>                Scheduler/job timezone. Default: Asia/Seoul.
  --puzzle-days <n>                 Number of puzzle slots to generate per run. Default: 1.
  --puzzle-keep <n>                 Number of recent puzzle packs to keep. Default: 21.
  --puzzle-interval-hours <n>       Internal tier slot interval. Default: 1.
  --memory <size>                   Cloud Run Job memory. Default: 1Gi.
  --cpu <n>                         Cloud Run Job CPU. Default: 1.
  --task-timeout <duration>         Cloud Run Job timeout. Default: 1800s.
  --skip-build                      Skip Cloud Build and reuse the current image tag.
  --dry-run                         Print commands without executing.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --project-id)
      PROJECT_ID="${2:-}"
      shift 2
      ;;
    --firebase-hosting-site)
      FIREBASE_HOSTING_SITE="${2:-}"
      shift 2
      ;;
    --region)
      REGION="${2:-}"
      shift 2
      ;;
    --scheduler-location)
      SCHEDULER_LOCATION="${2:-}"
      shift 2
      ;;
    --job-name)
      JOB_NAME="${2:-}"
      shift 2
      ;;
    --scheduler-job-name)
      SCHEDULER_JOB_NAME="${2:-}"
      shift 2
      ;;
    --schedule)
      SCHEDULE="${2:-}"
      shift 2
      ;;
    --time-zone)
      TIME_ZONE="${2:-}"
      shift 2
      ;;
    --puzzle-days)
      PUZZLE_DAYS="${2:-}"
      shift 2
      ;;
    --puzzle-keep)
      PUZZLE_KEEP="${2:-}"
      shift 2
      ;;
    --puzzle-interval-hours)
      PUZZLE_INTERVAL_HOURS="${2:-}"
      shift 2
      ;;
    --memory)
      MEMORY="${2:-}"
      shift 2
      ;;
    --cpu)
      CPU="${2:-}"
      shift 2
      ;;
    --task-timeout)
      TASK_TIMEOUT="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="1"
      shift
      ;;
    --skip-build)
      SKIP_BUILD="1"
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

if [ -z "$PROJECT_ID" ]; then
  echo "--project-id is required." >&2
  usage >&2
  exit 1
fi

if [ -z "$FIREBASE_HOSTING_SITE" ]; then
  echo "--firebase-hosting-site is required." >&2
  usage >&2
  exit 1
fi

run() {
  if [ "$DRY_RUN" = "1" ]; then
    printf '+'
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi

  "$@"
}

ensure_service_account() {
  local email="$1"
  local account_id="$2"
  local display_name="$3"

  if [ "$DRY_RUN" = "1" ]; then
    run gcloud iam service-accounts create "$account_id" \
      --project "$PROJECT_ID" \
      --display-name "$display_name"
    return 0
  fi

  if gcloud iam service-accounts describe "$email" --project "$PROJECT_ID" >/dev/null 2>&1; then
    echo "Service account already exists: $email"
    return 0
  fi

  run gcloud iam service-accounts create "$account_id" \
    --project "$PROJECT_ID" \
    --display-name "$display_name"
}

submit_build() {
  if [ "$DRY_RUN" = "1" ]; then
    run gcloud builds submit . \
      --project "$PROJECT_ID" \
      --config "$BUILD_CONFIG" \
      --async \
      --format "value(id)"
    return 0
  fi

  local build_id
  build_id="$(gcloud builds submit . \
    --project "$PROJECT_ID" \
    --config "$BUILD_CONFIG" \
    --async \
    --format "value(id)")"

  if [ -z "$build_id" ]; then
    echo "Could not resolve Cloud Build ID." >&2
    exit 1
  fi

  echo "Cloud Build ID: ${build_id}"

  while true; do
    local status
    status="$(gcloud builds describe "$build_id" \
      --project "$PROJECT_ID" \
      --region global \
      --format "value(status)")"
    echo "Cloud Build status: ${status}"

    case "$status" in
      SUCCESS)
        break
        ;;
      FAILURE|INTERNAL_ERROR|TIMEOUT|CANCELLED|EXPIRED)
        echo "Cloud Build failed: ${build_id} (${status})" >&2
        exit 1
        ;;
    esac

    sleep 10
  done
}

if [ "$DRY_RUN" = "1" ]; then
  PROJECT_NUMBER="dry-run"
else
  PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
fi
RUNTIME_SERVICE_ACCOUNT="${RUNTIME_SERVICE_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
SCHEDULER_SERVICE_ACCOUNT="${SCHEDULER_SERVICE_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
CLOUD_BUILD_SERVICE_ACCOUNT="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
COMPUTE_DEFAULT_SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG}"
RUN_JOB_URI="https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${JOB_NAME}:run"
ENV_VARS="FIREBASE_PROJECT_ID=${PROJECT_ID},FIREBASE_HOSTING_SITE=${FIREBASE_HOSTING_SITE},PUZZLE_DAYS=${PUZZLE_DAYS},PUZZLE_TIME_ZONE=${TIME_ZONE},PUZZLE_HOSTING_BASE_URL=https://${FIREBASE_HOSTING_SITE}.web.app,PUZZLE_APPEND=true,PUZZLE_KEEP=${PUZZLE_KEEP},PUZZLE_INTERVAL_HOURS=${PUZZLE_INTERVAL_HOURS},PUZZLE_DIFFICULTY_ROTATION=false,PUZZLE_DAILY_TIERS=true,PUZZLE_DIVERSITY_HISTORY=7,PUZZLE_MAX_ANSWER_REUSE=0.5,PUZZLE_MAX_SCAFFOLD_SIMILARITY=0.75"

echo "Project:              ${PROJECT_ID} (${PROJECT_NUMBER})"
echo "Region:               ${REGION}"
echo "Runtime SA:           ${RUNTIME_SERVICE_ACCOUNT}"
echo "Scheduler SA:         ${SCHEDULER_SERVICE_ACCOUNT}"
echo "Cloud Build SA:       ${CLOUD_BUILD_SERVICE_ACCOUNT}"
echo "Compute default SA:   ${COMPUTE_DEFAULT_SERVICE_ACCOUNT}"
echo "Image:                ${IMAGE}"
echo "Cloud Run Job:        ${JOB_NAME}"
echo "Scheduler:            ${SCHEDULER_JOB_NAME} (${SCHEDULE}, ${TIME_ZONE})"
echo "Firebase Hosting site:${FIREBASE_HOSTING_SITE}"

run gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  cloudscheduler.googleapis.com \
  firebasehosting.googleapis.com \
  run.googleapis.com \
  --project "$PROJECT_ID"

if [ "$DRY_RUN" = "1" ]; then
  run gcloud artifacts repositories create "$ARTIFACT_REPOSITORY" \
    --project "$PROJECT_ID" \
    --location "$REGION" \
    --repository-format docker \
    --description "crossword-puzzle container images"
elif ! gcloud artifacts repositories describe "$ARTIFACT_REPOSITORY" --project "$PROJECT_ID" --location "$REGION" >/dev/null 2>&1; then
  run gcloud artifacts repositories create "$ARTIFACT_REPOSITORY" \
    --project "$PROJECT_ID" \
    --location "$REGION" \
    --repository-format docker \
    --description "crossword-puzzle container images"
else
  echo "Artifact Registry repository already exists: ${ARTIFACT_REPOSITORY}"
fi

ensure_service_account "$RUNTIME_SERVICE_ACCOUNT" "$RUNTIME_SERVICE_ACCOUNT_ID" "Crossword puzzle pack generator"
ensure_service_account "$SCHEDULER_SERVICE_ACCOUNT" "$SCHEDULER_SERVICE_ACCOUNT_ID" "Crossword puzzle scheduler"

run gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" \
  --role roles/firebasehosting.admin \
  --condition=None

run gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:${CLOUD_BUILD_SERVICE_ACCOUNT}" \
  --role roles/artifactregistry.writer \
  --condition=None

run gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:${COMPUTE_DEFAULT_SERVICE_ACCOUNT}" \
  --role roles/artifactregistry.writer \
  --condition=None

run gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:${COMPUTE_DEFAULT_SERVICE_ACCOUNT}" \
  --role roles/storage.objectViewer \
  --condition=None

BUILD_CONFIG="$(mktemp)"
trap 'rm -f "$BUILD_CONFIG"' EXIT
cat >"$BUILD_CONFIG" <<YAML
steps:
  - name: gcr.io/cloud-builders/docker
    args:
      - build
      - -f
      - Dockerfile.puzzle-pack-job
      - -t
      - ${IMAGE}
      - .
images:
  - ${IMAGE}
YAML

if [ "$SKIP_BUILD" = "1" ]; then
  echo "Skipping Cloud Build; reusing image ${IMAGE}"
else
  submit_build
fi

if [ "$DRY_RUN" = "1" ]; then
  run gcloud run jobs create "$JOB_NAME" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --image "$IMAGE" \
    --service-account "$RUNTIME_SERVICE_ACCOUNT" \
    --memory "$MEMORY" \
    --cpu "$CPU" \
    --task-timeout "$TASK_TIMEOUT" \
    --max-retries 0 \
    --set-env-vars "$ENV_VARS"
elif gcloud run jobs describe "$JOB_NAME" --project "$PROJECT_ID" --region "$REGION" >/dev/null 2>&1; then
  run gcloud run jobs update "$JOB_NAME" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --image "$IMAGE" \
    --service-account "$RUNTIME_SERVICE_ACCOUNT" \
    --memory "$MEMORY" \
    --cpu "$CPU" \
    --task-timeout "$TASK_TIMEOUT" \
    --max-retries 0 \
    --set-env-vars "$ENV_VARS"
else
  run gcloud run jobs create "$JOB_NAME" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --image "$IMAGE" \
    --service-account "$RUNTIME_SERVICE_ACCOUNT" \
    --memory "$MEMORY" \
    --cpu "$CPU" \
    --task-timeout "$TASK_TIMEOUT" \
    --max-retries 0 \
    --set-env-vars "$ENV_VARS"
fi

run gcloud run jobs add-iam-policy-binding "$JOB_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --member "serviceAccount:${SCHEDULER_SERVICE_ACCOUNT}" \
  --role roles/run.invoker

if [ "$DRY_RUN" = "1" ]; then
  run gcloud scheduler jobs create http "$SCHEDULER_JOB_NAME" \
    --project "$PROJECT_ID" \
    --location "$SCHEDULER_LOCATION" \
    --schedule "$SCHEDULE" \
    --time-zone "$TIME_ZONE" \
    --uri "$RUN_JOB_URI" \
    --http-method POST \
    --oauth-service-account-email "$SCHEDULER_SERVICE_ACCOUNT" \
    --headers "Content-Type=application/json" \
    --message-body "{}"
elif gcloud scheduler jobs describe "$SCHEDULER_JOB_NAME" --project "$PROJECT_ID" --location "$SCHEDULER_LOCATION" >/dev/null 2>&1; then
  run gcloud scheduler jobs update http "$SCHEDULER_JOB_NAME" \
    --project "$PROJECT_ID" \
    --location "$SCHEDULER_LOCATION" \
    --schedule "$SCHEDULE" \
    --time-zone "$TIME_ZONE" \
    --uri "$RUN_JOB_URI" \
    --http-method POST \
    --oauth-service-account-email "$SCHEDULER_SERVICE_ACCOUNT" \
    --update-headers "Content-Type=application/json" \
    --message-body "{}"
else
  run gcloud scheduler jobs create http "$SCHEDULER_JOB_NAME" \
    --project "$PROJECT_ID" \
    --location "$SCHEDULER_LOCATION" \
    --schedule "$SCHEDULE" \
    --time-zone "$TIME_ZONE" \
    --uri "$RUN_JOB_URI" \
    --http-method POST \
    --oauth-service-account-email "$SCHEDULER_SERVICE_ACCOUNT" \
    --headers "Content-Type=application/json" \
    --message-body "{}"
fi

echo "Run once:"
echo "gcloud run jobs execute ${JOB_NAME} --project ${PROJECT_ID} --region ${REGION} --wait"
