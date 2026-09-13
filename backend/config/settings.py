import os
import sys
from urllib.parse import parse_qs, unquote, urlparse
from pathlib import Path
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.getenv('SECRET_KEY', 'django-insecure-fallback-key')
DEBUG = os.getenv('DEBUG', 'True') == 'True'
def csv_env(name, default=''):
    return [item.strip() for item in os.getenv(name, default).split(',') if item.strip()]


def postgres_config_from_url(url):
    parsed = urlparse(url)
    options = {
        key: values[-1]
        for key, values in parse_qs(parsed.query).items()
        if values
    }
    config = {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': unquote(parsed.path.lstrip('/')),
        'USER': unquote(parsed.username or ''),
        'PASSWORD': unquote(parsed.password or ''),
        'HOST': parsed.hostname or '',
        'PORT': str(parsed.port or 5432),
    }
    if options:
        config['OPTIONS'] = options
    return config

TUNNEL_ALLOWED_HOSTS = (
    '.ngrok-free.app,.ngrok.app,.ngrok-free.dev,.ngrok.dev,.ngrok.io,.trycloudflare.com,.up.railway.app,.vercel.app'
)
TUNNEL_ALLOWED_ORIGIN_REGEXES = (
    r'^https://.*\.ngrok-free\.app$,'
    r'^https://.*\.ngrok\.app$,'
    r'^https://.*\.ngrok-free\.dev$,'
    r'^https://.*\.ngrok\.dev$,'
    r'^https://.*\.ngrok\.io$,'
    r'^https://.*\.trycloudflare\.com$,'
    r'^https://.*\.up\.railway\.app$,'
    r'^https://.*\.vercel\.app$'
)
TUNNEL_CSRF_TRUSTED_ORIGINS = (
    'https://*.ngrok-free.app,'
    'https://*.ngrok.app,'
    'https://*.ngrok-free.dev,'
    'https://*.ngrok.dev,'
    'https://*.ngrok.io,'
    'https://*.trycloudflare.com,'
    'https://*.up.railway.app,'
    'https://*.vercel.app'
)

ALLOWED_HOSTS = csv_env('ALLOWED_HOSTS', f'localhost,127.0.0.1,0.0.0.0,{TUNNEL_ALLOWED_HOSTS}')
if DEBUG:
    for dev_host in ['localhost', '127.0.0.1', '0.0.0.0']:
        if dev_host not in ALLOWED_HOSTS:
            ALLOWED_HOSTS.append(dev_host)

CSRF_TRUSTED_ORIGINS = csv_env('CSRF_TRUSTED_ORIGINS', TUNNEL_CSRF_TRUSTED_ORIGINS)
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third party
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    # Local
    'accounts',
    'repository',
    'hosting',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'config.middleware.DDoSProtectionMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

RUNNING_TESTS = 'test' in sys.argv

if RUNNING_TESTS:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'test_db.sqlite3',
        }
    }
    MIGRATION_MODULES = {
        'accounts': None,
        'repository': None,
        'hosting': None,
    }
else:
    database_url = os.getenv('DATABASE_URL')
    if database_url:
        DATABASES = {'default': postgres_config_from_url(database_url)}
    else:
        DATABASES = {'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv('PGDATABASE', os.getenv('DB_NAME', 'thesis_repo')),
            'USER': os.getenv('PGUSER', os.getenv('DB_USER', 'postgres')),
            'PASSWORD': os.getenv('PGPASSWORD', os.getenv('DB_PASSWORD', 'postgres')),
            'HOST': os.getenv('PGHOST', os.getenv('DB_HOST', 'localhost')),
            'PORT': os.getenv('PGPORT', os.getenv('DB_PORT', '5432')),
        }}

AUTH_USER_MODEL = 'accounts.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Manila'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'
SUBMISSION_STORAGE_PATH = os.getenv('SUBMISSION_STORAGE_PATH', str(BASE_DIR / 'private_submissions'))

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# CORS
CORS_ALLOWED_ORIGINS = csv_env(
    'CORS_ALLOWED_ORIGINS',
    'http://localhost:5173,http://127.0.0.1:5173'
)
CORS_ALLOWED_ORIGIN_REGEXES = csv_env('CORS_ALLOWED_ORIGIN_REGEXES', TUNNEL_ALLOWED_ORIGIN_REGEXES)
CORS_ALLOW_CREDENTIALS = True

