# Temporary hosting investigation, changes, and operation

Investigation: September 7, 2026. Updated: September 9, 2026. This work extends the existing Django `hosting` app and React archive interface. It preserves authentication, PostgreSQL, archive relationships, saved configurations, and existing API paths. The repository already contained unrelated uncommitted changes; those were retained. No live application database was migrated during development.

The fullstack extension adds a static frontend build, HTTP backend, and optional
managed SQLite/PostgreSQL/MySQL database under one preview URL. The
[fullstack hosting guide](FULLSTACK_HOSTING.md) describes the current manifest,
database retention, configuration, and limits; the earlier investigation below
records how the single-runtime implementation evolved.

## 1. How the previous system worked

The inspected lifecycle was:

1. An admin posted `site_zip`, `project_type`, optional entrypoint, and optional start command to the existing global or archive hosting API.
2. The view called `hosting.manager.create_session_from_upload()` synchronously.
3. The manager created a `HostingSession` and extracted directly into `backend/media/temporary_hosting/session_<database_id>/`. It did **not** retain the uploaded ZIP.
4. Root detection unwrapped one directory. Runtime selection came from the form; there was no automatic runtime detection.
5. There was no dependency installation stage. Python used Django's own interpreter/environment; PHP and Node used host executables. A custom npm/npx command could install or execute packages on the host.
6. The manager probed ports 9100–9199 using `connect_ex()`, constructed a command, and launched `subprocess.Popen()` with the extracted directory as its working directory.
7. The child inherited `os.environ`, including platform configuration. Default servers bound to `127.0.0.1`.
8. It marked the session `running` immediately after `Popen()`, without an HTTP health check. The preview URL pointed at the visitor's own `http://127.0.0.1:<port>/`.
9. A daemon `threading.Timer` inside the Django process performed expiry. `AppConfig.ready()` scheduled a startup scan in every Django process. That scan swallowed all exceptions.
10. Status requests checked whether a PID existed. Stop sent a signal and cleared the PID without waiting for verified resource removal. Restart reused extracted files and the previously resolved command.

The old database already persisted `started_at` and `expires_at`. Its startup scan intended to reuse the remaining duration; it did **not** deliberately reset the timer on every page refresh or Django restart. The defects were missing readiness/reconciliation guarantees and reliance on web-process timers, not an exclusively browser-based countdown.

## 2. Problems discovered

- Public preview URLs were local to the visitor; neither Vite nor Nginx forwarded a temporary-site route.
- A process could immediately crash yet be marked running, and its PID could later be reused.
- An upload/start race could launch two applications because only `running` records were checked, with no database constraint.
- ZIPs were not retained, and extraction had no explicit upload, expansion, member-count, special-file, or duplicate-path limits.
- String-prefix path validation could accept a sibling directory with a matching prefix.
- Only one wrapper directory was handled. Runtime selection and startup assumptions were narrow.
- Node always used `npm run dev`; no dependency installation stage existed.
- Python previews shared Django's interpreter, and all child processes inherited the host environment.
- The stored custom command was overwritten with a concrete port/interpreter, so subsequent restarts could reuse stale ports.
- Stop did not verify completion. Failure did not consistently capture useful errors or clean resources.
- Web-process shutdown, multiple workers, timer exceptions, and crashes could desynchronize records and processes.
- Ordinary archive readers could retrieve runtime logs and operational metadata.
- Legacy source files and logs lived under public media storage.
- Deleting a saved configuration could delete other records sharing its name, including configurations belonging to another archive.

## 3. Root causes and the scope of the replacement

The host process runner was the fundamentally unsafe component: it executed uploaded code with platform filesystem/environment access and provided no dependency isolation. It was replaced with Docker execution behind a service adapter. There was no existing deployment Docker implementation, Celery/Redis worker, or temporary-site reverse-proxy route to preserve.

The existing manager module remains as a compatibility facade. Authentication, archive APIs, the `HostingSession` model, saved-site workflow, and the main frontend remain in place. The existing archive hosting card was extracted into a shared component and also exposed in the admin page.

## 4. Existing files modified

