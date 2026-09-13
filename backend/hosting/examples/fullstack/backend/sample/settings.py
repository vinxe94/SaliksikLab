"""Small demo app; hosting supplies isolated database settings at deployment."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = os.getenv('SECRET_KEY', 'local-example-only-change-before-public-use')
DEBUG = False
ALLOWED_HOSTS = ['*']
ROOT_URLCONF = 'sample.urls'
INSTALLED_APPS = ['items']
MIDDLEWARE = []
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
DATABASES = {'default': {
    'ENGINE': 'django.db.backends.sqlite3',
    'NAME': os.getenv('HOSTING_DB_PATH', str(BASE_DIR / 'db.sqlite3')),
}}
USE_TZ = True
