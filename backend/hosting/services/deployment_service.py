import logging
import os
import shlex
import signal
import shutil
import time
from pathlib import Path
from datetime import timedelta

from django.conf import settings
from django.core.files import File
from django.db import IntegrityError, transaction
from django.utils import timezone

from hosting.models import HostingSession
from .archive_service import (clean_app, hosting_root, normalize_project_root,
                              preserve_legacy_source, safe_extract_zip, save_upload,
                              storage_dir, validate_zip)
from .docker_service import DockerService
from .errors import HostingError
from .healthcheck_service import check_http, public_health_path, wait_until_healthy
from .log_service import append_log
from .runtime_service import SUPPORTED_RUNTIMES_MESSAGE, runtime_plan
from .tunnel_service import CloudflareTunnel

logger = logging.getLogger(__name__)
BUSY_MESSAGE = 'A temporary website is currently active. Stop it or wait until it expires before starting another deployment.'


class DeploymentCancelled(HostingError):
    pass


def worker_is_alive():
    try:
        return time.time() - (hosting_root() / 'worker.heartbeat').stat().st_mtime < 20
    except FileNotFoundError:
        return False


def require_worker():
    if settings.DEPLOYMENT_REQUIRE_WORKER and not worker_is_alive():
        raise HostingError('The hosting worker is offline. Start python manage.py hosting_worker, then retry.')


def active_session(archive_document=None):
    sessions = HostingSession.objects.filter(active_slot=1)
    if archive_document is not None:
        sessions = sessions.filter(archive_document=archive_document)
    return sessions.first()


def ensure_free_slot(excluding=None):
    sessions = HostingSession.objects.filter(active_slot=1)
    if excluding:
        sessions = sessions.exclude(pk=excluding)
    if sessions.exists():
        raise HostingError(BUSY_MESSAGE)
    if HostingSession.objects.filter(pid__isnull=False).exists():
        raise HostingError('Legacy host processes are pending verified cleanup. Check hosting worker logs.')


def create_session_from_upload(uploaded_file, project_type, user, name='', entrypoint='', start_command='', archive_document=None):
    require_worker()
    if not uploaded_file:
        raise HostingError('Upload a ZIP containing the website.')
    if project_type not in ('', 'auto', 'fullstack', *settings.DEPLOYMENT_IMAGES):
        raise HostingError(SUPPORTED_RUNTIMES_MESSAGE)
    if len(name.strip()) > 180 or len(entrypoint.strip()) > 260 or len(start_command.strip()) > 500:
        raise HostingError('Name, entrypoint or start command is too long.')
    try:
        with transaction.atomic():
            ensure_free_slot()
            session = HostingSession.objects.create(
                name=name.strip() or Path(uploaded_file.name).stem[:180] or 'Temporary website',
                project_type=project_type or 'auto', status='validating', active_slot=1,
                entrypoint=entrypoint.strip(), start_command=start_command.strip(),
                internal_port=settings.DEPLOYMENT_INTERNAL_PORT,
                archive_document=archive_document, started_by=user,
            )
    except IntegrityError as exc:
        raise HostingError(BUSY_MESSAGE) from exc
    try:
        directory = storage_dir(session)
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        source = directory / 'source.zip'
        session.source_zip = str(source)
        session.log_file = str(directory / 'logs' / 'deployment.log')
        session.save(update_fields=['source_zip', 'log_file'])
        save_upload(uploaded_file, source)
        append_log(session, 'ZIP received.')
        validate_zip(source)
        append_log(session, 'ZIP validated. Deployment queued.')
        transition(session, ('validating',), 'uploaded')
        return session
    except Exception as exc:
        # No container can exist before the record enters the uploaded queue.
        HostingSession.objects.filter(pk=session.pk).update(
            status='failed', active_slot=None, error_message=str(exc), stopped_at=timezone.now())
        append_log(session, f'Deployment failed: {exc}')
        if isinstance(exc, HostingError):
            raise
        raise HostingError(f'Unable to store the deployment: {exc}') from exc


