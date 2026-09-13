import io
import tempfile
import zipfile
from datetime import timedelta
from pathlib import Path
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from hosting.models import HostingSession
from hosting.services.archive_service import safe_extract_zip, normalize_project_root, storage_dir
from hosting.services.deployment_service import (create_session_from_upload, deploy, stop_session, restart_session,
    reconcile_deployment, finish_deployment, delete_saved_system)
from hosting.services.docker_service import DockerService, LABEL
from hosting.services.errors import HostingError
from hosting.services.log_service import read_logs
from hosting.services.runtime_service import runtime_plan
from repository.models import ArchiveDocument


def zip_upload(files=None):
    data = io.BytesIO()
    with zipfile.ZipFile(data, 'w') as archive:
        for name, value in (files or {'index.html': '<h1>Temporary site</h1>'}).items():
            archive.writestr(name, value)
    return SimpleUploadedFile('website.zip', data.getvalue(), content_type='application/zip')


class SimulatedDocker:
    """Only a test double; production code always calls the real Docker adapter."""
    def __init__(self):
        self.events = []
        self.info = None
        self.build_error = None
        self.cleanup_error = None
        self.cancel_build = None

    names = DockerService.names

    def cleanup(self, session):
        self.events.append('cleanup')
        if self.cleanup_error:
            raise HostingError(self.cleanup_error)
        self.info = None

    def build(self, session, plan, cancelled):
        self.events.append('build')
        if self.cancel_build:
            self.cancel_build(session)
            cancelled()
        if self.build_error:
            raise HostingError(self.build_error)
        return 'test-image'

    def start(self, session, plan, image, cancelled=None):
        self.events.append('start')
        session.port = 43217
        session.container_id = 'test-container'
        session.container_name = self.names(session)[0]
        session.save(update_fields=['port', 'container_id', 'container_name'])
        self.info = {'State': {'Running': True, 'Status': 'running', 'ExitCode': 0},
                     'Config': {'Labels': {LABEL: str(session.deployment_id)}},
                     'NetworkSettings': {'Ports': {f'{session.internal_port}/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '43217'}]}}}

    def port_info(self, session):
        return self.info

    def inspect(self, name):
        return self.info

    def verify_owned(self, info, session):
        return DockerService.verify_owned(self, info, session)

    def capture_logs(self, *args):
        return self.info


@override_settings(DEPLOYMENT_REQUIRE_WORKER=False, DEPLOYMENT_BASE_DOMAIN='', DEPLOYMENT_PUBLIC_ORIGIN='', DEPLOYMENT_DURATION_MINUTES=30)
class LifecycleTests(TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.settings_override = override_settings(DEPLOYMENT_STORAGE_PATH=self.temp.name)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.admin = get_user_model().objects.create_user('admin@example.test', 'test-password', role='admin')
        self.reader = get_user_model().objects.create_user('reader@example.test', 'test-password', role='student')
        self.docker = SimulatedDocker()
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def upload(self, files=None, **kwargs):
        return create_session_from_upload(zip_upload(files), kwargs.pop('project_type', 'auto'), self.admin, **kwargs)

    def running(self, **kwargs):
        session = self.upload(**kwargs)
        with patch('hosting.services.deployment_service.wait_until_healthy'):
            return deploy(session, docker=self.docker)

    def test_upload_is_queued_with_private_preserved_zip(self):
        session = self.upload()
        self.assertEqual(session.status, 'uploaded')
        self.assertIsNone(session.started_at)
        self.assertTrue(Path(session.source_zip).is_file())
        self.assertIn('ZIP validated', read_logs(session))
        self.assertEqual(session.active_slot, 1)

    def test_healthcheck_precedes_running_and_exact_30_minute_deadline(self):
        session = self.upload()
        def check(s, *_):
            s.refresh_from_db()
            self.assertEqual(s.status, 'starting')
            self.assertIsNone(s.started_at)
            self.assertEqual(s.preview_url, '')
        with patch('hosting.services.deployment_service.wait_until_healthy', side_effect=check):
            session = deploy(session, self.docker)
        self.assertEqual(session.status, 'running')
        self.assertEqual(session.expires_at - session.started_at, timedelta(minutes=30))
        self.assertIn('Health check passed', read_logs(session))

    def test_refresh_never_resets_expiry(self):
        session = self.running()
        expected = session.expires_at
        for _ in range(2):
            self.assertEqual(self.client.get('/api/hosting/status/').status_code, 200)
        session.refresh_from_db()
        self.assertEqual(session.expires_at, expected)

    def test_nested_project_root_and_dependency_directories_ignored(self):
        session = self.running(files={'project/site/index.html': 'works', 'README.md': 'wrapper',
                                      '__MACOSX/data': '', 'project/site/node_modules/hidden': 'ignored'})
        self.assertEqual(Path(session.project_dir).name, 'site')
        self.assertFalse((Path(session.project_dir) / 'node_modules').exists())

    def test_manual_stop_is_idempotent_and_disables_route_immediately(self):
        session = self.running()
        stop_session(session)
        session.refresh_from_db()
        self.assertEqual(session.status, 'stopping')
        self.assertEqual(session.preview_url, '')
        finish_deployment(session, docker=self.docker)
        stop_session(session)
        session.refresh_from_db()
        self.assertEqual(session.status, 'stopped')
        self.assertIsNone(session.port)
        self.assertIsNone(session.active_slot)
        self.assertTrue(Path(session.source_zip).exists())
        self.assertFalse((storage_dir(session) / 'app').exists())

    def test_restart_removes_old_resources_before_build_and_resets_deadline(self):
        session = self.running()
        original_expiry = session.expires_at
        restart_session(session)
        self.assertEqual(self.client.get(f'/temp/{session.deployment_id}/').status_code, 410)
        finish_deployment(session, docker=self.docker)
        session.refresh_from_db()
        self.assertEqual(session.status, 'uploaded')
        with patch('hosting.services.deployment_service.wait_until_healthy'):
            session = deploy(session, self.docker)
        self.assertGreater(session.expires_at, original_expiry)
        self.assertEqual(session.expires_at - session.started_at, timedelta(minutes=30))
        self.assertEqual(self.docker.events, ['cleanup', 'build', 'start', 'cleanup', 'cleanup', 'build', 'start'])

    def test_expiration_and_backend_restart_cleanup(self):
        session = self.running()
        deadline = timezone.now() - timedelta(seconds=1)
        HostingSession.objects.filter(pk=session.pk).update(expires_at=deadline)
        self.assertEqual(self.client.get(f'/temp/{session.deployment_id}/').status_code, 410)
        reconcile_deployment(session, self.docker, startup=True)
        session.refresh_from_db()
        self.assertEqual(session.status, 'expired')
        self.assertEqual(session.expires_at, deadline)
        self.assertIsNone(session.active_slot)

    def test_healthy_container_survives_backend_restart_with_original_deadline(self):
        session = self.running()
        deadline = session.expires_at
        with patch('hosting.services.deployment_service.check_http', return_value=(True, 'HTTP 200')):
            reconcile_deployment(session, self.docker, startup=True)
        session.refresh_from_db()
        self.assertEqual(session.status, 'running')
        self.assertEqual(session.expires_at, deadline)

    def test_crashed_container_records_exit_code_and_releases_slot(self):
        session = self.running()
        self.docker.info['State'].update(Running=False, ExitCode=17)
        reconcile_deployment(session, self.docker)
        session.refresh_from_db()
        self.assertEqual(session.status, 'failed')
        self.assertEqual(session.exit_code, 17)
        self.assertIn('unexpectedly', session.error_message)
        self.assertEqual(self.upload().status, 'uploaded')

    def test_missing_container_does_not_restart_timer(self):
        session = self.running()
        deadline = session.expires_at
        self.docker.info = None
        reconcile_deployment(session, self.docker, startup=True)
        session.refresh_from_db()
        self.assertEqual(session.status, 'failed')
        self.assertEqual(session.expires_at, deadline)
        self.assertIn('disappeared', session.error_message)

    def test_build_failure_is_visible_and_does_not_block_next_upload(self):
        session = self.upload()
        self.docker.build_error = 'Dependency installation failed (exit 1). See build logs.'
        session = deploy(session, self.docker)
        self.assertEqual(session.status, 'failed')
        self.assertIsNone(session.active_slot)
        self.assertIn('Dependency installation failed', session.error_message)
        self.assertEqual(self.docker.events[-1], 'cleanup')
        self.assertEqual(self.upload().status, 'uploaded')

    def test_startup_health_failure_cleans_all_resources(self):
        session = self.upload()
        with patch('hosting.services.deployment_service.wait_until_healthy', side_effect=HostingError('Health check timed out')):
            session = deploy(session, self.docker)
        self.assertEqual(session.status, 'failed')
        self.assertIsNone(session.port)
        self.assertIsNone(session.started_at)
        self.assertIsNone(session.active_slot)
        self.assertIn('timed out', read_logs(session))

    def test_cancel_build_never_starts_container(self):
        session = self.upload()
        self.docker.cancel_build = stop_session
        session = deploy(session, self.docker)
        self.assertEqual(session.status, 'stopped')
        self.assertNotIn('start', self.docker.events)

    def test_failed_cleanup_retains_slot_until_removal_is_verified(self):
        session = self.running()
        stop_session(session)
        self.docker.cleanup_error = 'Docker unavailable'
        finish_deployment(session, docker=self.docker)
        session.refresh_from_db()
        self.assertEqual(session.status, 'stopping')
        self.assertEqual(session.active_slot, 1)
        self.assertIn('Cleanup pending', session.error_message)
        self.docker.cleanup_error = None
        finish_deployment(session, docker=self.docker)
        session.refresh_from_db()
        self.assertEqual(session.status, 'stopped')

    def test_only_one_active_slot_including_builds(self):
        session = self.upload()
        for status in HostingSession.ACTIVE_STATUSES:
            HostingSession.objects.filter(pk=session.pk).update(status=status)
            with self.assertRaises(HostingError):
                self.upload()
        with self.assertRaises(IntegrityError), transaction.atomic():
            HostingSession.objects.create(name='Bypass', status='running', active_slot=1)

    def test_database_rejects_active_status_without_slot(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            HostingSession.objects.create(name='Bypass', status='running')

    def test_invalid_zip_records_useful_error_and_releases_slot(self):
        with self.assertRaisesRegex(HostingError, 'Invalid ZIP'):
            create_session_from_upload(SimpleUploadedFile('bad.zip', b'not a zip'), 'static', self.admin)
        session = HostingSession.objects.first()
        self.assertEqual(session.status, 'failed')
        self.assertIsNone(session.active_slot)
        self.assertIsNone(session.port)
        self.assertEqual(self.upload().status, 'uploaded')

    def test_admin_only_controls_and_private_logs(self):
        doc = ArchiveDocument.objects.create(title='Demo', is_approved=True)
        session = self.running(archive_document=doc)
        self.client.force_authenticate(self.reader)
        for path in ('start', 'stop', 'restart', 'kill'):
            self.assertEqual(self.client.post(f'/api/hosting/{path}/').status_code, 403)
            self.assertEqual(self.client.post(f'/api/hosting/archives/{doc.pk}/{path}/').status_code, 403)
        self.assertEqual(self.client.get(f'/api/hosting/archives/{doc.pk}/logs/').status_code, 403)
        result = self.client.get(f'/api/hosting/archives/{doc.pk}/status/').json()['session']
        self.assertEqual(result['id'], session.pk)
        self.assertFalse({'project_dir', 'source_zip', 'error_message', 'start_command', 'log_file'} & result.keys())

    def test_anonymous_public_route_no_credentials_forwarded_and_sandboxed(self):
        session = self.running()
        self.client.force_authenticate(None)
        upstream = Mock(status=200)
        upstream.read.return_value = b'<html><link href="/style.css"><h1>public</h1></html>'
        upstream.getheader.side_effect = lambda key, default=None: 'text/html' if key == 'Content-Type' else default
        connection = Mock()
        connection.getresponse.return_value = upstream
        with patch('hosting.services.proxy_service.http.client.HTTPConnection', return_value=connection):
            response = self.client.get(f'/temp/{session.deployment_id}/', HTTP_AUTHORIZATION='Bearer platform-secret', HTTP_COOKIE='sessionid=secret')
        self.assertEqual(response.status_code, 200)
        self.assertIn('sandbox', response['Content-Security-Policy'])
        self.assertNotIn('allow-same-origin', response['Content-Security-Policy'])
        headers = connection.request.call_args.kwargs['headers']
        self.assertNotIn('Authorization', headers)
        self.assertNotIn('Cookie', headers)
        self.assertIn(f'/temp/{session.deployment_id}/style.css'.encode(), response.content)
        self.assertIn('no-store', response['Cache-Control'])

    def test_public_connection_failure_returns_503_without_internal_details(self):
        session = self.running()
        with patch('hosting.services.proxy_service.http.client.HTTPConnection') as connection:
            connection.return_value.request.side_effect = ConnectionRefusedError('private host path')
            result = self.client.get(f'/temp/{session.deployment_id}/')
        self.assertEqual(result.status_code, 503)
        self.assertNotIn(b'private host path', result.content)

    def test_legacy_files_are_not_public(self):
        self.assertEqual(self.client.get('/media/temporary_hosting/session_1/preview.log').status_code, 404)
        self.assertEqual(self.client.get('/media/other/../temporary_hosting/session_1/preview.log').status_code, 404)

    def test_delete_removes_selected_configuration_only(self):
        first = self.upload(name='Shared name')
        stop_session(first)
        finish_deployment(first, docker=self.docker)
        second = self.upload(name='Shared name')
        self.assertEqual(delete_saved_system(first.pk), 1)
        self.assertTrue(HostingSession.objects.filter(pk=second.pk).exists())

    def test_runtime_uses_npm_start_and_preserves_command_template(self):
        session = self.upload({'package.json': '{"scripts":{"start":"node server.js"}}', 'server.js': ''}, start_command='node server.js --port {port}')
        safe_extract_zip(session.source_zip, storage_dir(session) / 'app')
        session.project_dir = str(storage_dir(session) / 'app')
        session.project_type = 'node'
        plan = runtime_plan(session)
        self.assertEqual(plan.command[-1], str(session.internal_port))
        self.assertIn('{port}', session.start_command)
        session.start_command = ''
        self.assertEqual(runtime_plan(session).command, ['npm', 'start'])

    @override_settings(DEPLOYMENT_REQUIRE_WORKER=True)
    def test_missing_worker_fails_before_reserving_slot(self):
        with self.assertRaisesRegex(HostingError, 'worker is offline'):
            self.upload()
        self.assertFalse(HostingSession.objects.exists())

    def test_cancel_during_public_response_does_not_deliver_stale_content(self):
        session = self.running()
        upstream = Mock(status=200)
        def stop_then_read(*_):
            stop_session(session)
            return b'stale content'
        upstream.read.side_effect = stop_then_read
        with patch('hosting.services.proxy_service.http.client.HTTPConnection') as connection:
            connection.return_value.getresponse.return_value = upstream
            response = self.client.get(f'/temp/{session.deployment_id}/')
        self.assertEqual(response.status_code, 410)
        self.assertNotIn(b'stale content', response.content)

    def test_preview_link_remains_valid_until_actual_expiry(self):
        session = self.running()
        session.expires_at = timezone.now() + timedelta(milliseconds=900)
        self.assertTrue(session.preview_url)

    def test_legacy_saved_configuration_can_be_imported_and_restarted(self):
        with tempfile.TemporaryDirectory() as media, override_settings(MEDIA_ROOT=media):
            session = HostingSession.objects.create(name='Legacy', project_type='static', status='stopped')
            root = Path(media) / 'temporary_hosting' / f'session_{session.pk}'
            root.mkdir(parents=True)
            (root / 'index.html').write_text('Legacy site')
            session.project_dir = str(root)
            session.save()
            session = restart_session(session)
            self.assertTrue(Path(session.source_zip).is_file())
            session = finish_deployment(session, docker=self.docker)
            with patch('hosting.services.deployment_service.wait_until_healthy'):
                session = deploy(session, self.docker)
            self.assertEqual(session.status, 'running')

    def test_custom_node_entrypoint_without_package_manifest_is_preserved(self):
        session = self.upload({'server.js': ''}, project_type='node', entrypoint='server.js')
        safe_extract_zip(session.source_zip, storage_dir(session) / 'app')
        session.project_dir = str(storage_dir(session) / 'app')
        plan = runtime_plan(session)
        self.assertEqual(plan.command, ['node', 'server.js'])
        self.assertEqual(plan.install, 'true')

    def test_archive_uploads_accept_ruby_and_cpp_with_stop_and_saved_restart(self):
        doc = ArchiveDocument.objects.create(title='Language demos', is_approved=True)
        for runtime, file in [('ruby', 'app.rb'), ('cpp', 'main.cpp')]:
            with self.subTest(runtime=runtime):
                response = self.client.post(f'/api/hosting/archives/{doc.pk}/start/', {
                    'site_zip': zip_upload({file: ''}), 'project_type': runtime,
                }, format='multipart')
                self.assertEqual(response.status_code, 202, response.data)
                session = HostingSession.objects.get(active_slot=1)
                self.assertEqual(session.archive_document_id, doc.pk)
                with patch('hosting.services.deployment_service.wait_until_healthy'):
                    session = deploy(session, self.docker)
                self.assertEqual(session.status, 'running', session.error_message)
                self.assertEqual(session.project_type, runtime)
                deadline = session.expires_at
                stop_session(session)
                finish_deployment(session, docker=self.docker)
                self.assertEqual(self.client.get(f'/temp/{session.deployment_id}/').status_code, 410)
                restart_session(session)
                finish_deployment(session, docker=self.docker)
                with patch('hosting.services.deployment_service.wait_until_healthy'):
                    session = deploy(session, self.docker)
                self.assertEqual(session.status, 'running', session.error_message)
                self.assertGreater(session.expires_at, deadline)
                stop_session(session)
                finish_deployment(session, docker=self.docker)

    def test_new_runtime_build_failures_release_slot_and_preserve_zip(self):
        for runtime, filename, failure in [('ruby', 'app.rb', 'Dependency installation failed (exit 1)'),
                                           ('cpp', 'main.cpp', 'C++ compilation failed (exit 1)')]:
            with self.subTest(runtime=runtime):
                self.docker.build_error = failure
                session = deploy(self.upload({filename: ''}, project_type=runtime), self.docker)
                self.assertEqual(session.status, 'failed')
                self.assertIn(failure, session.error_message)
                self.assertIsNone(session.active_slot)
                self.assertTrue(Path(session.source_zip).is_file())
                self.assertFalse((storage_dir(session) / 'app').exists())

    @override_settings(MAX_UPLOAD_SIZE_MB=1)
    def test_upload_size_limit_is_enforced_and_slot_released(self):
        with self.assertRaisesRegex(HostingError, 'exceeds'):
            create_session_from_upload(SimpleUploadedFile('big.zip', b'x' * 1048577), 'static', self.admin)
        self.assertFalse(HostingSession.objects.filter(active_slot=1).exists())

    @override_settings(MAX_UPLOAD_SIZE_MB=1, FILE_UPLOAD_MAX_MEMORY_SIZE=1024)
    def test_api_rejects_oversized_stream_before_creating_a_deployment(self):
        with tempfile.TemporaryDirectory() as uploads, override_settings(FILE_UPLOAD_TEMP_DIR=uploads):
            response = self.client.post('/api/hosting/start/', {
                'site_zip': SimpleUploadedFile('too-large.zip', b'x' * 1048577),
                'project_type': 'static',
            }, format='multipart')
            self.assertEqual(response.status_code, 413)
            self.assertIn('1 MB', response.json()['detail'])
            self.assertFalse(HostingSession.objects.exists())
            self.assertEqual(list(Path(uploads).iterdir()), [])

    @override_settings(MAX_UPLOAD_SIZE_MB=1)
    def test_archive_upload_has_the_same_streaming_limit(self):
        doc = ArchiveDocument.objects.create(title='Demo', is_approved=True)
        response = self.client.post(f'/api/hosting/archives/{doc.pk}/start/', {
            'site_zip': SimpleUploadedFile('too-large.zip', b'x' * 1048577),
            'project_type': 'static',
        }, format='multipart')
        self.assertEqual(response.status_code, 413)
        self.assertFalse(HostingSession.objects.exists())

    def test_shutdown_during_deployment_fails_cleanly_with_source_retained(self):
        from threading import Event
        session = self.upload()
        stopped = Event()
        stopped.set()
        session = deploy(session, self.docker, stop_event=stopped)
        self.assertEqual(session.status, 'failed')
        self.assertIn('worker stopped', session.error_message)
        self.assertTrue(Path(session.source_zip).is_file())
        self.assertIsNone(session.active_slot)
        self.assertNotIn('start', self.docker.events)

    def test_cancel_slow_docker_command_reaps_the_cli(self):
        from hosting.services.deployment_service import DeploymentCancelled
        with patch('hosting.services.docker_service.subprocess.Popen') as launch:
            process = launch.return_value
            process.poll.return_value = None
            with self.assertRaises(DeploymentCancelled):
                DockerService().command('pull', 'example-image', cancelled=Mock(side_effect=DeploymentCancelled('cancelled')))
            process.kill.assert_called_once()
            process.wait.assert_called_once()

    def test_transient_failed_health_check_recovers_without_resetting_deadline(self):
        session = self.running()
        deadline = session.expires_at
        with patch('hosting.services.deployment_service.check_http', return_value=(False, 'temporary timeout')):
            session = reconcile_deployment(session, self.docker)
        self.assertEqual(session.status, 'running')
        self.assertEqual(session.health_status, 'degraded')
        self.assertEqual(session.health_failures, 1)
        with patch('hosting.services.deployment_service.check_http', return_value=(True, 'HTTP 200')):
            reconcile_deployment(session, self.docker, startup=True)
        session.refresh_from_db()
        self.assertEqual(session.status, 'running')
        self.assertEqual(session.health_status, 'healthy')
        self.assertEqual(session.health_failures, 0)
        self.assertEqual(session.expires_at, deadline)

    @override_settings(DEPLOYMENT_HEALTHCHECK_FAILURES=3)
    def test_repeated_health_failures_are_persisted_then_cleaned(self):
        session = self.running()
        with patch('hosting.services.deployment_service.check_http', return_value=(False, 'HTTP 503')):
            for expected in (1, 2):
                session = reconcile_deployment(HostingSession.objects.get(pk=session.pk), self.docker, startup=True)
                self.assertEqual(session.health_failures, expected)
                self.assertEqual(session.status, 'running')
            session = reconcile_deployment(HostingSession.objects.get(pk=session.pk), self.docker)
        self.assertEqual(session.status, 'failed')
        self.assertIsNone(session.active_slot)
        self.assertIn('3/3', read_logs(session))


@override_settings(DEPLOYMENT_MAX_FILES=100, DEPLOYMENT_MAX_EXTRACTED_MB=1)
class ArchiveSecurityTests(TestCase):
    def test_traversal_absolute_windows_and_symlink_paths_are_rejected(self):
        for name in ('../escape/index.html', '../../etc/passwd', '/etc/passwd', 'C:/Windows/file', 'folder\\..\\file'):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as tmp:
                with self.assertRaises(HostingError):
                    safe_extract_zip(zip_upload({name: 'bad'}), tmp)
        data = io.BytesIO()
        with zipfile.ZipFile(data, 'w') as archive:
            info = zipfile.ZipInfo('link')
            info.create_system = 3
            info.external_attr = 0o120777 << 16
            archive.writestr(info, '/etc/passwd')
        data.seek(0)
        with tempfile.TemporaryDirectory() as tmp, self.assertRaisesRegex(HostingError, 'symbolic links'):
            safe_extract_zip(data, tmp)

    def test_zip_bomb_and_file_count_limits(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(HostingError, 'size limit'):
                safe_extract_zip(zip_upload({'index.html': b'x' * 1048577}), tmp)
            with self.assertRaisesRegex(HostingError, 'too many files'):
                safe_extract_zip(zip_upload({f'{i}.txt': '' for i in range(101)}), tmp)

    def test_environment_files_are_excluded(self):
        with tempfile.TemporaryDirectory() as tmp:
            safe_extract_zip(zip_upload({'index.html': 'safe', '.env': 'secret', '.env.production': 'secret'}), tmp)
            self.assertEqual([p.name for p in Path(tmp).iterdir()], ['index.html'])

    def test_flat_and_nested_roots(self):
        with tempfile.TemporaryDirectory() as tmp:
            safe_extract_zip(zip_upload({'one/two/index.html': 'works', '__MACOSX/file': 'ignore'}), tmp)
            self.assertEqual(normalize_project_root(tmp).name, 'two')