- `.gitignore`
- `README.md`
- `backend/.dockerignore`, `backend/.env.example`, `backend/Dockerfile`
- `backend/config/settings.py`, `backend/config/urls.py`
- `backend/hosting/admin.py`, `apps.py`, `manager.py`, `models.py`, `serializers.py`, `views.py`
- `frontend/nginx.conf`, `frontend/vite.config.js`
- `frontend/src/pages/AdminPage.jsx`, `frontend/src/pages/ArchiveDetailPage.jsx`

The existing hosting URL definitions and archive associations were reused. Changes already present in other repository/account/frontend files were not reverted or replaced.

## 5. Files created

- `backend/hosting/services/archive_service.py`: private storage, ZIP validation, extraction, legacy import, runtime-file cleanup.
- `backend/hosting/services/runtime_service.py`: deterministic runtime/dependency/start rules.
- `backend/hosting/services/docker_service.py`: bounded Docker build/runtime/gateway operations and ownership checks.
- `backend/hosting/services/healthcheck_service.py`: bounded HTTP readiness retries.
- `backend/hosting/services/deployment_service.py`: queue reservation, transitions, stop/restart, expiration, reconciliation.
- `backend/hosting/services/proxy_service.py`: public HTTP proxy, expiry gates, preview-domain isolation.
- `backend/hosting/services/upload_service.py`: streaming multipart limits and immediate HTTP 413 responses.
- `backend/hosting/services/log_service.py`, `errors.py`, `__init__.py`.
- `backend/hosting/management/commands/hosting_worker.py`, with package `__init__.py` files.
- `backend/hosting/tests/test_lifecycle.py`, `test_recovery.py`, `test_docker_integration.py`, and `tests/__init__.py`.
- `backend/hosting/tests/test_runtimes.py`, plus Ruby/C++ source examples and their guide under `backend/hosting/examples/`.
- `backend/hosting/test_settings.py`: isolated test database configuration.
- `frontend/src/components/TemporaryHostingPanel.jsx`.
- `docker-compose.hosting.yml`.
- `deploy/temporary-hosting-worker.service`.
- `deploy/temporary-hosting-nginx.conf.example`.
- This report and the migration below.

## 6. Database migration

`backend/hosting/migrations/0003_hostingsession_active_slot_and_more.py` adds:

- Unique deployment UUID, allocated separately for each existing record.
- A unique nullable `active_slot`, with a check constraint requiring slot 1 for active statuses and NULL for terminal statuses.
- Preserved ZIP path, container ID/name/state, internal port, health status, exit code, restart request, and stop target.
- Upload, validation, extraction, build, and stopping statuses while keeping existing lowercase API status values.
- `SET_NULL` for the archive relationship so deletion cannot silently discard an active runtime's ownership record.

The existing `port` field remains the host port; the serializer also exposes `host_port`. Existing timestamp/error/path fields are reused. Public URLs are derived from the stable deployment UUID and configuration, avoiding stored stale URLs.

Legacy active records become failed pending verified host-process cleanup; their source paths, PIDs, commands, and timestamps are preserved. The worker verifies a legacy process's working directory, command, and process-group identity before signaling it. Unverifiable PIDs are left alone with an actionable error and block new launches until resolved. Importing a legacy saved configuration creates its private `source.zip`; it does not require reuploading.

`backend/hosting/migrations/0004_hostingsession_health_failures.py` adds a persistent consecutive-health-failure counter. A brief HTTP timeout reports degraded health; three consecutive failures trigger cleanup by default. A successful check clears the counter without changing the session deadline. Container disappearance or process exit is still handled immediately.

`backend/hosting/migrations/0005_add_ruby_cpp_runtimes.py` adds Ruby and C++ model choices. Existing records and the single-active-site rule are unchanged. Ruby/C++ detection, container build/start commands, archive/admin selection, examples, and additional tests are documented in [the runtime example guide](../backend/hosting/examples/README.md).

`backend/hosting/migrations/0006_add_fullstack_runtime.py` adds the combined
frontend/backend/database choice. It preserves existing deployment records and
the single-active-deployment constraint. Apply it before using the new option.

