# SSH Reverse Tunnel

Prefer the simpler ngrok setup? See `docs/NGROK_TUNNEL.md`.

This project includes a helper script for exposing a local app through a VPS with SSH reverse port forwarding.

## 1. Configure The VPS

SSH into the VPS:

```bash
ssh user@server_ip
```

Edit the SSH daemon config:

```bash
sudo nano /etc/ssh/sshd_config
```

Set:

```conf
AllowTcpForwarding yes
GatewayPorts clientspecified
```

Restart SSH:

```bash
sudo systemctl restart ssh
```

Some distros use:

```bash
sudo systemctl restart sshd
```

Or copy and run the included VPS setup script on the server:

```bash
sudo scripts/vps-reverse-tunnel-setup.sh --remote-port 8080
```

The script backs up `/etc/ssh/sshd_config`, enables reverse forwarding, restarts SSH, and opens the selected firewall port with UFW or firewalld when available.

## 2. Open The Firewall Port

For UFW:

```bash
sudo ufw allow 8080/tcp
sudo ufw reload
sudo ufw status
```

For firewalld:

```bash
sudo firewall-cmd --add-port=8080/tcp --permanent
sudo firewall-cmd --reload
```

Also allow the same TCP port in your VPS provider firewall.

## 3. Configure This Repo

Copy the example config:

```bash
cp scripts/reverse-tunnel.env.example scripts/reverse-tunnel.env
```

Edit it:

```bash
nano scripts/reverse-tunnel.env
```

For your local app on `localhost:8000`, use:

```env
SSH_USER=your_user
SSH_HOST=server_ip
LOCAL_PORT=8000
REMOTE_BIND=0.0.0.0
REMOTE_PORT=8080
```

## 4. Start The Tunnel

Using the config file:

```bash
scripts/reverse-tunnel.sh
```

Or with direct flags:

```bash
scripts/reverse-tunnel.sh --user your_user --host server_ip --local-port 8000 --remote-port 8080
```

Equivalent raw SSH command:

```bash
ssh -N -R 0.0.0.0:8080:localhost:8000 your_user@server_ip
```

Open the app from the internet:

```text
http://server_ip:8080
```

## 5. Working Example

Local app:

```text
http://localhost:5000
```

Remote public port:

```text
8080
```

Command:

```bash
scripts/reverse-tunnel.sh --user your_user --host server_ip --local-port 5000 --remote-port 8080
```

Raw SSH equivalent:

```bash
ssh -N -R 0.0.0.0:8080:localhost:5000 your_user@server_ip
```

Access:

```text
http://server_ip:8080
```

## 6. Use autossh

Install autossh locally:

```bash
sudo apt update
sudo apt install autossh
```

Then run:

```bash
scripts/reverse-tunnel.sh --autossh
```

Or set this in `scripts/reverse-tunnel.env`:

```env
USE_AUTOSSH=true
```

## 7. systemd Service

Copy the service template:

```bash
sudo cp scripts/reverse-tunnel.service.example /etc/systemd/system/saliksiklab-reverse-tunnel.service
```

Edit paths, user, and environment values if needed:

```bash
sudo nano /etc/systemd/system/saliksiklab-reverse-tunnel.service
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable saliksiklab-reverse-tunnel
sudo systemctl start saliksiklab-reverse-tunnel
```

View logs:

```bash
journalctl -u saliksiklab-reverse-tunnel -f
```

## 8. Troubleshooting

Check the local app:

```bash
curl http://localhost:8000
```

Check the VPS listener:

```bash
sudo ss -tulpen | grep 8080
```

Expected bind:

```text
0.0.0.0:8080
```

If it binds only to `127.0.0.1:8080`, check `GatewayPorts` and use `REMOTE_BIND=0.0.0.0`.

Check SSH daemon settings:

```bash
sudo sshd -T | grep -E 'gatewayports|allowtcpforwarding'
```

Run a dry-run locally:

```bash
scripts/reverse-tunnel.sh --dry-run
```

Run verbose SSH:

```bash
ssh -vvv -N -R 0.0.0.0:8080:localhost:8000 your_user@server_ip
```

Common problems:

- VPS firewall is blocking `8080/tcp`.
- Cloud provider firewall is blocking `8080/tcp`.
- `GatewayPorts` is not enabled.
- `AllowTcpForwarding` is disabled.
- Remote port is already in use.
- Local app is not actually running on the configured local port.

## 9. Security

- Prefer SSH keys over passwords.
- Use a non-root SSH user.
- Expose only the ports you need.
- Restrict firewall source IPs when possible.
- Do not expose admin/debug interfaces publicly without authentication.
- Use HTTPS through Nginx/Caddy on the VPS for production traffic.