def save_default_archive_configuration(archive, user):
    """Save an approved ZIP without reserving a slot or executing any code."""
    if not archive.system_file:
        raise HostingError('This research has no approved system ZIP.')
    directory = None
    try:
        with transaction.atomic():
            session = HostingSession.objects.create(
                name=archive.title[:180], project_type='auto',
                status=HostingSession.STATUS_STOPPED, is_default=True,
                archive_document=archive, started_by=user,
                internal_port=settings.DEPLOYMENT_INTERNAL_PORT,
            )
            directory = storage_dir(session)
            directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            source = directory / 'source.zip'
            with archive.system_file.open('rb') as stored:
                upload = File(stored, name=archive.system_original_filename or 'system.zip')
                save_upload(upload, source)
            validate_zip(source)
            session.source_zip = str(source)
            session.log_file = str(directory / 'logs' / 'deployment.log')
            session.save(update_fields=['source_zip', 'log_file', 'updated_at'])
            append_log(session, 'Approved system saved as the default configuration. Ready to run.')
            return session
    except Exception as exc:
        if directory is not None:
            shutil.rmtree(directory, ignore_errors=True)
        if isinstance(exc, HostingError):
            raise
        raise HostingError('Unable to save the approved system configuration.') from exc


def stop_session(session, force=False, status=HostingSession.STATUS_STOPPED):
    with transaction.atomic():
        session = HostingSession.objects.select_for_update().get(pk=session.pk)
        if session.active_slot is None:
            return session
        session.status = 'stopping'
        session.restart_requested = False
        session.stop_target = status
        session.save(update_fields=['status', 'restart_requested', 'stop_target', 'updated_at'])
    append_log(session, 'Stop requested. Public route deactivated.')
    return session


def restart_session(session):
    require_worker()
    try:
        with transaction.atomic():
            session = HostingSession.objects.select_for_update().get(pk=session.pk)
            ensure_free_slot(excluding=session.pk)
            if session.status in ('uploaded', 'validating', 'extracting', 'building', 'starting', 'stopping'):
                raise HostingError('This deployment is already starting or stopping. Wait for it to finish.')
            if not session.source_zip:
                session.source_zip = str(preserve_legacy_source(session))
                session.start_command = _legacy_command(session)
            if not Path(session.source_zip).is_file():
                raise HostingError('Saved ZIP is missing. Upload the project again.')
            session.status = 'stopping'
            session.active_slot = 1
            session.restart_requested = True
            session.stop_target = 'stopped'
            session.error_message = ''
            session.save()
    except IntegrityError as exc:
        raise HostingError(BUSY_MESSAGE) from exc
    append_log(session, 'Restart requested. Source ZIP retained; old resources will be removed first.')
    return session


def _legacy_command(session):
    if not session.start_command or session.project_type == 'static':
        return ''
    args = shlex.split(session.start_command)
    if args:
        args[0] = Path(args[0]).name
    command = shlex.join(args).replace('127.0.0.1', '0.0.0.0')
    if session.port:
        command = command.replace(str(session.port), '{port}')
    return command


def start_saved_system(session_id):
    try:
        return restart_session(HostingSession.objects.get(pk=session_id))
    except HostingSession.DoesNotExist as exc:
        raise HostingError('Saved system does not exist.') from exc


def saved_systems(archive_document=None):
    sessions = HostingSession.objects.all()
    if archive_document is not None:
        sessions = sessions.filter(archive_document=archive_document)
    return [s for s in sessions if (s.source_zip and Path(s.source_zip).is_file())
            or (s.project_dir and Path(s.project_dir).is_dir())]


