#!/usr/bin/env bash
# deploy.sh — Build and deploy the xenga facilitator to GCP Cloud Run
#
# Usage:
#   ./deploy.sh setup   One-time GCP project setup (enable APIs, create registry)
#   ./deploy.sh deploy  Build image, push to Artifact Registry, deploy to Cloud Run
#
# Required environment variables:
#   GCP_PROJECT          GCP project ID
#   GCP_REGION           Cloud Run region (e.g. us-central1)
#   PRIVATE_KEY          Operator private key for on-chain transactions
#   ESCROW_VAULT_ADDRESS Deployed EscrowVault contract address
#
# Optional environment variables:
#   CLOUD_RUN_SERVICE    Cloud Run service name       (default: xenga-facilitator)
#   ARTIFACT_REPO        Artifact Registry repo name  (default: xenga)
#   MIN_INSTANCES        Minimum Cloud Run instances  (default: 0)
#   MAX_INSTANCES        Maximum Cloud Run instances  (default: 10)
#   MEMORY               Cloud Run memory allocation  (default: 512Mi)
#   CPU                  Cloud Run CPU count          (default: 1)
#   BASE_SEPOLIA_RPC     RPC endpoint
#   USDC_ADDRESS         USDC token address
#   CORS_ORIGIN          Allowed CORS origin
#   FEE_BPS              Fee in basis points
#   FEE_FLAT_USDC        Flat fee in USDC microunits
#   FEE_RECIPIENT        Address to receive fees
#   API_KEYS             Comma-separated API keys for protected endpoints
#   DEMO_MODE            Set to "true" to enable demo funding endpoint

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()     { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── Defaults ─────────────────────────────────────────────────────────────────
CLOUD_RUN_SERVICE="${CLOUD_RUN_SERVICE:-xenga-facilitator}"
ARTIFACT_REPO="${ARTIFACT_REPO:-xenga}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"
MAX_INSTANCES="${MAX_INSTANCES:-10}"
MEMORY="${MEMORY:-512Mi}"
CPU="${CPU:-1}"

# ── Helpers ───────────────────────────────────────────────────────────────────
require_cmd() {
  command -v "$1" &>/dev/null || die "'$1' is not installed or not in PATH"
}

require_var() {
  local var="$1" hint="${2:-}"
  [[ -n "${!var:-}" ]] || die "Required env var \$$var is not set${hint:+. $hint}"
}

require_base_vars() {
  require_var GCP_PROJECT "Set GCP_PROJECT to your GCP project ID"
  require_var GCP_REGION  "Set GCP_REGION (e.g. us-central1)"
}

registry_host() {
  echo "${GCP_REGION}-docker.pkg.dev"
}

image_path() {
  echo "$(registry_host)/${GCP_PROJECT}/${ARTIFACT_REPO}/${CLOUD_RUN_SERVICE}"
}

# ── setup: one-time GCP project setup ────────────────────────────────────────
cmd_setup() {
  info "=== One-time GCP setup ==="
  require_cmd gcloud
  require_base_vars

  info "Project : ${GCP_PROJECT}"
  info "Region  : ${GCP_REGION}"

  # Enable required APIs
  info "Enabling GCP APIs..."
  gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    secretmanager.googleapis.com \
    --project "${GCP_PROJECT}"
  success "APIs enabled"

  # Create Artifact Registry repository (no-op if it already exists)
  info "Creating Artifact Registry repository '${ARTIFACT_REPO}'..."
  if gcloud artifacts repositories describe "${ARTIFACT_REPO}" \
       --location "${GCP_REGION}" \
       --project "${GCP_PROJECT}" &>/dev/null; then
    info "Repository '${ARTIFACT_REPO}' already exists — skipping"
  else
    gcloud artifacts repositories create "${ARTIFACT_REPO}" \
      --repository-format docker \
      --location "${GCP_REGION}" \
      --project "${GCP_PROJECT}" \
      --description "xenga container images"
    success "Artifact Registry repository created"
  fi

  # Store secrets in Secret Manager
  info "Storing secrets in Secret Manager..."
  require_var PRIVATE_KEY          "Required to store in Secret Manager"
  require_var ESCROW_VAULT_ADDRESS "Required to store in Secret Manager"

  for secret_name in PRIVATE_KEY ESCROW_VAULT_ADDRESS; do
    local secret_value="${!secret_name}"
    if gcloud secrets describe "${secret_name}" --project "${GCP_PROJECT}" &>/dev/null; then
      info "Secret '${secret_name}' already exists — adding new version"
      echo -n "${secret_value}" | \
        gcloud secrets versions add "${secret_name}" \
          --data-file=- \
          --project "${GCP_PROJECT}"
    else
      echo -n "${secret_value}" | \
        gcloud secrets create "${secret_name}" \
          --data-file=- \
          --project "${GCP_PROJECT}"
    fi
    success "Secret '${secret_name}' stored"
  done

  # Grant Cloud Run SA access to secrets
  local project_number
  project_number=$(gcloud projects describe "${GCP_PROJECT}" --format="value(projectNumber)")
  local run_sa="${project_number}-compute@developer.gserviceaccount.com"

  info "Granting secret accessor role to Cloud Run service account..."
  for secret_name in PRIVATE_KEY ESCROW_VAULT_ADDRESS; do
    gcloud secrets add-iam-policy-binding "${secret_name}" \
      --member "serviceAccount:${run_sa}" \
      --role "roles/secretmanager.secretAccessor" \
      --project "${GCP_PROJECT}" \
      --quiet
  done
  success "IAM bindings set"

  # Configure Docker auth
  info "Configuring Docker authentication for Artifact Registry..."
  gcloud auth configure-docker "$(registry_host)" --quiet
  success "Docker auth configured"

  echo ""
  success "Setup complete. You can now run: ./deploy.sh deploy"
}

# ── deploy: build, push, and deploy to Cloud Run ─────────────────────────────
cmd_deploy() {
  info "=== Deploying facilitator to GCP Cloud Run ==="
  require_cmd gcloud
  require_cmd docker
  require_base_vars
  require_var PRIVATE_KEY          "Set PRIVATE_KEY to the operator wallet private key"
  require_var ESCROW_VAULT_ADDRESS "Set ESCROW_VAULT_ADDRESS to the deployed EscrowVault address"

  local git_sha
  git_sha=$(git rev-parse --short HEAD 2>/dev/null || echo "local")
  local image
  image=$(image_path)
  local image_tag="${image}:${git_sha}"
  local image_latest="${image}:latest"

  info "Project  : ${GCP_PROJECT}"
  info "Region   : ${GCP_REGION}"
  info "Service  : ${CLOUD_RUN_SERVICE}"
  info "Image    : ${image_tag}"

  # Ensure Docker is authenticated
  gcloud auth configure-docker "$(registry_host)" --quiet

  # Build
  info "Building Docker image (linux/amd64)..."
  docker build \
    --platform linux/amd64 \
    --tag "${image_tag}" \
    --tag "${image_latest}" \
    --file Dockerfile \
    .
  success "Image built"

  # Push
  info "Pushing to Artifact Registry..."
  docker push "${image_tag}"
  docker push "${image_latest}"
  success "Image pushed"

  # Assemble env-var list (only include optional vars that are actually set)
  local env_vars="PRIVATE_KEY=${PRIVATE_KEY},ESCROW_VAULT_ADDRESS=${ESCROW_VAULT_ADDRESS}"
  [[ -n "${BASE_SEPOLIA_RPC:-}" ]] && env_vars+=",BASE_SEPOLIA_RPC=${BASE_SEPOLIA_RPC}"
  [[ -n "${USDC_ADDRESS:-}" ]]     && env_vars+=",USDC_ADDRESS=${USDC_ADDRESS}"
  [[ -n "${CORS_ORIGIN:-}" ]]      && env_vars+=",CORS_ORIGIN=${CORS_ORIGIN}"
  [[ -n "${FEE_BPS:-}" ]]          && env_vars+=",FEE_BPS=${FEE_BPS}"
  [[ -n "${FEE_FLAT_USDC:-}" ]]    && env_vars+=",FEE_FLAT_USDC=${FEE_FLAT_USDC}"
  [[ -n "${FEE_RECIPIENT:-}" ]]    && env_vars+=",FEE_RECIPIENT=${FEE_RECIPIENT}"
  [[ -n "${API_KEYS:-}" ]]         && env_vars+=",API_KEYS=${API_KEYS}"
  [[ -n "${DEMO_MODE:-}" ]]        && env_vars+=",DEMO_MODE=${DEMO_MODE}"

  # Deploy
  info "Deploying to Cloud Run..."
  gcloud run deploy "${CLOUD_RUN_SERVICE}" \
    --image "${image_tag}" \
    --platform managed \
    --region "${GCP_REGION}" \
    --port 8080 \
    --memory "${MEMORY}" \
    --cpu "${CPU}" \
    --min-instances "${MIN_INSTANCES}" \
    --max-instances "${MAX_INSTANCES}" \
    --allow-unauthenticated \
    --set-env-vars "${env_vars}" \
    --project "${GCP_PROJECT}"

  local service_url
  service_url=$(gcloud run services describe "${CLOUD_RUN_SERVICE}" \
    --region "${GCP_REGION}" \
    --project "${GCP_PROJECT}" \
    --format "value(status.url)" 2>/dev/null || echo "")

  echo ""
  success "Facilitator deployed!"
  [[ -n "${service_url}" ]] && echo -e "  URL: ${GREEN}${service_url}${NC}"
}

# ── Entry point ───────────────────────────────────────────────────────────────
CMD="${1:-}"
case "${CMD}" in
  setup)  cmd_setup  ;;
  deploy) cmd_deploy ;;
  *)
    echo -e "${RED}Usage:${NC} $0 <setup|deploy>"
    echo ""
    echo "  setup   One-time GCP project setup (enable APIs, create registry, store secrets)"
    echo "  deploy  Build Docker image, push to Artifact Registry, deploy to Cloud Run"
    echo ""
    echo "See the top of this file for required environment variables."
    exit 1
    ;;
esac
