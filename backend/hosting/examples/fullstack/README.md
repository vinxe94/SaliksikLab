# Frontend, Django backend and database example

Zip this folder's contents, including `hosting.json`, and upload the ZIP using
auto detection. A wrapping project folder is also accepted. Do not include a
virtual environment, `node_modules`, `.env`, or generated `frontend/dist`.

The frontend uses a tiny Node build with no npm dependencies. Hosting builds its
assets, installs Django inside the backend image, creates an isolated SQLite
volume and runs the committed migration. `/api/` requests reach Django and other
paths reach the frontend; a path such as `/items/new` serves the SPA entry page.
The page lets you add items and reload them from the database.

This example requires a dedicated preview hostname configured by the hosting
operator. The browser uses relative `/api/items/` URLs, so frontend and backend
share the preview origin. It contains no authentication and is intended for demo
data only.

`database.persist` is true: records survive a stopped or expired preview and a
restart of this saved deployment. Deleting the saved deployment deletes its data.
A newly uploaded ZIP creates a separate database. See `database/README.md` for
optional SQLite seed data.

For PostgreSQL, change `database.engine` to `postgresql` and add
`psycopg[binary]>=3.1,<4` to `backend/requirements.txt`. For MySQL, change it to
`mysql` and add `mysqlclient>=2.2,<3`. Hosting supplies database connection settings
for Django; the ZIP must not include credentials for the host database. Hosting
automatically pulls the configured database image when it is not already cached.

The opt-in Docker tests in `hosting.tests.test_fullstack_docker` exercise this
fixture using temporary platform storage and a separate test database. The
PostgreSQL/MySQL cases have a second explicit opt-in flag.