## 7. Dependency changes

No backend or frontend package dependency was added. An isolated `/tmp` virtual environment containing the project's declared requirements was used for testing; uploaded application dependencies were never installed into it or into the host environment.

Runtime requirements are Docker Engine and a worker with Docker daemon access. Docker Engine 29.1.3 was used for real tests. The Docker worker image includes the Docker CLI; the web image does not need the Docker socket.

Runtime rules:

| Runtime | Dependency installation, inside build container | Default start |
|---|---|---|
| Static | None | Non-root Nginx serving `index.html` |
| Node.js | `npm ci` with a lockfile; otherwise `npm install` | `npm start`; existing `npm run dev` previews remain supported |
| Python | Private `/app/.venv`, then `pip install -r requirements.txt` when present | `manage.py runserver 0.0.0.0:<port> --noreload`, or `app.py`/selected entrypoint |
| PHP | `composer install` when `composer.json` is present | PHP server serving `public/` when available, otherwise project root |
| Ruby | `bundle install` when `Gemfile` is present; project gems in `/app/vendor/bundle` | Explicit entrypoint, Rails `bin/rails`, Rack `config.ru`, or `app.rb`/`server.rb`; Bundler wraps startup when a Gemfile exists |
| C++ | GCC compiles root `.cpp`/`.cc`/`.cxx` sources, or one selected source, using C++17 and pthreads | `/app/.hosting-build/server`, serving HTTP on `0.0.0.0:$PORT` |

A plain Node entrypoint/custom command without a package manifest also remains supported. Custom commands are argument arrays inside the selected container; `{port}` remains a template and is resolved per launch. No uploaded Dockerfile is executed.

## 8. Docker changes

The worker creates a predictable `temporary_<uuid-without-hyphens>` application container and a temporary `_build` container. A trusted `_proxy` Nginx container publishes the local host port. This gateway is necessary because actual Docker tests confirmed that internal networks do not receive published port bindings.

Uploaded runtime code has only an isolated internal network. The trusted gateway connects that network to a loopback-only published port. The gateway checks the current container ID on every request, preventing a stale request from reaching a different deployment if a host port is reused. The application has no host network, bind mount, platform environment, Docker socket, extra capabilities, or privileged mode.

Build/runtime/gateway containers run as UID/GID 10001, with memory, CPU, PID, log, and no-new-privileges limits. Build containers have network access for package registries. Dependencies and source are committed into a deployment-specific Docker image; build containers are then removed. Runtime files remain inside Docker layers. The gateway filesystem is read-only apart from its bounded `/tmp`.

Ownership labels identify the deployment and installation. Cleanup never uses a global Docker prune and does not remove unrelated containers/images/networks. Shared base images remain cached. Deployment-specific images, networks, and containers are removed at stop/failure/expiry.

The adapter's loopback publishing and resource flags follow the [Docker run documentation](https://docs.docker.com/engine/containers/run/) and [port publishing documentation](https://docs.docker.com/engine/network/port-publishing/), with behavior also verified on the local daemon.

## 9. Timer and expiration

The worker sets `started_at` only after a successful HTTP health check and persists `expires_at = started_at + 30 minutes` by default. Refreshing the page only refreshes the display. Django application startup creates no timers and performs no database work in `AppConfig.ready()`.

Public proxy requests check persisted status/expiry both before forwarding and before returning the buffered response. An expired/stopping deployment returns a noncached 410. No new request is forwarded after its database deadline.

A separate worker wakes at the next deadline or cleanup interval, whichever is sooner. It transitions through `stopping`, removes resources, clears the port/slot, records `stopped_at`, and marks `expired`. Scheduling and Docker operations take finite time: physical resource removal completes shortly after the deadline, while public access is governed by the exact timestamp. If the worker and Docker are unavailable, resource cleanup waits for recovery; the public expiry gate still applies. This is why the worker is supplied as an independently supervised service.

## 10. Restart

