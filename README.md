# Tukiva

Tukiva is a research repository management system for submitting, reviewing, archiving, and browsing academic PDF outputs. It uses a Django REST Framework backend, a React + Vite frontend, and PostgreSQL for persistent data.

## Current Scope

Tukiva currently provides:

- JWT authentication, registration, profile editing, and password reset.
- Role-based access for admin, faculty, and student users.
- Account approval and user management for admins.
- Student upload requests with private research PDFs and system ZIPs for administrator review.
- An administrator-only, first-come/first-served queue with approve, reject, and return-for-revision actions.
- Administrator-only upload and publication of research PDFs and executable-system ZIP packages.
- Published archive version history, system downloads, and optional system links.
- Repository browsing with search, filters, inline PDF viewing, previews, and downloads.
- Admin analytics with approval donut chart, user engagement line chart, course distribution, and department/course output counts.
- Dashboard summary cards, recent archive activity, and recent submissions.
- Department and course management.
- CSV export plus JSON backup/restore for repository data.

Collaboration, SSH tunnel scripts, and Hugging Face translation/model-cache features have been removed. Local development still allows ngrok/Cloudflare tunnel hostnames through the frontend and backend security settings.

## Tech Stack

| Layer        | Technology                                       |
| ------------ | ------------------------------------------------ |
| Backend      | Python, Django, Django REST Framework            |
| Auth         | Simple JWT                                       |
| Frontend     | React 18, Vite, React Router                     |
| Charts       | Chart.js, react-chartjs-2                        |
| Styling      | Custom CSS in `frontend/src/index.css`           |
| Database     | PostgreSQL                                       |
| File Storage | Django media files                               |
| Deployment   | Docker, Docker Compose, Nginx frontend container |

## Project Structure

```text
Tukiva/
├── backend/
│   ├── accounts/              # User model, auth, admin user APIs, login events
│   ├── config/                # Django settings and root URL config
│   ├── repository/            # Research outputs, archive documents, review, stats
│   ├── media/                 # Local uploaded files, not source code
│   ├── manage.py
│   └── requirements.txt
├── frontend/
│   ├── public/                # Static public assets
│   ├── src/
│   │   ├── api/axios.js       # API client and token refresh handling
│   │   ├── components/        # Sidebar and language switcher
│   │   ├── contexts/          # Auth and UI language context
│   │   └── pages/             # Dashboard, repository, upload, admin, analytics, etc.
│   ├── nginx.conf
│   ├── package.json
│   └── vite.config.js
├── docker-compose.yml
├── SYSTEM_DESIGN.md
└── MULTI_LAYER_ARCHITECTURE.md
```

## Main Frontend Routes

| Route                | Page                              | Access                            |
| -------------------- | --------------------------------- | --------------------------------- |
| `/login`             | Login                             | Guest                             |
| `/register`          | Register                          | Guest                             |
| `/forgot-password`   | Password reset request            | Guest                             |
| `/reset-password`    | Password reset confirm            | Guest                             |
| `/dashboard`         | Dashboard                         | Authenticated                     |
| `/repository`        | Repository browser                | Authenticated                     |
| `/archives/:id`      | Published archive detail          | Authenticated                     |
| `/archives/:id/view` | PDF viewer                        | Authenticated                     |
| `/upload`            | Student request / admin publish   | Student or admin                  |
| `/profile`           | Profile                           | Authenticated                     |
| `/admin`             | Management                        | Admin                             |
| `/analytics`         | Analytics                         | Admin                             |
| `/reports`           | Report generation page            | Admin route, not shown in sidebar |

## Backend API Overview

All API paths are served under `/api/`.

### Auth

| Method      | Path                                  | Purpose                        |
| ----------- | ------------------------------------- | ------------------------------ |
| `POST`      | `/api/auth/register/`                 | Create user account            |
| `POST`      | `/api/auth/login/`                    | Login and create a login event |
| `POST`      | `/api/auth/refresh/`                  | Refresh JWT                    |
| `GET/PATCH` | `/api/auth/me/`                       | Get or update current user     |
| `GET`       | `/api/auth/faculty/`                  | List active approved faculty   |
| `GET`       | `/api/auth/admin/users/`              | Admin user list                |
| `PATCH`     | `/api/auth/admin/users/<id>/`         | Admin user update              |
| `POST`      | `/api/auth/admin/users/<id>/approve/` | Toggle account approval        |
| `POST`      | `/api/auth/password-reset/`           | Request password reset         |
| `POST`      | `/api/auth/password-reset/confirm/`   | Confirm password reset         |

### Repository And Archives

