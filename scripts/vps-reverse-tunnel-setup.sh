#!/usr/bin/env bash
set -euo pipefail

REMOTE_PORT="${REMOTE_PORT:-8080}"
SSHD_CONFIG="${SSHD_CONFIG:-/etc/ssh/sshd_config}"

usage() {
  cat <<'USAGE'
Configure a VPS to accept public SSH reverse tunnels.

Run this script on the VPS:
  sudo scripts/vps-reverse-tunnel-setup.sh --remote-port 8080

Options:
  --remote-port PORT   TCP port to open in the firewall, default: 8080
  -h, --help           Show this help

The script:
  - enables AllowTcpForwarding
  - enables GatewayPorts clientspecified
  - restarts ssh/sshd
  - opens the selected TCP port with ufw or firewalld when available
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --remote-port)
      REMOTE_PORT="${2:?Missing value for --remote-port}"
      shift 2
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

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run this script with sudo on the VPS." >&2
  exit 1
fi

if [[ ! -f "$SSHD_CONFIG" ]]; then
  echo "SSH daemon config not found: $SSHD_CONFIG" >&2
  exit 1
fi

backup="${SSHD_CONFIG}.reverse-tunnel.$(date +%Y%m%d%H%M%S).bak"
cp "$SSHD_CONFIG" "$backup"
echo "Backed up SSH config to $backup"

set_sshd_option() {
  local key="$1"
  local value="$2"

  if grep -qiE "^[#[:space:]]*${key}[[:space:]]+" "$SSHD_CONFIG"; then
    sed -i -E "s|^[#[:space:]]*${key}[[:space:]]+.*|${key} ${value}|I" "$SSHD_CONFIG"
  else
    printf '\n%s %s\n' "$key" "$value" >> "$SSHD_CONFIG"
  fi
}

set_sshd_option "AllowTcpForwarding" "yes"
set_sshd_option "GatewayPorts" "clientspecified"

if command -v sshd >/dev/null 2>&1; then
  sshd -t
fi

if systemctl list-unit-files ssh.service >/dev/null 2>&1; then
  systemctl restart ssh
elif systemctl list-unit-files sshd.service >/dev/null 2>&1; then
  systemctl restart sshd
else
  echo "Could not find ssh or sshd systemd service. Restart SSH manually." >&2
fi

if command -v ufw >/dev/null 2>&1; then
  ufw allow "${REMOTE_PORT}/tcp"
  ufw reload || true
elif command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --add-port="${REMOTE_PORT}/tcp" --permanent
  firewall-cmd --reload
else
  echo "No ufw or firewalld found. Open TCP ${REMOTE_PORT} in your firewall manually."
fi

echo
echo "VPS reverse tunnel support is configured."
echo "Expected SSH daemon options:"
echo "  AllowTcpForwarding yes"
echo "  GatewayPorts clientspecified"
echo
echo "Open your cloud provider firewall for TCP ${REMOTE_PORT} if it has a separate firewall panel."
