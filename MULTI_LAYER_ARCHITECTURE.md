# Tukiva Multi-Layer Architecture

## Purpose

This document describes the current layered architecture of Tukiva after removal of collaboration, tunneling, and AI translation/model-cache features.

## Layer Overview

```mermaid
graph TB
    subgraph L1["Layer 1: Presentation"]
        Browser[Browser]
        React[React SPA]
        CSS[Custom CSS]
    end

    subgraph L2["Layer 2: Client Application"]
        Router[React Router]
        AuthContext[AuthContext]
        LanguageContext[LanguageContext]
        Axios[Axios API Client]
        Charts[Chart.js Views]
    end

    subgraph L3["Layer 3: API/Application Services"]
        URLs[Django URL Routing]
        DRF[Django REST Framework Views]
        Serializers[DRF Serializers]
        Permissions[Role Permissions]
        JWT[JWT Auth]
    end

    subgraph L4["Layer 4: Domain"]
        Accounts[Accounts Domain]
        Repository[Repository Domain]
        Review[Archive Review Workflow]
        Analytics[Analytics Computation]
        Backup[Backup/Restore]
    end

    subgraph L5["Layer 5: Persistence and Infrastructure"]
        ORM[Django ORM]
        Postgres[(PostgreSQL)]
        Media[(Media Files)]
        SMTP[SMTP Email]
        Docker[Docker/Nginx/Gunicorn]
    end

    Browser --> React
    React --> CSS
    React --> Router
    React --> AuthContext
    React --> LanguageContext
    React --> Axios
    React --> Charts
    Axios --> URLs
    URLs --> DRF
    DRF --> Serializers
    DRF --> Permissions
    DRF --> JWT
    DRF --> Accounts
    DRF --> Repository
    Repository --> Review
    Repository --> Analytics
    Repository --> Backup
    Accounts --> ORM
    Repository --> ORM
    ORM --> Postgres
    Repository --> Media
    Accounts --> SMTP
    Docker --> React
    Docker --> DRF
```

## Layer 1: Presentation

The presentation layer is the browser-rendered React application.

| File/Area | Responsibility |
| --- | --- |
| `frontend/src/main.jsx` | React entrypoint |
| `frontend/src/App.jsx` | App routes and auth/admin route guards |
| `frontend/src/index.css` | Main design system and responsive layout |
| `frontend/src/App.css` | Legacy/global app styles |
| `frontend/public/logo.png` | Product logo |
| `frontend/nginx.conf` | Static frontend serving and API/media proxy in container |

## Layer 2: Client Application

This layer manages browser state, navigation, and API communication.

| Module | Responsibility |
| --- | --- |
| `AuthContext.jsx` | Authenticated user, login, register, logout, refresh current user |
| `LanguageContext.jsx` | Static UI text switching |
| `axios.js` | JWT headers, refresh-token retry, auth redirect |
| `Sidebar.jsx` | Navigation and role-aware admin links |
| `LanguageSwitcher.jsx` | Locale toggle |

### Current Pages

| Page | Route | Notes |
| --- | --- | --- |
| `LoginPage` | `/login` | Authenticates and redirects by role |
| `RegisterPage` | `/register` | Creates account |
| `ForgotPasswordPage` | `/forgot-password` | Sends reset email/token |
| `ResetPasswordPage` | `/reset-password` | Applies reset token |
| `DashboardPage` | `/dashboard` | Summary cards, archive activity, recent submissions |
| `RepositoryPage` | `/repository` | Browse/search archive repository |
| `ArchiveDetailPage` | `/archives/:id` | Published artifact details and admin controls |
| `ArchivePdfViewerPage` | `/archives/:id/view` | PDF reading view |
| `UploadPage` | `/upload` | Student metadata request or administrator publication |
| `SubmissionRequestPage` | `/submission-requests/:id` | Owned request status and resubmission |
| `AdminPage` | `/admin` | FIFO request processing and user/account management |
| `AnalyticsPage` | `/analytics` | Charts and repository/user engagement analytics |
| `ReportGenerationPage` | `/reports` | Admin-only route, hidden from sidebar |
| `ProfilePage` | `/profile` | Profile and avatar editing |

## Layer 3: API/Application Services

The backend exposes DRF views through two active API namespaces.

```text
/api/auth/          backend/accounts/urls.py
/api/repository/    backend/repository/urls.py
```

### Auth Services

| Endpoint | Responsibility |
| --- | --- |
| `/api/auth/login/` | JWT login and `LoginEvent` creation |
| `/api/auth/register/` | Account creation |
| `/api/auth/refresh/` | Token refresh |
| `/api/auth/me/` | Current user retrieve/update |
| `/api/auth/admin/users/` | Admin user management |
| `/api/auth/password-reset/` | Reset request |
| `/api/auth/password-reset/confirm/` | Reset confirmation |

### Repository Services

