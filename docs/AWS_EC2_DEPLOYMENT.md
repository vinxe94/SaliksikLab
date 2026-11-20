# Deploy Tukiva on AWS EC2

This setup keeps Django, PostgreSQL, the Docker hosting worker, and the React frontend on one Ubuntu EC2 instance. Caddy terminates HTTPS. Uploaded previews use the existing Cloudflare Quick Tunnel integration.

## 1. Create the EC2 instance

- Select Ubuntu Server 24.04 LTS, x86_64, in the Asia Pacific (Sydney) region (`ap-southeast-2`).
- Select an EC2 instance type that has sufficient memory for PostgreSQL, Django, and Docker builds. A 2 GB instance is only suitable for a small trial and can run out of memory during builds.
- Attach persistent storage with enough space for PostgreSQL, media, backups, and Docker images.
- Create a security group with inbound SSH (22) restricted to your IP, and HTTP (80) and HTTPS (443) open. Do not allow inbound 5432, 5433, 8080, 3000, or the Docker API port.
- Assign a stable public IP (for example, an Elastic IP) and create an `A` record for your domain pointing to it.

## 2. Install Docker and clone the repository

Install Docker Engine and the Docker Compose plugin using Docker's official Ubuntu instructions: <https://docs.docker.com/engine/install/ubuntu/>. Then connect to the instance and run:

```bash
sudo apt update
sudo apt install -y git
sudo install -d -o "$USER" /opt/tukiva
git clone https://github.com/vinxe94/SaliksikLab.git /opt/tukiva
cd /opt/tukiva
```

The GitHub repository must contain the production setup changes. If you use a private repository, configure GitHub SSH access on the instance instead of putting an access token in the clone URL.

## 3. Configure secrets and the domain

Create the private Compose environment file:

```bash
cp .env.production.example .env
chmod 600 .env
openssl rand -hex 48
openssl rand -hex 32
```

Edit `.env`: set `DOMAIN` to the DNS name you pointed to the EC2 IP, and replace `DJANGO_SECRET_KEY` and `POSTGRES_PASSWORD` with separate generated values. Never commit `.env` or paste these secrets into chat.

## 4. Start Tukiva

```bash
sudo docker compose \
  -f docker-compose.yml \
  -f docker-compose.hosting.yml \
  -f docker-compose.production.yml \
  up -d --build
```

The backend entrypoint applies migrations and collects static files. Confirm that all services are running:

```bash
sudo docker compose \
  -f docker-compose.yml \
  -f docker-compose.hosting.yml \
  -f docker-compose.production.yml \
  ps
```

Caddy obtains and renews HTTPS certificates when the domain resolves to the instance and ports 80 and 443 are reachable. Open `https://your-domain` in a browser. For service logs, use the same three Compose file arguments followed by `logs -f backend hosting-worker caddy`.

## Persistent data and security

The Compose volumes preserve PostgreSQL data, uploaded media, private submissions, deployment source ZIPs, and Caddy certificates across container rebuilds. They do not protect data from instance or disk loss; configure and verify off-instance database and volume backups before using real research data.

The hosting worker requires `/var/run/docker.sock` to create and remove isolated preview containers. Keep SSH and administrator access restricted, keep Docker and database ports closed to the public internet, and allow only trusted administrators to publish or run submitted systems.

The AWS Free account plan is temporary. Check AWS Billing for the plan end date and arrange a paid plan or a migration before the Free plan expires so the instance and its data remain accessible.
