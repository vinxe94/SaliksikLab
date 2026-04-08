# SaliksikLab - System Design Document

## Research Repository Management System

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [User Interface Layer](#user-interface-layer)
4. [Services Layer](#services-layer)
5. [Database Schema](#database-schema)
6. [Libraries & Integrations](#libraries--integrations)
7. [API Architecture](#api-architecture)
8. [Security Architecture](#security-architecture)
9. [Deployment Architecture](#deployment-architecture)

---

## System Overview

SaliksikLab is a comprehensive research repository management system designed to handle academic research outputs, collaboration, and code execution. The system supports multiple user roles and provides both mobile and desktop interfaces.

### Key Features
- Research output submission and version control
- Role-based access control (Admin, Faculty, Student, Researcher)
- Collaboration hub with Git-style workflows
- In-browser code execution environment
- Analytics and reporting dashboard
- File preview and download tracking
- Email notifications

---

## Architecture Diagram

```mermaid
graph TB
    subgraph "Client Layer"
        A[Desktop Browser]
        B[Mobile Browser]
        C[Tablet Browser]
    end
    
    subgraph "Presentation Layer - Frontend"
        D[React SPA<br/>Vite + React Router]
        E[Responsive UI<br/>CSS Design System]
        F[Auth Context]
        G[State Management]
    end
    
    subgraph "API Gateway"
        H[Django REST Framework<br/>Port 8080]
        I[CORS Middleware]
        J[JWT Authentication]
    end
    
    subgraph "Services Layer"
        K[User Authentication<br/>Service]
        L[Repository Management<br/>Service]
        M[Version Control<br/>Service]
        N[Collaboration<br/>Service]
        O[Code Execution<br/>Service]
        P[Notification<br/>Service]
        Q[File Storage<br/>Service]
        R[Analytics<br/>Service]
    end
    
    subgraph "Data Layer"
        S[(PostgreSQL<br/>Database)]
        T[File System<br/>Media Storage]
        U[Cache Layer<br/>Translation Cache]
    end
    
    subgraph "External Integrations"
        V[SMTP Email<br/>Service]
        W[Sandboxed<br/>Runtime]
    end
    
    A --> D
    B --> D
    C --> D
    D --> E
    D --> F
    D --> G
    D --> H
    H --> I
    H --> J
    J --> K
    H --> L
    H --> M
    H --> N
    H --> O
    H --> P
    H --> Q
    H --> R
    K --> S
    L --> S
    M --> S
    N --> S
    O --> S
    P --> S
    Q --> T
    R --> S
    P --> V
    O --> W
    O --> U
```

---

## User Interface Layer

### 1. Responsive Design Architecture

The system employs a mobile-first responsive design strategy using CSS custom properties and media queries.

```mermaid
graph LR
    A[CSS Design System] --> B[Custom Properties]
    A --> C[Media Queries]
    A --> D[Flexbox/Grid]
    A --> E[Component Classes]
    
    B --> B1[Colors]
    B --> B2[Spacing]
    B --> B3[Typography]
    B --> B4[Shadows]
    B --> B5[Border Radius]
    
    C --> C1[Mobile: <768px]
    C --> C2[Tablet: 768-1024px]
    C --> C3[Desktop: >1024px]
```

### 2. Page Components

| Page | Route | Purpose | Responsive Behavior |
|------|-------|---------|---------------------|
| Login | `/login` | User authentication | Single column, full-width form |
| Register | `/register` | New user registration | Single column, full-width form |
| Dashboard | `/dashboard` | Analytics overview | Grid adjusts columns based on viewport |
| Repository | `/repository` | Browse research outputs | Card grid: 1 col mobile, 2-3 col desktop |
| Detail | `/repository/:id` | View output details | Sidebar stacks on mobile |
| Upload | `/upload` | Submit new research | Form adjusts width |
| Admin | `/admin` | Admin management | Table scrolls horizontally on mobile |
| Profile | `/profile` | User profile management | Single column layout |
| Code Lab | `/code-lab` | In-browser IDE | Split-pane editor |
| Collaboration | `/collaborate` | Project collaboration | Tab navigation adapts |

### 3. Mobile-Specific Considerations

```mermaid
graph TD
    A[Mobile UX] --> B[Touch Targets ≥44px]
    A --> C[Swipe Gestures]
    A --> D[Bottom Navigation]
    A --> E[Collapsible Sidebar]
    A --> F[Optimized Forms]
    A --> G[Image Compression]
    
    B --> B1[Buttons]
    B --> B2[Menu Items]
    B --> B3[Cards]
    
    F --> F1[Auto-focus inputs]
    F --> F2[Virtual keyboard handling]
    F --> F3[File upload optimization]
```

### 4. Component Hierarchy

```
App
├── AuthProvider
│   └── LanguageProvider
│       ├── Sidebar (Navigation)
│       ├── Main Content Area
│       │   ├── LoginPage
│       │   ├── RegisterPage
│       │   ├── DashboardPage
│       │   │   ├── StatCard (×5)
│       │   │   ├── AnalyticsChart
│       │   │   └── RecentSubmissionsTable
│       │   ├── RepositoryPage
│       │   │   ├── SearchBar
│       │   │   ├── FilterPanel
│       │   │   ├── RepositoryCard (×N)
│       │   │   └── Pagination
│       │   ├── DetailPage
│       │   │   ├── MetadataCard
│       │   │   ├── FilePreviewer
│       │   │   ├── VersionHistoryPanel
│       │   │   └── AdminActions
│       │   ├── UploadPage
│       │   │   └── UploadForm
│       │   ├── AdminPage
│       │   │   ├── UserManagementTable
│       │   │   ├── ExportControls
│       │   │   └── PendingApprovals
│       │   ├── ProfilePage
│       │   │   └── ProfileForm
│       │   ├── CodePlaygroundPage
│       │   │   ├── CodeEditor
│       │   │   ├── LanguageSelector
│       │   │   ├── OutputPanel
│       │   │   └── RunHistoryPanel
│       │   └── CollaborationPage
│       │       ├── ProjectList
│       │       ├── ProjectDetail
│       │       │   ├── IssuesTab
│       │       │   ├── MergeRequestsTab
│       │       │   ├── CommitsTab
│       │       │   └── MembersTab
│       │       └── NotificationPanel
│       └── Toast Notifications
```

---

## Services Layer

### 1. User Authentication Service

**Location:** `backend/accounts/`

**Responsibilities:**
- User registration and login
- JWT token management (access + refresh)
- Password reset workflow
- Role-based authorization
- Account approval workflow

**Key Components:**

```mermaid
classDiagram
    class User {
        +UUID id
        +String email
        +String first_name
        +String last_name
        +String role
        +String department
        +Boolean is_active
        +Boolean is_staff
        +Boolean is_account_approved
        +DateTime date_joined
        +String get_full_name()
    }
    
    class UserManager {
        +create_user(email, password)
        +create_superuser(email, password)
    }
    
    class PasswordResetToken {
        +UUID id
        +UUID token
        +DateTime created_at
        +Boolean is_used
        +User user
    }
    
    User --> UserManager : managed by
    User --> PasswordResetToken : has many
```

**API Endpoints:**

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/register/` | Register new user | No |
| POST | `/api/auth/login/` | Login, get tokens | No |
| POST | `/api/auth/refresh/` | Refresh access token | No |
| GET | `/api/auth/me/` | Get current user | Yes |
| PATCH | `/api/auth/me/` | Update profile | Yes |
| POST | `/api/auth/forgot-password/` | Request password reset | No |
| POST | `/api/auth/reset-password/` | Complete password reset | No |

**Authentication Flow:**

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend API
    participant DB as Database
    
    U->>F: Enter credentials
    F->>B: POST /api/auth/login/
    B->>DB: Validate credentials
    DB-->>B: User record
    B->>B: Generate JWT tokens
    B-->>F: Return access + refresh tokens
    F->>F: Store tokens in memory
    F-->>U: Navigate to dashboard
    
    Note over F,B: Subsequent requests
    F->>B: Request with Access Token
    B->>B: Validate JWT
    B-->>F: Return protected resource
```

### 2. Repository Management Service

**Location:** `backend/repository/`

**Responsibilities:**
- Research output CRUD operations
- File upload and storage
- Search and filtering
- Download tracking
- Approval workflow
- Data export (CSV, JSON)

**Key Models:**

```mermaid
erDiagram
    ResearchOutput ||--o{ OutputFile : "has many versions"
    ResearchOutput ||--o{ DownloadLog : "tracked by"
    OutputFile ||--o{ DownloadLog : "referenced in"
    User ||--o{ ResearchOutput : "uploads"
    User ||--o{ OutputFile : "uploads"
    User ||--o{ DownloadLog : "performs"
    
    ResearchOutput {
        UUID id PK
        VARCHAR title
        TEXT abstract
        VARCHAR output_type
        VARCHAR department
        INT year
        JSON keywords
        VARCHAR author
        VARCHAR adviser
        UUID uploaded_by FK
        BOOLEAN is_approved
        BOOLEAN is_rejected
        TEXT rejection_reason
        BOOLEAN is_deleted
        VARCHAR course
        JSON co_authors
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }
    
    OutputFile {
        UUID id PK
        UUID research_output FK
        VARCHAR file
        VARCHAR original_filename
        BIGINT file_size
        INT version
        TEXT change_notes
        UUID uploaded_by FK
        TIMESTAMP uploaded_at
    }
    
    DownloadLog {
        UUID id PK
        UUID user FK
        UUID research_output FK
        UUID output_file FK
        TIMESTAMP downloaded_at
    }
    
    User {
        UUID id PK
        VARCHAR email
        VARCHAR first_name
        VARCHAR last_name
        VARCHAR role
        VARCHAR department
    }
```

**API Endpoints:**

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| GET | `/api/repository/` | List outputs (paginated) | Yes | All |
| POST | `/api/repository/` | Upload new output | Yes | All |
| GET | `/api/repository/:id/` | Get output details | Yes | All |
| PATCH | `/api/repository/:id/` | Update metadata | Yes | Owner/Admin |
| DELETE | `/api/repository/:id/` | Soft delete | Yes | Owner/Admin |
| POST | `/api/repository/:id/approve/` | Approve/reject | Yes | Admin |
| GET | `/api/repository/:id/download/` | Download latest | Yes | All |
| GET | `/api/repository/:id/download/:fid/` | Download version | Yes | All |
| GET | `/api/repository/:id/preview/` | Preview inline | Yes | All |
| POST | `/api/repository/:id/revise/` | Submit revision | Yes | Owner/Admin |
| GET | `/api/repository/:id/versions/` | List versions | Yes | All |
| POST | `/api/repository/:id/rollback/` | Rollback version | Yes | Admin |
| GET | `/api/repository/stats/` | Dashboard analytics | Yes | All |
| GET | `/api/repository/export/csv/` | CSV export | Yes | Admin |
| GET | `/api/repository/backup/` | JSON backup | Yes | Admin |

**Version Control Flow:**

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant FS as File System
    participant DB as Database
    participant E as Email Service
    
    U->>F: Upload revision with notes
    F->>B: POST /api/repository/:id/revise/
    B->>DB: Get current max version
    DB-->>B: Return version N
    B->>B: Increment to N+1
    B->>FS: Store file at outputs/:id/v(N+1)/
    B->>DB: Create OutputFile record
    B->>DB: Reset approval status to pending
    B->>E: Notify all admins
    E-->>U: Email sent to admins
    B-->>F: Return new version details
    F-->>U: Show success toast
```

### 3. Collaboration Service

**Location:** `backend/collaboration/`

**Responsibilities:**
- Project workspace management
- Issue tracking
- Merge request workflow
- Commit history
- Team notifications
- Member management

**Key Models:**

```mermaid
erDiagram
    CollabProject ||--o{ ProjectMember : "has members"
    CollabProject ||--o{ Issue : "contains"
    CollabProject ||--o{ MergeRequest : "contains"
    CollabProject ||--o{ Commit : "has commits"
    CollabProject ||--o{ Notification : "generates"
    CollabProject }o--|| ResearchOutput : "linked to"
    
    Issue ||--o{ IssueComment : "has comments"
    MergeRequest ||--o{ MRComment : "has comments"
    MergeRequest ||--o{ Commit : "creates on merge"
    
    User ||--o{ CollabProject : "owns"
    User ||--o{ ProjectMember : "belongs to"
    User ||--o{ Issue : "authors"
    User ||--o{ MergeRequest : "authors"
    User ||--o{ Commit : "pushes"
    User ||--o{ Notification : "receives"
    
    CollabProject {
        UUID id PK
        VARCHAR name
        TEXT description
        VARCHAR status
        UUID owner FK
        UUID research_output FK
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }
    
    ProjectMember {
        UUID id PK
        UUID project FK
        UUID user FK
        VARCHAR role
        TIMESTAMP joined_at
    }
    
    Issue {
        UUID id PK
        UUID project FK
        INT number
        VARCHAR title
        TEXT body
        VARCHAR status
        VARCHAR label
        UUID author FK
        TIMESTAMP created_at
        TIMESTAMP updated_at
        TIMESTAMP closed_at
    }
    
    MergeRequest {
        UUID id PK
        UUID project FK
        INT number
        VARCHAR title
        TEXT description
        VARCHAR status
        UUID author FK
        UUID output_file FK
        TIMESTAMP created_at
        TIMESTAMP merged_at
    }
    
    Commit {
        UUID id PK
        UUID project FK
        UUID author FK
        VARCHAR message
        TEXT description
        UUID output_file FK
        UUID merge_request FK
        VARCHAR sha
        TIMESTAMP created_at
    }
    
    Notification {
        UUID id PK
        UUID recipient FK
        UUID actor FK
        VARCHAR notif_type
        UUID project FK
        INT object_id
        VARCHAR message
        BOOLEAN is_read
        TIMESTAMP created_at
    }
```

**Collaboration Workflow:**

```mermaid
graph TD
    A[Create Project] --> B[Invite Members]
    B --> C{Member Role}
    C -->|Owner| D[Full Access]
    C -->|Contributor| E[Create Issues/MRs/Commits]
    C -->|Viewer| F[Read Only]
    
    E --> G[Open Issue]
    G --> H[Discuss in Comments]
    H --> I[Mark In Progress]
    I --> J[Close Issue]
    
    E --> K[Open Merge Request]
    K --> L[Review & Comment]
    L --> M{Decision}
    M -->|Merge| N[Create Commit]
    M -->|Close| O[Reject MR]
    N --> P[Notify Team]
    
    E --> Q[Push Commit]
    Q --> P
```

### 4. Code Execution Service

**Location:** `backend/code_execution/`

**Responsibilities:**
- Sandboxed code execution
- Support for Python, Java, C++
- Execution time/memory limits
- Run history tracking
- Translation caching

**Architecture:**

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend Editor
    participant B as Backend API
    participant S as Sandbox
    participant DB as Database
    participant C as Translation Cache
    
    U->>F: Write code
    U->>F: Click Run
    F->>B: POST /api/code/execute/
    B->>B: Validate input
    B->>S: Spawn subprocess
    S->>S: Set resource limits
    S->>S: Execute code
    S-->>B: Return stdout/stderr/exit_code
    B->>DB: Save ExecutionLog
    B->>C: Check translation cache
    C-->>B: Return cached if exists
    B-->>F: Return execution results
    F->>F: Display output/errors
    F-->>U: Show results
```

**Security Measures:**
- CPU timeout: 10 seconds
- Max output: 64 KB
- Max memory: 128 MB
- No network access
- Isolated filesystem
- Process isolation

**API Endpoints:**

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/code/execute/` | Run code | Yes |
| GET | `/api/code/history/` | Get run history | Yes |

### 5. Notification Service

**Responsibilities:**
- Email notifications
- In-app notifications
- Notification preferences
- Delivery tracking

**Notification Types:**

| Event | Trigger | Recipients | Channel |
|-------|---------|------------|---------|
| Submission approved | Admin approves | Submitter | Email |
| Submission rejected | Admin rejects | Submitter | Email |
| Revision submitted | User revises | All admins | Email |
| Password reset | User requests | Requesting user | Email |
| Issue opened | User creates issue | Project members | In-app |
| Issue closed | User closes issue | Project members | In-app |
| MR opened | User opens MR | Project members | In-app |
| MR merged | User merges MR | Project members | In-app |
| Commit pushed | User pushes commit | Project members | In-app |
| Member added | Owner invites | Invited user | In-app |

### 6. File Storage Service

**Storage Structure:**
```
media/
└── outputs/
    ├── <output_id_1>/
    │   ├── v1/
    │   │   └── thesis_draft.pdf
    │   ├── v2/
    │   │   └── thesis_revised.pdf
    │   └── v3/
    │       └── thesis_final.pdf
    ├── <output_id_2>/
    │   └── v1/
    │       └── source_code.zip
    └── ...
```

**File Operations:**
- Upload: Django `FileField` with custom `upload_to` function
- Download: Django `FileResponse` with download tracking
- Preview: Inline serving with appropriate MIME types
- Deletion: Cascade delete with version rollback

**Supported File Types:**

| Category | Extensions |
|----------|------------|
| Documents | `.pdf`, `.doc`, `.docx`, `.txt`, `.md` |
| Archives | `.zip`, `.tar`, `.gz`, `.rar` |
| Source Code | `.py`, `.js`, `.ts`, `.java`, `.c`, `.cpp`, `.h`, `.cs`, `.php`, `.rb` |
| Web | `.html`, `.css`, `.json`, `.xml`, `.yaml`, `.yml` |
| Images | `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg` |

**File Size Limits:**
- Maximum upload: 100 MB
- Streaming enabled for large files

---

## Database Schema

### Complete Entity Relationship Diagram

```mermaid
erDiagram
    %% Authentication & Users
    User ||--o{ ResearchOutput : "uploads"
    User ||--o{ OutputFile : "uploads"
    User ||--o{ DownloadLog : "performs"
    User ||--o{ PasswordResetToken : "has"
    User ||--o{ CodeSubmission : "submits"
    User ||--o{ CollabProject : "owns"
    User ||--o{ ProjectMember : "belongs to"
    User ||--o{ Issue : "authors"
    User ||--o{ MergeRequest : "authors"
    User ||--o{ Commit : "pushes"
    User ||--o{ Notification : "receives"
    User ||--o{ IssueComment : "writes"
    User ||--o{ MRComment : "writes"
    
    %% Repository
    ResearchOutput ||--o{ OutputFile : "has versions"
    ResearchOutput ||--o{ DownloadLog : "tracked in"
    OutputFile ||--o{ DownloadLog : "referenced in"
    OutputFile ||--o{ MergeRequest : "attached to"
    OutputFile ||--o{ Commit : "linked in"
    
    %% Collaboration
    CollabProject ||--o{ ProjectMember : "has members"
    CollabProject ||--o{ Issue : "contains"
    CollabProject ||--o{ MergeRequest : "contains"
    CollabProject ||--o{ Commit : "has"
    CollabProject ||--o{ Notification : "generates"
    CollabProject }o--|| ResearchOutput : "optionally linked"
    
    Issue ||--o{ IssueComment : "has comments"
    MergeRequest ||--o{ MRComment : "has comments"
    MergeRequest ||--o{ Commit : "creates on merge"
    
    User {
        UUID id PK
        VARCHAR email UK
        VARCHAR first_name
        VARCHAR last_name
        VARCHAR role
        VARCHAR department
        BOOLEAN is_active
        BOOLEAN is_staff
        BOOLEAN is_account_approved
        TIMESTAMP date_joined
        VARCHAR password
    }
    
    PasswordResetToken {
        UUID id PK
        UUID token UK
        UUID user FK
        TIMESTAMP created_at
        BOOLEAN is_used
    }
    
    ResearchOutput {
        UUID id PK
        VARCHAR title
        TEXT abstract
        VARCHAR output_type
        VARCHAR department
        INT year
        JSON keywords
        VARCHAR author
        VARCHAR adviser
        UUID uploaded_by FK
        BOOLEAN is_approved
        BOOLEAN is_rejected
        TEXT rejection_reason
        BOOLEAN is_deleted
        VARCHAR course
        JSON co_authors
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }
    
    OutputFile {
        UUID id PK
        UUID research_output FK
        VARCHAR file
        VARCHAR original_filename
        BIGINT file_size
        INT version
        TEXT change_notes
        UUID uploaded_by FK
        TIMESTAMP uploaded_at
    }
    
    DownloadLog {
        UUID id PK
        UUID user FK
        UUID research_output FK
        UUID output_file FK
        TIMESTAMP downloaded_at
    }
    
    CodeSubmission {
        UUID id PK
        UUID user FK
        VARCHAR language
        TEXT source_code
        TEXT stdin_input
        VARCHAR status
        TEXT stdout_output
        TEXT stderr_output
        INT exit_code
        FLOAT execution_time_ms
        INT memory_used_kb
        TIMESTAMP created_at
    }
    
    TranslationCache {
        UUID id PK
        VARCHAR source_text_hash UK
        TEXT source_text
        VARCHAR source_lang
        VARCHAR target_lang
        TEXT translated_text
        TIMESTAMP created_at
    }
    
    CollabProject {
        UUID id PK
        VARCHAR name
        TEXT description
        VARCHAR status
        UUID owner FK
        UUID research_output FK
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }
    
    ProjectMember {
        UUID id PK
        UUID project FK
        UUID user FK
        VARCHAR role
        TIMESTAMP joined_at
    }
    
    Issue {
        UUID id PK
        UUID project FK
        INT number
        VARCHAR title
        TEXT body
        VARCHAR status
        VARCHAR label
        UUID author FK
        TIMESTAMP created_at
        TIMESTAMP updated_at
        TIMESTAMP closed_at
    }
    
    IssueComment {
        UUID id PK
        UUID issue FK
        UUID author FK
        TEXT body
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }
    
    MergeRequest {
        UUID id PK
        UUID project FK
        INT number
        VARCHAR title
        TEXT description
        VARCHAR status
        UUID author FK
        UUID output_file FK
        TIMESTAMP created_at
        TIMESTAMP updated_at
        TIMESTAMP merged_at
    }
    
    MRComment {
        UUID id PK
        UUID merge_request FK
        UUID author FK
        TEXT body
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }
    
    Commit {
        UUID id PK
        UUID project FK
        UUID author FK
        VARCHAR message
        TEXT description
        UUID output_file FK
        UUID merge_request FK
        VARCHAR sha UK
        TIMESTAMP created_at
    }
    
    Notification {
        UUID id PK
        UUID recipient FK
        UUID actor FK
        VARCHAR notif_type
        UUID project FK
        INT object_id
        VARCHAR message
        BOOLEAN is_read
        TIMESTAMP created_at
    }
```

### Database Tables Summary

| Table Name | Records (Est.) | Purpose |
|------------|---------------|---------|
| `accounts_user` | 1,000 - 10,000 | User accounts |
| `accounts_passwordresettoken` | 100 - 500 | Password reset tokens |
| `repository_researchoutput` | 5,000 - 50,000 | Research output metadata |
| `repository_outputfile` | 10,000 - 100,000 | Versioned file records |
| `repository_downloadlog` | 50,000 - 500,000 | Download tracking |
| `code_execution_codesubmission` | 10,000 - 100,000 | Code execution history |
| `code_execution_translationcache` | 1,000 - 10,000 | Translation cache |
| `collaboration_collabproject` | 500 - 5,000 | Collaboration projects |
| `collaboration_projectmember` | 1,000 - 25,000 | Project memberships |
| `collaboration_issue` | 2,000 - 20,000 | Issue tracking |
| `collaboration_issuecomment` | 5,000 - 50,000 | Issue discussions |
| `collaboration_mergerequest` | 1,000 - 10,000 | Merge requests |
| `collaboration_mrcomment` | 2,000 - 20,000 | MR reviews |
| `collaboration_commit` | 5,000 - 50,000 | Commit history |
| `collaboration_notification` | 10,000 - 100,000 | In-app notifications |
| `auth_group` | 10 - 50 | Django auth groups |
| `auth_permission` | 100 - 200 | Django permissions |
| `django_session` | 1,000 - 10,000 | User sessions |
| `django_admin_log` | 5,000 - 50,000 | Admin action logs |

### Indexing Strategy

```sql
-- User authentication
CREATE INDEX idx_user_email ON accounts_user(email);
CREATE INDEX idx_user_role ON accounts_user(role);

-- Repository search
CREATE INDEX idx_output_title ON repository_researchoutput(title);
CREATE INDEX idx_output_type ON repository_researchoutput(output_type);
CREATE INDEX idx_output_dept ON repository_researchoutput(department);
CREATE INDEX idx_output_year ON repository_researchoutput(year);
CREATE INDEX idx_output_approved ON repository_researchoutput(is_approved);
CREATE INDEX idx_output_deleted ON repository_researchoutput(is_deleted);
CREATE INDEX idx_output_created ON repository_researchoutput(created_at DESC);

-- File versions
CREATE INDEX idx_file_output ON repository_outputfile(research_output_id);
CREATE INDEX idx_file_version ON repository_outputfile(version DESC);

-- Download analytics
CREATE INDEX idx_download_user ON repository_downloadlog(user_id);
CREATE INDEX idx_download_output ON repository_downloadlog(research_output_id);
CREATE INDEX idx_download_date ON repository_downloadlog(downloaded_at DESC);

-- Collaboration
CREATE INDEX idx_project_owner ON collaboration_collabproject(owner_id);
CREATE INDEX idx_member_project ON collaboration_projectmember(project_id);
CREATE INDEX idx_member_user ON collaboration_projectmember(user_id);
CREATE INDEX idx_issue_project ON collaboration_issue(project_id, number);
CREATE INDEX idx_mr_project ON collaboration_mergerequest(project_id, number);
CREATE INDEX idx_commit_project ON collaboration_commit(project_id, created_at DESC);
CREATE INDEX idx_notification_recipient ON collaboration_notification(recipient_id, is_read);

-- Code execution
CREATE INDEX idx_code_user ON code_execution_codesubmission(user_id, created_at DESC);
CREATE INDEX idx_translation_hash ON code_execution_translationcache(source_text_hash);
```

---

## Libraries & Integrations

### Frontend Dependencies

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^7.0.0",
    "axios": "^1.6.0",
    "lucide-react": "^0.300.0",
    "react-hot-toast": "^2.4.0",
    "prop-types": "^15.8.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.0",
    "vite": "^5.0.0"
  }
}
```

| Library | Purpose | Version |
|---------|---------|---------|
| React 18 | UI component framework | 18.2+ |
| Vite 5 | Build tool & dev server | 5.0+ |
| React Router 7 | Client-side routing | 7.0+ |
| Axios | HTTP client with interceptors | 1.6+ |
| Lucide React | Icon library | 0.300+ |
| React Hot Toast | Toast notifications | 2.4+ |
| PropTypes | Runtime type checking | 15.8+ |

### Backend Dependencies

```txt
Django>=4.2
djangorestframework>=3.14
djangorestframework-simplejwt>=5.3
django-cors-headers>=4.3
psycopg2-binary>=2.9
Pillow>=10.0
```

| Library | Purpose | Version |
|---------|---------|---------|
| Django | Web framework | 4.2+ |
| DRF | REST API framework | 3.14+ |
| SimpleJWT | JWT authentication | 5.3+ |
| CORS Headers | Cross-origin support | 4.3+ |
| psycopg2 | PostgreSQL adapter | 2.9+ |
| Pillow | Image processing | 10.0+ |

### External Integrations

```mermaid
graph LR
    A[SaliksikLab] --> B[PostgreSQL]
    A --> C[SMTP Server]
    A --> D[File System]
    A --> E[Subprocess Runtime]
    
    B --> B1[Primary Database]
    C --> C1[Gmail SMTP]
    C --> C2[Custom SMTP]
    D --> D1[Local Storage]
    D --> D2[Cloud Storage<br/>Future]
    E --> E1[Python CPython]
    E --> E2[Java OpenJDK 17]
    E --> E3[C++ g++]
```

| Integration | Type | Purpose | Configuration |
|-------------|------|---------|---------------|
| PostgreSQL | Database | Primary data store | `DB_NAME`, `DB_USER`, `DB_PASSWORD` |
| SMTP | Email | Notifications | `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER` |
| File System | Storage | Media files | `MEDIA_ROOT`, `MEDIA_URL` |
| Python Runtime | Code Execution | Python code runner | Sandboxed subprocess |
| Java Runtime | Code Execution | Java code runner | Sandboxed subprocess |
| C++ Compiler | Code Execution | C++ code runner | Sandboxed subprocess |

### API Integration Points

```mermaid
graph TD
    A[Frontend React App] --> B[Django REST API]
    B --> C[Authentication Endpoints]
    B --> D[Repository Endpoints]
    B --> E[Collaboration Endpoints]
    B --> F[Code Execution Endpoints]
    
    C --> C1[/api/auth/login/]
    C --> C2[/api/auth/register/]
    C --> C3[/api/auth/me/]
    
    D --> D1[/api/repository/]
    D --> D2[/api/repository/:id/]
    D --> D3[/api/repository/stats/]
    
    E --> E1[/api/collab/projects/]
    E --> E2[/api/collab/projects/:id/issues/]
    E --> E3[/api/collab/notifications/]
    
    F --> F1[/api/code/execute/]
    F --> F2[/api/code/history/]
```

---

## API Architecture

### REST API Design Principles

1. **Resource-based URLs**: `/api/repository/`, `/api/auth/users/`
2. **HTTP methods**: GET (read), POST (create), PATCH (update), DELETE (remove)
3. **JSON request/response**: Consistent format
4. **Pagination**: Cursor-based for large datasets
5. **Error handling**: Standardized error responses
6. **Authentication**: JWT Bearer tokens
7. **Rate limiting**: Configurable per endpoint

### API Response Format

**Success Response:**
```json
{
  "count": 100,
  "next": "http://localhost:8080/api/repository/?page=2",
  "previous": null,
  "results": [
    {
      "id": "uuid-here",
      "title": "Research Title",
      "author": "John Doe",
      "is_approved": true,
      "created_at": "2026-04-05T12:00:00Z"
    }
  ]
}
```

**Error Response:**
```json
{
  "detail": "Authentication credentials were not provided.",
  "code": "not_authenticated"
}
```

### API Endpoint Categories

```mermaid
graph TD
    A[API Endpoints] --> B[Authentication /api/auth/]
    A --> C[Repository /api/repository/]
    A --> D[Collaboration /api/collab/]
    A --> E[Code Execution /api/code/]
    
    B --> B1[Register]
    B --> B2[Login]
    B --> B3[Profile]
    B --> B4[Password Reset]
    
    C --> C1[CRUD Operations]
    C --> C2[Version Control]
    C --> C3[File Operations]
    C --> C4[Analytics]
    
    D --> D1[Projects]
    D --> D2[Issues]
    D --> D3[Merge Requests]
    D --> D4[Commits]
    D --> D5[Notifications]
    
    E --> E1[Execute Code]
    E --> E2[Run History]
```

### Rate Limiting Strategy

| Endpoint Category | Rate Limit | Window |
|-------------------|------------|--------|
| Authentication | 10 requests | 1 minute |
| Repository read | 100 requests | 1 minute |
| Repository write | 20 requests | 1 minute |
| Code execution | 5 requests | 1 minute |
| Collaboration | 50 requests | 1 minute |

---

## Security Architecture

### Authentication & Authorization

```mermaid
graph TD
    A[User Request] --> B{JWT Valid?}
    B -->|No| C[401 Unauthorized]
    B -->|Yes| D{User Active?}
    D -->|No| E[403 Forbidden]
    D -->|Yes| F{Role Authorized?}
    F -->|No| G[403 Forbidden]
    F -->|Yes| H[Process Request]
    
    I[Login] --> J[Validate Credentials]
    J --> K[Generate Access Token<br/>5 min expiry]
    J --> L[Generate Refresh Token<br/>7 day expiry]
    K --> M[Return to Client]
    L --> M
```

### Security Measures

| Layer | Measure | Implementation |
|-------|---------|----------------|
| Transport | HTTPS | SSL/TLS in production |
| Authentication | JWT | RS256 signing, short expiry |
| Authorization | RBAC | Role checks in views |
| Input Validation | Server-side | DRF serializers |
| File Upload | Validation | Extension whitelist, size limit |
| SQL Injection | Prevention | Django ORM |
| XSS | Prevention | React auto-escaping |
| CSRF | Protection | JWT in headers |
| CORS | Configuration | Whitelist origins |
| Rate Limiting | Throttling | Per-IP, per-user |

### Role-Based Access Control Matrix

| Resource | Student | Researcher | Faculty | Admin |
|----------|---------|------------|---------|-------|
| View approved outputs | ✅ | ✅ | ✅ | ✅ |
| Upload outputs | ✅ | ✅ | ✅ | ✅ |
| Edit own outputs | ✅ | ✅ | ✅ | ✅ |
| Delete own outputs | ✅ | ✅ | ✅ | ✅ |
| Approve outputs | ❌ | ❌ | ❌ | ✅ |
| Reject outputs | ❌ | ❌ | ❌ | ✅ |
| Rollback versions | ❌ | ❌ | ❌ | ✅ |
| Export data | ❌ | ❌ | ❌ | ✅ |
| Manage users | ❌ | ❌ | ❌ | ✅ |
| Use Code Lab | ✅ | ✅ | ✅ | ✅ |
| Create projects | ✅ | ✅ | ✅ | ✅ |
| Manage all projects | ❌ | ❌ | ❌ | ✅ |

---

## Deployment Architecture

### Development Environment

```mermaid
graph LR
    A[Developer Machine] --> B[Frontend Dev Server<br/>Vite :5173]
    A --> C[Backend Dev Server<br/>Django :8080]
    A --> D[PostgreSQL<br/>:5432]
    A --> E[File System<br/>./media/]
    
    B --> C
    C --> D
    C --> E
```

### Production Architecture (Recommended)

```mermaid
graph TB
    subgraph "Internet"
        A[Users]
    end
    
    subgraph "Load Balancer / Reverse Proxy"
        B[Nginx / HAProxy]
    end
    
    subgraph "Application Servers"
        C1[Django + Gunicorn<br/>Instance 1]
        C2[Django + Gunicorn<br/>Instance 2]
        C3[Django + Gunicorn<br/>Instance 3]
    end
    
    subgraph "Static Files"
        D[Nginx Static Server]
        E[CDN<br/>Optional]
    end
    
    subgraph "Database Layer"
        F[(PostgreSQL Primary)]
        G[(PostgreSQL Replica)<br/>Optional]
    end
    
    subgraph "Storage"
        H[Shared File Storage<br/>NFS / S3]
    end
    
    subgraph "Cache Layer"
        I[Redis<br/>Optional]
    end
    
    A --> B
    B --> C1
    B --> C2
    B --> C3
    B --> D
    D --> E
    
    C1 --> F
    C2 --> F
    C3 --> F
    F --> G
    
    C1 --> H
    C2 --> H
    C3 --> H
    
    C1 --> I
    C2 --> I
    C3 --> I
```

### Deployment Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| Web Server | Nginx | Reverse proxy, static files |
| App Server | Gunicorn | WSGI server for Django |
| Database | PostgreSQL 14+ | Primary data store |
| File Storage | Local / S3 | Media file storage |
| Cache | Redis (optional) | Session cache, query cache |
| Email | SMTP | Notification delivery |
| Monitoring | Sentry (optional) | Error tracking |
| CI/CD | GitHub Actions | Automated testing & deployment |

### Environment Variables

```env
# Django
SECRET_KEY=<secure-random-string>
DEBUG=False
ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com

# Database
DB_NAME=saliksiklab
DB_USER=saliksik_user
DB_PASSWORD=<secure-password>
DB_HOST=db.yourdomain.com
DB_PORT=5432

# CORS
CORS_ALLOWED_ORIGINS=https://yourdomain.com

# Email
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=<app-password>
DEFAULT_FROM_EMAIL=Research Repository <noreply@yourdomain.com>

# Frontend
FRONTEND_URL=https://yourdomain.com

# File Upload
MAX_UPLOAD_SIZE=104857600
```

---

## Scalability Considerations

### Horizontal Scaling Strategies

```mermaid
graph TD
    A[Current Architecture] --> B[Single Server]
    B --> C{Growth Triggers}
    
    C -->|High CPU| D[Add App Servers]
    C -->|High Memory| E[Increase RAM]
    C -->|High DB Load| F[Read Replicas]
    C -->|Storage Full| G[Object Storage S3]
    C -->|High Traffic| H[CDN for Static Files]
    
    D --> I[Load Balancer]
    E --> I
    F --> I
    G --> I
    H --> I
```

### Scaling Recommendations

| Metric | Current | Threshold | Action |
|--------|---------|-----------|--------|
| Requests/sec | 10-50 | >100 | Add app servers |
| Database connections | 20 | >100 | Connection pooling |
| Storage | Local FS | >80% capacity | Migrate to S3 |
| Response time | <200ms | >500ms | Optimize queries, add cache |
| File uploads | Local | >10GB/day | Use object storage |

### Future Enhancements

1. **Microservices Architecture**: Separate services for auth, repository, collaboration
2. **Message Queue**: Celery + Redis for async tasks (email, code execution)
3. **Search Engine**: Elasticsearch for advanced search capabilities
4. **Real-time Updates**: WebSockets for live notifications
5. **Mobile Apps**: React Native for native mobile experience
6. **API Versioning**: Support multiple API versions
7. **GraphQL**: Alternative API query language
8. **Containerization**: Docker + Kubernetes for orchestration

---

## Monitoring & Observability

### Key Metrics to Track

```mermaid
graph LR
    A[Monitoring] --> B[Application Metrics]
    A --> C[Infrastructure Metrics]
    A --> D[Business Metrics]
    
    B --> B1[Response Time]
    B --> B2[Error Rate]
    B --> B3[Request Rate]
    B --> B4[Active Users]
    
    C --> C1[CPU Usage]
    C --> C2[Memory Usage]
    C --> C3[Disk I/O]
    C --> C4[Network I/O]
    
    D --> D1[Total Uploads]
    D --> D2[Approval Rate]
    D --> D3[Download Count]
    D --> D4[Code Executions]
```

### Logging Strategy

| Log Type | Level | Destination | Retention |
|----------|-------|-------------|-----------|
| Application | INFO, ERROR | File + Sentry | 30 days |
| Access | INFO | File | 90 days |
| Database | WARNING, ERROR | File | 30 days |
| Security | WARNING, ERROR | File + Alert | 1 year |
| Audit | INFO | Database | Permanent |

---

## Appendix

### Technology Stack Summary

**Frontend:**
- React 18 with Vite 5
- React Router 7 for routing
- Axios for HTTP requests
- Lucide React for icons
- Custom CSS design system

**Backend:**
- Python 3.10+
- Django 4.2+
- Django REST Framework
- SimpleJWT for authentication
- PostgreSQL 14+

**Infrastructure:**
- Nginx (reverse proxy)
- Gunicorn (WSGI server)
- File system storage
- SMTP for email

### Glossary

| Term | Definition |
|------|------------|
| JWT | JSON Web Token - stateless authentication mechanism |
| RBAC | Role-Based Access Control - permission model based on user roles |
| WSGI | Web Server Gateway Interface - Python web server standard |
| CORS | Cross-Origin Resource Sharing - browser security mechanism |
| ORM | Object-Relational Mapping - database abstraction layer |
| SPA | Single Page Application - client-side rendered web app |
| MR | Merge Request - proposal to merge changes (GitLab terminology) |
| SHA | Secure Hash Algorithm - unique identifier for commits |

### Document Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-04-05 | System Architect | Initial system design document |

---

*This system design document provides a comprehensive overview of the SaliksikLab research repository management system architecture, including all major components, data flows, and integration points.*
