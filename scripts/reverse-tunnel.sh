#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${REVERSE_TUNNEL_ENV:-$ROOT_DIR/scripts/reverse-tunnel.env}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

SSH_USER="${SSH_USER:-}"
SSH_HOST="${SSH_HOST:-}"
LOCAL_HOST="${LOCAL_HOST:-localhost}"
LOCAL_PORT="${LOCAL_PORT:-8000}"
REMOTE_BIND="${REMOTE_BIND:-0.0.0.0}"
REMOTE_PORT="${REMOTE_PORT:-8080}"
SSH_PORT="${SSH_PORT:-22}"
SSH_KEY="${SSH_KEY:-}"
USE_AUTOSSH="${USE_AUTOSSH:-false}"
DRY_RUN="${DRY_RUN:-false}"

usage() {
  cat <<'USAGE'
Expose a local web app through an SSH reverse tunnel.

Usage:
  scripts/reverse-tunnel.sh [options]

Options:
  --user USER             Remote SSH username
  --host HOST             Remote server IP or hostname
  --local-port PORT       Local app port, default: 8000
  --remote-port PORT      Public VPS port, default: 8080
  --local-host HOST       Local host forwarded to SSH, default: localhost
  --remote-bind ADDRESS   Remote bind address, default: 0.0.0.0
  --ssh-port PORT         SSH port, default: 22
  --key PATH              SSH private key path
  --autossh               Use autossh instead of ssh
  --dry-run               Print the command without running it
  -h, --help              Show this help

Environment file:
  scripts/reverse-tunnel.env is loaded automatically when present.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --user)
      SSH_USER="${2:?Missing value for --user}"
      shift 2
      ;;
    --host)
      SSH_HOST="${2:?Missing value for --host}"
      shift 2
      ;;
    --local-port)
      LOCAL_PORT="${2:?Missing value for --local-port}"
      shift 2
      ;;
    --remote-port)
      REMOTE_PORT="${2:?Missing value for --remote-port}"
      shift 2
      ;;
    --local-host)
      LOCAL_HOST="${2:?Missing value for --local-host}"
      shift 2
      ;;
    --remote-bind)
      REMOTE_BIND="${2:?Missing value for --remote-bind}"
      shift 2
      ;;
    --ssh-port)
      SSH_PORT="${2:?Missing value for --ssh-port}"
      shift 2
      ;;
    --key)
      SSH_KEY="${2:?Missing value for --key}"
      shift 2
      ;;
    --autossh)
      USE_AUTOSSH="true"
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

if [[ -z "$SSH_USER" || -z "$SSH_HOST" ]]; then
  echo "SSH_USER and SSH_HOST are required. Set them in $ENV_FILE or pass --user and --host." >&2
  exit 2
fi

if [[ "$USE_AUTOSSH" == "true" ]] && ! command -v autossh >/dev/null 2>&1; then
  echo "autossh is not installed. Install it or run without --autossh." >&2
  exit 127
fi

runner="ssh"
cmd=()
if [[ "$USE_AUTOSSH" == "true" ]]; then
  runner="autossh"
  cmd+=("autossh" "-M" "0")
else
  cmd+=("ssh")
fi

cmd+=(
  "-N"
  "-p" "$SSH_PORT"
  "-o" "ExitOnForwardFailure=yes"
  "-o" "ServerAliveInterval=30"
  "-o" "ServerAliveCountMax=3"
)

if [[ -n "$SSH_KEY" ]]; then
  cmd+=("-i" "$SSH_KEY")
fi

cmd+=(
  "-R" "${REMOTE_BIND}:${REMOTE_PORT}:${LOCAL_HOST}:${LOCAL_PORT}"
  "${SSH_USER}@${SSH_HOST}"
)

echo "Opening reverse tunnel:"
echo "  public: http://${SSH_HOST}:${REMOTE_PORT}"
echo "  local:  http://${LOCAL_HOST}:${LOCAL_PORT}"
echo
printf 'Command:'
printf ' %q' "${cmd[@]}"
printf '\n'

if [[ "$DRY_RUN" == "true" ]]; then
  exit 0
fi

exec "${cmd[@]}"
