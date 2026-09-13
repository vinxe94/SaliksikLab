"""Validate full-stack projects and describe builds without importing uploaded code."""
import ast
import json
import re
import shlex
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from types import SimpleNamespace

from django.conf import settings

from .archive_service import IGNORED
from .errors import HostingError


MANIFEST_LIMIT = 64 * 1024
CONVENTIONAL_PAIRS = (('frontend', 'backend'), ('client', 'server'))
DEFAULT_API_PREFIXES = ['/api']


@dataclass
class FrontendPlan:
    path: str
    output: str
    image: str
    install: str
    environment: dict


@dataclass
class DatabasePlan:
    engine: str
    seed: str = ''
    persist: bool = True


@dataclass
class FullStackPlan:
    backend: object
    backend_path: str
    frontend: FrontendPlan | None
    database: DatabasePlan
    backend_health_path: str
    api_prefixes: list
    runtime: str = field(default='fullstack', init=False)


def is_fullstack_project(root):
    root = Path(root)
    return (root / 'hosting.json').is_file() or any(
        (root / frontend).is_dir() and (root / backend).is_dir()
        for frontend, backend in CONVENTIONAL_PAIRS)


def _object(value, allowed, label):
    if not isinstance(value, dict):
        raise HostingError(f'{label} must be a JSON object.')
    unknown = set(value) - set(allowed)
    if unknown:
        raise HostingError(f'{label} contains unsupported fields: {", ".join(sorted(unknown))}.')
    return value


def _string(value, label, *, maximum=1024, empty=False):
    if not isinstance(value, str) or (not value and not empty) or len(value) > maximum or any(ord(c) < 32 for c in value):
        raise HostingError(f'{label} must be a valid string of at most {maximum} characters.')
    return value


def _path(root, value, label, *, kind=None, allow_dot=False):
    value = _string(value, label, maximum=512)
    path = PurePosixPath(value)
    if (path.is_absolute() or '..' in path.parts or '\\' in value or ':' in value
            or (not path.parts and not allow_dot)
            or any(part in IGNORED or part == '.env' or part.startswith('.env.') for part in path.parts)):
        raise HostingError(f'{label} must be a relative path inside the ZIP, without ignored directories.')
    target = (Path(root) / value).resolve()
    if not target.is_relative_to(Path(root).resolve()):
        raise HostingError(f'{label} must stay inside the ZIP.')
    if kind == 'dir' and not target.is_dir():
        raise HostingError(f'{label} directory does not exist: {value}.')
    if kind == 'file' and not target.is_file():
        raise HostingError(f'{label} file does not exist: {value}.')
    return path.as_posix()


def _url_path(value, label):
    value = _string(value, label, maximum=256)
    if not re.fullmatch(r'/[A-Za-z0-9_./-]*', value) or '//' in value or '..' in value:
        raise HostingError(f'{label} must be an absolute URL path containing letters, numbers, /, ., _ or -.')
    return value


def _read_manifest(root):
    manifest = root / 'hosting.json'
    if not manifest.is_file():
        return {}
    if manifest.stat().st_size > MANIFEST_LIMIT:
        raise HostingError('hosting.json exceeds the 64 KB manifest limit.')
    try:
        def unique_pairs(pairs):
            result = {}
            for key, value in pairs:
                if key in result:
                    raise ValueError(f'duplicate field {key}')
                result[key] = value
            return result
        value = json.loads(manifest.read_text(encoding='utf-8'), object_pairs_hook=unique_pairs)
    except (ValueError, UnicodeError, OSError) as exc:
        raise HostingError(f'hosting.json must contain valid JSON: {exc}') from exc
    _object(value, {'version', 'frontend', 'backend', 'database', 'api_prefixes'}, 'hosting.json')
    if type(value.get('version')) is not int or value['version'] != 1:
        raise HostingError('hosting.json version must be 1.')
    return value


