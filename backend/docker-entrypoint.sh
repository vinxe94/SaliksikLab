#!/bin/sh
set -e

python <<'PY'
import os
import socket
import time

host = os.getenv('DB_HOST')
port = int(os.getenv('DB_PORT', '5432'))

if host:
    deadline = time.time() + 60
    while True:
        try:
            with socket.create_connection((host, port), timeout=2):
                break
        except OSError:
            if time.time() > deadline:
                raise
            print(f'Waiting for database at {host}:{port}...')
            time.sleep(2)
PY

python manage.py migrate --noinput
python manage.py collectstatic --noinput

exec "$@"
