import os
import shlex
import shutil
import signal
import socket
import subprocess
import sys
import threading
import zipfile
from pathlib import Path

from django.conf import settings
from django.utils import timezone

from .models import HostingSession

_timers = {}
_timer_lock = threading.Lock()


class HostingError(Exception):
    pass


def hosting_root():
    root = Path(settings.MEDIA_ROOT) / 'temporary_hosting'
    root.mkdir(parents=True, exist_ok=True)
    return root


def safe_extract_zip(uploaded_file, destination):
    destination = Path(destination).resolve()
    with zipfile.ZipFile(uploaded_file) as archive:
        for member in archive.infolist():
            target = (destination / member.filename).resolve()
            if not str(target).startswith(str(destination)):
                raise HostingError('Zip file contains an unsafe path.')
        archive.extractall(destination)


def normalize_project_root(path):
    path = Path(path)
    entries = [item for item in path.iterdir() if not item.name.startswith('__MACOSX')]
    if len(entries) == 1 and entries[0].is_dir():
        return entries[0]
    return path


def find_free_port():
    start = getattr(settings, 'TEMP_HOSTING_PORT_START', 9100)
    end = getattr(settings, 'TEMP_HOSTING_PORT_END', 9199)
    for port in range(start, end + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.2)
            if sock.connect_ex(('127.0.0.1', port)) != 0:
                return port
    raise HostingError('No available temporary hosting ports.')


def read_logs(session, tail_bytes=12000):
    if not session or not session.log_file or not os.path.exists(session.log_file):
        return ''
    with open(session.log_file, 'rb') as handle:
        handle.seek(0, os.SEEK_END)
        size = handle.tell()
        handle.seek(max(0, size - tail_bytes), os.SEEK_SET)
        return handle.read().decode('utf-8', errors='replace')


def process_is_alive(pid):
    if not pid:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def terminate_process(session, force=False):
    if not session.pid:
        return
    sig = signal.SIGKILL if force else signal.SIGTERM
    try:
        os.killpg(session.pid, sig)
    except ProcessLookupError:
        return
    except OSError:
        try:
            os.kill(session.pid, sig)
        except OSError:
            return


def mark_stopped(session, status):
    cancel_timer(session.id)
    session.status = status
    session.stopped_at = timezone.now()
    session.pid = None
    session.save(update_fields=['status', 'stopped_at', 'pid', 'updated_at'])


def stop_session(session, force=False, status=HostingSession.STATUS_STOPPED):
    terminate_process(session, force=force)
    mark_stopped(session, status)
    return session


def expire_session(session_id):
    try:
        session = HostingSession.objects.get(id=session_id)
    except HostingSession.DoesNotExist:
        return
    if session.status == HostingSession.STATUS_RUNNING and session.expires_at and session.expires_at <= timezone.now():
        stop_session(session, force=True, status=HostingSession.STATUS_EXPIRED)


def cancel_timer(session_id):
    with _timer_lock:
        timer = _timers.pop(session_id, None)
    if timer:
        timer.cancel()


def schedule_expiry(session):
    if session.status != HostingSession.STATUS_RUNNING or not session.expires_at:
        return
    delay = max(0, (session.expires_at - timezone.now()).total_seconds())
    cancel_timer(session.id)
    timer = threading.Timer(delay, expire_session, args=[session.id])
    timer.daemon = True
    with _timer_lock:
        _timers[session.id] = timer
    timer.start()


def schedule_active_sessions():
    try:
        sessions = HostingSession.objects.filter(status=HostingSession.STATUS_RUNNING)
        for session in sessions:
            if session.expires_at and session.expires_at <= timezone.now():
                expire_session(session.id)
            elif process_is_alive(session.pid):
                schedule_expiry(session)
            else:
                mark_stopped(session, HostingSession.STATUS_FAILED)
    except Exception:
        pass


def active_session():
    session = HostingSession.objects.filter(status=HostingSession.STATUS_RUNNING).first()
    if session and session.expires_at and session.expires_at <= timezone.now():
        expire_session(session.id)
        return None
    if session and not process_is_alive(session.pid):
        mark_stopped(session, HostingSession.STATUS_FAILED)
        return None
    return session


