# SaliksikLab — Research Repository System

A web-based platform for managing, submitting, and reviewing academic research outputs. Built with **Django REST Framework** (backend) and **React + Vite** (frontend), using **PostgreSQL** as the database.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Backend Setup (Django)](#2-backend-setup-django)
  - [3. Frontend Setup (React)](#3-frontend-setup-react)
  - [4. Environment Variables](#4-environment-variables)
  - [5. Running the App](#5-running-the-app)
- [User Roles](#user-roles)
- [Version Control System](#version-control-system)
  - [How It Works](#how-it-works)
  - [User Flow](#user-flow)
  - [Version History Panel](#version-history-panel)
  - [Submitting a Revision](#submitting-a-revision)
  - [Admin Rollback](#admin-rollback)
- [API Overview](#api-overview)
- [File Upload Limits](#file-upload-limits)
- [Email Notifications](#email-notifications)

---

## Features

- 🔐 JWT-based authentication (login, register, password reset)
- 👤 Role-based access: **Admin** and **Student/User**
- 📂 Upload research outputs (thesis, source code, documentation, etc.)
- 🔍 Search and filter the repository by title, author, department, year, type
- ✅ Admin approval / rejection workflow with feedback
- 📜 **Version control** — submit revisions with change notes, full history preserved
- ⬇️ File download tracking with download counts
- 👁️ Inline file previewer (PDF, images, text/code files)
- 📊 Dashboard with analytics (by type, department, year)
- 📧 Email notifications for approvals, rejections, and revisions
- 🗂️ CSV export and JSON backup (admin only)

---

## Tech Stack

| Layer     | Technology                                      |
|-----------|-------------------------------------------------|
| Backend   | Python 3, Django 4+, Django REST Framework      |
| Auth      | Simple JWT (`djangorestframework-simplejwt`)    |
| Frontend  | React 18, Vite 5, React Router 7                |
| Styling   | Vanilla CSS (custom design system)              |
| Database  | PostgreSQL                                      |
| File I/O  | Django `FileField`, served via `FileResponse`   |
| Icons     | Lucide React                                    |
| Toasts    | react-hot-toast                                 |

---

## Project Structure

```
SaliksikLab/
├── backend/                  # Django project
│   ├── accounts/             # User model, auth views, serializers
│   ├── config/               # Django settings, URL config
│   │   ├── settings.py
│   │   └── urls.py
│   ├── repository/           # Core app: outputs, versions, files
│   │   ├── models.py         # ResearchOutput, OutputFile, DownloadLog
│   │   ├── serializers.py    # DRF serializers
│   │   ├── views.py          # All API views
│   │   └── urls.py           # Repository endpoint routes
│   ├── media/                # Uploaded files (auto-created)
│   │   └── outputs/<id>/v<N>/<filename>
│   ├── manage.py
│   ├── requirements.txt
│   └── .env                  # Environment variables (not committed)
│
└── frontend/                 # React + Vite project
    ├── src/
    │   ├── api/              # Axios instance (axios.js)
    │   ├── components/       # Sidebar, shared UI
    │   ├── contexts/         # AuthContext (JWT state)
    │   └── pages/            # All page components
    │       ├── LoginPage.jsx
    │       ├── RegisterPage.jsx
    │       ├── DashboardPage.jsx
    │       ├── RepositoryPage.jsx
    │       ├── DetailPage.jsx        ← version control UI lives here
    │       ├── UploadPage.jsx
    │       ├── AdminPage.jsx
    │       └── ProfilePage.jsx
    ├── package.json
    └── vite.config.js
```

---

## Prerequisites

Make sure the following are installed on your machine:

- **Python** 3.10+
- **Node.js** 18+ and **npm**
- **PostgreSQL** 14+
- **Git**

---

## Installation & Setup

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd SaliksikLab
```

---

### 2. Backend Setup (Django)

```bash
# Navigate to backend
cd backend

# Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate        # On Windows: venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt
```

#### Create the PostgreSQL Database

```sql
-- In your PostgreSQL shell (psql):
CREATE DATABASE thesis_repo;
CREATE USER postgres WITH PASSWORD 'postgres';
GRANT ALL PRIVILEGES ON DATABASE thesis_repo TO postgres;
```

#### Configure environment variables (see [Environment Variables](#4-environment-variables))

```bash
# Copy example env
cp .env.example .env
# Then edit .env with your actual DB credentials and secret key
```

#### Apply Migrations & Create Superuser

```bash
python3 manage.py migrate
python3 manage.py createsuperuser
```

When creating the superuser, you will be prompted for email, full name, and password. After creation, log into the Django admin at `http://localhost:8080/admin/` and set the user's **role** to `admin`.

---

### 3. Frontend Setup (React)

```bash
# Navigate to frontend (from project root)
cd frontend

# Install dependencies
npm install
```

---

### 4. Environment Variables

Create a `.env` file inside the `backend/` folder with the following:

```env
# Django
SECRET_KEY=your-secret-key-here
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

# CORS (must match frontend URL)
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# PostgreSQL
DB_NAME=thesis_repo
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432

# Email (optional — defaults to console output in development)
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-password
DEFAULT_FROM_EMAIL=Research Repository <noreply@repository.local>

# Frontend URL (used in password reset links)
FRONTEND_URL=http://localhost:5173
```

> **Note:** For Gmail, generate an [App Password](https://support.google.com/accounts/answer/185833) if 2FA is enabled.

---

### 5. Running the App

Open **two terminals** simultaneously:

**Terminal 1 — Django Backend:**
```bash
cd backend
source venv/bin/activate
python3 manage.py runserver 8080
```
Backend runs at: `http://localhost:8080`

**Terminal 2 — React Frontend:**
```bash
cd frontend
npm run dev
```
Frontend runs at: `http://localhost:5173`

Open your browser and go to **http://localhost:5173**.

---

## User Roles

| Role      | Permissions                                                                 |
|-----------|-----------------------------------------------------------------------------|
| `student` | Register, upload outputs, revise own submissions, browse approved outputs   |
| `admin`   | All of the above + approve/reject, rollback versions, export data, view all |

> New registrations default to `student`. Admins must manually approve new accounts or promote users via the Admin Panel.

---

## Version Control System

SaliksikLab includes a built-in version control system for research submissions. Every file upload is versioned, and users can submit revisions while admins maintain full history with rollback capability.

---

### How It Works

Every research output has a **parent record** (`ResearchOutput`) that holds metadata, and one or more **versioned file records** (`OutputFile`) attached to it:

```
ResearchOutput (id=5, title="My Thesis")
  └── OutputFile  version=1  [thesis_draft.pdf]      ← initial upload
  └── OutputFile  version=2  [thesis_revised.pdf]    ← after revision
  └── OutputFile  version=3  [thesis_final.pdf]      ← after another revision
```

Files are stored on disk at:
```
media/outputs/<output_id>/v<version_number>/<filename>
```

---

### User Flow

```
┌──────────────────────────────────────────────────────────────┐
│   User uploads → v1 created → Status: Pending Review        │
│         ↓                                                    │
│   Admin reviews → Approve ✅  or  Reject ❌                  │
│         ↓                                                    │
│   User revises → v2 created → Status resets: Pending Review │
│         ↓         (email sent to all admins)                 │
│   Admin re-reviews → Approve ✅  or  Reject ❌               │
└──────────────────────────────────────────────────────────────┘
```

Key behaviors:
- **Submitting a revision always resets the approval status to Pending Review**, regardless of whether it was previously approved or rejected.
- **All previous versions are preserved** and remain downloadable/viewable.
- **Admin email notifications** are sent whenever a revision is submitted.
- **Metadata can be updated** during revision (title, abstract, author, keywords, etc.).

---

### Version History Panel

On a submission's detail page, the right sidebar shows the full version history:

```
🔄 Version History              [3 versions]

┌─────────────────────────────────────────────┐
│ v3  [Current]                               │
│ thesis_final.pdf                            │
│ 1.4 MB · Mar 2, 2026 · Juan dela Cruz      │
│ ┊ Revised conclusion and references         │
│                               [👁️]  [⬇️]   │
└─────────────────────────────────────────────┘
  v2
  thesis_revised.pdf
  1.2 MB · Feb 28, 2026 · Juan dela Cruz
  ┊ Fixed methodology section
                         [👁️]  [⬇️]  [↩ Rollback]

  v1
  thesis_draft.pdf
  0.9 MB · Feb 26, 2026
                         [👁️]  [⬇️]  [↩ Rollback]
```

- The **latest version** is always shown first with a green **[Current]** badge.
- Each version shows its filename, file size, upload date, uploader name, and change notes.
- **👁️ View** — opens the file inline (PDF viewer, image viewer, or text viewer).
- **⬇️ Download** — downloads that specific version's file.
- **↩ Rollback** — visible to admins only on older versions (see below).

---

### Submitting a Revision

Only the **submission owner** or an **admin** can submit a revision. From the detail page:

1. Click the **🔄 Revise** button in the page header.
2. An inline form expands below the metadata card:

```
┌─── Submit Revision ────────────────────────────────────────┐
│                                                            │
│  ⚠ Submitting a revision will reset the approval          │
│    status to Pending Review.                               │
│                                                            │
│  New File *         [Choose File...]                       │
│                                                            │
│  Change Notes                                              │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Describe what changed in this revision…              │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ▶ Update Metadata (optional)                              │
│    ├─ Title                                                │
│    ├─ Author(s) / Adviser                                  │
│    ├─ Department / Course                                  │
│    ├─ Abstract                                             │
│    ├─ Co-Authors                                           │
│    └─ Keywords                                             │
│                                                            │
│  [Submit Revision]    [Cancel]                             │
└────────────────────────────────────────────────────────────┘
```

3. After submission:
   - The version number increments (e.g., v2 → v3).
   - The status badge on the detail page changes to **🕐 Pending Review**.
   - A success toast appears: *"Revision v3 uploaded! Status reset to Pending Review."*
   - All admin users receive an email notification.

---

### Admin Rollback

Admins can revert a submission to any earlier version:

1. Navigate to the submission's detail page.
2. In the **Version History** panel, click **↩ Rollback** on an older version.
3. A confirmation dialog appears:
   > *"Rollback to version 1? All newer versions will be permanently deleted."*
4. If confirmed:
   - All `OutputFile` records with a version number **greater than** the target are deleted.
   - The corresponding files on disk are also permanently removed.
   - The version history refreshes to show the rolled-back state.

> ⚠️ **Rollback is irreversible.** Deleted versions and their files cannot be recovered.

---

## API Overview

All endpoints are prefixed with `/api/`.

### Auth (`/api/auth/`)

| Method | Endpoint              | Description                   |
|--------|-----------------------|-------------------------------|
| POST   | `/auth/register/`     | Register a new user           |
| POST   | `/auth/login/`        | Login, returns JWT tokens     |
| POST   | `/auth/refresh/`      | Refresh access token          |
| GET    | `/auth/me/`           | Get current user profile      |
| PATCH  | `/auth/me/`           | Update profile / password     |
| POST   | `/auth/forgot-password/`  | Send password reset email |
| POST   | `/auth/reset-password/`   | Complete password reset   |

### Repository (`/api/repository/`)

| Method | Endpoint                            | Description                              |
|--------|-------------------------------------|------------------------------------------|
| GET    | `/repository/`                      | List research outputs                    |
| POST   | `/repository/`                      | Upload a new output                      |
| GET    | `/repository/<id>/`                 | Get full details of an output            |
| PATCH  | `/repository/<id>/`                 | Update output metadata                   |
| DELETE | `/repository/<id>/`                 | Soft-delete an output                    |
| POST   | `/repository/<id>/approve/`         | Approve or reject (admin only)           |
| GET    | `/repository/<id>/download/`        | Download latest version                  |
| GET    | `/repository/<id>/download/<fid>/`  | Download a specific version              |
| GET    | `/repository/<id>/preview/`         | Preview latest version inline            |
| GET    | `/repository/<id>/preview/<fid>/`   | Preview a specific version inline        |
| POST   | `/repository/<id>/revise/`          | Submit a new revision                    |
| GET    | `/repository/<id>/versions/`        | List all versions                        |
| POST   | `/repository/<id>/rollback/`        | Rollback to a version (admin only)       |
| GET    | `/repository/stats/`                | Dashboard analytics                      |
| GET    | `/repository/export/csv/`           | CSV export (admin only)                  |
| GET    | `/repository/backup/`               | JSON export (admin only)                 |

---

## File Upload Limits

| Setting                  | Value   |
|--------------------------|---------|
| Maximum file size        | 100 MB  |
| Allowed extensions       | `.pdf`, `.doc`, `.docx`, `.txt`, `.zip`, `.tar`, `.gz`, `.rar`, `.py`, `.js`, `.ts`, `.java`, `.c`, `.cpp`, `.h`, `.cs`, `.php`, `.rb`, `.html`, `.css`, `.json`, `.xml`, `.yaml`, `.yml`, `.md`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg` |

---

## Email Notifications

The system sends email notifications for the following events:

| Event                   | Recipient        |
|-------------------------|------------------|
| Submission approved     | Submission owner |
| Submission rejected     | Submission owner |
| Revision submitted      | All admin users  |
| Password reset request  | Requesting user  |

In **development**, emails are printed to the Django console by default (`EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend`). To send real emails, configure SMTP settings in your `.env` file.

---

## License

This project is for academic use. All research outputs uploaded to this system remain the intellectual property of their respective authors.