def delete_saved_system(session_id, docker=None):
    import shutil
    with transaction.atomic():
        try:
            session = HostingSession.objects.select_for_update().get(pk=session_id)
        except HostingSession.DoesNotExist as exc:
            raise HostingError('Saved system does not exist.') from exc
        if session.active_slot or session.pid:
            raise HostingError('Stop this deployment and wait for cleanup before deleting it.')
        if session.project_type == 'fullstack':
            (docker or DockerService()).purge_data(session)
        directory = storage_dir(session)
        if directory.exists():
            shutil.rmtree(directory)
        session.delete()
    return 1


def transition(session, expected, status):
    updated = HostingSession.objects.filter(pk=session.pk, status__in=expected).update(status=status, updated_at=timezone.now())
    if not updated:
        raise DeploymentCancelled('Deployment was cancelled.')
    session.refresh_from_db()


def check_cancelled(session):
    if not HostingSession.objects.filter(pk=session.pk, status__in=('extracting', 'building', 'starting'), active_slot=1).exists():
        raise DeploymentCancelled('Deployment was cancelled.')


def deploy(session, docker=None, stop_event=None):
    docker = docker or DockerService()

    def cancelled():
        check_cancelled(session)
        if stop_event is not None and stop_event.is_set():
            raise HostingError('Hosting worker stopped during deployment. Restart the saved ZIP.')

    try:
        transition(session, ('uploaded',), 'extracting')
        cancelled()
        docker.cleanup(session)
        clean_app(session)
        append_log(session, 'Extracting ZIP.')
        safe_extract_zip(session.source_zip, storage_dir(session) / 'app')
        cancelled()
        session.project_dir = str(normalize_project_root(storage_dir(session) / 'app'))
        session.internal_port = settings.DEPLOYMENT_INTERNAL_PORT
        session.save(update_fields=['project_dir', 'internal_port'])
        append_log(session, f'Project root detected: {Path(session.project_dir).relative_to(storage_dir(session))}.')
        if settings.DEPLOYMENT_TUNNEL_ENABLED:
            CloudflareTunnel(docker).start(session, cancelled)
        plan = runtime_plan(session)
        session.project_type = plan.runtime
        session.save(update_fields=['project_type'])
        append_log(session, f'Runtime detected: {plan.runtime}.')
        transition(session, ('extracting',), 'building')
        append_log(session, 'Container build started.')
        image = docker.build(session, plan, cancelled)
        transition(session, ('building',), 'starting')
        docker.start(session, plan, image, cancelled=cancelled)
        append_log(session, 'Container started. Waiting for application health check.')
        wait_until_healthy(session, docker, cancelled)
        if settings.DEPLOYMENT_TUNNEL_ENABLED and not CloudflareTunnel(docker).is_running(session):
            raise HostingError('Cloudflare tunnel stopped during application startup. Restart the saved system.')
        with transaction.atomic():
            session = HostingSession.objects.select_for_update().get(pk=session.pk)
            if session.status != 'starting':
                raise DeploymentCancelled('Deployment was cancelled.')
            if session.project_type == 'fullstack':
                # Retain the initialized database before making the website public.
                docker.mark_ready(session)
            session.set_expiry()
            session.status, session.health_status, session.container_status = 'running', 'healthy', 'running'
            session.health_failures = 0
            session.stopped_at, session.exit_code = None, None
            session.error_message = ''
            session.save()
        append_log(session, f'Health check passed. Public route activated. Deployment running until {session.expires_at.isoformat()}.')
        if session.tunnel_url:
            append_log(session, f'Cloudflare public URL: {session.tunnel_url}')
    except DeploymentCancelled:
        finish_deployment(session, docker=docker)
    except Exception as exc:
        logger.exception('Deployment %s failed', session.pk)
        HostingSession.objects.filter(pk=session.pk).update(error_message=str(exc)[:6000])
        append_log(session, f'Deployment failed: {exc}')
        finish_deployment(session, target='failed', docker=docker)
    session.refresh_from_db()
    return session


