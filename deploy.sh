#!/usr/bin/env bash
# deploy.sh — Deploy xenga services to GCP Cloud Run (facilitator) and Vercel (web)
#
# Usage:
#   ./deploy.sh facilitator   Build & deploy the Express facilitator to GCP Cloud Run
#   ./deploy.sh web           Deploy the Next.js frontend to Vercel
#   ./deploy.sh all           Deploy both services
#
# Required environment variables (facilitator):
#   GCP_PROJECT          GCP project ID
#   GCP_REGION           Cloud Run region (e.g. us-central1)
#   CLOUD_RUN_SERVICE    Cloud Run service name (default: xenga-facilitator)
#   PRIVATE_KEY          Operator private key for on-chain transactions
#   ESCROW_VAULT_ADDRESS Deployed EscrowVault contract address
#
# Optional environment variables (facilitator):
#   ARTIFACT_REGISTRY    Registry host (default: gcr.io)
#   BASE_SEPOLIA_RPC     RPC endpoint (defaults to https://sepolia.base.org)
#   USDC_ADDRESS         USDC token address (defaults to Base Sepolia USDC)
#   CORS_ORIGIN          Allowed CORS origin (defaults to *)
#   FEE_BPS              Fee in basis points
#   FEE_FLAT_USDC        Flat fee in USDC microunits
#   FEE_RECIPIENT        Address to receive fees
#   API_KEYS             Comma-separated API keys for protected endpoints
#   DEMO_MODE            Set to "true" to enable demo funding endpoint
#   MIN_INSTANCES        Minimum Cloud Run instances (default: 0)
#   MAX_INSTANCES        Maximum Cloud Run instances (default: 10)
#   MEMORY               Cloud Run memory allocation (default: 512Mi)
#   CPU                  Cloud Run CPU allocation (default: 1)
#
# Required environment variables (web):
#   NEXT_PUBLIC_FACILITATOR_URL  URL of the deployed facilitator
#
# Optional environment variables (web):
#   VERCEL_ORG_ID        Vercel org ID (for non-interactive CI)
#   VERCEL_PROJECT_ID    Vercel project ID (for non-interactive CI)
#   VERCEL_TOKEN         Vercel API token (for non-interactive CI)
#   VERCEL_PROD          Set to "true" to deploy to production (default: preview)

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Colour

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
die()     { error "$*"; exit 1; }

# ── Defaults ─────────────────────────────────────────────────────────────────
CLOUD_RUN_SERVICE="${CLOUD_RUN_SERVICE:-xenga-facilitator}"
ARTIFACT_REGISTRY="${ARTIFACT_REGISTRY:-gcr.io}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"
MAX_INSTANCES="${MAX_INSTANCES:-10}"
MEMORY="${MEMORY:-512Mi}"
CPU="${CPU:-1}"
VERCEL_PROD="${VERCEL_PROD:-false}"

# ── Helpers ───────────────────────────────────────────────────────────────────
require_cmd() {
  command -v "$1" &>/dev/null || die "'$1' is not installed or not in PATH"
}

require_var() {
  local var="$1"
  local hint="${2:-}"
  [[ -n "${!var:-}" ]] || die "Required environment variable \$$var is not set${hint:+. $hint}"
}

confirm() {
  local msg="$1"
  read -rp "$(echo -e "${YELLOW}$msg [y/N]: ${NC}")" ans
  [[ "${ans,,}" == "y" ]] || { info "Aborted."; exit 0; }
}