Restart disables the route immediately and retains the active slot while the worker removes old containers, network, image, and extracted files. The retained ZIP is re-extracted, dependencies rebuilt, and a fresh container checked. Only then does a new 30-minute session begin.

Duplicate restart requests while a deployment is starting/stopping are rejected. Restart never restarts Django. Existing saved configurations and archive-specific restart endpoints remain available. An explicit session ID prevents a delayed action from targeting a different newly active deployment.

## 11. Cleanup and retention

- Normal stop, force-stop, cancellation, expiry, and failure all use the same cleanup operation.
- Repeating stop/removal is safe when resources are already gone.
- Slow Docker pulls and commits can be cancelled; the host Docker CLI is killed and reaped. Worker shutdown during deployment fails and cleans the unfinished attempt while retaining its ZIP.
- Failed builds and failed health checks retain useful logs and release the slot **after** removal is verified.
- If Docker is unreachable or removal fails, the state remains `stopping` with an explicit cleanup error; the slot stays reserved until retry succeeds. Claiming `failed` and admitting another app while the old one might still run would violate the one-site requirement.
- Source ZIP and bounded logs are retained until the administrator deletes that specific saved configuration.
- Extracted source, transfer archives, build/runtime/gateway containers, private networks, and deployment images are removed.
- Startup/periodic reconciliation removes orphan resources belonging to this installation, including resources whose database record disappeared.
- Legacy extracted directories are retained during upgrade as source backups and are blocked from public media access.

## 12. Ports and public proxy

Default local/development URL:

```text
/temp/<deployment-uuid>/
```

Vite and the existing frontend Nginx forward this path to Django. The request then reaches the assigned `127.0.0.1:<ephemeral-port>` gateway and the isolated application. Docker atomically allocates the host port; the old probe-then-bind range is gone. A stopped route returns 410; a connection failure returns a generic 503 without leaking internal errors.

For full applications, configure a separate wildcard preview domain:

```text
https://<deployment-uuid>.preview.example.net/
```

Wildcard DNS/TLS and reverse-proxy routing must point that domain to the backend, using the supplied Nginx example. Preview hosts are intercepted before platform authentication/routing: `/api/...` on a preview host belongs to that uploaded app, not to Tukiva.

The path fallback rewrites ordinary root-relative HTML/CSS assets. Framework-generated JavaScript URLs require a configured base path (`PUBLIC_URL` is supplied), or the wildcard-host option. The same-origin path fallback is sandboxed to protect platform browser storage; applications needing cookies, localStorage, service workers, or ordinary same-origin fetch behavior should use the separate preview domain.

## 13. Security improvements

- Streaming multipart limits reject oversized requests before the whole upload is stored, with HTTP 413 and closure/removal of partial temporary uploads.
- ZIP path traversal, absolute/Windows paths, links/special files, duplicates, encryption, archive size, expansion size, and file-count validation.
- Private source/log storage outside `MEDIA_ROOT`; legacy media paths are blocked, including normalized traversal variants.
- Bundled virtual environments, `node_modules`, Git metadata, and `.env*` files are excluded from deployment extraction.
- Non-root, bounded containers; no privileged mode, Docker socket, host mounts, inherited platform environment, or additional capabilities for uploaded applications.
- Runtime isolation from external/host networks, with a fixed trusted reverse-proxy gateway.
- Admin-only mutations/logs; ordinary archive readers get only public deployment metadata.
- Existing JWT authentication remains intact. Hosting control endpoints do not introduce cookie/session authentication or a CSRF bypass for platform actions. Only the separate public uploaded-app proxy accepts unauthenticated application requests.
- Same-origin preview content is sandboxed; platform credentials are not forwarded. Dedicated preview cookies cannot set a parent Domain.
- Proxy request/response size limits, HTTP timeouts, no cache, and a container-generation check.
- Django admin no longer permits direct editing/deletion of lifecycle state behind the worker.

## 14. ZIP storage

Default layout:

```text
backend/storage/deployments/<deployment-uuid>/
├── source.zip
├── app/                         # Exists while building/running
└── logs/
    ├── deployment.log
    ├── build.log
    ├── runtime.log
    └── proxy.log
```

