"""Managed application services, isolated networking, and retained database volumes."""
import io
import json
import os
import secrets
import shlex
import subprocess
import tarfile
import tempfile
import time
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import quote, urlsplit

from django.conf import settings

from .archive_service import storage_dir
from .errors import HostingError
from .log_service import append_log


def read_state(session):
    path = storage_dir(session) / 'database.json'
    return json.loads(path.read_text()) if path.exists() else None


def write_state(session, state):
    path = storage_dir(session) / 'database.json'
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_suffix('.new')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as handle:
        json.dump(state, handle)
    temporary.replace(path)


def redact(session, text):
    state = read_state(session) or {}
    for key in ('password', 'root_password', 'secret_key'):
        if state.get(key):
            text = text.replace(state[key], '[redacted]')
    return text


class FullStackDocker:
    def __init__(self, docker):
        self.docker = docker

    def copy_file(self, container, destination, content, uid=10001):
        data = io.BytesIO()
        with tarfile.open(fileobj=data, mode='w') as archive:
            info = tarfile.TarInfo(destination.lstrip('/'))
            info.uid = info.gid = uid
            info.mode, info.size = 0o644, len(content)
            archive.addfile(info, io.BytesIO(content))
        self.docker.command('cp', '-', f'{container}:/', data=data.getvalue(), timeout=120)

    def copy_between(self, source, source_path, destination, destination_path):
        # Docker produces and consumes the tar; untrusted build output is never unpacked on the host.
        with tempfile.TemporaryFile() as archive:
            try:
                result = subprocess.run(['docker', 'cp', f'{source}:{source_path}/.', '-'],
                                        stdout=archive, stderr=subprocess.PIPE, timeout=120)
                if result.returncode:
                    raise HostingError('Frontend output is missing. Check frontend.output in hosting.json.')
                archive.seek(0)
                result = subprocess.run(['docker', 'cp', '-', f'{destination}:{destination_path}'],
                                        stdin=archive, capture_output=True, timeout=120)
                if result.returncode:
                    raise HostingError('Unable to copy the built frontend into its container.')
            except (OSError, subprocess.TimeoutExpired) as exc:
                raise HostingError('Transferring frontend assets failed or timed out.') from exc

    def copy_seed(self, container, source):
        # A large SQL dump must not be buffered in the worker's memory.
        with tempfile.TemporaryFile() as archive:
            with tarfile.open(fileobj=archive, mode='w') as tar:
                info = tar.gettarinfo(str(source), 'docker-entrypoint-initdb.d/010-hosting-seed.sql')
                info.uid = info.gid = 999
                info.mode = 0o644
                with source.open('rb') as content:
                    tar.addfile(info, content)
            archive.seek(0)
            try:
                result = subprocess.run(['docker', 'cp', '-', f'{container}:/'], stdin=archive,
                                        capture_output=True, timeout=120)
            except (OSError, subprocess.TimeoutExpired) as exc:
                raise HostingError('Copying the database seed failed or timed out.') from exc
            if result.returncode:
                raise HostingError('Unable to copy the database seed into its container.')

    def build(self, session, plan, cancelled):
        d = self.docker
        name, builder, image = d.names(session)
        if plan.frontend is not None:
            self.build_frontend(session, plan, cancelled)
            append_log(session, 'Frontend build completed. Installing backend dependencies.')
        else:
            append_log(session, 'Installing backend dependencies.')
        d.ensure_image(plan.backend.image, cancelled)
        seed = Path(session.project_dir) / plan.database.seed if plan.database.engine == 'sqlite' and plan.database.seed else None
        d.build_runtime(session, plan.backend, cancelled, builder=builder, image=image,
                        create_data=True, data_seed=seed)
        return image

    def build_frontend(self, session, plan, cancelled):
        d = self.docker
        name, _, image = d.names(session)
        frontend_builder = name + '_frontend_build'
        frontend_image_builder = name + '_frontend_image'
        append_log(session, 'Building frontend assets.')
        d.ensure_image(plan.frontend.image, cancelled)
        output = '/app/' + plan.frontend.path + '/' + plan.frontend.output
        frontend = SimpleNamespace(runtime='frontend', image=plan.frontend.image,
                                   install=plan.frontend.install + ' && test -f ' + shlex.quote(output + '/index.html'),
                                   environment=plan.frontend.environment, workdir='/app/' + plan.frontend.path,
                                   generated_files={})
        d.build_runtime(session, frontend, cancelled, builder=frontend_builder,
                        log_file='frontend-build.log', commit=False)
        d.ensure_image(settings.DEPLOYMENT_IMAGES['static'], cancelled)
        config = (f'server {{ listen {session.internal_port}; server_name _; '
                  'root /usr/share/nginx/html; index index.html; disable_symlinks on; '
                  'location / { try_files $uri $uri/ /index.html; } '
                  'location ~ /\\. { deny all; } '
                  'location ~* \\.(js|mjs|css|json|map|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|txt|xml|webmanifest)$ { try_files $uri =404; } '
                  '}\n').encode()
        d.command('create', '--name', frontend_image_builder, *d.labels(session), *d.limits(),
                  '--network', 'none', settings.DEPLOYMENT_IMAGES['static'])
        self.copy_between(frontend_builder, output, frontend_image_builder, '/usr/share/nginx/html')
        self.copy_file(frontend_image_builder, '/etc/nginx/conf.d/default.conf', config)
        cancelled()
        d.command('commit', frontend_image_builder, image + '-frontend', timeout=120, cancelled=cancelled)
        d.remove_container(frontend_image_builder, session)
        d.remove_container(frontend_builder, session)

    def state(self, session, plan):
        state = read_state(session)
        if state and state['engine'] != plan.database.engine:
            raise HostingError('The saved database engine changed. Upload the project as a new deployment.')
        if state is None:
            state = {'engine': plan.database.engine, 'persist': plan.database.persist,
                     'password': secrets.token_urlsafe(32), 'root_password': secrets.token_urlsafe(32),
                     'secret_key': secrets.token_urlsafe(48), 'initialized': False}
        state['persist'] = plan.database.persist
        state['frontend'] = plan.frontend is not None
        write_state(session, state)
        return state

    def volume(self, session, suffix):
        d = self.docker
        name = d.names(session)[0] + suffix
        if d.command('volume', 'ls', '-q', '--filter', f'name=^{name}$').split():
            info = json.loads(d.command('volume', 'inspect', name))[0]
            d.verify_owned({'Config': {'Labels': info.get('Labels')}}, session)
        else:
            d.command('volume', 'create', *d.labels(session), name)
        return name

    def database_environment(self, session, state):
        name = self.docker.names(session)[0]
        engine = state['engine']
        domain = settings.DEPLOYMENT_BASE_DOMAIN or settings.DEPLOYMENT_FULLSTACK_BASE_DOMAIN
        scheme = settings.DEPLOYMENT_PUBLIC_SCHEME if settings.DEPLOYMENT_BASE_DOMAIN else settings.DEPLOYMENT_FULLSTACK_PUBLIC_SCHEME
        tunnel_url = getattr(session, 'tunnel_url', '')
        origin = tunnel_url.rstrip('/') or f'{scheme}://{session.deployment_id}.{domain}'
        values = {'HOSTING_DB_ENGINE': engine, 'SECRET_KEY': state['secret_key'],
                  'HOSTING_PUBLIC_ORIGIN': origin, 'HOSTING_DB_PATH': '/data/db.sqlite3',
                  'ALLOWED_HOSTS': f'{session.deployment_id}.{domain.split(":")[0]},localhost,127.0.0.1',
                  'PUBLIC_URL': '/', 'DB_NAME': 'app', 'DB_USER': 'app',
                  'DB_PASSWORD': state['password'], 'DB_HOST': name + '_db',
                  'DB_PORT': '5432' if engine == 'postgresql' else '3306'}
        if tunnel_url:
            values['ALLOWED_HOSTS'] += ',' + urlsplit(tunnel_url).hostname
        if engine == 'sqlite':
            values.update(DB_NAME='/data/db.sqlite3', DATABASE_URL='sqlite:////data/db.sqlite3')
        elif engine in ('postgresql', 'mysql'):
            values['DATABASE_URL'] = f'{engine}://app:{quote(state["password"], safe="")}@{values["DB_HOST"]}:{values["DB_PORT"]}/app'
        else:
            for key in ('DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST', 'DB_PORT'):
                values.pop(key)
        return values

    def start_database(self, session, plan, state, cancelled):
        d = self.docker
        name = d.names(session)[0]
        engine = state['engine']
        if engine not in ('postgresql', 'mysql'):
            return
        d.ensure_image(settings.DEPLOYMENT_DATABASE_IMAGES[engine], cancelled)
        volume = self.volume(session, '_data')
        env = {'POSTGRES_DB': 'app', 'POSTGRES_USER': 'app', 'POSTGRES_PASSWORD': state['password']} if engine == 'postgresql' else {
            'MYSQL_DATABASE': 'app', 'MYSQL_USER': 'app', 'MYSQL_PASSWORD': state['password'],
            'MYSQL_ROOT_PASSWORD': state['root_password']}
        mount = '/var/lib/postgresql/data' if engine == 'postgresql' else '/var/lib/mysql'
        limits = d.limits()
        limits[limits.index('--user') + 1] = 'postgres' if engine == 'postgresql' else 'mysql'
        extra = [] if engine == 'postgresql' else ['--innodb-buffer-pool-size=64M', '--performance-schema=OFF', '--max-connections=25']
        d.command('create', '--name', name + '_db', *d.labels(session), *limits,
                  *d.environment(SimpleNamespace(environment=env)), '--network', name,
                  '--mount', f'type=volume,source={volume},target={mount}', settings.DEPLOYMENT_DATABASE_IMAGES[engine], *extra)
        if plan.database.seed and not state['initialized']:
            source = Path(session.project_dir) / plan.database.seed
            self.copy_seed(name + '_db', source)
            append_log(session, 'Initializing database from the declared SQL seed.')
        d.command('start', name + '_db')
        deadline = time.monotonic() + settings.DEPLOYMENT_DATABASE_TIMEOUT_SECONDS
        probe = ['pg_isready', '-q', '-h', '127.0.0.1', '-U', 'app', '-d', 'app'] if engine == 'postgresql' else [
            'sh', '-c', 'MYSQL_PWD="$MYSQL_PASSWORD" mysql --protocol=TCP -h127.0.0.1 -uapp app -Nse "SELECT 1"']
        while time.monotonic() < deadline:
            cancelled()
            info = d.capture_logs(session, name + '_db', 'database.log')
            if not info or not info['State']['Running']:
                raise HostingError('Database exited during initialization. See database logs.')
            try:
                d.command('exec', name + '_db', *probe, timeout=5)
                append_log(session, 'Database is ready.')
                return
            except HostingError:
                time.sleep(0.5)
        raise HostingError('Database initialization timed out. See database logs.')

    def start(self, session, plan, image, cancelled):
        d = self.docker
        name = d.names(session)[0]
        state = self.state(session, plan)
        d.command('network', 'create', '--internal', *d.labels(session),
                  '--opt', 'com.docker.network.bridge.gateway_mode_ipv4=isolated', name)
        self.start_database(session, plan, state, cancelled)
        environment = dict(plan.backend.environment)
        environment.update(self.database_environment(session, state))
        app_volume = self.volume(session, '_data' if state['engine'] == 'sqlite' else '_files')
        command = plan.backend.command
        if plan.backend.prepare:
            command = ['/bin/sh', '-c', ' && '.join(shlex.join(cmd) for cmd in plan.backend.prepare)
                       + ' && exec ' + shlex.join(command)]
        container_id = d.command('create', '--name', name, *d.labels(session), *d.limits(),
                                 *d.environment(SimpleNamespace(environment=environment)), '--network', name,
                                 '--mount', f'type=volume,source={app_volume},target=/data',
                                 '--tmpfs', '/tmp:rw,nosuid,nodev,size=64m,mode=1777',
                                 '--workdir', plan.backend.workdir, '--entrypoint', command[0], image, *command[1:])
        session.container_name, session.container_id = name, container_id
        session.save(update_fields=['container_name', 'container_id'])
        d.command('start', name)
        if plan.frontend is not None:
            d.command('create', '--name', name + '_frontend', *d.labels(session), *d.limits(),
                      '--network', name, '--tmpfs', '/tmp:rw,nosuid,nodev,size=64m,mode=1777', image + '-frontend')
            d.command('start', name + '_frontend')
        append_log(session, 'Services started. Waiting for migrations and HTTP readiness.')
        d.start_proxy(session, self.proxy_routes(session, plan), cancelled)
        return d.inspect(name)

    def proxy_routes(self, session, plan):
        name = self.docker.names(session)[0]
        routes = []
        for prefix in plan.api_prefixes if plan.frontend is not None else []:
            exact = prefix.rstrip('/')
            for location in (f'= {exact}', f'^~ {exact}/'):
                routes.append(f'location {location} {{ proxy_pass http://{name}:{session.internal_port}; {self.proxy_headers()} }}')
        routes.append(f'location = /__hosting_backend_health__/ {{ proxy_pass http://{name}:{session.internal_port}{plan.backend_health_path}; {self.proxy_headers()} }}')
        public_service = name + '_frontend' if plan.frontend is not None else name
        routes.append(f'location / {{ proxy_pass http://{public_service}:{session.internal_port}; {self.proxy_headers()} }}')
        return ' '.join(routes)

    @staticmethod
    def proxy_headers():
        return ('proxy_set_header Host $http_host; proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto; '
                'proxy_buffering off; proxy_connect_timeout 2s; proxy_read_timeout 5s; '
                'proxy_ignore_headers X-Accel-Redirect;')

    def services_healthy(self, session):
        d = self.docker
        name = d.names(session)[0]
        state = read_state(session) or {}
        # State written before this option existed always described a separate frontend.
        containers = [name + '_frontend'] if state.get('frontend', True) else []
        if state.get('engine') in ('postgresql', 'mysql'):
            containers.append(name + '_db')
        for container in containers:
            info = d.inspect(container)
            d.verify_owned(info, session)
            if not info or not info['State']['Running']:
                return False, f'Full application service {container.rsplit("_", 1)[-1]} stopped.'
        return True, ''

    def mark_ready(self, session):
        state = read_state(session)
        state['initialized'] = True
        write_state(session, state)

    def cleanup(self, session):
        d = self.docker
        name, _, image = d.names(session)
        for suffix, logfile in (('_frontend', 'frontend.log'), ('_db', 'database.log'),
                                ('_frontend_build', 'frontend-build.log'), ('_frontend_image', 'frontend-image.log')):
            d.capture_logs(session, name + suffix, logfile)
            d.remove_container(name + suffix, session)
        if d.command('image', 'ls', '-q', image + '-frontend'):
            d.verify_owned(json.loads(d.command('image', 'inspect', image + '-frontend'))[0], session)
            d.command('image', 'rm', image + '-frontend')

    def cleanup_data(self, session):
        state = read_state(session)
        if state and (not state['persist'] or not state['initialized']):
            self.purge_data(session)

    def purge_data(self, session):
        d = self.docker
        name = d.names(session)[0]
        for suffix in ('_data', '_files'):
            volume = name + suffix
            if d.command('volume', 'ls', '-q', '--filter', f'name=^{volume}$').split():
                info = json.loads(d.command('volume', 'inspect', volume))[0]
                d.verify_owned({'Config': {'Labels': info.get('Labels')}}, session)
                d.command('volume', 'rm', volume)
        (storage_dir(session) / 'database.json').unlink(missing_ok=True)