# ── Deploy facilitator to GCP Cloud Run ───────────────────────────────────────
deploy_facilitator() {
  info "=== Deploying facilitator to GCP Cloud Run ==="

  # Prerequisites
  require_cmd gcloud
  require_cmd docker

  require_var GCP_PROJECT  "Set GCP_PROJECT to your GCP project ID"
  require_var GCP_REGION   "Set GCP_REGION (e.g. us-central1)"
  require_var PRIVATE_KEY  "Set PRIVATE_KEY to the operator wallet private key"
  require_var ESCROW_VAULT_ADDRESS "Set ESCROW_VAULT_ADDRESS to the deployed EscrowVault contract"

  local image="${ARTIFACT_REGISTRY}/${GCP_PROJECT}/${CLOUD_RUN_SERVICE}"
  local git_sha
  git_sha=$(git rev-parse --short HEAD 2>/dev/null || echo "local")
  local image_tag="${image}:${git_sha}"
  local image_latest="${image}:latest"

  info "GCP project  : ${GCP_PROJECT}"
  info "Region       : ${GCP_REGION}"
  info "Service      : ${CLOUD_RUN_SERVICE}"
  info "Image        : ${image_tag}"

  # Authenticate Docker with GCR/Artifact Registry
  info "Configuring Docker authentication..."
  if [[ "${ARTIFACT_REGISTRY}" == "gcr.io" ]]; then
    gcloud auth configure-docker gcr.io --quiet
  else
    # Artifact Registry: extract region from host (e.g. us-central1-docker.pkg.dev → us-central1)
    local ar_region
    ar_region=$(echo "${ARTIFACT_REGISTRY}" | cut -d'-' -f1-2 2>/dev/null || echo "${GCP_REGION}")
    gcloud auth configure-docker "${ARTIFACT_REGISTRY}" --quiet
  fi

  # Build
  info "Building Docker image..."
  docker build \
    --platform linux/amd64 \
    --tag "${image_tag}" \
    --tag "${image_latest}" \
    --file Dockerfile \
    .
  success "Docker image built: ${image_tag}"

  # Push
  info "Pushing image to registry..."
  docker push "${image_tag}"
  docker push "${image_latest}"
  success "Image pushed"

  # Build Cloud Run env-var flags from environment
  local env_flags=""

  # Required
  env_flags+=" --set-env-vars=PRIVATE_KEY=${PRIVATE_KEY}"
  env_flags+=" --set-env-vars=ESCROW_VAULT_ADDRESS=${ESCROW_VAULT_ADDRESS}"

  # Optional — only set if provided
  [[ -n "${BASE_SEPOLIA_RPC:-}" ]]   && env_flags+=" --set-env-vars=BASE_SEPOLIA_RPC=${BASE_SEPOLIA_RPC}"
  [[ -n "${USDC_ADDRESS:-}" ]]       && env_flags+=" --set-env-vars=USDC_ADDRESS=${USDC_ADDRESS}"
  [[ -n "${CORS_ORIGIN:-}" ]]        && env_flags+=" --set-env-vars=CORS_ORIGIN=${CORS_ORIGIN}"
  [[ -n "${FEE_BPS:-}" ]]            && env_flags+=" --set-env-vars=FEE_BPS=${FEE_BPS}"
  [[ -n "${FEE_FLAT_USDC:-}" ]]      && env_flags+=" --set-env-vars=FEE_FLAT_USDC=${FEE_FLAT_USDC}"
  [[ -n "${FEE_RECIPIENT:-}" ]]      && env_flags+=" --set-env-vars=FEE_RECIPIENT=${FEE_RECIPIENT}"
  [[ -n "${API_KEYS:-}" ]]           && env_flags+=" --set-env-vars=API_KEYS=${API_KEYS}"
  [[ -n "${DEMO_MODE:-}" ]]          && env_flags+=" --set-env-vars=DEMO_MODE=${DEMO_MODE}"

  # Deploy to Cloud Run
  info "Deploying to Cloud Run..."
  # shellcheck disable=SC2086
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
    --project "${GCP_PROJECT}" \
    $env_flags

  local service_url
  service_url=$(gcloud run services describe "${CLOUD_RUN_SERVICE}" \
    --region "${GCP_REGION}" \
    --project "${GCP_PROJECT}" \
    --format "value(status.url)" 2>/dev/null || echo "")

  success "Facilitator deployed!"
  [[ -n "${service_url}" ]] && echo -e "  URL: ${GREEN}${service_url}${NC}"
  echo ""
  warn "Remember to set NEXT_PUBLIC_FACILITATOR_URL=${service_url} when deploying the web frontend."
}

# ── Deploy web to Vercel ──────────────────────────────────────────────────────
deploy_web() {
  info "=== Deploying web frontend to Vercel ==="

  require_cmd vercel
  require_var NEXT_PUBLIC_FACILITATOR_URL "Set NEXT_PUBLIC_FACILITATOR_URL to the facilitator URL"

  local vercel_flags=""

  # CI mode (non-interactive) when token is set
  if [[ -n "${VERCEL_TOKEN:-}" ]]; then
    vercel_flags+=" --token ${VERCEL_TOKEN}"
    require_var VERCEL_ORG_ID     "Required in CI mode alongside VERCEL_TOKEN"
    require_var VERCEL_PROJECT_ID "Required in CI mode alongside VERCEL_TOKEN"
  fi

  [[ "${VERCEL_PROD}" == "true" ]] && vercel_flags+=" --prod"

  info "Facilitator URL : ${NEXT_PUBLIC_FACILITATOR_URL}"
  info "Production      : ${VERCEL_PROD}"

  # Build & deploy from the web/ directory
  info "Running vercel deploy..."
  local deploy_url
  # shellcheck disable=SC2086
  deploy_url=$(
    cd web && \
    NEXT_PUBLIC_FACILITATOR_URL="${NEXT_PUBLIC_FACILITATOR_URL}" \
    vercel deploy $vercel_flags 2>&1 | tee /dev/stderr | tail -1
  )

  success "Web frontend deployed!"
  [[ -n "${deploy_url}" ]] && echo -e "  URL: ${GREEN}${deploy_url}${NC}"
}

# ── Entry point ───────────────────────────────────────────────────────────────
usage() {
  grep '^# ' "$0" | sed 's/^# //' | sed '1d'
  exit 1
}

TARGET="${1:-}"

case "${TARGET}" in
  facilitator)
    deploy_facilitator
    ;;
  web)
    deploy_web
    ;;
  all)
    deploy_facilitator
    echo ""
    # If facilitator URL wasn't set externally, try to read it from Cloud Run
    if [[ -z "${NEXT_PUBLIC_FACILITATOR_URL:-}" ]]; then
      require_var GCP_PROJECT
      require_var GCP_REGION
      NEXT_PUBLIC_FACILITATOR_URL=$(gcloud run services describe "${CLOUD_RUN_SERVICE}" \
        --region "${GCP_REGION}" \
        --project "${GCP_PROJECT}" \
        --format "value(status.url)" 2>/dev/null || true)
      [[ -n "${NEXT_PUBLIC_FACILITATOR_URL}" ]] \
        && info "Auto-detected facilitator URL: ${NEXT_PUBLIC_FACILITATOR_URL}" \
        || die "Could not determine NEXT_PUBLIC_FACILITATOR_URL. Set it manually."
    fi
    deploy_web
    ;;
  *)
    echo -e "${RED}Usage:${NC} $0 <facilitator|web|all>"
    echo ""
    echo "  facilitator  Build & deploy the Express facilitator to GCP Cloud Run"
    echo "  web          Deploy the Next.js frontend to Vercel"
    echo "  all          Deploy both (facilitator first, then web with auto-detected URL)"
    echo ""
    echo "See the top of this file for required environment variables."
    exit 1
    ;;
esac
