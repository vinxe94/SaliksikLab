# Temporary hosting examples

The archive and admin runtime selectors support five programming languages:
JavaScript (Node.js), Python, PHP, Ruby, and C++, plus static HTML/CSS/JavaScript sites
and combined frontend/backend/database deployments.

Apply `python manage.py migrate` in the backend environment and restart the hosting
worker after updating the code. Keep Django, the frontend, Docker, and
`python manage.py hosting_worker` running.

Website ZIP uploads can be up to **200 MB** by default (`MAX_UPLOAD_SIZE_MB=200`).

## Frontend, backend, and database

Upload `frontend/` and `backend/` together, with an optional `database/` seed folder.
Choose **Detect automatically** or **Frontend + backend + database**. Hosting builds
the frontend, starts the backend, and can provision SQLite, PostgreSQL, or MySQL.
Use a root `hosting.json` to configure database choice, custom paths, and migration
commands. See [the fullstack hosting guide](../../../docs/FULLSTACK_HOSTING.md)
for a complete manifest, frontend API configuration, persistence, and preview URLs.

Django sites that render their own templates can use the same managed databases
without a separate frontend. Add this `hosting.json` next to `manage.py`:

```json
{
  "version": 1,
  "frontend": false,
  "backend": {"path": ".", "runtime": "python", "entrypoint": "manage.py"},
  "database": {"engine": "mysql", "persist": true}
}
```

Choose **Detect automatically** and leave the form's entrypoint/start command
empty. If `manage.py` lives in `backend/`, put the manifest in the project root
and change only `backend.path` to `backend`. The preview serves Django pages,
static files, media, and API routes directly. Hosting creates the database and
runs migrations; it does not create application users or import undeclared data.

Leave `venv`, `.venv`, `node_modules`, `.git`, and caches out of the ZIP. Include
dependency manifests and lockfiles instead. ZIPs still have a 10,000-entry limit;
bundled dependencies can exceed it even when the upload is smaller than 200 MB.

Persistent database data survives stop, expiry, and restart of the same saved
deployment. Deleting that deployment removes its database data. The default local
fullstack preview host is `*.preview.localhost:8080`; remote sharing requires a
configured wildcard domain routed to the backend.

## Ruby and C++ examples

From the repository root, create two ZIPs with Python's standard library:

```bash
python3 -m zipfile -c /tmp/ruby-hosting-demo.zip backend/hosting/examples/ruby
python3 -m zipfile -c /tmp/cpp-hosting-demo.zip backend/hosting/examples/cpp
```

Open an archive as an admin, scroll to **Temporary Hosting**, choose either ZIP,
and select **Detect automatically**, **Ruby**, or **C++** as appropriate. Leave
the entrypoint and start command empty. Click **Save and Run**, wait for **RUNNING**,
and click **Open Website**. Stop the first website before starting the other.

## Ruby

The default image is `ruby:3.4-bookworm`. `bundle install` runs inside the build
container when a `Gemfile` exists. Gems persist under `/app/vendor/bundle`; a
`Gemfile.lock` is used by Bundler when provided. No gems are installed on the host.

The default startup order is an explicit entrypoint, `bin/rails`, `config.ru`,
then `app.rb` or `server.rb`. Rack configurations need a `Gemfile` declaring
`rackup` and a server such as `puma` or `webrick`. The included demo uses Rack and
WEBrick. Standalone Rails projects must supply their own working configuration.
For a Rails backend with a separate frontend and managed database, use the
fullstack manifest and explicitly configure database access and migrations.

A standalone `app.rb`/`server.rb` can use Ruby's standard library without a
`Gemfile`. Scripts must listen on `0.0.0.0` and use `ENV.fetch("PORT")`. Rack and
Rails defaults receive explicit interface/port flags. A custom start command
such as `ruby app.rb --port {port}` runs under `bundle exec` when a Gemfile exists.

## C++

The default image is `gcc:14-trixie`. The worker compiles all `.cpp`, `.cc`, and
`.cxx` files directly under the detected project root together using:

```text
g++ -std=c++17 -O2 -pthread -I /app <source files> -o /app/.hosting-build/server
```

An explicit entrypoint, such as `src/main.cpp`, selects a single source file
instead. Include needed headers in the ZIP. Source filenames are quoted and
cannot inject compiler options. Build errors and exit codes appear in deployment
logs; failed compilation never marks a deployment running.

The default start command runs the compiled executable. To pass arguments, use:

```text
/app/.hosting-build/server --port {port}
```

The executable must implement HTTP, bind `0.0.0.0`, and read the `PORT` environment
variable (or the custom command's arguments). A console-only program will fail
the website health check. The included small Linux socket demo needs no external
libraries and reads `PORT` automatically.

CMake/Make build pipelines, OS-package installation, prebuilt binaries, and
automatic third-party C++ dependency resolution are not implemented. Header-only
libraries can be included in the project. Both compilation and execution retain
the existing container memory, CPU, process, timeout, and cleanup limits.

## Verification

Unit/API checks cover nested roots, ambiguous runtime detection, dependency
paths, compiler argument quoting, custom commands, archive association, stop,
saved restart, and build-failure cleanup. Opt-in Docker tests additionally cover
Ruby dependency failure and a Rack response, plus C++ compilation failure and a
successful HTTP response:

```bash
cd backend
python manage.py test hosting --settings=hosting.test_settings --noinput
```

The normal command skips real Docker tests. Their opt-in flag is documented in
the main hosting report; do not point test settings at the application database.

Runtime references: [official Ruby image tags](https://github.com/docker-library/official-images/blob/master/library/ruby),
[official GCC image tags](https://github.com/docker-library/official-images/blob/master/library/gcc),
[Bundler configuration](https://bundler.io/man/bundle-config.1.html),
[Rack's separate rackup dependency](https://github.com/rack/rack/blob/main/UPGRADE-GUIDE.md),
and [GCC compiler options](https://gcc.gnu.org/onlinedocs/gcc/Overall-Options.html).