The storage root also contains the worker lock and heartbeat. Docker Compose stores this directory in the `hosting_storage` named volume. Web and worker processes must share this storage and the same database. `DEPLOYMENT_STORAGE_PATH` must stay outside public media storage.

## 15. Uploaded-project dependencies

They are installed inside the limited Docker build container, then retained in the deployment image/runtime filesystem. Python uses `/app/.venv`; npm installs into `/app/node_modules`; Composer installs into the container's application tree. Static sites install nothing. Docker physically stores these layers on the host, but no uploaded-project package is installed into system Python, global npm/Composer, or Django's environment.

## 16. Server restart recovery

The worker acquires an exclusive filesystem lock and reconciles before accepting work. A second worker using the same storage cannot run concurrently. A healthy unexpired runtime is kept with its original timestamps. Expired runtimes are removed. A missing/exited runtime becomes failed with its exit/error details. Interrupted build/start operations are cleaned and marked failed; queued ZIPs can safely resume. No automatic restart loop is enabled for uploaded containers.

Run the worker with systemd or Compose's restart policy so it restarts independently of Django. A laptop/host reboot that loses a container results in a clear failed session or expired cleanup, rather than silently creating another 30-minute session.

## 17. Deployment failure recovery

Upload/validation failures create a failed record with the actual error and never create a container. Runtime detection, dependency, startup, and health failures capture their stage/logs and enter centralized cleanup. Docker outages remain visible as pending cleanup and are retried. A failed deployment whose cleanup succeeded does not block the next upload. Admins can restart from the preserved source ZIP after correcting the ZIP/configuration as needed.

## 18. Commands to run

Use the existing backend environment and database configuration. From the repository root:

```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
```

Run the backend and frontend as before (`./run-projects.sh tukiva` from the repository root also remains available). Run the additional worker in its own terminal:

```bash
cd backend
source venv/bin/activate
python manage.py hosting_worker
```

For a service, edit the user, working directory, and Python path in `deploy/temporary-hosting-worker.service` to match the installed environment, ensure that service user can use Docker, then install it:

```bash
sudo install -m 0644 deploy/temporary-hosting-worker.service /etc/systemd/system/temporary-hosting-worker.service
sudo systemctl daemon-reload
sudo systemctl enable --now temporary-hosting-worker
journalctl -u temporary-hosting-worker -f
```

The service-install commands above are operator instructions; they were not executed during development. Before upgrading a running old installation, stop its host previews/web processes, apply migrations, then start the new worker/web processes.

Alternatively, on Linux:

```bash
docker compose -f docker-compose.yml -f docker-compose.hosting.yml up --build
```

The optional override preserves the ordinary Compose file. The web/worker use the host network to reach loopback-only deployment ports; the frontend uses `host.docker.internal`. Only the trusted worker receives the Docker socket. The worker and backend share source storage and the existing media volume for legacy import. Keep their database credentials synchronized if changing the original Compose development defaults. Compose configuration is taken from root `.env`/shell variables, whereas local Django reads `backend/.env`.

For a one-time reconciliation, stop the persistent worker first, then run:

```bash
python manage.py hosting_worker --once
```

This reconciles and processes one queued deployment; it is not a replacement for the persistent expiration worker.

## 19. Environment variables

Existing platform database/auth settings remain required. Hosting defaults are ready for local `/temp/` previews; new settings are optional unless using custom storage or a preview domain.

