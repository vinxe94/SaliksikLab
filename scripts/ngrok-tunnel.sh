#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${NGROK_TUNNEL_ENV:-$ROOT_DIR/scripts/ngrok-tunnel.env}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

LOCAL_PORT="${LOCAL_PORT:-8000}"
LOCAL_HOST="${LOCAL_HOST:-localhost}"
NGROK_DOMAIN="${NGROK_DOMAIN:-}"
NGROK_REGION="${NGROK_REGION:-}"
NGROK_BASIC_AUTH="${NGROK_BASIC_AUTH:-}"
NGROK_LOG="${NGROK_LOG:-stdout}"
NGROK_POOLING_ENABLED="${NGROK_POOLING_ENABLED:-false}"
DRY_RUN="${DRY_RUN:-false}"

usage() {
  cat <<'USAGE'
Expose a local web app with ngrok.

Usage:
  scripts/ngrok-tunnel.sh [options]

Options:
  --local-port PORT       Local app port, default: 8000
  --local-host HOST       Local app host, default: localhost
  --domain DOMAIN         Optional reserved/static ngrok domain or URL
  --region REGION         Optional ngrok region
  --basic-auth USER:PASS  Optional basic auth in front of the tunnel
  --pooling-enabled       Allow multiple tunnels to share the same endpoint
  --dry-run               Print the command without running it
  -h, --help              Show this help

Environment file:
  scripts/ngrok-tunnel.env is loaded automatically when present.

Before first use:
  ngrok config add-authtoken YOUR_NGROK_AUTHTOKEN
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local-port)
      LOCAL_PORT="${2:?Missing value for --local-port}"
      shift 2
      ;;
    --local-host)
      LOCAL_HOST="${2:?Missing value for --local-host}"
      shift 2
      ;;
    --domain)
      NGROK_DOMAIN="${2:?Missing value for --domain}"
      shift 2
      ;;
    --region)
      NGROK_REGION="${2:?Missing value for --region}"
      shift 2
      ;;
    --basic-auth)
      NGROK_BASIC_AUTH="${2:?Missing value for --basic-auth}"
      shift 2
      ;;
    --pooling-enabled)
      NGROK_POOLING_ENABLED="true"
      shift
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

target="${LOCAL_HOST}:${LOCAL_PORT}"
cmd=("ngrok" "http" "$target" "--log" "$NGROK_LOG")

if [[ -n "$NGROK_DOMAIN" ]]; then
  NGROK_DOMAIN="${NGROK_DOMAIN#http://}"
  NGROK_DOMAIN="${NGROK_DOMAIN#https://}"
  cmd+=("--url" "$NGROK_DOMAIN")
fi

if [[ -n "$NGROK_REGION" ]]; then
  cmd+=("--region" "$NGROK_REGION")
fi

if [[ -n "$NGROK_BASIC_AUTH" ]]; then
  cmd+=("--basic-auth" "$NGROK_BASIC_AUTH")
fi

if [[ "$NGROK_POOLING_ENABLED" == "true" ]]; then
  cmd+=("--pooling-enabled")
fi

echo "Opening ngrok tunnel:"
echo "  local: http://${target}"
if [[ -n "$NGROK_DOMAIN" ]]; then
  echo "  public: https://${NGROK_DOMAIN}"
else
  echo "  public: shown by ngrok after startup"
fi
echo
printf 'Command:'
printf ' %q' "${cmd[@]}"
printf '\n'

if [[ "$DRY_RUN" == "true" ]]; then
  exit 0
fi

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok is not installed or not on PATH." >&2
  echo "Install it from https://ngrok.com/download, then run:" >&2
  echo "  ngrok config add-authtoken YOUR_NGROK_AUTHTOKEN" >&2
  exit 127
fi

exec "${cmd[@]}"
