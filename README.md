# SaliksikLab

SaliksikLab is a research repository management system for submitting, reviewing, archiving, and browsing academic PDF outputs. It uses a Django REST Framework backend, a React + Vite frontend, and PostgreSQL for persistent data.

## Current Scope

SaliksikLab currently provides:

- JWT authentication, registration, profile editing, and password reset.
- Role-based access for admin, faculty, student, and researcher users.
- Account approval and user management for admins.
- PDF-focused archive submission with metadata, keywords, public/private visibility, assigned faculty, and optional system links.
- Review workflows for pending, approved, rejected, and revision-requested archive documents.
- Archive version history and revision upload.
- Repository browsing with search, filters, inline PDF viewing, previews, and downloads.
- Admin analytics with approval donut chart, user engagement line chart, course distribution, and department/course output counts.
- Dashboard summary cards, recent archive activity, and recent submissions.
- Department and course management.
- CSV export plus JSON backup/restore for repository data.

Collaboration, ngrok/SSH tunneling, and Hugging Face translation/model-cache features have been removed.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Backend | Python, Django, Django REST Framework |
| Auth | Simple JWT |
| Frontend | React 18, Vite, React Router |
| Charts | Chart.js, react-chartjs-2 |
| Styling | Custom CSS in `frontend/src/index.css` |
| Database | PostgreSQL |
| File Storage | Django media files |
| Deployment | Docker, Docker Compose, Nginx frontend container |

## Project Structure

```text
SaliksikLab/
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

| Route | Page | Access |
| --- | --- | --- |
| `/login` | Login | Guest |
| `/register` | Register | Guest |
| `/forgot-password` | Password reset request | Guest |
| `/reset-password` | Password reset confirm | Guest |
| `/dashboard` | Dashboard | Authenticated |
| `/repository` | Repository browser | Authenticated |
| `/archives/:id` | Archive detail and review actions | Authenticated |
| `/archives/:id/view` | PDF viewer | Authenticated |
| `/upload` | Archive upload | Authenticated |
| `/profile` | Profile | Authenticated |
| `/admin` | Management | Admin |
| `/analytics` | Analytics | Admin |
| `/reports` | Report generation page | Admin route, not shown in sidebar |

## Backend API Overview

All API paths are served under `/api/`.

### Auth

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register/` | Create user account |
| `POST` | `/api/auth/login/` | Login and create a login event |
| `POST` | `/api/auth/refresh/` | Refresh JWT |
| `GET/PATCH` | `/api/auth/me/` | Get or update current user |
| `GET` | `/api/auth/faculty/` | List active approved faculty |
| `GET` | `/api/auth/admin/users/` | Admin user list |
| `PATCH` | `/api/auth/admin/users/<id>/` | Admin user update |
| `POST` | `/api/auth/admin/users/<id>/approve/` | Toggle account approval |
| `POST` | `/api/auth/password-reset/` | Request password reset |
| `POST` | `/api/auth/password-reset/confirm/` | Confirm password reset |

### Repository And Archives

| Method | Path | Purpose |
| --- | --- | --- |
| `GET/POST` | `/api/repository/` | Legacy research output list/create |
| `GET` | `/api/repository/stats/` | Dashboard and analytics stats |
| `GET` | `/api/repository/export/csv/` | Admin CSV export |
| `GET/POST` | `/api/repository/backup/` | Admin JSON backup |
| `POST` | `/api/repository/restore/` | Admin JSON restore |
| `GET/POST` | `/api/repository/archives/` | Archive list/create |
| `GET/PATCH/DELETE` | `/api/repository/archives/<id>/` | Archive detail/update/delete |
| `GET` | `/api/repository/archives/<id>/preview/` | Preview current file |
| `GET` | `/api/repository/archives/<id>/download/` | Download current file |
| `GET` | `/api/repository/archives/<id>/versions/` | Archive version history |
| `POST` | `/api/repository/archives/<id>/revise/` | Upload revised archive file |
| `POST` | `/api/repository/archives/<id>/review/` | Approve, reject, or request revision |
| `GET/POST` | `/api/repository/departments/` | Department management |
| `GET/POST` | `/api/repository/courses/` | Course management |

## Data Model Summary

| Model | Purpose |
| --- | --- |
| `accounts.User` | Custom user with role, department, avatar, approval state |
| `accounts.PasswordResetToken` | Password reset tokens |
| `accounts.LoginEvent` | Successful login history for student engagement analytics |
| `repository.ResearchOutput` | Legacy research output metadata |
| `repository.OutputFile` | Legacy output file versions |
| `repository.DownloadLog` | Download tracking for legacy outputs |
| `repository.Department` | Academic department list |
| `repository.Course` | Course list, optionally linked to a department |
| `repository.Repository` | General repository container |
| `repository.RepositoryFile` | Versioned repository file |
| `repository.ArchiveDocument` | Main PDF archive record and review state |
| `repository.ArchiveDocumentVersion` | Version history for archive revisions |

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

| Service | URL |
| --- | --- |
| Frontend | `http://localhost:3000` |
| Backend | `http://localhost:8080` |
| PostgreSQL | `localhost:5432` |

Docker volumes store PostgreSQL data, uploaded media, and collected static files.

## Environment Variables

Create `backend/.env` from `backend/.env.example` and set:

```env
SECRET_KEY=your-secret-key
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
CORS_ALLOWED_ORIGIN_REGEXES=
CSRF_TRUSTED_ORIGINS=
DB_NAME=thesis_repo
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432
FRONTEND_URL=http://localhost:5173
```

## Cleanup Notes

The following are local/generated data and should not be treated as core source:

- `backend/media/`
- `backend/db.sqlite3`
- `backend/**/__pycache__/`
- `frontend/dist/`
- `frontend/node_modules/`
- local virtual environments such as `.venv/` or `backend/venv/`
