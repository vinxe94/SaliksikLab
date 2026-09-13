import json
import shlex
from dataclasses import dataclass, field
from pathlib import Path

from django.conf import settings

from .archive_service import CPP_SUFFIXES
from .errors import HostingError


SUPPORTED_RUNTIMES_MESSAGE = 'Supported runtimes are static, Python, Node.js, PHP, Ruby, C++ and full-stack.'
CPP_EXECUTABLE = '/app/.hosting-build/server'


@dataclass
class RuntimePlan:
    runtime: str
    image: str
    install: str
    command: list
    environment: dict
    workdir: str = '/app'
    prepare: list = field(default_factory=list)
    generated_files: dict = field(default_factory=dict)


def detect_runtime(root, selected='', *, allow_fullstack=True):
    root = Path(root)
    supported = settings.DEPLOYMENT_IMAGES
    if allow_fullstack and selected in ('', 'auto', 'fullstack'):
        from .fullstack_service import is_fullstack_project
        if selected == 'fullstack' or is_fullstack_project(root):
            return 'fullstack'
    if selected and selected != 'auto':
        if selected not in supported:
            raise HostingError(SUPPORTED_RUNTIMES_MESSAGE)
        return selected
    matches = []
    for runtime, markers in (
        ('node', ('package.json',)), ('python', ('requirements.txt', 'manage.py', 'app.py')),
        ('php', ('composer.json', 'index.php')),
        ('ruby', ('Gemfile', 'config.ru', 'app.rb', 'server.rb')),
    ):
        if any((root / name).is_file() for name in markers):
            matches.append(runtime)
    if any(p.is_file() and p.suffix in CPP_SUFFIXES for p in root.iterdir()):
        matches.append('cpp')
    if len(matches) == 1:
        return matches[0]
    if not matches and (root / 'index.html').is_file():
        return 'static'
    raise HostingError('Cannot determine the runtime reliably. Select a supported runtime and entrypoint.')


