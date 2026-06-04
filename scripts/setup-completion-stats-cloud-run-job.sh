#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID=""
BIGQUERY_SOURCE_PROJECT_ID=""
FIREBASE_HOSTING_SITE=""
FIREBASE_ANALYTICS_DATASET=""
FIREBASE_ANALYTICS_TABLE_PATTERN="events_*"
BIGQUERY_LOCATION="asia-southeast3"
REGION="asia-northeast3"
SCHEDULER_LOCATION="asia-northeast3"
JOB_NAME="crossword-puzzle-completion-stats-aggregator"
SCHEDULER_JOB_NAME="crossword-puzzle-completion-stats-every-30m"
ARTIFACT_REPOSITORY="crossword-puzzle"
IMAGE_NAME="completion-stats-job"
IMAGE_TAG="latest"
RUNTIME_SERVICE_ACCOUNT_ID="crossword-puzzle-stats-job"
SCHEDULER_SERVICE_ACCOUNT_ID="crossword-puzzle-scheduler"
SCHEDULE="*/30 * * * *"
TIME_ZONE="Asia/Seoul"
STATS_LOOKBACK_DAYS="14"
MEMORY="512Mi"
CPU="1"
TASK_TIMEOUT="600s"
DRY_RUN="0"
SKIP_BUILD="0"

usage() {
  cat <<'USAGE'
Usage: scripts/setup-completion-stats-cloud-run-job.sh --project-id <id> --firebase-hosting-site <site> --analytics-dataset <dataset> [options]

Options:
  --project-id <id>                    Google Cloud / Firebase project ID.
  --firebase-hosting-site <site>       Firebase Hosting site ID that serves /puzzles and /puzzle-stats.
  --analytics-dataset <dataset>        GA4 BigQuery export dataset, usually analytics_<property_id>.
  --bigquery-source-project-id <id>    Project that owns the Analytics dataset. Default: --project-id.
  --analytics-table-pattern <pattern>  GA4 export table wildcard. Default: events_*.
  --bigquery-location <location>       BigQuery query location. Default: asia-southeast3.
  --region <region>                    Cloud Run Job region. Default: asia-northeast3.
  --scheduler-location <region>        Cloud Scheduler location. Default: asia-northeast3.
  --job-name <name>                    Cloud Run Job name.
  --scheduler-job-name <name>          Cloud Scheduler job name.
  --schedule <cron>                    Scheduler cron. Default: "*/30 * * * *".
  --time-zone <zone>                   Scheduler/job timezone. Default: Asia/Seoul.
  --stats-lookback-days <n>            BigQuery event table lookback window. Default: 14.
  --memory <size>                      Cloud Run Job memory. Default: 512Mi.
  --cpu <n>                            Cloud Run Job CPU. Default: 1.
  --task-timeout <duration>            Cloud Run Job timeout. Default: 600s.
  --skip-build                         Skip Cloud Build and reuse the current image tag.
  --dry-run                            Print commands without executing.
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
    --analytics-dataset)
      FIREBASE_ANALYTICS_DATASET="${2:-}"
      shift 2
      ;;
    --bigquery-source-project-id)
      BIGQUERY_SOURCE_PROJECT_ID="${2:-}"
      shift 2
      ;;
    --analytics-table-pattern)
      FIREBASE_ANALYTICS_TABLE_PATTERN="${2:-}"
      shift 2
      ;;
    --bigquery-location)
      BIGQUERY_LOCATION="${2:-}"
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
    --stats-lookback-days)
      STATS_LOOKBACK_DAYS="${2:-}"
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

if [ -z "$FIREBASE_ANALYTICS_DATASET" ]; then
  echo "--analytics-dataset is required." >&2
  usage >&2
  exit 1
fi

if [ -z "$BIGQUERY_SOURCE_PROJECT_ID" ]; then
  BIGQUERY_SOURCE_PROJECT_ID="$PROJECT_ID"
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
HOSTING_BASE_URL="https://${FIREBASE_HOSTING_SITE}.web.app"
ENV_VARS="FIREBASE_PROJECT_ID=${PROJECT_ID},FIREBASE_HOSTING_SITE=${FIREBASE_HOSTING_SITE},PUZZLE_HOSTING_BASE_URL=${HOSTING_BASE_URL},FIREBASE_ANALYTICS_DATASET=${FIREBASE_ANALYTICS_DATASET},FIREBASE_ANALYTICS_TABLE_PATTERN=${FIREBASE_ANALYTICS_TABLE_PATTERN},BIGQUERY_SOURCE_PROJECT=${BIGQUERY_SOURCE_PROJECT_ID},BIGQUERY_LOCATION=${BIGQUERY_LOCATION},STATS_LOOKBACK_DAYS=${STATS_LOOKBACK_DAYS},PUZZLE_CORS_ORIGIN=*"

echo "Project:                  ${PROJECT_ID} (${PROJECT_NUMBER})"
echo "BigQuery source project:  ${BIGQUERY_SOURCE_PROJECT_ID}"
echo "Analytics dataset:        ${FIREBASE_ANALYTICS_DATASET}"
echo "BigQuery location:        ${BIGQUERY_LOCATION}"
echo "Region:                   ${REGION}"
echo "Runtime SA:               ${RUNTIME_SERVICE_ACCOUNT}"
echo "Scheduler SA:             ${SCHEDULER_SERVICE_ACCOUNT}"
echo "Cloud Build SA:           ${CLOUD_BUILD_SERVICE_ACCOUNT}"
echo "Compute default SA:       ${COMPUTE_DEFAULT_SERVICE_ACCOUNT}"
echo "Image:                    ${IMAGE}"
echo "Cloud Run Job:            ${JOB_NAME}"
echo "Scheduler:                ${SCHEDULER_JOB_NAME} (${SCHEDULE}, ${TIME_ZONE})"
echo "Firebase Hosting site:    ${FIREBASE_HOSTING_SITE}"

run gcloud services enable \
  artifactregistry.googleapis.com \
  bigquery.googleapis.com \
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

ensure_service_account "$RUNTIME_SERVICE_ACCOUNT" "$RUNTIME_SERVICE_ACCOUNT_ID" "Crossword completion stats aggregator"
ensure_service_account "$SCHEDULER_SERVICE_ACCOUNT" "$SCHEDULER_SERVICE_ACCOUNT_ID" "Crossword puzzle scheduler"

run gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" \
  --role roles/firebasehosting.admin \
  --condition=None

run gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" \
  --role roles/bigquery.jobUser \
  --condition=None

run gcloud projects add-iam-policy-binding "$BIGQUERY_SOURCE_PROJECT_ID" \
  --member "serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" \
  --role roles/bigquery.dataViewer \
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
      - Dockerfile.completion-stats-job
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