def _frontend_plan(root, config, path):
    path = _path(root, config.get('path', path), 'frontend.path', kind='dir')
    directory = root / path
    package_file = directory / 'package.json'
    environment = {'HOME': '/tmp', 'HOST': '0.0.0.0', 'PUBLIC_URL': '/',
                   'VITE_API_BASE_URL': '/api', 'VITE_API_URL': '/api'}
    values = config.get('environment', {})
    if not isinstance(values, dict) or len(values) > 50:
        raise HostingError('frontend.environment must be an object with at most 50 variables.')
    for key, value in values.items():
        if not re.fullmatch(r'[A-Z][A-Z0-9_]{0,63}', key) or key in {'PATH', 'HOME', 'NODE_OPTIONS', 'NODE_PATH', 'NPM_CONFIG_USERCONFIG'}:
            raise HostingError(f'Unsupported frontend environment variable: {key}.')
        environment[key] = _string(value, f'frontend.environment.{key}', maximum=4096, empty=True)
    if package_file.is_file():
        if package_file.stat().st_size > 1024 * 1024:
            raise HostingError('Frontend package.json exceeds the 1 MB manifest limit.')
        try:
            package = json.loads(package_file.read_text(encoding='utf-8'))
        except (ValueError, UnicodeError, OSError) as exc:
            raise HostingError(f'Frontend package.json must contain valid JSON: {exc}') from exc
        scripts = package.get('scripts', {}) if isinstance(package, dict) else None
        if not isinstance(scripts, dict):
            raise HostingError('Frontend package.json and scripts must be JSON objects.')
        script = _string(config.get('build_script', 'build'), 'frontend.build_script', maximum=80)
        if not re.fullmatch(r'[A-Za-z0-9_:.-]+', script) or script.startswith('-') or not isinstance(scripts.get(script), str) or not scripts[script].strip():
            raise HostingError(f'Frontend package.json must declare the {script!r} build script.')
        output = _path(directory, config.get('output', 'dist'), 'frontend.output')
        install = ('npm ci --no-audit --no-fund' if (directory / 'package-lock.json').is_file()
                   else 'npm install --no-audit --no-fund')
        install += ' && ' + shlex.join(['npm', 'run', script])
    else:
        if 'build_script' in config:
            raise HostingError('frontend.build_script requires a package.json.')
        output = _path(directory, config.get('output', '.'), 'frontend.output', kind='dir', allow_dot=True)
        if not (directory / output / 'index.html').is_file():
            raise HostingError('Static frontend output must contain index.html.')
        install = 'true'
    return FrontendPlan(path, output, settings.DEPLOYMENT_IMAGES['node'], install, environment)


def _settings_module(root, explicit=''):
    if explicit:
        module = _string(explicit, 'backend.settings_module', maximum=256)
        if not re.fullmatch(r'[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*', module):
            raise HostingError('backend.settings_module must be a dotted Python module name.')
        path = root.joinpath(*module.split('.'))
        if not path.with_suffix('.py').is_file() and not (path / '__init__.py').is_file():
            raise HostingError('backend.settings_module must exist inside the backend directory.')
        return module
    manage = root / 'manage.py'
    if manage.is_file() and manage.stat().st_size <= MANIFEST_LIMIT:
        try:
            tree = ast.parse(manage.read_text(encoding='utf-8'))
            for node in ast.walk(tree):
                if (isinstance(node, ast.Call) and len(node.args) >= 2
                        and isinstance(node.func, ast.Attribute) and node.func.attr == 'setdefault'
                        and isinstance(node.args[0], ast.Constant) and node.args[0].value == 'DJANGO_SETTINGS_MODULE'
                        and isinstance(node.args[1], ast.Constant) and isinstance(node.args[1].value, str)):
                    return _settings_module(root, node.args[1].value)
        except (SyntaxError, UnicodeError, ValueError):
            pass
    matches = [path.relative_to(root).with_suffix('').as_posix().replace('/', '.')
               for path in root.glob('*/settings.py')]
    if len(matches) == 1:
        return _settings_module(root, matches[0])
    raise HostingError('Cannot determine Django settings. Set backend.settings_module in hosting.json.')