| Variable | Default | Purpose |
|---|---|---|
| `DEPLOYMENT_DURATION_MINUTES` | `30` | Session duration; legacy `TEMP_HOSTING_DURATION_MINUTES` remains a fallback |
| `MAX_UPLOAD_SIZE_MB` | `200` | ZIP upload limit |
| `DEPLOYMENT_STORAGE_PATH` | `backend/storage/deployments` | Private persistent source/log directory |
| `DEPLOYMENT_MAX_EXTRACTED_MB` | `500` | Expanded source limit |
| `DEPLOYMENT_MAX_FILES` | `10000` | ZIP member count limit |
| `DEPLOYMENT_INTERNAL_PORT` | `8080` | Application/gateway listen port |
| `DEPLOYMENT_MEMORY_LIMIT` | `512m` | Per-container memory and swap cap |
| `DEPLOYMENT_CPU_LIMIT` | `0.5` | Per-container CPU allocation |
| `DEPLOYMENT_PIDS_LIMIT` | `128` | Per-container process limit |
| `DEPLOYMENT_BUILD_TIMEOUT_SECONDS` | `600` | Pull/install timeout |
| `HEALTHCHECK_TIMEOUT_SECONDS` | `60` | Startup readiness window |
| `DEPLOYMENT_HEALTHCHECK_FAILURES` | `3` | Consecutive failed checks required before stopping an existing runtime |
| `DEPLOYMENT_HEALTHCHECK_PATH` | `/` | HTTP endpoint that must return 2xx/3xx |
| `DEPLOYMENT_CLEANUP_INTERVAL` | `1` | Maximum idle worker wait, in seconds |
| `DEPLOYMENT_LOG_MAX_BYTES` | `2097152` | Retained per-file log bound |
| `DEPLOYMENT_PROXY_MAX_BYTES` | `20971520` | HTTP request/response bound |
| `DEPLOYMENT_BASE_DOMAIN` | empty | Separate wildcard preview domain |
| `DEPLOYMENT_PUBLIC_SCHEME` | `https` | Scheme for wildcard preview links |
| `DEPLOYMENT_PUBLIC_ORIGIN` | empty | Absolute origin for path previews when API/frontend origins differ |
| `DEPLOYMENT_INSTANCE_ID` | `tukiva` | Ownership scope; use a distinct value for separate installations sharing Docker |
| `DEPLOYMENT_STATIC_IMAGE` | `nginxinc/nginx-unprivileged:1.28-alpine` | Static/gateway base image |
| `DEPLOYMENT_NODE_IMAGE` | `node:22-bookworm-slim` | Node base image |
| `DEPLOYMENT_PYTHON_IMAGE` | `tukiva-hosting-python:3.12` (follows `DEPLOYMENT_FULLSTACK_PYTHON_IMAGE`) | Prepared Python image with compiler, pkg-config, and MySQL client development libraries; built from the trusted bundled Dockerfile when absent |
| `DEPLOYMENT_PHP_IMAGE` | `composer:2` | PHP/Composer base image |
| `DEPLOYMENT_RUBY_IMAGE` | `ruby:3.4-bookworm` | Ruby/Bundler base image |
| `DEPLOYMENT_CPP_IMAGE` | `gcc:14-trixie` | C++ compiler/runtime base image |

Use administrator-controlled image tags/digests; uploaded projects cannot choose base images. Keep web/worker settings consistent. The proxy and containers must share the Docker host's loopback network namespace; a remote Docker daemon or ordinary bridged web container cannot access these local ports directly.

## 20. Tests performed

Automated coverage includes all requested lifecycle categories:

| Scenario | Verification |
|---|---|
| Valid static ZIP, flat/nested roots | Real Docker launches and public HTTP responses |
| Public access without login | Anonymous Django proxy requests reaching real containers |
| Refresh countdown | Repeated status requests preserve stored timestamps |
| Expiration | Deadline-gated requests, expired-startup cleanup, and a real shortened worker session |
| Stop/idempotency | Route closes immediately; worker removes runtime/gateway/port; repeated stop succeeds |
| Restart | Preserved ZIP, new container ID, cleanup before build, new exact 30-minute interval |
| Invalid/dangerous ZIPs | Invalid bytes, traversal, absolute/Windows paths, links, expansion/file-count/upload limits |
| Dependency failure | Real npm install lifecycle failure (exit 19), private logs, subsequent successful launch |
| Startup failure | Real Node exit 23 and captured stderr |
| Port conflicts | Occupied host socket while Docker allocates a different ephemeral port |
| Backend/worker restart | Healthy reconciliation preserves deadline; separate worker killed/restarted mid-session |
| Single active deployment | Database constraint tests plus simultaneous PostgreSQL admin uploads |
| Runtime crash | Real container kill, failed status, exit code, cleanup |
| Failure frees slot | Upload after cleaned failure succeeds |
| Route removal | 410 after stop/expiry, including cancellation during a response |
| Authorization/log privacy | Student cannot control deployments/read logs; public metadata omits private paths/errors |
| Upgrade migration | PostgreSQL upgrade with duplicate legacy active rows preserves sources/PIDs and creates distinct UUIDs |
| Main system regression | Existing account and repository tests |
| Frontend | Targeted ESLint and Vite production build |
| Configuration | Migration drift check and optional Compose validation |

