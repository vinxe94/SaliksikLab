"""Isolated SQLite configuration for hosting tests and migration verification."""
import os
from config.settings import *  # noqa: F403

DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': os.getenv('HOSTING_TEST_DATABASE', ':memory:')}}
MIGRATION_MODULES = {} if os.getenv('HOSTING_TEST_MIGRATIONS') == '1' else {'accounts': None, 'repository': None, 'hosting': None}
if os.getenv('HOSTING_TEST_POSTGRES_PORT'):
    DATABASES = {'default': {'ENGINE': 'django.db.backends.postgresql', 'NAME': os.getenv('HOSTING_TEST_DATABASE', 'hosting_test'), 'USER': 'hosting_test', 'PASSWORD': 'hosting_test', 'HOST': '127.0.0.1', 'PORT': os.environ['HOSTING_TEST_POSTGRES_PORT']}}
    MIGRATION_MODULES = {}
DEPLOYMENT_REQUIRE_WORKER = False
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
DDOS_PROTECTION_ENABLED = False
ALLOWED_HOSTS = ['testserver', 'localhost', '127.0.0.1', '.previews.localhost']

if os.getenv('HOSTING_TEST_DURATION_SECONDS'):
    DEPLOYMENT_DURATION_MINUTES = float(os.environ['HOSTING_TEST_DURATION_SECONDS']) / 60