# DRF
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 12,
    'DEFAULT_THROTTLE_CLASSES': (
        'rest_framework.throttling.ScopedRateThrottle',
    ),
    'DEFAULT_THROTTLE_RATES': {
        'auth_login_ip': os.getenv('AUTH_LOGIN_IP_RATE', '5/min'),
        'auth_login_email': os.getenv('AUTH_LOGIN_EMAIL_RATE', '5/min'),
        'auth_register': os.getenv('AUTH_REGISTER_RATE', '5/hour'),
        'auth_token_refresh': os.getenv('AUTH_TOKEN_REFRESH_RATE', '30/min'),
        'auth_password_reset_ip': os.getenv('AUTH_PASSWORD_RESET_IP_RATE', '5/hour'),
        'auth_password_reset_email': os.getenv('AUTH_PASSWORD_RESET_EMAIL_RATE', '3/hour'),
        'auth_password_reset_confirm': os.getenv('AUTH_PASSWORD_RESET_CONFIRM_RATE', '10/hour'),
    },
}

# JWT
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': False,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# File upload settings
DATA_UPLOAD_MAX_MEMORY_SIZE = 104857600   # 100 MB
FILE_UPLOAD_MAX_MEMORY_SIZE = 104857600   # 100 MB

ALLOWED_UPLOAD_EXTENSIONS = [
    'pdf',
]

# Email
EMAIL_BACKEND = os.getenv('EMAIL_BACKEND', 'django.core.mail.backends.console.EmailBackend')
EMAIL_HOST = os.getenv('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', '587'))
EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', 'True') == 'True'
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', 'Research Repository <noreply@repository.local>')
FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:5173')

# App-layer DDoS/flood protection
DDOS_PROTECTION_ENABLED = os.getenv('DDOS_PROTECTION_ENABLED', 'True') == 'True'
DDOS_RATE_LIMIT = os.getenv('DDOS_RATE_LIMIT', '300/min')
DDOS_BLOCK_SECONDS = int(os.getenv('DDOS_BLOCK_SECONDS', '300'))
DDOS_TRUST_PROXY_HEADERS = os.getenv('DDOS_TRUST_PROXY_HEADERS', 'False') == 'True'
DDOS_EXEMPT_PATH_PREFIXES = tuple(csv_env('DDOS_EXEMPT_PATH_PREFIXES', '/static/'))