| Method             | Path                                      | Purpose                              |
| ------------------ | ----------------------------------------- | ------------------------------------ |
| `GET/POST`         | `/api/repository/`                        | Legacy list / admin-only create      |
| `GET`              | `/api/repository/stats/`                  | Dashboard and analytics stats        |
| `GET`              | `/api/repository/export/csv/`             | Admin CSV export                     |
| `GET/POST`         | `/api/repository/backup/`                 | Admin JSON backup                    |
| `POST`             | `/api/repository/restore/`                | Admin JSON restore                   |
| `GET/POST`         | `/api/repository/archives/`               | Archive list / admin-only publication |
| `GET/PATCH/DELETE` | `/api/repository/archives/<id>/`          | Detail / admin-only mutation         |
| `GET`              | `/api/repository/archives/<id>/preview/`  | Preview current file                 |
| `GET`              | `/api/repository/archives/<id>/download/` | Download current file                |
| `GET`              | `/api/repository/archives/<id>/versions/` | Archive version history              |
| `POST`             | `/api/repository/archives/<id>/revise/`   | Admin upload of a revised paper      |
| `GET`              | `/api/repository/archives/<id>/system/download/` | Download published system ZIP |
| `GET/POST`         | `/api/repository/submission-requests/`    | Admin queue list / student request   |
| `GET`              | `/api/repository/submission-requests/<id>/` | Admin-only request detail          |
| `POST`             | `/api/repository/submission-requests/<id>/review/` | Admin decision and publication |
| `GET`              | `/api/repository/submission-requests/<id>/status/` | Student owner checks one request |
| `POST`             | `/api/repository/submission-requests/<id>/resubmit/` | Student resubmits a returned request |
| `GET/POST`         | `/api/repository/departments/`            | Department management                |
| `GET/POST`         | `/api/repository/courses/`                | Course management                    |

## Data Model Summary

| Model                               | Purpose                                                   |
| ----------------------------------- | --------------------------------------------------------- |
| `accounts.User`                     | Custom user with role, department, avatar, approval state |
| `accounts.PasswordResetToken`       | Password reset tokens                                     |
| `accounts.LoginEvent`               | Successful login history for student engagement analytics |
| `repository.ResearchOutput`         | Legacy research output metadata                           |
| `repository.OutputFile`             | Legacy output file versions                               |
| `repository.DownloadLog`            | Download tracking for legacy outputs                      |
| `repository.Department`             | Academic department list                                  |
| `repository.Course`                 | Course list, optionally linked to a department            |
| `repository.Repository`             | General repository container                              |
| `repository.RepositoryFile`         | Versioned repository file                                 |
| `repository.ResearchSubmissionRequest` | Student metadata, private PDF/ZIP attachments, and FIFO review state |
| `repository.ArchiveDocument`        | Administrator-published paper/system archive              |
| `repository.ArchiveDocumentVersion` | Version history for archive revisions                     |

## Submission Workflow

1. A student submits metadata and a research PDF, a system ZIP, or both according to the submission type (100 MB maximum per file). Attachments are stored privately and the request receives a FIFO queue position.
2. Only administrators can list the queue. The API enforces processing of the oldest pending request first.
3. An administrator reads the submitted PDF in the review screen with page navigation and zoom, then approves, rejects with a reason, or returns the request with revision instructions. The viewer and its fonts/image decoders are hosted with the frontend. Earlier metadata-only requests can still receive missing files from the administrator.
4. A returned request can be revised by its student owner, including replacement attachments, and is placed at the end of the pending queue when resubmitted. Unchanged attachments are retained.
5. Approval copies the submitted files into a published archive whose uploader and reviewer are the administrator. An included ZIP is also saved as the archive's default hosting configuration, initially stopped. The administrator can select **Run approved system** without uploading the ZIP again; approval does not start execution or require an online hosting worker.

Pending attachments are served only to their student owner and administrators through `/api/repository/submission-requests/<id>/research/` and `/system/`. They have no public media URLs. `SUBMISSION_STORAGE_PATH` defaults to `backend/private_submissions`; keep it outside `MEDIA_ROOT` and on persistent storage. Docker Compose mounts dedicated volumes for these attachments and saved hosting packages. Run `python manage.py migrate` after this update (repository migration 0014 and hosting migration 0007), then restart the backend and hosting worker.

## Analytics

The analytics page uses `/api/repository/stats/` and currently shows:

- Approval breakdown as a donut chart.
- Student user engagement as a line chart:
  - Daily active users.
  - Logins per day.
- Outputs by course as a bar chart.
- Department and course output counts as compact ranked rows.

Login engagement data starts accumulating after the `LoginEvent` migration is applied and users log in.

## Local Setup

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 0.0.0.0:8080
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server runs on `http://localhost:5173` and proxies `/api` and `/media` to `http://localhost:8080`.

## Docker Setup

```bash
docker compose up --build
```