def detect_command(project_type, project_dir, port, entrypoint='', start_command=''):
    project_dir = Path(project_dir)
    if start_command.strip():
        return build_custom_command(start_command, port)

    if project_type == HostingSession.TYPE_STATIC:
        return [sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1']

    if project_type == HostingSession.TYPE_PHP:
        if not shutil.which('php'):
            raise HostingError('PHP is not installed or not available in PATH.')
        router = entrypoint.strip() or 'index.php'
        return ['php', '-S', f'127.0.0.1:{port}', router]

    if project_type == HostingSession.TYPE_PYTHON:
        if entrypoint.strip():
            return [sys.executable, entrypoint.strip()]
        if (project_dir / 'manage.py').exists():
            return [sys.executable, 'manage.py', 'runserver', f'127.0.0.1:{port}']
        if (project_dir / 'app.py').exists():
            return [sys.executable, 'app.py']
        raise HostingError('Add a start command or include manage.py/app.py for Python previews.')

    if project_type == HostingSession.TYPE_NODE:
        if (project_dir / 'package.json').exists():
            return ['npm', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', str(port)]
        raise HostingError('Node previews need package.json or a custom start command.')

    raise HostingError('Unsupported project type.')


def build_custom_command(start_command, port):
    formatted = start_command.replace('{port}', str(port))
    parts = shlex.split(formatted)
    if not parts:
        raise HostingError('Start command cannot be empty.')
    allowed = {'python', 'python3', 'php', 'node', 'npm', 'npx'}
    executable = Path(parts[0]).name
    if executable not in allowed:
        raise HostingError('Start command must begin with python, python3, php, node, npm, or npx.')
    if executable in {'python', 'python3'}:
        parts[0] = sys.executable
    return parts


def start_session(session):
    existing = active_session()
    if existing and existing.id != session.id:
        raise HostingError('Another website is already running. Stop it before starting a new one.')

    port = find_free_port()
    session.status = HostingSession.STATUS_STARTING
    session.port = port
    session.error_message = ''
    session.set_expiry()
    session.save()

    project_dir = Path(session.project_dir)
    log_path = project_dir / 'preview.log'
    command = detect_command(
        session.project_type,
        project_dir,
        port,
        session.entrypoint,
        session.start_command,
    )
    session.start_command = ' '.join(shlex.quote(part) for part in command)
    session.log_file = str(log_path)
    session.save(update_fields=['start_command', 'log_file', 'updated_at'])

    env = os.environ.copy()
    env['PORT'] = str(port)
    env['HOST'] = '127.0.0.1'

    with open(log_path, 'ab') as logs:
        logs.write(f'\n--- Starting preview at {timezone.now().isoformat()} ---\n'.encode())
        logs.write(f'Command: {session.start_command}\n'.encode())
        process = subprocess.Popen(
            command,
            cwd=project_dir,
            stdout=logs,
            stderr=subprocess.STDOUT,
            env=env,
            start_new_session=True,
        )

    session.pid = process.pid
    session.status = HostingSession.STATUS_RUNNING
    session.save(update_fields=['pid', 'status', 'updated_at'])
    schedule_expiry(session)
    return session


def create_session_from_upload(uploaded_file, project_type, user, name='', entrypoint='', start_command=''):
    if active_session():
        raise HostingError('Another website is already running. Stop it before starting a new one.')
    if not uploaded_file:
        raise HostingError('Upload a zip file containing the website.')
    if not uploaded_file.name.lower().endswith('.zip'):
        raise HostingError('Only .zip website uploads are supported.')

    session = HostingSession.objects.create(
        name=name.strip() or Path(uploaded_file.name).stem[:180] or 'Temporary website',
        project_type=project_type,
        status=HostingSession.STATUS_STARTING,
        project_dir='',
        entrypoint=entrypoint.strip(),
        start_command=start_command.strip(),
        started_by=user,
    )
    project_dir = hosting_root() / f'session_{session.id}'
    project_dir.mkdir(parents=True, exist_ok=True)
    try:
        safe_extract_zip(uploaded_file, project_dir)
        actual_root = normalize_project_root(project_dir)
        session.project_dir = str(actual_root)
        session.save(update_fields=['project_dir', 'updated_at'])
        return start_session(session)
    except Exception:
        session.status = HostingSession.STATUS_FAILED
        session.error_message = 'Failed to start preview.'
        session.stopped_at = timezone.now()
        session.save(update_fields=['status', 'error_message', 'stopped_at', 'updated_at'])
        raise


def restart_session(session):
    if session.status == HostingSession.STATUS_RUNNING:
        stop_session(session, force=True, status=HostingSession.STATUS_STOPPED)
        session.refresh_from_db()
    return start_session(session)