Before the final streaming-upload, cancellable-command, and health-retry additions, all six real-container scenarios passed for static, Node, Python, and PHP. It includes a 12-second test-only session to verify automatic scheduling and worker crash recovery; ordinary sessions were separately asserted to use exactly `started_at + timedelta(minutes=30)`. Tests did not wait through a full 30-minute wall-clock session.

Verification before the Ruby/C++ addition on September 8:

- Current code: 78 tests discovered on local Django 6.0.4; 70 passed and 8 environment-specific cases skipped.
- Current code in the built worker image, using disposable PostgreSQL **without a Docker socket**: 72 passed and the 6 real-Docker cases skipped. This includes both migration upgrades and simultaneous admin requests.
- Targeted frontend ESLint, production build, Nginx syntax validation, Compose validation, migration-drift check, and whitespace checks passed.
- The worker image built successfully, its Docker CLI runs, and Django's configuration check passed. Disposable test database/port-check containers were removed; no deployment containers, deployment images, or private deployment networks remained. The separately tagged worker test image and shared base images remain cached.
- Final re-execution of all six real-Docker cases was blocked by automatic approval review: mounting the host Docker socket in the trusted test controller was rejected because it grants broad host Docker control. No rejected socket mount was performed. The final retest needs explicit approval; prior real-container results do not verify the subsequent additions end to end.

The admin panel also ignores out-of-order polling responses and does not show logs from a different deployment.

Ruby/C++ update verification on September 8:

- 99 tests discovered: 89 passed, with 8 opt-in Docker lifecycle tests and 2 PostgreSQL-specific tests skipped. The same result passed on local Django 6.0.4 and the cached image containing the declared Django 4.2 dependencies. The latter had network access disabled and no Docker socket.
- Restricted, non-root standalone containers built and served the included Ruby/Rack and C++ examples; both returned HTTP 200 with the expected page. Ruby installed Rack, rackup, and WEBrick inside its container. C++ compiled with GCC using the runtime plan's C++17 flags.
- An invalid Gemfile failed with exit code 4 and useful Bundler diagnostics; invalid C++ source failed with exit code 1 and compiler diagnostics. These checks used only the new language test containers, with no Docker socket. They validate build/start/HTTP behavior; they do not rerun the full queued deployment/proxy lifecycle suite described above.
- Frontend lint/build, Compose configuration, migration drift, and whitespace checks passed. Migration `0005` was generated; the live application database was not migrated. Both language test containers were removed, while shared base images remain cached.
- Ready-to-upload example ZIPs were created at `/tmp/ruby-hosting-demo.zip` and `/tmp/cpp-hosting-demo.zip`. The example guide includes commands to recreate them.

Fullstack update verification on September 9:

- The hosting, account, and repository suites discovered 121 tests: 101 passed,
  with 20 optional Docker/PostgreSQL cases skipped. Targeted frontend lint,
  production build, hosting migration drift, merged Compose configuration, and
  whitespace checks passed.
- Real Docker tests verified SQLite and PostgreSQL seed/persistence behavior,
  MySQL seed/persistence behavior using the bundled trusted Python image, and
  frontend/backend readiness and cleanup. The existing static, Node, Python,
  and PHP deployment regression checks also passed.
- A cleaned TigAyo ZIP with 77 source entries (209,716 bytes) built its Vite
  frontend, installed its Django 6 dependencies, applied migrations against a
  disposable managed PostgreSQL database, and returned HTTP 200 for the frontend,
  application health API, and managed backend health endpoint. This was a
  deployment smoke test; it did not exercise every TigAyo application workflow.
