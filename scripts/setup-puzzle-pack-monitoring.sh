#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID=""
REGION="asia-northeast3"
SCHEDULER_LOCATION="asia-northeast3"
GENERATOR_JOB_NAME="crossword-puzzle-pack-generator"
HEALTH_JOB_NAME="crossword-puzzle-pack-health"
HEALTH_SCHEDULER_JOB_NAME="crossword-puzzle-pack-health-daily"
HEALTH_SCHEDULE="30 0 * * *"
TIME_ZONE="Asia/Seoul"
HOSTING_BASE_URL=""
IMAGE=""
RUNTIME_SERVICE_ACCOUNT=""
SCHEDULER_SERVICE_ACCOUNT_ID="crossword-puzzle-scheduler"
NOTIFICATION_CHANNEL=""
LOG_METRIC_NAME="crossword_puzzle_pack_job_error_count"
ALERT_POLICY_DISPLAY_NAME="가로세로 낱말 퍼즐 일간팩 오류"
DRY_RUN="0"

usage() {
  cat <<'USAGE'
Usage: scripts/setup-puzzle-pack-monitoring.sh --project-id <id> --hosting-base-url <url> --notification-channel <resource> [options]

Options:
  --project-id <id>                    Google Cloud project ID.
  --hosting-base-url <url>             Public Firebase Hosting base URL.
  --notification-channel <resource>    Cloud Monitoring notification channel full resource name.
  --region <region>                    Cloud Run Job region. Default: asia-northeast3.
  --scheduler-location <region>        Cloud Scheduler location. Default: asia-northeast3.
  --generator-job-name <name>          Existing generator job name.
  --health-job-name <name>             Health-check Cloud Run Job name.
  --health-scheduler-job-name <name>   Health-check Scheduler job name.
  --health-schedule <cron>             Health-check cron. Default: "30 0 * * *".
  --time-zone <zone>                   Scheduler/check timezone. Default: Asia/Seoul.
  --image <image>                      Container image. Defaults to the generator job image.
  --runtime-service-account <email>    Runtime service account. Defaults to the generator job account.
  --dry-run                            Print commands without executing.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --project-id)
      PROJECT_ID="${2:-}"
      shift 2
      ;;
    --hosting-base-url)
      HOSTING_BASE_URL="${2:-}"
      shift 2
      ;;
    --notification-channel)
      NOTIFICATION_CHANNEL="${2:-}"
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
    --generator-job-name)
      GENERATOR_JOB_NAME="${2:-}"
      shift 2
      ;;
    --health-job-name)
      HEALTH_JOB_NAME="${2:-}"
      shift 2
      ;;
    --health-scheduler-job-name)
      HEALTH_SCHEDULER_JOB_NAME="${2:-}"
      shift 2
      ;;
    --health-schedule)
      HEALTH_SCHEDULE="${2:-}"
      shift 2
      ;;
    --time-zone)
      TIME_ZONE="${2:-}"
      shift 2
      ;;
    --image)
      IMAGE="${2:-}"
      shift 2
      ;;
    --runtime-service-account)
      RUNTIME_SERVICE_ACCOUNT="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="1"
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

if [ -z "$PROJECT_ID" ] || [ -z "$HOSTING_BASE_URL" ]; then
  echo "--project-id and --hosting-base-url are required." >&2
  usage >&2
  exit 1
fi

if [ -z "$NOTIFICATION_CHANNEL" ] && [ "$DRY_RUN" != "1" ]; then
  echo "--notification-channel is required outside dry-run." >&2
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

if [ "$DRY_RUN" = "1" ]; then
  PROJECT_NUMBER="dry-run"
  if [ -z "$IMAGE" ]; then
    IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/crossword-puzzle/puzzle-pack-job:latest"
  fi
  if [ -z "$RUNTIME_SERVICE_ACCOUNT" ]; then
    RUNTIME_SERVICE_ACCOUNT="crossword-puzzle-pack-job@${PROJECT_ID}.iam.gserviceaccount.com"
  fi
  if [ -z "$NOTIFICATION_CHANNEL" ]; then
    NOTIFICATION_CHANNEL="projects/${PROJECT_ID}/notificationChannels/dry-run"
  fi
