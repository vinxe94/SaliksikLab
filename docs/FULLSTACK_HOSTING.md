# Hosting a frontend, backend, and database together

Temporary Hosting accepts one ZIP containing a backend, an optional separate
frontend, and an optional database seed. It builds the frontend when present, installs the backend dependencies,
starts the backend and managed database, and serves the frontend and API through
one preview URL. The existing one-active-deployment limit and session expiry still
apply to the complete application.

## Prepare the ZIP

Use this layout, optionally inside one enclosing project folder:

```text
project/
├── hosting.json
├── frontend/
│   ├── package.json
│   ├── package-lock.json
│   └── src/
├── backend/
│   ├── requirements.txt
│   ├── manage.py
│   └── project/
│       └── settings.py
└── database/
    └── seed.sql
```

Include source, dependency manifests, lockfiles, and Django migration files. Leave
out `venv`, `.venv`, `node_modules`, `.git`, and caches. The hosting worker installs
dependencies inside containers. Bundled dependencies still count against the ZIP
member limit before extraction excludes them. The defaults remain 200 MB uploaded,
500 MB extracted, and 10,000 archive entries. Uploaded `.env` files are excluded.

The `database/` directory is optional. A SQL file is a seed for a database selected
in `hosting.json`; its presence alone does not select or configure a database.

Choose **Detect automatically** or **Frontend + backend + database**, then **Save
and Run**. Conventional `frontend/` and `backend/` folders are detected
automatically. Use `hosting.json` when paths, database choice, or commands need
configuration. Put backend entrypoints and commands in this file.

## Example manifest

For a frontend build and Django backend using PostgreSQL:

```json
{
  "version": 1,
  "frontend": {
    "path": "frontend",
    "output": "dist",
    "build_script": "build",
    "environment": {
      "VITE_API_URL": "/api"
    }
  },
  "backend": {
    "path": "backend",
    "runtime": "python",
    "settings_module": "project.settings",
    "migrate": true
  },
  "database": {
    "engine": "postgresql",
    "persist": true
  },
  "api_prefixes": ["/api"]
}
```

Replace `project.settings` with your Django settings module, or omit the field to
let hosting infer it from `manage.py` or an unambiguous settings file. Use the
environment variable name your frontend actually reads; setting `VITE_API_URL`
does not rewrite hard-coded URLs in source files. Frontend build environment
values are public and must not contain secrets.

| Field | Behavior |
|---|---|
| `version` | Manifest format version; use `1`. |
| `frontend` | A frontend configuration object, or exactly `false` to serve the backend at every public URL without building a separate frontend. |
| `frontend.path` | Frontend directory, relative to the project root; default `frontend`. |
| `frontend.output` | Directory containing built `index.html`, relative to the frontend; default `dist` for npm builds or `.` for a plain static frontend. |
| `frontend.build_script` | npm script to build the frontend; default `build`. |
| `frontend.environment` | Public string values supplied to the frontend build. |
| `backend.path` | Backend directory, relative to the project root; default `backend`, or `.` when `frontend` is `false`. The root path `.` is allowed only without a separate frontend. |
| `backend.runtime` | `auto`, `python`, `node`, `php`, `ruby`, or `cpp`. |
| `backend.entrypoint` | Optional file within the backend directory. |
| `backend.start_command` | Optional backend command; use `{port}` for the assigned port. |
| `backend.settings_module` | Optional Django settings module. |
| `backend.migrate` | Enable/disable automatic Django migrations, or supply a list of argument arrays for custom migration commands. |
| `backend.health_path` | Backend readiness URL; use an endpoint that returns HTTP 2xx or 3xx. |
| `database.engine` | `none`, `sqlite`, `postgresql`, or `mysql`. For Django, hosting detects a literal database engine in the settings file, including PostgreSQL/MySQL, and falls back to SQLite if it cannot infer one. Other backends default to no managed database. |
| `database.seed` | Optional seed path relative to the project root. Use `.sql` for PostgreSQL/MySQL or a `.db`, `.sqlite`, or `.sqlite3` file for SQLite. |
| `database.persist` | Default `true`; retain database data for this saved deployment. |
| `api_prefixes` | Paths forwarded to the backend with a separate frontend; defaults to `/api`. Matching preserves the path. Unnecessary when `frontend` is `false`, because all paths go to the backend. |