# Temporary website preview hosting
DEPLOYMENT_DURATION_MINUTES = int(os.getenv('DEPLOYMENT_DURATION_MINUTES', os.getenv('TEMP_HOSTING_DURATION_MINUTES', '30')))
DEPLOYMENT_STORAGE_PATH = os.getenv('DEPLOYMENT_STORAGE_PATH', str(BASE_DIR / 'storage' / 'deployments'))
MAX_UPLOAD_SIZE_MB = int(os.getenv('MAX_UPLOAD_SIZE_MB', '200'))
DEPLOYMENT_MAX_EXTRACTED_MB = int(os.getenv('DEPLOYMENT_MAX_EXTRACTED_MB', '500'))
DEPLOYMENT_MAX_FILES = int(os.getenv('DEPLOYMENT_MAX_FILES', '10000'))
DEPLOYMENT_INTERNAL_PORT = int(os.getenv('DEPLOYMENT_INTERNAL_PORT', '8080'))
DEPLOYMENT_MEMORY_LIMIT = os.getenv('DEPLOYMENT_MEMORY_LIMIT', '512m')
DEPLOYMENT_CPU_LIMIT = os.getenv('DEPLOYMENT_CPU_LIMIT', '0.5')
DEPLOYMENT_PIDS_LIMIT = int(os.getenv('DEPLOYMENT_PIDS_LIMIT', '128'))
DEPLOYMENT_BUILD_TIMEOUT_SECONDS = int(os.getenv('DEPLOYMENT_BUILD_TIMEOUT_SECONDS', '600'))
HEALTHCHECK_TIMEOUT_SECONDS = int(os.getenv('HEALTHCHECK_TIMEOUT_SECONDS', '60'))
DEPLOYMENT_HEALTHCHECK_FAILURES = int(os.getenv('DEPLOYMENT_HEALTHCHECK_FAILURES', '3'))
DEPLOYMENT_HEALTHCHECK_PATH = os.getenv('DEPLOYMENT_HEALTHCHECK_PATH', '/')
DEPLOYMENT_CLEANUP_INTERVAL = float(os.getenv('DEPLOYMENT_CLEANUP_INTERVAL', '1'))
DEPLOYMENT_LOG_MAX_BYTES = int(os.getenv('DEPLOYMENT_LOG_MAX_BYTES', '2097152'))
DEPLOYMENT_PROXY_MAX_BYTES = int(os.getenv('DEPLOYMENT_PROXY_MAX_BYTES', '20971520'))
DEPLOYMENT_BASE_DOMAIN = os.getenv('DEPLOYMENT_BASE_DOMAIN', '').strip().lower()
DEPLOYMENT_PUBLIC_SCHEME = os.getenv('DEPLOYMENT_PUBLIC_SCHEME', 'https')
DEPLOYMENT_PUBLIC_ORIGIN = os.getenv('DEPLOYMENT_PUBLIC_ORIGIN', '').rstrip('/')
DEPLOYMENT_FULLSTACK_BASE_DOMAIN = os.getenv('DEPLOYMENT_FULLSTACK_BASE_DOMAIN', 'preview.localhost:8080').strip().lower()
DEPLOYMENT_FULLSTACK_PUBLIC_SCHEME = os.getenv('DEPLOYMENT_FULLSTACK_PUBLIC_SCHEME', 'http')
DEPLOYMENT_DATABASE_TIMEOUT_SECONDS = int(os.getenv('DEPLOYMENT_DATABASE_TIMEOUT_SECONDS', '120'))
DEPLOYMENT_FULLSTACK_PYTHON_IMAGE = os.getenv('DEPLOYMENT_FULLSTACK_PYTHON_IMAGE', 'tukiva-hosting-python:3.12')
DEPLOYMENT_DATABASE_IMAGES = {
    'postgresql': os.getenv('DEPLOYMENT_POSTGRESQL_IMAGE', 'postgres:17-bookworm'),
    'mysql': os.getenv('DEPLOYMENT_MYSQL_IMAGE', 'mysql:8.4'),
}
DEPLOYMENT_REQUIRE_WORKER = True
DEPLOYMENT_INSTANCE_ID = os.getenv('DEPLOYMENT_INSTANCE_ID', 'tukiva')
DEPLOYMENT_IMAGES = {
    'static': os.getenv('DEPLOYMENT_STATIC_IMAGE', 'nginxinc/nginx-unprivileged:1.28-alpine'),
    'node': os.getenv('DEPLOYMENT_NODE_IMAGE', 'node:22-bookworm-slim'),
    'python': os.getenv('DEPLOYMENT_PYTHON_IMAGE', DEPLOYMENT_FULLSTACK_PYTHON_IMAGE),
    'php': os.getenv('DEPLOYMENT_PHP_IMAGE', 'composer:2'),
    'ruby': os.getenv('DEPLOYMENT_RUBY_IMAGE', 'ruby:3.4-bookworm'),
    'cpp': os.getenv('DEPLOYMENT_CPP_IMAGE', 'gcc:14-trixie'),
}
if DEPLOYMENT_BASE_DOMAIN:
    ALLOWED_HOSTS.append('.' + DEPLOYMENT_BASE_DOMAIN.split(':')[0])
if DEPLOYMENT_FULLSTACK_BASE_DOMAIN:
    ALLOWED_HOSTS.append('.' + DEPLOYMENT_FULLSTACK_BASE_DOMAIN.split(':')[0])

# Preview domains never enter the platform's authentication/API routes.
MIDDLEWARE.insert(0, 'hosting.services.proxy_service.PreviewHostMiddleware')
# Large multipart uploads spill to disk instead of consuming 100 MB per request.
FILE_UPLOAD_MAX_MEMORY_SIZE = 2621440