def _django_files(module):
    settings_code = f'''# Generated by hosting; imported only inside the isolated application container.
import importlib
import os
_original = importlib.import_module({module!r})
for _key in dir(_original):
    if _key.isupper():
        globals()[_key] = getattr(_original, _key)
HOSTING_ORIGINAL_ROOT_URLCONF = ROOT_URLCONF
ROOT_URLCONF = 'hosting_urls'
SECRET_KEY = os.environ['SECRET_KEY']
ALLOWED_HOSTS = ['*']
DEBUG = False
SECURE_SSL_REDIRECT = False
SECURE_HSTS_SECONDS = 0
USE_X_FORWARDED_HOST = True
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
_origin = os.environ.get('HOSTING_PUBLIC_ORIGIN', '').rstrip('/')
CSRF_TRUSTED_ORIGINS = [_origin] if _origin else []
SESSION_COOKIE_SECURE = _origin.startswith('https://')
CSRF_COOKIE_SECURE = SESSION_COOKIE_SECURE
MEDIA_ROOT = '/data/media'
MEDIA_URL = '/media/'
_engine = os.environ.get('HOSTING_DB_ENGINE', 'sqlite')
if _engine == 'sqlite':
    DATABASES = {{'default': {{'ENGINE': 'django.db.backends.sqlite3', 'NAME': os.environ.get('HOSTING_DB_PATH', '/data/db.sqlite3')}}}}
elif _engine in ('postgresql', 'mysql'):
    DATABASES = {{'default': {{'ENGINE': 'django.db.backends.' + _engine,
        'NAME': os.environ['DB_NAME'], 'USER': os.environ['DB_USER'],
        'PASSWORD': os.environ['DB_PASSWORD'], 'HOST': os.environ['DB_HOST'],
        'PORT': os.environ['DB_PORT'], 'CONN_MAX_AGE': 0}}}}
else:
    DATABASES = {{'default': {{'ENGINE': 'django.db.backends.dummy'}}}}
'''
    urls_code = '''from django.conf import settings
from django.db import connection
from django.http import JsonResponse
from django.urls import include, path
from django.views.static import serve

def health(request):
    if settings.DATABASES['default']['ENGINE'] != 'django.db.backends.dummy':
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            cursor.fetchone()
    return JsonResponse({'status': 'ok'})

urlpatterns = [path('__hosting_health__/', health),
               path('media/<path:path>', serve, {'document_root': settings.MEDIA_ROOT}),
               path('', include(settings.HOSTING_ORIGINAL_ROOT_URLCONF))]
'''
    runner_code = '''import os
import sys
os.environ['DJANGO_SETTINGS_MODULE'] = 'hosting_settings'
from django.core.management import execute_from_command_line
from django.conf import settings
args = sys.argv[1:]
if args and args[0] == 'runserver' and 'django.contrib.staticfiles' in settings.INSTALLED_APPS:
    args.append('--insecure')
execute_from_command_line([sys.argv[0], *args])
'''
    return {'hosting_settings.py': settings_code, 'hosting_urls.py': urls_code, 'hosting_manage.py': runner_code}


def _django_engine(root, module):
    """Recognize literal Django engines without importing the uploaded settings."""
    path = root.joinpath(*module.split('.'))
    path = path.with_suffix('.py') if path.with_suffix('.py').is_file() else path / '__init__.py'
    if path.stat().st_size > MANIFEST_LIMIT:
        raise HostingError('Django settings exceed the inspection limit; set database.engine explicitly.')
    try:
        tree = ast.parse(path.read_text(encoding='utf-8'))
    except (SyntaxError, UnicodeError):
        raise HostingError('Cannot inspect Django database settings; set database.engine explicitly.')
    engines = {node.value.rsplit('.', 1)[-1] for node in ast.walk(tree)
               if isinstance(node, ast.Constant) and isinstance(node.value, str)
               and node.value in {'django.db.backends.sqlite3', 'django.db.backends.postgresql',
                                  'django.db.backends.postgresql_psycopg2', 'django.db.backends.mysql'}}
    engines = {'sqlite' if value == 'sqlite3' else 'postgresql' if value == 'postgresql_psycopg2' else value for value in engines}
    if len(engines) > 1:
        raise HostingError('Multiple Django database engines found; choose database.engine in hosting.json.')
    return next(iter(engines), 'sqlite')


