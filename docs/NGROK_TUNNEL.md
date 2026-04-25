# Ngrok Tunnel

Use ngrok when you want to expose a local app without managing a VPS, SSH reverse tunnels, firewall rules, or `GatewayPorts`.

## 1. Install ngrok

Install ngrok from:

```text
https://ngrok.com/download
```

Then sign in to your ngrok dashboard and copy your auth token.

Add the token locally:

```bash
ngrok config add-authtoken YOUR_NGROK_AUTHTOKEN
```

Verify ngrok works:

```bash
ngrok version
```

## 2. Configure This Repo

Copy the example config:

```bash
cp scripts/ngrok-tunnel.env.example scripts/ngrok-tunnel.env
```

Edit it:

```bash
nano scripts/ngrok-tunnel.env
```

Default config for a local app on `localhost:8000`:

```env
LOCAL_HOST=localhost
LOCAL_PORT=8000
NGROK_DOMAIN=
NGROK_BASIC_AUTH=
```

## 3. Start Your Local App

Make sure your app is running:

```bash
curl http://localhost:8000
```

## 4. Start The Tunnel

Using the config file:

```bash
scripts/ngrok-tunnel.sh
```

Or with direct flags:

```bash
scripts/ngrok-tunnel.sh --local-port 8000
```

Ngrok will print a public URL like:

```text
https://random-name.ngrok-free.app
```

Open that URL in a browser to access your local app from the internet.

## 5. Working Example

For a Flask app on local port `5000`:

```bash
scripts/ngrok-tunnel.sh --local-port 5000
```

Raw ngrok equivalent:

```bash
ngrok http localhost:5000
```

## 6. Static Domain

If your ngrok account has a reserved domain, set:

```env
NGROK_DOMAIN=your-domain.ngrok-free.app
```

Then start:

```bash
scripts/ngrok-tunnel.sh
```

Or:

```bash
scripts/ngrok-tunnel.sh --local-port 8000 --domain your-domain.ngrok-free.app
```

The script uses ngrok's current `--url` flag internally.

## 7. Basic Auth

To protect the public tunnel:

```env
NGROK_BASIC_AUTH=admin:change-this-password
```

Or:

```bash
scripts/ngrok-tunnel.sh --basic-auth admin:change-this-password
```

## 8. systemd Service

Copy the service template:

```bash
sudo cp scripts/ngrok-tunnel.service.example /etc/systemd/system/saliksiklab-ngrok.service
```

Edit the user and paths if needed:

```bash
sudo nano /etc/systemd/system/saliksiklab-ngrok.service
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable saliksiklab-ngrok
sudo systemctl start saliksiklab-ngrok
```

View logs:

```bash
journalctl -u saliksiklab-ngrok -f
```

## 9. Troubleshooting

Check your app:

```bash
curl http://localhost:8000
```

Check ngrok auth:

```bash
ngrok config check
```

Run a dry run:

```bash
scripts/ngrok-tunnel.sh --dry-run
```

Common problems:

- Ngrok is not installed or not on `PATH`.
- Auth token was not added with `ngrok config add-authtoken`.
- Local app is not running.
- Wrong local port.
- Reserved domain does not belong to your ngrok account.
- Reserved domain is already online in another ngrok session. Stop the old session or temporarily clear `NGROK_DOMAIN`.
- Public app works but API calls fail because frontend/backend URLs are hardcoded to localhost.

## 10. Quick Commands

For SaliksikLab on port `8000`:

```bash
scripts/ngrok-tunnel.sh --local-port 8000
```

For Flask on port `5000`:

```bash
scripts/ngrok-tunnel.sh --local-port 5000
```
