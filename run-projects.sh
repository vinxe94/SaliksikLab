#!/usr/bin/env bash
set -euo pipefail

# Edit these if your project folders live somewhere else.
DESKTOP_DIR="${DESKTOP_DIR:-/home/vince/Desktop}"
SALIKSIKLAB_DIR="${SALIKSIKLAB_DIR:-$DESKTOP_DIR/SaliksikLab}"
THESIS_DIR="${THESIS_DIR:-/home/vince/thesis}"
TABLE_EGG_DIR="${TABLE_EGG_DIR:-/home/vince/table-egg-management-system}"
YOURDESK_DIR="${YOURDESK_DIR:-$DESKTOP_DIR/YourDesk}"

PIDS=()

usage() {
  cat <<'EOF'
Usage:
  ./run-projects.sh <project>

Projects:
  saliksiklab   Backend 8080, frontend 5173
  thesis        Backend 8002, frontend 5175
  table-egg     Backend 8000, frontend 5174
  yourdesk      Backend 8001
  all           Start all configured projects

Path overrides:
  SALIKSIKLAB_DIR=/path/to/SaliksikLab ./run-projects.sh saliksiklab
  THESIS_DIR=/path/to/thesis ./run-projects.sh thesis
  TABLE_EGG_DIR=/path/to/table-egg-management-system ./run-projects.sh table-egg
  YOURDESK_DIR=/path/to/YourDesk ./run-projects.sh yourdesk
EOF
}

require_dir() {
  local dir="$1"
  local label="$2"

  if [[ ! -d "$dir" ]]; then
    echo "Missing $label directory: $dir"
    echo "Set ${label}_DIR to the correct path, then run this script again."
    exit 1
  fi
}

activate_venv_if_present() {
  local project_dir="$1"
  local backend_dir="$2"

  if [[ -f "$backend_dir/venv/bin/activate" ]]; then
    # shellcheck disable=SC1091
    source "$backend_dir/venv/bin/activate"
  elif [[ -f "$backend_dir/.venv/bin/activate" ]]; then
    # shellcheck disable=SC1091
    source "$backend_dir/.venv/bin/activate"
  elif [[ -f "$project_dir/venv/bin/activate" ]]; then
    # shellcheck disable=SC1091
    source "$project_dir/venv/bin/activate"
  elif [[ -f "$project_dir/.venv/bin/activate" ]]; then
    # shellcheck disable=SC1091
    source "$project_dir/.venv/bin/activate"
  fi
}

start_process() {
  local label="$1"
  shift

  echo "Starting $label..."
  (
    "$@"
  ) &
  PIDS+=("$!")
}

start_django_backend() {
  local project_dir="$1"
  local port="$2"
  local label="$3"
  local backend_dir="$project_dir/backend"

  require_dir "$project_dir" "$label"
  require_dir "$backend_dir" "$label backend"

  start_process "$label backend on port $port" bash -lc "
    cd '$backend_dir'
    $(declare -f activate_venv_if_present)
    activate_venv_if_present '$project_dir' '$backend_dir'
    python manage.py runserver 0.0.0.0:$port
  "
}

start_fastapi_backend() {
  local project_dir="$1"
  local port="$2"
  local label="$3"
  local backend_dir="$project_dir/backend"

  require_dir "$project_dir" "$label"
  require_dir "$backend_dir" "$label backend"

  start_process "$label backend on port $port" bash -lc "
    cd '$backend_dir'
    $(declare -f activate_venv_if_present)
    activate_venv_if_present '$project_dir' '$backend_dir'
    uvicorn app.main:app --reload --host 0.0.0.0 --port $port
  "
}

start_frontend() {
  local project_dir="$1"
  local port="$2"
  local label="$3"
  local frontend_dir="$project_dir/frontend"

  require_dir "$frontend_dir" "$label frontend"

  start_process "$label frontend on port $port" bash -lc "
    cd '$frontend_dir'
    npm run dev -- --host 0.0.0.0 --port $port
  "
}

start_saliksiklab() {
  start_django_backend "$SALIKSIKLAB_DIR" 8080 "SALIKSIKLAB"
  start_frontend "$SALIKSIKLAB_DIR" 5173 "SALIKSIKLAB"
}

start_thesis() {
  start_fastapi_backend "$THESIS_DIR" 8002 "THESIS"
  start_frontend "$THESIS_DIR" 5175 "THESIS"
}

start_table_egg() {
  start_fastapi_backend "$TABLE_EGG_DIR" 8000 "TABLE_EGG"
  start_frontend "$TABLE_EGG_DIR" 5174 "TABLE_EGG"
}

start_yourdesk() {
  start_django_backend "$YOURDESK_DIR" 8001 "YOURDESK"
}

cleanup() {
  if [[ "${#PIDS[@]}" -gt 0 ]]; then
    echo
    echo "Stopping running servers..."
    kill "${PIDS[@]}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

PROJECT="${1:-}"

case "$PROJECT" in
  saliksiklab)
    start_saliksiklab
    ;;
  thesis)
    start_thesis
    ;;
  table-egg|table-egg-management-system)
    start_table_egg
    ;;
  yourdesk)
    start_yourdesk
    ;;
  all)
    start_saliksiklab
    start_thesis
    start_table_egg
    start_yourdesk
    ;;
  -h|--help|help|"")
    usage
    exit 0
    ;;
  *)
    echo "Unknown project: $PROJECT"
    echo
    usage
    exit 1
    ;;
esac

echo
echo "Servers are running. Press Ctrl+C to stop."
wait