else
  PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
  if [ -z "$IMAGE" ]; then
    IMAGE="$(gcloud run jobs describe "$GENERATOR_JOB_NAME" \
      --project "$PROJECT_ID" \
      --region "$REGION" \
      --format='value(spec.template.template.containers[0].image)')"
  fi
  if [ -z "$RUNTIME_SERVICE_ACCOUNT" ]; then
    RUNTIME_SERVICE_ACCOUNT="$(gcloud run jobs describe "$GENERATOR_JOB_NAME" \
      --project "$PROJECT_ID" \
      --region "$REGION" \
      --format='value(spec.template.template.serviceAccount)')"
  fi
fi

SCHEDULER_SERVICE_ACCOUNT="${SCHEDULER_SERVICE_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
HEALTH_JOB_URI="https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${HEALTH_JOB_NAME}:run"
HEALTH_ENV_VARS="PUZZLE_HOSTING_BASE_URL=${HOSTING_BASE_URL},PUZZLE_TIME_ZONE=${TIME_ZONE}"
LOG_FILTER="resource.type=\"cloud_run_job\" AND (resource.labels.job_name=\"${GENERATOR_JOB_NAME}\" OR resource.labels.job_name=\"${HEALTH_JOB_NAME}\") AND severity>=ERROR"

echo "Project:              ${PROJECT_ID} (${PROJECT_NUMBER})"
echo "Generator Job:        ${GENERATOR_JOB_NAME}"
echo "Health Job:           ${HEALTH_JOB_NAME}"
echo "Health Scheduler:     ${HEALTH_SCHEDULER_JOB_NAME} (${HEALTH_SCHEDULE}, ${TIME_ZONE})"
echo "Notification Channel: ${NOTIFICATION_CHANNEL}"

run gcloud services enable \
  logging.googleapis.com \
  monitoring.googleapis.com \
  --project "$PROJECT_ID"

if [ "$DRY_RUN" = "1" ]; then
  run gcloud run jobs create "$HEALTH_JOB_NAME" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --image "$IMAGE" \
    --service-account "$RUNTIME_SERVICE_ACCOUNT" \
    --command node \
    --args server/batch/check-puzzle-pack-health.mjs \
    --memory 512Mi \
    --cpu 1 \
    --task-timeout 300s \
    --max-retries 1 \
    --set-env-vars "$HEALTH_ENV_VARS"
elif gcloud run jobs describe "$HEALTH_JOB_NAME" --project "$PROJECT_ID" --region "$REGION" >/dev/null 2>&1; then
  run gcloud run jobs update "$HEALTH_JOB_NAME" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --image "$IMAGE" \
    --service-account "$RUNTIME_SERVICE_ACCOUNT" \
    --command node \
    --args server/batch/check-puzzle-pack-health.mjs \
    --memory 512Mi \
    --cpu 1 \
    --task-timeout 300s \
    --max-retries 1 \
    --set-env-vars "$HEALTH_ENV_VARS"
else
  run gcloud run jobs create "$HEALTH_JOB_NAME" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --image "$IMAGE" \
    --service-account "$RUNTIME_SERVICE_ACCOUNT" \
    --command node \
    --args server/batch/check-puzzle-pack-health.mjs \
    --memory 512Mi \
    --cpu 1 \
    --task-timeout 300s \
    --max-retries 1 \
    --set-env-vars "$HEALTH_ENV_VARS"
fi

run gcloud run jobs add-iam-policy-binding "$HEALTH_JOB_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --member "serviceAccount:${SCHEDULER_SERVICE_ACCOUNT}" \
  --role roles/run.invoker

if [ "$DRY_RUN" = "1" ]; then
  run gcloud scheduler jobs create http "$HEALTH_SCHEDULER_JOB_NAME" \
    --project "$PROJECT_ID" \
    --location "$SCHEDULER_LOCATION" \
    --schedule "$HEALTH_SCHEDULE" \
    --time-zone "$TIME_ZONE" \
    --uri "$HEALTH_JOB_URI" \
    --http-method POST \
    --oauth-service-account-email "$SCHEDULER_SERVICE_ACCOUNT" \
    --headers "Content-Type=application/json" \
    --message-body "{}"
