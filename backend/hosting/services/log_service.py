from django.conf import settings
from django.utils import timezone

from .archive_service import storage_dir


def append_log(session, message, filename='deployment.log'):
    directory = storage_dir(session) / 'logs'
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = directory / filename
    # Bounded logs, including noisy dependency installers.
    if path.exists() and path.stat().st_size > settings.DEPLOYMENT_LOG_MAX_BYTES:
        with path.open('rb') as handle:
            handle.seek(-settings.DEPLOYMENT_LOG_MAX_BYTES // 2, 2)
            tail = handle.read()
        path.write_bytes(b'[Earlier log output truncated]\n' + tail)
    with path.open('a', encoding='utf-8') as handle:
        handle.write(f'{timezone.now().isoformat()} {message}\n')


def read_logs(session, tail_bytes=24000):
    if not session:
        return ''
    output = []
    for name in ('deployment.log', 'frontend-build.log', 'build.log', 'database.log', 'runtime.log', 'frontend.log', 'proxy.log'):
        path = storage_dir(session) / 'logs' / name
        if path.exists():
            with path.open('rb') as handle:
                handle.seek(max(0, path.stat().st_size - tail_bytes))
                output.append(f'--- {name} ---\n' + handle.read().decode('utf-8', errors='replace'))
    return '\n'.join(output)