def runtime_plan(session, *, workdir='/app', allow_fullstack=True):
    root = Path(session.project_dir)
    runtime = detect_runtime(root, session.project_type, allow_fullstack=allow_fullstack)
    if runtime == 'fullstack':
        from .fullstack_service import fullstack_plan
        return fullstack_plan(session)
    port = str(session.internal_port)
    venv = workdir + '/.venv'
    cpp_executable = workdir + '/.hosting-build/server'
    env = {'PORT': port, 'HOST': '0.0.0.0', 'HOME': '/tmp', 'PYTHONUNBUFFERED': '1',
           'PYTHONDONTWRITEBYTECODE': '1', 'PUBLIC_URL': '/' if settings.DEPLOYMENT_TUNNEL_ENABLED or settings.DEPLOYMENT_BASE_DOMAIN else f'/temp/{session.deployment_id}/'}
    if getattr(session, 'tunnel_url', ''):
        env['HOSTING_PUBLIC_ORIGIN'] = session.tunnel_url.rstrip('/')
    install = 'true'
    command = []
    entry = session.entrypoint.strip()
    if entry and (Path(entry).is_absolute() or '..' in Path(entry).parts or not (root / entry).is_file()):
        raise HostingError('Entrypoint must be an existing file inside the project.')
    if runtime == 'static':
        if not (root / 'index.html').is_file():
            raise HostingError('Static sites must contain index.html at their project root.')
        command = ['nginx', '-g', 'daemon off;']
    elif runtime == 'node':
        manifest = root / 'package.json'
        if not manifest.exists():
            if entry:
                command = ['node', entry]
            elif not session.start_command:
                raise HostingError('Node.js requires package.json, an entrypoint, or a custom start command.')
        else:
            if manifest.stat().st_size > 1024 * 1024:
                raise HostingError('package.json exceeds the 1 MB manifest limit.')
            try:
                package = json.loads(manifest.read_text())
            except (ValueError, OSError) as exc:
                raise HostingError(f'Node.js requires a valid package.json: {exc}') from exc
            if not isinstance(package, dict) or not isinstance(package.get('scripts', {}), dict):
                raise HostingError('package.json and its scripts must be JSON objects.')
            install = 'npm ci --no-audit --no-fund' if (root / 'package-lock.json').exists() else 'npm install --no-audit --no-fund'
            scripts = package.get('scripts', {})
            if scripts.get('start'):
                command = ['npm', 'start']
            elif scripts.get('dev'):
                # Preserve existing Vite previews with explicit interface and port.
                command = ['npm', 'run', 'dev', '--', '--host', '0.0.0.0', '--port', port]
            elif not session.start_command:
                raise HostingError('Node.js requires an npm start (or dev) script, or a custom start command.')
    elif runtime == 'python':
        env['PATH'] = venv + '/bin:/usr/local/bin:/usr/bin:/bin'
        install = shlex.join(['python', '-m', 'venv', venv])
        if (root / 'requirements.txt').is_file():
            install += ' && ' + shlex.join([venv + '/bin/pip', 'install', '--no-cache-dir', '-r', 'requirements.txt'])
        entry = entry or ('manage.py' if (root / 'manage.py').is_file() else 'app.py')
        if entry == 'manage.py':
            command = [venv + '/bin/python', entry, 'runserver', f'0.0.0.0:{port}', '--noreload']
        elif (root / entry).is_file():
            command = [venv + '/bin/python', entry]
        elif not session.start_command:
            raise HostingError('Python requires app.py, manage.py, an entrypoint, or a custom start command.')
    elif runtime == 'php':
        if (root / 'composer.json').is_file():
            install = 'composer install --no-interaction --prefer-dist --no-progress'
        webroot = 'public' if (root / 'public' / 'index.php').is_file() else '.'
        command = ['php', '-S', f'0.0.0.0:{port}', '-t', webroot]
        if entry:
            command.append(entry)
        elif not (root / webroot / 'index.php').is_file() and not session.start_command:
            raise HostingError('PHP requires index.php or public/index.php.')
    elif runtime == 'ruby':
        bundled = (root / 'Gemfile').is_file()
        prefix = ['bundle', 'exec'] if bundled else []
        if bundled:
            env.update(BUNDLE_PATH=workdir + '/vendor/bundle', BUNDLE_APP_CONFIG=workdir + '/.bundle',
                       BUNDLE_JOBS='1', BUNDLE_RETRY='2')
            install = 'bundle install'
        if entry and Path(entry).suffix != '.ru':
            command = [*prefix, 'ruby', entry]
        elif not entry and (root / 'bin' / 'rails').is_file():
            command = [*prefix, 'ruby', 'bin/rails', 'server', '-b', '0.0.0.0', '-p', port]
        elif entry or (root / 'config.ru').is_file():
            if not bundled and not session.start_command:
                raise HostingError('Rack apps require a Gemfile declaring rackup and a server such as puma or webrick.')
            command = [*prefix, 'rackup', entry or 'config.ru', '--host', '0.0.0.0', '--port', port]
        else:
            entry = next((name for name in ('app.rb', 'server.rb') if (root / name).is_file()), '')
            if entry:
                command = [*prefix, 'ruby', entry]
            elif not session.start_command:
                raise HostingError('Ruby requires app.rb, server.rb, config.ru, bin/rails, or an entrypoint/start command.')
    elif runtime == 'cpp':
        if entry and Path(entry).suffix not in CPP_SUFFIXES:
            raise HostingError('C++ entrypoint must be a .cpp, .cc or .cxx source file.')
        sources = [entry] if entry else sorted(p.name for p in root.iterdir() if p.is_file() and p.suffix in CPP_SUFFIXES)
        if not sources:
            raise HostingError('C++ requires .cpp, .cc or .cxx source files at the project root, or a source entrypoint.')
        # Prefix paths so uploaded filenames cannot become compiler options;
        # quote each argument since the build command runs in a container shell.
        compiler = ['g++', '-std=c++17', '-O2', '-pthread', '-I', workdir,
                    *('./' + source for source in sources), '-o', cpp_executable]
        install = 'mkdir -p ' + shlex.quote(workdir + '/.hosting-build') + ' && ' + shlex.join(compiler)
        command = [cpp_executable]
    if session.start_command.strip():
        try:
            command = shlex.split(session.start_command.replace('{port}', port))
        except ValueError as exc:
            raise HostingError(f'Invalid start command: {exc}') from exc
        if runtime == 'cpp':
            if not command or command[0] not in (cpp_executable, './.hosting-build/server', '.hosting-build/server'):
                raise HostingError('C++ start command must run /app/.hosting-build/server, optionally with arguments.')
            command[0] = cpp_executable
        elif not command or Path(command[0]).name not in {'python', 'python3', 'php', 'node', 'npm', 'npx', 'gunicorn', 'uvicorn',
                                                         'ruby', 'bundle', 'bundler', 'rackup', 'puma', 'rails'}:
            raise HostingError('Start command must use python, php, node, npm, npx, gunicorn, uvicorn, ruby, bundle, rackup, puma or rails.')
        if any('127.0.0.1' in arg or 'localhost' in arg for arg in command):
            raise HostingError('The application must listen on 0.0.0.0. Use {port} for its port.')
        if runtime == 'python' and command[0] in ('python', 'python3'):
            command[0] = venv + '/bin/python'
        if runtime == 'ruby' and (root / 'Gemfile').is_file() and Path(command[0]).name not in ('bundle', 'bundler'):
            command = ['bundle', 'exec', *command]
    return RuntimePlan(runtime, settings.DEPLOYMENT_IMAGES[runtime], install, command, env, workdir=workdir)