def finish_deployment(session, target=None, docker=None):
    docker = docker or DockerService()
    with transaction.atomic():
        session = HostingSession.objects.select_for_update().get(pk=session.pk)
        if session.active_slot is None:
            return session
        session.stop_target = target or session.stop_target
        session.status = 'stopping'
        session.save(update_fields=['status', 'stop_target', 'updated_at'])
    try:
        docker.cleanup(session)
        clean_app(session)
    except Exception as exc:
        message = f'Cleanup pending; worker will retry: {exc}'
        HostingSession.objects.filter(pk=session.pk).update(error_message=message[:6000], health_status='unknown')
        append_log(session, message)
        logger.exception('Cleanup failed for deployment %s', session.pk)
        session.refresh_from_db()
        return session
    with transaction.atomic():
        session = HostingSession.objects.select_for_update().get(pk=session.pk)
        session.port, session.pid = None, None
        session.container_id = ''
        session.tunnel_url = ''
        session.container_status, session.health_status = 'removed', 'inactive'
        session.health_failures = 0
        session.stopped_at = timezone.now()
        if session.restart_requested:
            session.status = 'uploaded'
            session.started_at = session.expires_at = None
            session.restart_requested = False
            session.error_message = ''
            append_log(session, 'Old container removed. Deployment restart queued.')
        else:
            session.status = session.stop_target
            session.active_slot = None
            append_log(session, f'Deployment {session.status}. Container, network, image and extracted files removed. Source ZIP and logs retained.')
        session.save()
    return session


def expire_session(session_id, docker=None):
    session = HostingSession.objects.filter(pk=session_id, status='running', expires_at__lte=timezone.now()).first()
    if session:
        return finish_deployment(session, target='expired', docker=docker)


def reconcile_deployment(session, docker=None, startup=False):
    docker = docker or DockerService()
    session.refresh_from_db()
    if session.status == 'stopping':
        return finish_deployment(session, docker=docker)
    if session.status == 'running':
        if not session.expires_at or session.expires_at <= timezone.now():
            return finish_deployment(session, target='expired', docker=docker)
        if settings.DEPLOYMENT_TUNNEL_ENABLED and (not session.tunnel_url or not CloudflareTunnel(docker).is_running(session)):
            message = 'The Cloudflare public link is unavailable. Restart the saved system to create a new temporary URL.'
            HostingSession.objects.filter(pk=session.pk).update(error_message=message)
            append_log(session, message)
            return finish_deployment(session, target='failed', docker=docker)
        info = docker.inspect(session.container_name or docker.names(session)[0])
        docker.verify_owned(info, session)
        if not info or not info['State']['Running']:
            message = 'Container exited unexpectedly.' if info else 'Container disappeared; the original session was interrupted.'
            HostingSession.objects.filter(pk=session.pk).update(error_message=message, exit_code=info['State']['ExitCode'] if info else None)
            append_log(session, message)
            return finish_deployment(session, target='failed', docker=docker)
        if session.project_type == 'fullstack':
            services_running, error = docker.services_healthy(session)
            if not services_running:
                HostingSession.objects.filter(pk=session.pk).update(error_message=error)
                append_log(session, error)
                return finish_deployment(session, target='failed', docker=docker)
        proxy_info = docker.port_info(session)
        docker.verify_owned(proxy_info, session)
        bindings = proxy_info['NetworkSettings']['Ports'].get(f'{session.internal_port}/tcp') or [] if proxy_info else []
        if not bindings or bindings[0]['HostIp'] != '127.0.0.1' or int(bindings[0]['HostPort']) != session.port:
            HostingSession.objects.filter(pk=session.pk).update(error_message='Container port mapping no longer matches the deployment.')
            return finish_deployment(session, target='failed', docker=docker)
        health_path = public_health_path(session)
        healthy, error = check_http(session.port, session.container_id, path=health_path,
                                    timeout=min(2, (session.expires_at - timezone.now()).total_seconds()))
        if healthy and session.project_type == 'fullstack':
            healthy, error = docker.services_healthy(session)
            if healthy and health_path is None:
                healthy, error = check_http(session.port, session.container_id, path='/__hosting_backend_health__/')
        if session.expires_at <= timezone.now():
            return finish_deployment(session, target='expired', docker=docker)
        if not healthy:
            failures = session.health_failures + 1
            message = f'Application health check failed ({failures}/{settings.DEPLOYMENT_HEALTHCHECK_FAILURES}): {error}'
            HostingSession.objects.filter(pk=session.pk).update(error_message=message, health_status='degraded', health_failures=failures)
            append_log(session, message)
            if failures < max(1, settings.DEPLOYMENT_HEALTHCHECK_FAILURES):
                session.refresh_from_db()
                return session
            return finish_deployment(session, target='failed', docker=docker)
        if session.health_failures:
            append_log(session, 'Application health recovered; original deadline retained.')
        HostingSession.objects.filter(pk=session.pk).update(container_status='running', health_status='healthy', health_failures=0, error_message='')
        docker.capture_logs(session, session.container_name, 'runtime.log')
    elif (startup and session.status in ('extracting', 'building', 'starting', 'validating')) or (
            session.status == 'validating' and session.updated_at < timezone.now() - timedelta(minutes=5)):
        HostingSession.objects.filter(pk=session.pk).update(error_message='Deployment interrupted before readiness; restart the saved ZIP.')
        return finish_deployment(session, target='failed', docker=docker)
    return session