| Endpoint Group | Responsibility |
| --- | --- |
| `/api/repository/submission-requests/` | Student request creation and admin-only FIFO list |
| `/api/repository/submission-requests/<id>/review/` | Admin approval/publication, rejection, or revision return |
| `/api/repository/submission-requests/<id>/resubmit/` | Student resubmission at the queue tail |
| `/api/repository/archives/` | Published archive list and admin-only creation |
| `/api/repository/archives/<id>/review/` | Admin-only legacy archive review |
| `/api/repository/archives/<id>/revise/` | Admin-only revised PDF upload |
| `/api/repository/archives/<id>/versions/` | Archive version history |
| `/api/repository/archives/<id>/preview/` | Preview archive file |
| `/api/repository/archives/<id>/download/` | Download archive file |
| `/api/repository/stats/` | Dashboard and analytics data |
| `/api/repository/departments/` | Department management |
| `/api/repository/courses/` | Course management |
| `/api/repository/export/csv/` | CSV export |
| `/api/repository/backup/` and `/restore/` | JSON backup and restore |

## Layer 4: Domain Logic

### Accounts Domain

Core entities:

- `User`
- `PasswordResetToken`
- `LoginEvent`

Rules:

- Email is the username field.
- Users have one of three roles: admin, faculty, student.
- Admins can approve accounts and change user status/roles.
- Successful logins create `LoginEvent` records for engagement analytics.

### Repository Domain

Core entities:

- `ArchiveDocument`
- `ArchiveDocumentVersion`
- `ResearchSubmissionRequest`
- `Department`
- `Course`
- `ResearchOutput`
- `OutputFile`
- `DownloadLog`
- `Repository`
- `RepositoryFile`

Rules:

- Student requests contain metadata, system run instructions, and private PDF/ZIP attachments according to submission type.
- Only administrators can list the request queue, publish archives, and configure or run executable systems. A request owner and administrators can stream its private attachments.
- Pending requests are processed oldest-first; the backend rejects out-of-order decisions.
- Review can approve and publish, reject, or return a request for revision.
- Approval copies the reviewed attachments to the archive and saves an included ZIP as its stopped default hosting configuration. It does not launch the system.
- Resubmitted requests rejoin the tail of the FIFO queue.
- Approved archives are accessible to all authenticated users.
- Stats are role-aware.

### Analytics Domain

Analytics are computed in `StatsView` and rendered in `AnalyticsPage`.

Current analytics include:

- Approval breakdown.
- Student daily active users.
- Student logins per day.
- Output counts by course.
- Department and course output-count summaries.

## Layer 5: Persistence And Infrastructure

| Component | Responsibility |
| --- | --- |
| PostgreSQL | Main relational database |
| Django ORM | Model persistence and query construction |
| Django media root | Uploaded PDFs, revisions, avatars |
| SMTP backend | Password reset and account approval email |
| Docker Compose | Local/container orchestration |
| Gunicorn | Backend WSGI server in container |
| Nginx | Frontend static server |

## Data Flow Examples

### Login

```mermaid
sequenceDiagram
    participant U as User
    participant F as React
    participant A as Auth API
    participant DB as PostgreSQL

    U->>F: Submit email/password
    F->>A: POST /api/auth/login/
    A->>DB: Validate user credentials
    A->>DB: Create LoginEvent
    A-->>F: access token, refresh token, user
    F->>F: Store tokens and redirect
```

### Student Request And Administrator Publication

```mermaid
sequenceDiagram
    participant U as Student
    participant F as React
    participant R as Repository API
    participant DB as PostgreSQL
    participant M as Media Storage
    participant P as Private Submission Storage
    participant H as Hosting Configuration
    participant A as Administrator

    U->>F: Submit metadata, PDF, and system ZIP
    F->>R: POST /api/repository/submission-requests/
    R->>P: Validate and store private attachments
    R->>DB: Enqueue pending request
    A->>F: Open administrator-only FIFO queue
    F->>R: GET /submission-requests/:id/research/
    R->>P: Open submitted PDF after authorization
    R-->>F: Stream PDF for review
    F->>R: POST /submission-requests/:id/review/
    R->>R: Verify request is first pending item
    R->>M: Copy approved student attachments
    R->>DB: Approve request and create published ArchiveDocument
    R->>H: Save ZIP as stopped default for this archive
```

### Analytics

```mermaid
sequenceDiagram
    participant Admin
    participant F as AnalyticsPage
    participant R as StatsView
    participant DB as PostgreSQL

    Admin->>F: Open /analytics
    F->>R: GET /api/repository/stats/
    R->>DB: Count archive/output status and engagement
    R-->>F: status, course, department, user_engagement
    F->>F: Render donut, line, bar, and count rows
```

## Removed Layers And Integrations

The following are intentionally no longer part of the architecture:

- Collaboration app and `/api/collab/` routes.
- Collaboration React page.
- SSH reverse tunnel scripts/docs/config.
- Hugging Face model cache, translation settings, and AI translation docs.
