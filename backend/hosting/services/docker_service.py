"""A small Docker CLI adapter; no uploaded Dockerfile or host shell is executed."""
import io
import json
import subprocess
import tarfile
import tempfile
import time
from pathlib import Path

from django.conf import settings

from .archive_service import storage_dir
from .errors import HostingError
from .log_service import append_log


LABEL = 'org.saliksiklab.temporary'
OWNER_LABEL = 'org.saliksiklab.hosting-instance'


class DockerService:
    def command(self, *args, timeout=30, data=None, cancelled=None):
        if cancelled is not None:
            return self.interruptible_command(args, timeout, cancelled, data=data)
        try:
            result = subprocess.run(['docker', *args], input=data, capture_output=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            # TimeoutExpired includes argv, which may contain generated database credentials.
            raise HostingError(f'Docker {args[0]} exceeded its timeout.') from None
        except OSError as exc:
            raise HostingError(f'Docker is unavailable: {exc}') from exc
        if result.returncode:
            error = result.stderr.decode(errors='replace')[-3000:]
            raise HostingError(f'Docker {args[0]} failed: {error}')
        return result.stdout.decode(errors='replace').strip()

    def interruptible_command(self, args, timeout, cancelled, data=None):
        """Cancel slow image pulls/commits without leaving a host CLI process."""
        with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as input_file:
            if data is not None:
                input_file.write(data)
                input_file.seek(0)
            try:
                process = subprocess.Popen(['docker', *args], stdin=input_file if data is not None else subprocess.DEVNULL,
                                           stdout=output, stderr=subprocess.STDOUT)
            except OSError as exc:
                raise HostingError(f'Docker is unavailable: {exc}') from exc
            try:
                deadline = time.monotonic() + timeout
                while process.poll() is None:
                    cancelled()
                    if time.monotonic() >= deadline:
                        raise HostingError(f'Docker {args[0]} exceeded its {timeout}-second timeout.')
                    time.sleep(0.1)
                cancelled()
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait(timeout=10)
            size = output.tell()
            output.seek(max(0, size - 6000))
            message = output.read().decode(errors='replace').strip()
            if process.returncode:
                raise HostingError(f'Docker {args[0]} failed: {message}')
            return message

    def inspect(self, name):
        # Listing first distinguishes a missing object from an unreachable daemon.
        ids = self.command('ps', '-aq', '--filter', f'name=^/{name}$').split()
        if not ids:
            return None
        return json.loads(self.command('inspect', ids[0]))[0]

    def verify_owned(self, info, session):
        if info:
            labels = (info.get('Config') or {}).get('Labels') or {}
            if labels.get(LABEL) != str(session.deployment_id) or (
                    labels.get(OWNER_LABEL) and labels[OWNER_LABEL] != settings.DEPLOYMENT_INSTANCE_ID):
                raise HostingError('Container name belongs to another application; refusing to modify it.')

    def remove_container(self, name, session):
        info = self.inspect(name)
        self.verify_owned(info, session)
        if info:
            self.command('rm', '-f', name)

    def names(self, session):
        name = f'temporary_{session.deployment_id.hex}'
        return name, name + '_build', 'temporary-site:' + session.deployment_id.hex

    def labels(self, session):
        return ['--label', f'{LABEL}={session.deployment_id}', '--label', f'{OWNER_LABEL}={settings.DEPLOYMENT_INSTANCE_ID}']

    def port_info(self, session):
        return self.inspect(self.names(session)[0] + '_proxy')

    def limits(self):
        return ['--memory', settings.DEPLOYMENT_MEMORY_LIMIT,
                '--memory-swap', settings.DEPLOYMENT_MEMORY_LIMIT,
                '--cpus', settings.DEPLOYMENT_CPU_LIMIT,
                '--pids-limit', str(settings.DEPLOYMENT_PIDS_LIMIT),
                '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
                '--user', '10001:10001', '--init', '--restart', 'no',
                '--log-driver', 'json-file', '--log-opt', 'max-size=2m', '--log-opt', 'max-file=2']

    def environment(self, plan):
        flags = []
        for key, value in plan.environment.items():
            flags.extend(['--env', f'{key}={value}'])
        return flags

    def copy_source(self, session, container, static=False, generated_files=None, create_data=False, data_seed=None):
        # Docker receives an archive of only validated project files. No bind mounts.
        # Stream through a private temporary file instead of buffering the archive.
        archive_path = storage_dir(session) / 'source.tar'
        try:
            with tarfile.open(archive_path, 'w') as tar:
                root = Path(session.project_dir)
                for path in [root, *sorted(root.rglob('*'))]:
                    if path.is_symlink():
                        raise HostingError('Project contains a symbolic link.')
                    info = tar.gettarinfo(str(path), 'app' if path == root else 'app/' + path.relative_to(root).as_posix())
                    info.uid = info.gid = 10001
                    info.uname = info.gname = ''
                    if path.is_file():
                        with path.open('rb') as handle:
                            tar.addfile(info, handle)
                    else:
                        tar.addfile(info)
                for target, content in (generated_files or {}).items():
                    # Generated paths are supplied by our trusted runtime planner.
                    content = content.encode() if isinstance(content, str) else content
                    info = tarfile.TarInfo(target.lstrip('/'))
                    info.uid = info.gid = 10001
                    info.mode, info.size = 0o644, len(content)
                    tar.addfile(info, io.BytesIO(content))
                if create_data:
                    info = tarfile.TarInfo('data')
                    info.type, info.mode, info.uid, info.gid = tarfile.DIRTYPE, 0o755, 10001, 10001
                    tar.addfile(info)
                    if data_seed:
                        info = tar.gettarinfo(str(data_seed), 'data/db.sqlite3')
                        info.uid = info.gid = 10001
                        info.mode = 0o600
                        with Path(data_seed).open('rb') as handle:
                            tar.addfile(info, handle)
                if static:
                    config = (f'server {{ listen {session.internal_port}; server_name _; root /app; index index.html; '
                              'location / { try_files $uri $uri/ =404; } '
                              'location ~ /\\. { deny all; } }').encode()
                    info = tarfile.TarInfo('etc/nginx/conf.d/default.conf')
                    info.size = len(config)
                    info.mode = 0o644
                    tar.addfile(info, io.BytesIO(config))
            with archive_path.open('rb') as handle:
                try:
                    result = subprocess.run(['docker', 'cp', '-', f'{container}:/'], stdin=handle, capture_output=True, timeout=120)
                except (OSError, subprocess.TimeoutExpired) as exc:
                    raise HostingError(f'Copying source into the container failed: {exc}') from exc
            if result.returncode:
                raise HostingError('Copying source into the container failed: ' + result.stderr.decode(errors='replace')[-2000:])
        finally:
            archive_path.unlink(missing_ok=True)

    def capture_logs(self, session, name, filename):
        info = self.inspect(name)
        self.verify_owned(info, session)
        if info:
            # docker logs writes stderr to stderr even when it succeeds.
            result = subprocess.run(['docker', 'logs', '--tail', '200', name], capture_output=True, timeout=10)
            if result.returncode:
                raise HostingError('Unable to read container logs.')
            output = (result.stdout + result.stderr).decode(errors='replace')[-settings.DEPLOYMENT_LOG_MAX_BYTES:]
            if session.project_type == 'fullstack':
                from .fullstack_docker import redact
                output = redact(session, output)
            path = storage_dir(session) / 'logs' / filename
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(output, encoding='utf-8')
        return info

    def build(self, session, plan, cancelled):
        if plan.runtime == 'fullstack':
            from .fullstack_docker import FullStackDocker
            return FullStackDocker(self).build(session, plan, cancelled)
        return self.build_runtime(session, plan, cancelled)

    def ensure_image(self, image, cancelled):
        if self.command('image', 'ls', '-q', '--filter', f'reference={image}'):
            return
        if image == settings.DEPLOYMENT_FULLSTACK_PYTHON_IMAGE:
            # Build only our bundled image; uploaded Dockerfiles are never used.
            dockerfile = Path(__file__).resolve().parents[1] / 'images' / 'python' / 'Dockerfile'
            data = io.BytesIO()
            with tarfile.open(fileobj=data, mode='w:gz', format=tarfile.GNU_FORMAT) as archive:
                archive.add(dockerfile, arcname='Dockerfile')
            self.command('build', '--tag', image, '-', data=data.getvalue(),
                         timeout=settings.DEPLOYMENT_BUILD_TIMEOUT_SECONDS, cancelled=cancelled)
        else:
            self.command('pull', image, timeout=settings.DEPLOYMENT_BUILD_TIMEOUT_SECONDS, cancelled=cancelled)

    def build_runtime(self, session, plan, cancelled, builder=None, image=None, log_file='build.log',
                      commit=True, create_data=False, data_seed=None):
        _, default_builder, default_image = self.names(session)
        builder, image = builder or default_builder, image or default_image
        append_log(session, f'Using runtime image: {plan.image}.')
        self.ensure_image(plan.image, cancelled)
        self.command('create', '--name', builder, *self.labels(session),
                     *self.limits(), *self.environment(plan), '--network', 'bridge',
                     '--workdir', getattr(plan, 'workdir', '/app'), '--entrypoint', '/bin/sh', plan.image, '-c', plan.install)
        self.copy_source(session, builder, static=plan.runtime == 'static',
                         generated_files=getattr(plan, 'generated_files', {}), create_data=create_data, data_seed=data_seed)
        cancelled()
        build_stage = 'C++ compilation' if plan.runtime == 'cpp' else 'Frontend build' if plan.runtime == 'frontend' else 'Dependency installation'
        append_log(session, 'Compiling C++ source inside the build container.' if plan.runtime == 'cpp' else
                   'Installing dependencies inside the build container.' if plan.install != 'true' else
                   'No dependencies to install.')
        self.command('start', builder)
        deadline = time.monotonic() + settings.DEPLOYMENT_BUILD_TIMEOUT_SECONDS
        while True:
            cancelled()
            info = self.capture_logs(session, builder, log_file)
            if not info:
                raise HostingError('Build container disappeared.')
            if not info['State']['Running']:
                code = info['State']['ExitCode']
                if code:
                    session.exit_code = code
                    session.save(update_fields=['exit_code'])
                    raise HostingError(f'{build_stage} failed (exit {code}). See build logs.')
                break
            if time.monotonic() >= deadline:
                raise HostingError(f'{build_stage} exceeded the build timeout. See build logs.')
            time.sleep(0.5)
        append_log(session, 'C++ compilation completed.' if plan.runtime == 'cpp' else 'Dependencies installed.')
        if commit:
            self.command('commit', builder, image, timeout=120, cancelled=cancelled)
            self.remove_container(builder, session)
        return image

    def start(self, session, plan, image, cancelled=None):
        if plan.runtime == 'fullstack':
            from .fullstack_docker import FullStackDocker
            return FullStackDocker(self).start(session, plan, image, cancelled or (lambda: None))
        name, _, _ = self.names(session)
        # Isolated gateway prevents runtime containers reaching host services or LAN.
        self.command('network', 'create', '--internal', *self.labels(session),
                     '--opt', 'com.docker.network.bridge.gateway_mode_ipv4=isolated', name)
        container_id = self.command('create', '--name', name, *self.labels(session),
                     *self.limits(), *self.environment(plan), '--network', name,
                     '--tmpfs', '/tmp:rw,nosuid,nodev,size=64m,mode=1777',
                     '--workdir', '/app', '--entrypoint', plan.command[0], image, *plan.command[1:])
        session.container_name, session.container_id = name, container_id
        session.save(update_fields=['container_name', 'container_id'])
        self.command('start', name)
        routes = (f'location / {{ proxy_pass http://{name}:{session.internal_port}; '
                  'proxy_set_header Host $http_host; proxy_buffering off; '
                  'proxy_connect_timeout 2s; proxy_read_timeout 5s; '
                  'proxy_ignore_headers X-Accel-Redirect; }')
        self.start_proxy(session, routes, cancelled)
        return self.inspect(name)

    def start_proxy(self, session, routes, cancelled=None):
        name = self.names(session)[0]
        container_id = session.container_id
        # Docker does not publish ports on --internal networks. A trusted nginx
        # gateway bridges the isolated app network to a loopback-only host port.
        # Uploaded code stays exclusively on the isolated network.
        proxy = name + '_proxy'
        proxy_image = settings.DEPLOYMENT_IMAGES['static']
        if not self.command('image', 'ls', '-q', '--filter', f'reference={proxy_image}'):
            append_log(session, f'Pulling proxy image: {proxy_image}.')
            self.command('pull', proxy_image, timeout=settings.DEPLOYMENT_BUILD_TIMEOUT_SECONDS, cancelled=cancelled)
        proxy_config = (
            'pid /tmp/nginx.pid; error_log /dev/stderr notice; '
            'events { worker_connections 256; } http { access_log /dev/stdout; '
            'client_body_temp_path /tmp/client; proxy_temp_path /tmp/proxy; '
            'fastcgi_temp_path /tmp/fastcgi; uwsgi_temp_path /tmp/uwsgi; scgi_temp_path /tmp/scgi; '
            f'server {{ listen {session.internal_port}; server_name _; '
            f'client_max_body_size {settings.DEPLOYMENT_PROXY_MAX_BYTES}; '
            f'if ($http_x_hosting_container != "{container_id}") {{ return 410; }} '
            + routes + ' } }')
        self.command('create', '--name', proxy, *self.labels(session), *self.limits(),
                     '--network', 'bridge', '--publish', f'127.0.0.1::{session.internal_port}',
                     '--read-only', '--tmpfs', '/tmp:rw,nosuid,nodev,size=32m,mode=1777',
                     '--env', f'HOSTING_PROXY_CONFIG={proxy_config}',
                     '--entrypoint', '/bin/sh', proxy_image, '-c',
                     'printf "%s" "$HOSTING_PROXY_CONFIG" > /tmp/nginx.conf; exec nginx -c /tmp/nginx.conf -g "daemon off;"')
        self.command('network', 'connect', name, proxy)
        self.command('start', proxy)
        info = self.port_info(session)
        bindings = info['NetworkSettings']['Ports'].get(f'{session.internal_port}/tcp') or []
        if not bindings or bindings[0]['HostIp'] != '127.0.0.1':
            raise HostingError('Docker did not allocate the requested loopback proxy port.')
        session.port = int(bindings[0]['HostPort'])
        session.container_status = 'running'
        session.save(update_fields=['port', 'container_status'])

    def services_healthy(self, session):
        if session.project_type == 'fullstack':
            from .fullstack_docker import FullStackDocker
            return FullStackDocker(self).services_healthy(session)
        return True, ''

    def mark_ready(self, session):
        if session.project_type == 'fullstack':
            from .fullstack_docker import FullStackDocker
            FullStackDocker(self).mark_ready(session)

    def purge_data(self, session):
        from .fullstack_docker import FullStackDocker
        return FullStackDocker(self).purge_data(session)

    def cleanup(self, session):
        name, builder, image = self.names(session)
        self.capture_logs(session, name + '_tunnel', 'tunnel.log')
        self.remove_container(name + '_tunnel', session)
        info = self.capture_logs(session, name, 'runtime.log')
        if info:
            session.exit_code = info['State']['ExitCode'] if not info['State']['Running'] else session.exit_code
            session.save(update_fields=['exit_code'])
        self.capture_logs(session, builder, 'build.log')
        self.capture_logs(session, name + '_proxy', 'proxy.log')
        for container in (name + '_proxy', name, builder):
            self.remove_container(container, session)
        if session.project_type == 'fullstack':
            from .fullstack_docker import FullStackDocker
            FullStackDocker(self).cleanup(session)
        networks = self.command('network', 'ls', '-q', '--filter', f'name=^{name}$').split()
        if networks:
            details = json.loads(self.command('network', 'inspect', name))[0]
            if details.get('Labels', {}).get(LABEL) != str(session.deployment_id):
                raise HostingError('Network belongs to another application; refusing removal.')
            self.command('network', 'rm', name)
        if self.command('image', 'ls', '-q', image):
            self.verify_owned(json.loads(self.command('image', 'inspect', image))[0], session)
            self.command('image', 'rm', image)
        if session.project_type == 'fullstack':
            FullStackDocker(self).cleanup_data(session)

    def orphan_ids(self):
        ids = self.command('ps', '-aq', '--filter', f'label={OWNER_LABEL}={settings.DEPLOYMENT_INSTANCE_ID}').split()
        if not ids:
            return []
        return [(item['Id'], item['Config']['Labels'][LABEL]) for item in json.loads(self.command('inspect', *ids))]

    def cleanup_orphan_resources(self, active):
        owner = f'label={OWNER_LABEL}={settings.DEPLOYMENT_INSTANCE_ID}'
        for kind in ('network', 'image'):
            ids = self.command(kind, 'ls', '-q', '--filter', owner).split()
            if not ids:
                continue
            for info in json.loads(self.command(kind, 'inspect', *sorted(set(ids)))):
                labels = info.get('Labels') if kind == 'network' else info.get('Config', {}).get('Labels')
                deployment_id = (labels or {}).get(LABEL)
                if deployment_id and deployment_id not in active:
                    self.command(kind, 'rm', info['Id'])