elif gcloud scheduler jobs describe "$HEALTH_SCHEDULER_JOB_NAME" --project "$PROJECT_ID" --location "$SCHEDULER_LOCATION" >/dev/null 2>&1; then
  run gcloud scheduler jobs update http "$HEALTH_SCHEDULER_JOB_NAME" \
    --project "$PROJECT_ID" \
    --location "$SCHEDULER_LOCATION" \
    --schedule "$HEALTH_SCHEDULE" \
    --time-zone "$TIME_ZONE" \
    --uri "$HEALTH_JOB_URI" \
    --http-method POST \
    --oauth-service-account-email "$SCHEDULER_SERVICE_ACCOUNT" \
    --update-headers "Content-Type=application/json" \
    --message-body "{}"
else
  run gcloud scheduler jobs create http "$HEALTH_SCHEDULER_JOB_NAME" \
    --project "$PROJECT_ID" \
    --location "$SCHEDULER_LOCATION" \
    --schedule "$HEALTH_SCHEDULE" \
    --time-zone "$TIME_ZONE" \
    --uri "$HEALTH_JOB_URI" \
    --http-method POST \
    --oauth-service-account-email "$SCHEDULER_SERVICE_ACCOUNT" \
    --headers "Content-Type=application/json" \
    --message-body "{}"
fi

if [ "$DRY_RUN" = "1" ]; then
  run gcloud logging metrics create "$LOG_METRIC_NAME" \
    --project "$PROJECT_ID" \
    --description "Cloud Run puzzle-pack generator and health-check errors." \
    --log-filter "$LOG_FILTER"
elif gcloud logging metrics describe "$LOG_METRIC_NAME" --project "$PROJECT_ID" >/dev/null 2>&1; then
  run gcloud logging metrics update "$LOG_METRIC_NAME" \
    --project "$PROJECT_ID" \
    --description "Cloud Run puzzle-pack generator and health-check errors." \
    --log-filter "$LOG_FILTER"
else
  run gcloud logging metrics create "$LOG_METRIC_NAME" \
    --project "$PROJECT_ID" \
    --description "Cloud Run puzzle-pack generator and health-check errors." \
    --log-filter "$LOG_FILTER"
fi

POLICY_FILE="$(mktemp)"
trap 'rm -f "$POLICY_FILE"' EXIT
cat >"$POLICY_FILE" <<JSON
{
  "displayName": "${ALERT_POLICY_DISPLAY_NAME}",
  "combiner": "OR",
  "enabled": true,
  "notificationChannels": ["${NOTIFICATION_CHANNEL}"],
  "documentation": {
    "mimeType": "text/markdown",
    "content": "퍼즐팩 생성 또는 00:30 공개본 health check가 실패했습니다. Cloud Run Job 로그에서 ${GENERATOR_JOB_NAME}와 ${HEALTH_JOB_NAME}을 확인하세요."
  },
  "alertStrategy": {
    "autoClose": "1800s"
  },
  "conditions": [
    {
      "displayName": "퍼즐팩 Cloud Run Job 오류 로그 발생",
      "conditionThreshold": {
        "filter": "metric.type=\"logging.googleapis.com/user/${LOG_METRIC_NAME}\" AND resource.type=\"cloud_run_job\"",
        "aggregations": [
          {
            "alignmentPeriod": "60s",
            "perSeriesAligner": "ALIGN_SUM",
            "crossSeriesReducer": "REDUCE_SUM"
          }
        ],
        "comparison": "COMPARISON_GT",
        "duration": "0s",
        "thresholdValue": 0,
        "trigger": {
          "count": 1
        }
      }
    }
  ]
}
JSON

if [ "$DRY_RUN" = "1" ]; then
  run gcloud monitoring policies create \
    --project "$PROJECT_ID" \
    --policy-from-file "$POLICY_FILE"
else
  POLICY_NAME="$(gcloud monitoring policies list \
    --project "$PROJECT_ID" \
    --filter "displayName=${ALERT_POLICY_DISPLAY_NAME}" \
    --format='value(name)' \
    --limit=1)"
  if [ -n "$POLICY_NAME" ]; then
    run gcloud monitoring policies update "$POLICY_NAME" \
      --project "$PROJECT_ID" \
      --policy-from-file "$POLICY_FILE"
  else
    run gcloud monitoring policies create \
      --project "$PROJECT_ID" \
      --policy-from-file "$POLICY_FILE"
  fi
fi

echo "Run health check once:"
echo "gcloud run jobs execute ${HEALTH_JOB_NAME} --project ${PROJECT_ID} --region ${REGION} --wait"