Other URLs, including `/admin`, belong to the frontend by default. If your backend
serves Django admin, static files, or media at those URLs, explicitly add the
corresponding `/admin`, `/static`, and `/media` prefixes. Keep frontend admin pages
out of that list so they continue to load through the frontend.

For a plain static frontend, include an `index.html` in its frontend directory;
no npm installation is needed. For an npm frontend, hosting runs `npm ci` when a
lockfile is present or `npm install` otherwise, then the configured build script.
The result is served as static files with a single-page-app fallback. Frontend
servers that require server-side rendering are outside this mode.

## Django with templates and a database

A Django website that renders its own pages does not need a `frontend/` directory.
Place this `hosting.json` beside its `manage.py`, and choose **Detect automatically**
with the entrypoint and start-command fields empty:

```json
{
  "version": 1,
  "frontend": false,
  "backend": {
    "path": ".",
    "runtime": "python",
    "entrypoint": "manage.py",
    "migrate": true
  },
  "database": {
    "engine": "mysql",
    "persist": true
  }
}
```

Use `sqlite` or `postgresql` instead when appropriate. If `manage.py` is under
`backend/`, keep the manifest at the project root and use `"path": "backend"`.
The `entrypoint` stays `manage.py`, relative to that directory. Setting
`frontend: false` explicitly requests a managed backend and database; selecting
the ordinary **Python** runtime alone does not provision a managed database.

The preview root, login pages, Django admin, `/static/`, `/media/`, and API URLs all
go to Django. There is no separate frontend container or single-page-app fallback.
Django serves static assets using its configured staticfiles finders when
`django.contrib.staticfiles` is installed. Managed media uploads use `/data/media`;
media files already bundled in the ZIP are not copied into that volume. Readiness
uses the backend health endpoint, so an API-only application's `/` may return 404
without failing deployment.

Declare every imported package in `requirements.txt`, including `python-dotenv`
if settings import `dotenv`. Hosting must import the project's settings inside the
container before applying managed overrides. It supplies generated database
credentials and a secret key; a bundled `.env` file is excluded from extraction.

## Backend and database behavior

The backend uses the existing runtime dependency and startup rules. It must serve
HTTP on `0.0.0.0` using the supplied `PORT`. Custom commands are parsed as argument
lists, so shell pipelines and redirection are not supported. Dependencies required
by the application must be declared in its manifests.

For Django, hosting generates preview settings for allowed hosts, the managed
database, CSRF origins, and a deployment-specific secret key. It serves static
files through Django's preview server. It runs migrations before starting the
server unless `backend.migrate` is `false`, and supplies a dedicated readiness
endpoint. This does not create an administrator account or invent application
seed data. Custom initialization must be explicitly configured. For example:

```json
"migrate": [
  ["python", "manage.py", "migrate", "--noinput"],
  ["python", "manage.py", "loaddata", "preview_fixture.json"]
]
```

Migration commands run on each start and must be safe to repeat. Do not import
the same application records on every start unless your initialization handles
existing records. `database.seed` is intended for the initial database contents.

PostgreSQL and MySQL run in a separate container on the deployment's private
network. Hosting creates credentials and supplies `DATABASE_URL` and `DB_*`
variables to the backend. Applications other than Django must read those values
in their database configuration; hard-coded `localhost` credentials will not
connect to the managed database. Do not put database credentials in the manifest.
External databases remain unavailable from the isolated runtime network.

A seed must match the selected database engine and your application schema.
PostgreSQL/MySQL seeds are plain SQL files, not compressed or binary backups.
Hosting imports the seed into a fresh database before backend migrations. If a
seed already contains tables, its migration history must agree with your source
migrations. A failed import or migration fails deployment and appears in the logs.

## Persistence and expiry

With `database.persist: true`, database data survives stop, expiry, and restart of
the same saved deployment. Data from a previously healthy deployment is also
retained after a later failure. If initial setup fails before the first successful
deployment, its new partial database is removed so a retry can initialize cleanly.
The database container stops
with the website; retaining data does not keep the website publicly accessible.
Restart rebuilds application containers from the saved ZIP and reuses that
deployment's data. Uploading another ZIP creates a separate deployment and database.