| Service    | URL                     |
| ---------- | ----------------------- |
| Frontend   | `http://localhost:3000` |
| Backend    | `http://localhost:8080` |
| PostgreSQL | `localhost:5432`        |

Docker volumes store PostgreSQL data, uploaded media, and collected static files.

## Environment Variables

Create `backend/.env` from `backend/.env.example` and set:

```env
SECRET_KEY=your-secret-key
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1,.ngrok-free.app,.ngrok.app,.ngrok-free.dev,.ngrok.dev,.ngrok.io,.trycloudflare.com
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
CORS_ALLOWED_ORIGIN_REGEXES=^https://.*\.ngrok-free\.app$,^https://.*\.ngrok\.app$,^https://.*\.ngrok-free\.dev$,^https://.*\.ngrok\.dev$,^https://.*\.ngrok\.io$,^https://.*\.trycloudflare\.com$
CSRF_TRUSTED_ORIGINS=https://*.ngrok-free.app,https://*.ngrok.app,https://*.ngrok-free.dev,https://*.ngrok.dev,https://*.ngrok.io,https://*.trycloudflare.com
DB_NAME=thesis_repo
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432
FRONTEND_URL=http://localhost:5173
```

## Temporary Website Hosting

Administrators can upload and manage temporary websites from the admin page's **Temporary Hosting** tab or an archive's hosting card. The existing APIs now queue isolated Docker deployments, verify HTTP readiness, and preserve the uploaded ZIP for restart. A session lasts 30 minutes after readiness, with its deadline stored in PostgreSQL.

Each execution now creates its own public `https://<random>.trycloudflare.com/` URL using a [Cloudflare Quick Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/). The worker verifies public DNS/HTTPS routing to the correct deployment before building the app; the hosting card shows the generated URL after application readiness. Share it with anyone online while the backend, hosting worker, and Docker host remain running. Stop/expiry disables access; restarting the saved system creates a new link. No Cloudflare account, token, or custom domain is required.

Apply `python manage.py migrate` (including hosting migration `0008`) and restart Django and the hosting worker after this update. `DEPLOYMENT_TUNNEL_ENABLED=true` is the default. Set `DEPLOYMENT_TUNNEL_ORIGIN` to the local **Django backend** origin if it is not `http://127.0.0.1:8080`. The worker pulls the configured `DEPLOYMENT_CLOUDFLARED_IMAGE` automatically. Its outbound Internet connection needs Cloudflare TCP port 7844. The connector runs separately from the isolated uploaded application and routes every request through the deployment's expiry checks. Connection failures appear in deployment/tunnel logs instead of producing a local-only link.

If the host's DNS resolver cannot resolve a newly generated tunnel hostname, the readiness check retries through [Cloudflare DNS over HTTPS](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/). HTTPS still verifies the original hostname and certificate. This fallback is limited to the server's check; visitors whose DNS provider has stale records may need to retry or use their browser's secure DNS setting.

The public integration checks use disposable apps and Docker resources: `RUN_CLOUDFLARE_HOSTING_TESTS=1 python manage.py test hosting.tests.test_cloudflare_integration --settings=hosting.test_settings`. They verify frontend assets, database API requests, secure cookies/CSRF, expiry, stop, and a fresh URL after restart.

For deliberate offline or custom-domain hosting, set `DEPLOYMENT_TUNNEL_ENABLED=false`; the existing `DEPLOYMENT_BASE_DOMAIN` and local preview settings then apply. Quick Tunnels are temporary development/demo links; Cloudflare does not guarantee their uptime and they do not support SSE. The existing application proxy also does not support WebSocket upgrades.

Supported languages are **JavaScript (Node.js), Python, PHP, Ruby, and C++**, plus static HTML/CSS/JavaScript sites. Ruby installs gems with Bundler; C++ compiles source with GCC inside the deployment container. Both require an HTTP server listening on `0.0.0.0` using `PORT`. See the [Ruby/C++ examples and ZIP instructions](backend/hosting/examples/README.md). Apply migrations (including `0005_add_ruby_cpp_runtimes`) and restart the worker after updating.

Run `python manage.py hosting_worker` in the backend environment alongside the normal web/frontend processes. For Linux Docker hosting, use `docker compose -f docker-compose.yml -f docker-compose.hosting.yml up --build`. The persistent worker is required for deployment processing, expiration, and recovery.

See [the temporary hosting investigation and runbook](docs/TEMPORARY_HOSTING_REPORT.md) for the old implementation's root causes, migration, storage/dependency isolation, public-domain setup, environment variables, tests, and limitations.

## Cleanup Notes

The following are local/generated data and should not be treated as core source:

- `backend/media/`
- `backend/db.sqlite3`
- `backend/**/__pycache__/`
- `frontend/dist/`
- `frontend/node_modules/`
- local virtual environments such as `.venv/` or `backend/venv/`

future plans

make the
