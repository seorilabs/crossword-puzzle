#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID=""
GITHUB_OWNER="seorilabs"
GITHUB_REPO="crossword-puzzle"
POOL_ID="github-actions"
PROVIDER_ID="github"
SERVICE_ACCOUNT_ID="seorilabs-play-publisher"
SERVICE_ACCOUNT_EMAIL=""
SERVICE_ACCOUNT_DISPLAY_NAME="Seorilabs Shared Play Publisher"
APPLY=false

usage() {
  cat <<'EOF'
Usage:
  scripts/setup-google-play-wif.sh --project-id <gcp-project-id> [--github-repo <repo>] [--apply]

Options:
  --project-id <id>             Google Cloud project that owns the shared service account.
  --github-owner <owner>        GitHub owner/org. Default: seorilabs.
  --github-repo <repo>          GitHub repo. Default: crossword-puzzle.
  --pool-id <id>                Workload Identity Pool id. Default: github-actions.
  --provider-id <id>            Workload Identity Provider id. Default: github.
  --service-account-id <id>     Shared service account id. Default: seorilabs-play-publisher.
  --service-account-email <email>
                                Existing shared service account email. Overrides --service-account-id.
  --service-account-display-name <name>
                                Display name when creating the shared service account.
  --apply                       Run gcloud/gh mutations. Without this, only prints the repo onboarding plan.

This script is repo onboarding, not app creation. Use one shared Google Play
publisher service account, grant it Play Console access once, then call this
script for each GitHub repo that should be allowed to impersonate it.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --project-id)
      PROJECT_ID="${2:-}"
      shift 2
      ;;
    --github-owner)
      GITHUB_OWNER="${2:-}"
      shift 2
      ;;
    --github-repo)
      GITHUB_REPO="${2:-}"
      shift 2
      ;;
    --pool-id)
      POOL_ID="${2:-}"
      shift 2
      ;;
    --provider-id)
      PROVIDER_ID="${2:-}"
      shift 2
      ;;
    --service-account-id)
      SERVICE_ACCOUNT_ID="${2:-}"
      shift 2
      ;;
    --service-account-email)
      SERVICE_ACCOUNT_EMAIL="${2:-}"
      shift 2
      ;;
    --service-account-display-name)
      SERVICE_ACCOUNT_DISPLAY_NAME="${2:-}"
      shift 2
      ;;
    --apply)
      APPLY=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ -z "$PROJECT_ID" ]; then
  echo "--project-id is required." >&2
  usage >&2
  exit 2
fi

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 is required." >&2
    exit 1
  fi
}

run() {
  printf '+'
  printf ' %q' "$@"
  printf '\n'
  if [ "$APPLY" = true ]; then
    "$@"
  fi
}

require_command gcloud

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
if [ -z "$PROJECT_NUMBER" ]; then
  echo "Could not resolve project number for $PROJECT_ID." >&2
  exit 1
fi

if [ -z "$SERVICE_ACCOUNT_EMAIL" ]; then
  SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
fi
PROVIDER_RESOURCE="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"
REPOSITORY_PRINCIPAL="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${GITHUB_OWNER}/${GITHUB_REPO}"

cat <<EOF
Google Play repo onboarding plan

Project:                ${PROJECT_ID} (${PROJECT_NUMBER})
GitHub repository:      ${GITHUB_OWNER}/${GITHUB_REPO}
Shared service account: ${SERVICE_ACCOUNT_EMAIL}
WIF provider variable:  GOOGLE_WORKLOAD_IDENTITY_PROVIDER=${PROVIDER_RESOURCE}
Service account var:    GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL=${SERVICE_ACCOUNT_EMAIL}

EOF

run gcloud services enable androidpublisher.googleapis.com iamcredentials.googleapis.com sts.googleapis.com --project "$PROJECT_ID"

if ! gcloud iam workload-identity-pools describe "$POOL_ID" --project "$PROJECT_ID" --location global >/dev/null 2>&1; then
  run gcloud iam workload-identity-pools create "$POOL_ID" \
    --project "$PROJECT_ID" \
    --location global \
    --display-name "GitHub Actions"
else
  echo "Workload Identity Pool already exists: $POOL_ID"
fi

if ! gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" --project "$PROJECT_ID" --location global --workload-identity-pool "$POOL_ID" >/dev/null 2>&1; then
  run gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --project "$PROJECT_ID" \
    --location global \
    --workload-identity-pool "$POOL_ID" \
    --display-name "GitHub Actions" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner,attribute.ref=assertion.ref" \
    --attribute-condition "assertion.repository_owner == '${GITHUB_OWNER}'"
else
  echo "Workload Identity Provider already exists: $PROVIDER_ID"
fi

if ! gcloud iam service-accounts describe "$SERVICE_ACCOUNT_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1; then
  if [ -n "$SERVICE_ACCOUNT_EMAIL" ] && [ "${SERVICE_ACCOUNT_EMAIL#${SERVICE_ACCOUNT_ID}@}" = "$SERVICE_ACCOUNT_EMAIL" ]; then
    echo "Existing service account was not found and cannot be created from --service-account-email: $SERVICE_ACCOUNT_EMAIL" >&2
    exit 1
  fi
  run gcloud iam service-accounts create "$SERVICE_ACCOUNT_ID" \
    --project "$PROJECT_ID" \
    --display-name "$SERVICE_ACCOUNT_DISPLAY_NAME"
else
  echo "Service account already exists: $SERVICE_ACCOUNT_EMAIL"
fi

run gcloud iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT_EMAIL" \
  --project "$PROJECT_ID" \
  --role roles/iam.workloadIdentityUser \
  --member "$REPOSITORY_PRINCIPAL"

cat <<EOF

Next manual Play Console step:
  One-time shared setup:
  1. Open Play Console > Users and permissions.
  2. Invite the shared service account:
     ${SERVICE_ACCOUNT_EMAIL}
  3. Grant account-level permissions if you want new app repos to work without
     per-app console permission work, or grant app-level permissions per package
     if you prefer tighter blast radius.
     Minimum target for automation: view app information, manage store presence,
     and manage testing-track releases.

GitHub repository variables:
  gh variable set GOOGLE_WORKLOAD_IDENTITY_PROVIDER --repo '${GITHUB_OWNER}/${GITHUB_REPO}' --body '${PROVIDER_RESOURCE}'
  gh variable set GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL --repo '${GITHUB_OWNER}/${GITHUB_REPO}' --body '${SERVICE_ACCOUNT_EMAIL}'

Run with --apply only after reviewing the plan.
EOF

if [ "$APPLY" = true ] && command -v gh >/dev/null 2>&1; then
  gh variable set GOOGLE_WORKLOAD_IDENTITY_PROVIDER --repo "${GITHUB_OWNER}/${GITHUB_REPO}" --body "$PROVIDER_RESOURCE"
  gh variable set GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL --repo "${GITHUB_OWNER}/${GITHUB_REPO}" --body "$SERVICE_ACCOUNT_EMAIL"
fi
