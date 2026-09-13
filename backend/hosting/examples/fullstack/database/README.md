The default example starts with an empty managed SQLite database. Hosting runs
`backend/manage.py migrate --noinput` before opening the preview, creating the
`items_item` table. Database files are stored in a Docker volume, outside the ZIP.

To start from an existing SQLite database, place it here as `seed.sqlite3` and add
`"seed": "database/seed.sqlite3"` to the `database` object in `hosting.json`. A seed
is used only when initializing a new saved deployment. With `persist: true`, items
remain after stop, expiry and restart. Deleting the saved deployment removes the
volume and its data.