def clean_legacy_process(session):
    """Never signal a reused PID based solely on its number."""
    proc = Path('/proc') / str(session.pid)
    try:
        command = (proc / 'cmdline').read_bytes().split(b'\0')
        if not command or not command[0]:
            raise FileNotFoundError
        cwd = (proc / 'cwd').resolve(strict=True)
        expected = Path(settings.MEDIA_ROOT).resolve() / 'temporary_hosting' / f'session_{session.pk}'
        saved = shlex.split(session.start_command)
        if (not cwd.is_relative_to(expected) or os.getpgid(session.pid) != session.pid
                or not saved or Path(os.fsdecode(command[0])).name != Path(saved[0]).name):
            raise HostingError(f'Legacy PID {session.pid} could not be verified; inspect it manually before clearing the PID.')
        os.killpg(session.pid, signal.SIGKILL)
        append_log(session, 'Verified legacy host process terminated during upgrade.')
    except (FileNotFoundError, ProcessLookupError):
        pass
    HostingSession.objects.filter(pk=session.pk).update(pid=None, status='failed', active_slot=None)


def reconcile_all_deployments(docker=None, startup=False):
    docker = docker or DockerService()
    for session in HostingSession.objects.filter(pid__isnull=False):
        try:
            clean_legacy_process(session)
        except Exception as exc:
            HostingSession.objects.filter(pk=session.pk).update(error_message=str(exc))
            logger.exception('Legacy cleanup failed for %s', session.pk)
    for session in HostingSession.objects.filter(active_slot=1):
        try:
            reconcile_deployment(session, docker=docker, startup=startup)
        except HostingError as exc:
            HostingSession.objects.filter(pk=session.pk).update(health_status='unknown', error_message=f'Container state could not be verified: {exc}')
            logger.exception('Container state could not be verified for deployment %s', session.pk)
    active = {str(value) for value in HostingSession.objects.filter(active_slot=1).values_list('deployment_id', flat=True)}
    for container_id, deployment_id in docker.orphan_ids():
        if deployment_id not in active:
            docker.command('rm', '-f', container_id)
    docker.cleanup_orphan_resources(active)


def process_queue(docker=None, stop_event=None):
    session = HostingSession.objects.filter(status='uploaded', active_slot=1).first()
    if session:
        return deploy(session, docker=docker, stop_event=stop_event)