def _prepare_commands(value, backend):
    if not isinstance(value, list) or len(value) > 10:
        raise HostingError('backend.migrate must be a boolean or a list of at most 10 argument arrays.')
    result = []
    allowed = {'python', 'python3', 'php', 'node', 'npm', 'npx', 'ruby', 'bundle', 'bundler', 'rails'}
    for command in value:
        if not isinstance(command, list) or not command or len(command) > 50:
            raise HostingError('Each backend.migrate command must be a nonempty array of arguments.')
        args = [_string(arg, 'backend.migrate argument', maximum=1024) for arg in command]
        if args[0] not in allowed:
            raise HostingError('backend.migrate commands must use python, php, node, npm, npx, ruby, bundle or rails.')
        if backend.runtime == 'python' and args[0] in ('python', 'python3'):
            args[0] = backend.workdir + '/.venv/bin/python'
        result.append(args)
    return result


def fullstack_plan(session):
    from .runtime_service import runtime_plan

    root = Path(session.project_dir)
    if session.entrypoint.strip() or session.start_command.strip():
        raise HostingError('For full-stack deployments, put entrypoint and start_command in hosting.json backend.')
    manifest = _read_manifest(root)
    frontend_path, backend_path = next(((front, back) for front, back in CONVENTIONAL_PAIRS
                                       if (root / front).is_dir() and (root / back).is_dir()), ('frontend', 'backend'))
    frontend_config = manifest.get('frontend', {})
    if frontend_config is not False:
        frontend_config = _object(frontend_config, {'path', 'output', 'build_script', 'environment'}, 'frontend')
    backend_config = _object(manifest.get('backend', {}), {'path', 'runtime', 'entrypoint', 'start_command',
                                                          'migrate', 'settings_module', 'health_path'}, 'backend')
    database_config = _object(manifest.get('database', {}), {'engine', 'seed', 'persist'}, 'database')
    frontend = None if frontend_config is False else _frontend_plan(root, frontend_config, frontend_path)
    backend_path = _path(root, backend_config.get('path', '.' if frontend is None else backend_path),
                         'backend.path', kind='dir', allow_dot=frontend is None)
    if frontend is not None:
        front_parts, back_parts = PurePosixPath(frontend.path), PurePosixPath(backend_path)
        if front_parts.is_relative_to(back_parts) or back_parts.is_relative_to(front_parts):
            raise HostingError('Frontend and backend directories must be separate and must not contain each other.')
    runtime = _string(backend_config.get('runtime', 'auto'), 'backend.runtime', maximum=16)
    if runtime not in ('auto', 'python', 'node', 'php', 'ruby', 'cpp'):
        raise HostingError('backend.runtime must be auto, python, node, php, ruby or cpp.')
    backend_session = SimpleNamespace(project_dir=str(root / backend_path), project_type=runtime,
                                     internal_port=session.internal_port, deployment_id=session.deployment_id,
                                     entrypoint=_string(backend_config.get('entrypoint', ''), 'backend.entrypoint', empty=True),
                                     start_command=_string(backend_config.get('start_command', ''), 'backend.start_command', maximum=4096, empty=True))
    backend = runtime_plan(backend_session, workdir=str(PurePosixPath('/app') / backend_path), allow_fullstack=False)
    backend.environment['PUBLIC_URL'] = '/'
    django = backend.runtime == 'python' and ((root / backend_path / 'manage.py').is_file() or 'settings_module' in backend_config)
    module = _settings_module(root / backend_path, backend_config.get('settings_module', '')) if django else None
    engine = database_config.get('engine')
    if 'engine' not in database_config:
        engine = _django_engine(root / backend_path, module) if django else 'none'
    if not isinstance(engine, str) or engine not in {'none', 'sqlite', 'postgresql', 'mysql'}:
        raise HostingError('database.engine must be none, sqlite, postgresql or mysql.')
    persist = database_config.get('persist', True)
    if type(persist) is not bool:
        raise HostingError('database.persist must be true or false.')
    seed = database_config.get('seed', '')
    if 'seed' not in database_config and engine == 'sqlite' and (root / backend_path / 'db.sqlite3').is_file():
        seed = backend_path + '/db.sqlite3'
    _string(seed, 'database.seed', empty=True)
    if seed:
        seed = _path(root, seed, 'database.seed', kind='file')
        valid_suffixes = {'.sqlite', '.sqlite3', '.db'} if engine == 'sqlite' else {'.sql'}
        if engine == 'none' or Path(seed).suffix.lower() not in valid_suffixes:
            raise HostingError('database.seed must be a SQLite database for sqlite, or a .sql file for postgresql/mysql.')
        if engine == 'sqlite':
            with (root / seed).open('rb') as stream:
                if stream.read(16) != b'SQLite format 3\x00':
                    raise HostingError('database.seed is not a valid SQLite database.')
    backend.environment['HOSTING_DB_ENGINE'] = engine
    if engine == 'sqlite':
        backend.environment['HOSTING_DB_PATH'] = '/data/db.sqlite3'
        backend.environment['DATABASE_URL'] = 'sqlite:////data/db.sqlite3'
    migrate = backend_config.get('migrate', django and engine != 'none')
    if type(migrate) is not bool:
        backend.prepare = _prepare_commands(migrate, backend)
    elif migrate and not django:
        raise HostingError('Automatic migrations require Django. Use backend.migrate argument arrays for other frameworks.')
    if django:
        build_dir = backend.workdir + '/.hosting-build'
        backend.generated_files = {build_dir + '/' + name: content for name, content in _django_files(module).items()}
        backend.environment.update(DJANGO_SETTINGS_MODULE='hosting_settings', PYTHONPATH=build_dir + ':' + backend.workdir)
        runner = build_dir + '/hosting_manage.py'
        python = backend.workdir + '/.venv/bin/python'
        if migrate is True:
            backend.prepare = [[python, runner, 'migrate', '--noinput']]
        if not backend_session.start_command:
            backend.command = [python, runner, 'runserver', f'0.0.0.0:{session.internal_port}', '--noreload']
        for command in [backend.command, *backend.prepare]:
            if any(arg == '--settings' or arg.startswith('--settings=') or 'DJANGO_SETTINGS_MODULE=' in arg for arg in command):
                raise HostingError('Django commands must use the managed hosting settings; remove custom --settings overrides.')
            if len(command) > 1 and Path(command[0]).name in ('python', 'python3') and command[1] in ('manage.py', './manage.py'):
                command[1] = runner
        if engine in ('postgresql', 'mysql'):
            driver = 'psycopg[binary]' if engine == 'postgresql' else 'mysqlclient'
            backend.install += ' && ' + shlex.join([backend.workdir + '/.venv/bin/pip', 'install', '--no-cache-dir', driver])
            if engine == 'mysql':
                backend.image = settings.DEPLOYMENT_FULLSTACK_PYTHON_IMAGE
    elif 'settings_module' in backend_config:
        raise HostingError('backend.settings_module is only supported for Django/Python.')
    health_path = _url_path(backend_config.get('health_path', '/__hosting_health__/' if django else '/'), 'backend.health_path')
    prefixes = manifest.get('api_prefixes', DEFAULT_API_PREFIXES.copy())
    if not isinstance(prefixes, list) or not prefixes or len(prefixes) > 20:
        raise HostingError('api_prefixes must be an array of 1 to 20 URL prefixes.')
    prefixes = [_url_path(prefix, 'api_prefixes item').rstrip('/') for prefix in prefixes]
    if '' in prefixes or '/__hosting_backend_health__' in prefixes or len(prefixes) != len(set(prefixes)):
        raise HostingError('api_prefixes must contain unique paths and cannot contain the root path /.')
    return FullStackPlan(backend, backend_path, frontend, DatabasePlan(engine, seed, persist), health_path, prefixes)