- Verification used isolated test storage and databases. The live platform
  database still needs the normal migration/restart step before using the new
  runtime choice. Setup details and supported scope are in
  [FULLSTACK_HOSTING.md](FULLSTACK_HOSTING.md).

Python/MySQL and Django-only update verification on September 10:

- Ordinary Python deployments now default to the same prepared Python image used
  for managed MySQL backends. The shared image loader builds the trusted bundled
  Dockerfile when necessary; explicit operator image overrides remain supported.
- A real standalone Python deployment installed the reported versions of Django,
  Pillow, reportlab, openpyxl, requests, and `mysqlclient==2.2.4`, imported them,
  and served HTTP successfully. The compiler, `pkg-config`, and MySQL development
  libraries are inside the build image.
- `hosting.json` now accepts `frontend: false` for a backend that serves its own
  pages. A real MySQL deployment verified migrations, template rendering,
  database writes, static assets, reconciliation, and cleanup with no separate
  frontend container. The existing separate frontend/backend regression passed.
- The account, repository, and hosting suites discovered 138 tests: 116 passed,
  with 22 optional integration cases skipped. Shared image preparation, manifest
  validation, preview routing, and old saved-state behavior have regression
  coverage. Compose configuration and source whitespace checks passed.

Repeat ordinary tests:

```bash
cd backend
python manage.py test accounts repository hosting --settings=hosting.test_settings --noinput
```

Opt into Docker tests:

```bash
RUN_DOCKER_HOSTING_TESTS=1 python manage.py test hosting.tests.test_docker_integration --settings=hosting.test_settings --noinput
```

PostgreSQL concurrency/upgrade and separate-worker tests use a disposable database with `HOSTING_TEST_POSTGRES_PORT=<test-container-port>`. The test settings use database/user/password `hosting_test` and never select the normal application database. Do not point these test settings at application data. Tests without this variable skip PostgreSQL-only cases.

## 21. Remaining limits

- Java is not implemented; ambiguous/unsupported projects receive explicit errors. Ruby and C++ are available alongside JavaScript, Python, PHP, and static sites. Fullstack mode adds one static frontend build, one HTTP backend, and an optional SQLite/PostgreSQL/MySQL database. Arbitrary Compose projects, extra workers/services, frontend server-side rendering, and custom OS-package installation need further runtime support. C++ supports direct GCC source compilation, not CMake/Make projects or console-only previews.
- Path previews cannot transparently repair every framework's absolute JavaScript/API routes. Use a separate wildcard preview domain for full applications; DNS/TLS/public Internet reachability must be configured by the operator. Local anonymous proxy access was tested; no external domain or tunnel was published.
- The HTTP proxy is bounded and buffered. WebSockets, SSE/indefinite streaming, and responses larger than the configured limit are not supported.
- Source ZIPs/logs are retained until deletion. Docker writable application layers do not have a portable disk quota; an isolated worker host or storage-driver quotas are appropriate where hostile workloads/disk exhaustion are a concern.
- Build containers need registry/network access. Their outbound traffic is not restricted to an allowlist of registries; runtime containers have the stricter isolated network.
- The worker must remain supervised. Public access is denied at the exact stored expiry, but process scheduling/Docker latency and worker/daemon outages prevent a hard real-time guarantee for physical container destruction.
- Runtime containers have restart policy `no`; missing containers fail explicitly rather than restoring application state. Ordinary runtime writes are ephemeral. Fullstack managed database data persists across stop/expiry/restart when `database.persist` is true and is removed when the saved deployment is deleted. A failed initial setup removes its new partial database; a later failure retains data from a previously healthy deployment.
- Custom apps must listen on `0.0.0.0:$PORT` and return 2xx/3xx at the health-check path. Platform secrets and `.env*` files are deliberately unavailable.
- This is a single-Docker-host design with shared local storage and one active website per database. Multiple independent Docker hosts require a distributed worker/ownership design.
- The frontend build retains its existing large-bundle warning; targeted lint/build checks pass.