Use **Delete** beside a stopped saved configuration to remove it and its managed
database volume. The interface asks for confirmation before deleting the data.
With `persist: false`, teardown removes the data, so a later start begins with a
fresh database and seed. Application files outside the managed database storage
remain temporary, including uploaded files written to ordinary backend directories.
Managed Django media uploads are stored under `/data/media` and retained with the
saved deployment. Existing media files bundled in a ZIP are not imported there.
Database retention is not a backup service.

## Preview URLs and operator setup

Apply the model-choice migration and restart Django and the hosting worker:

```bash
cd backend
python manage.py migrate
python manage.py hosting_worker
```

Keep the worker running separately from Django. With Compose, rebuild/recreate the
hosting stack using the existing hosting override. No change to the platform's
own database engine or application credentials is needed.

Fullstack previews now receive a public Cloudflare Quick Tunnel URL for each
execution. The generated HTTPS origin is supplied to the backend for redirects,
allowed hosts, CSRF checks, and secure cookies. Root-relative frontend assets and
API paths belong to that system's Cloudflare host. The platform's own API and
administrator routes are never served through a deployment tunnel. Stop and expiry
deny requests even if the worker has not yet removed the connector container.
Restarting creates a new link; the saved ZIP and retained database stay with the research.

The backend and worker default to `DEPLOYMENT_TUNNEL_ENABLED=true` and
`DEPLOYMENT_TUNNEL_ORIGIN=http://127.0.0.1:8080`. The latter must identify the local
Django backend. Apply hosting migration `0008` and restart both processes when upgrading.

When `DEPLOYMENT_TUNNEL_ENABLED=false`, fullstack previews still use a separate
host so root-relative assets, API paths, and application cookies belong to the
preview. When `DEPLOYMENT_BASE_DOMAIN` is set,
the URL uses that domain and `DEPLOYMENT_PUBLIC_SCHEME`. Otherwise the local default
is:

```text
http://<deployment-uuid>.preview.localhost:8080/
```

The default assumes Django is listening on port 8080. Change
`DEPLOYMENT_FULLSTACK_BASE_DOMAIN` to include the backend's actual port if needed.
Localhost addresses refer to the visitor's own computer. To share a preview with
another device or a remote user, configure a separate wildcard domain, DNS, TLS,
and reverse proxy routing to Django. The existing
[`deploy/temporary-hosting-nginx.conf.example`](../deploy/temporary-hosting-nginx.conf.example)
shows this routing. The hosting settings add the configured domain suffix to
Django's allowed hosts; they do not provision DNS or certificates.

| Setting | Default |
|---|---|
| `DEPLOYMENT_FULLSTACK_BASE_DOMAIN` | `preview.localhost:8080` |
| `DEPLOYMENT_FULLSTACK_PUBLIC_SCHEME` | `http` |
| `DEPLOYMENT_DATABASE_TIMEOUT_SECONDS` | `120` |
| `DEPLOYMENT_FULLSTACK_PYTHON_IMAGE` | `tukiva-hosting-python:3.12` |
| `DEPLOYMENT_POSTGRESQL_IMAGE` | `postgres:17-bookworm` |
| `DEPLOYMENT_MYSQL_IMAGE` | `mysql:8.4` |

Keep Django and worker settings consistent. Fullstack hosting uses the existing
resource limits for its containers; total resource use increases because the
database is a separate service. By default, ordinary Python and managed Python
backends use the image prepared by the worker from its trusted Dockerfile, with
the compiler, `pkg-config`, and MySQL client development libraries needed to
install `mysqlclient`. The existing `DEPLOYMENT_FULLSTACK_PYTHON_IMAGE` setting
names this shared image. It is cached; no manual image build is required.
Uploaded projects cannot supply an arbitrary Dockerfile or select Docker images.

This mode supports one HTTP backend, an optional static frontend, and one managed database.
Additional workers, Redis, arbitrary Compose projects, frontend server-side
rendering, WebSockets, and indefinite streaming need further runtime support.
