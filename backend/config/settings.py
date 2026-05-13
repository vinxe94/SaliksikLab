import os
import sys
from pathlib import Path
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.getenv('SECRET_KEY', 'django-insecure-fallback-key')
DEBUG = os.getenv('DEBUG', 'True') == 'True'
def csv_env(name, default=''):
    return [item.strip() for item in os.getenv(name, default).split(',') if item.strip()]

TUNNEL_ALLOWED_HOSTS = (
    '.ngrok-free.app,.ngrok.app,.ngrok-free.dev,.ngrok.dev,.ngrok.io,.trycloudflare.com'
)
TUNNEL_ALLOWED_ORIGIN_REGEXES = (
    r'^https://.*\.ngrok-free\.app$,'
    r'^https://.*\.ngrok\.app$,'
    r'^https://.*\.ngrok-free\.dev$,'
    r'^https://.*\.ngrok\.dev$,'
    r'^https://.*\.ngrok\.io$,'
    r'^https://.*\.trycloudflare\.com$'
)
TUNNEL_CSRF_TRUSTED_ORIGINS = (
    'https://*.ngrok-free.app,'
    'https://*.ngrok.app,'
    'https://*.ngrok-free.dev,'
    'https://*.ngrok.dev,'
    'https://*.ngrok.io,'
    'https://*.trycloudflare.com'
)

ALLOWED_HOSTS = csv_env('ALLOWED_HOSTS', f'localhost,127.0.0.1,{TUNNEL_ALLOWED_HOSTS}')

CSRF_TRUSTED_ORIGINS = csv_env('CSRF_TRUSTED_ORIGINS', TUNNEL_CSRF_TRUSTED_ORIGINS)
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
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv('DB_NAME', 'thesis_repo'),
            'USER': os.getenv('DB_USER', 'postgres'),
            'PASSWORD': os.getenv('DB_PASSWORD', 'postgres'),
            'HOST': os.getenv('DB_HOST', 'localhost'),
            'PORT': os.getenv('DB_PORT', '5432'),
        }
    }

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
