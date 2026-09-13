import tempfile
from datetime import timedelta
from pathlib import Path
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone

from hosting.models import HostingSession
from hosting.services.archive_service import storage_dir
from hosting.services.deployment_service import (
    create_session_from_upload, deploy, finish_deployment, reconcile_deployment,
    restart_session, stop_session,
)
from hosting.services.docker_service import DockerService
from hosting.services.errors import HostingError
from hosting.services.fullstack_docker import FullStackDocker
from hosting.services.runtime_service import runtime_plan
from hosting.services.tunnel_service import CloudflareTunnel, QUICK_URL, public_route_ready, tunnel_hostname
from .test_lifecycle import SimulatedDocker, zip_upload


@override_settings(DEPLOYMENT_TUNNEL_ENABLED=True, DEPLOYMENT_REQUIRE_WORKER=False)
class CloudflareTunnelTests(TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        settings = override_settings(DEPLOYMENT_STORAGE_PATH=directory.name)
        settings.enable()
        self.addCleanup(settings.disable)
        self.user = get_user_model().objects.create_user('tunnel@example.test', 'test', role='admin')
        self.session = create_session_from_upload(zip_upload(), 'static', self.user)
        self.docker = SimulatedDocker()
        probe = patch('hosting.services.tunnel_service.public_route_ready', return_value=(True, ''))
        probe.start()
        self.addCleanup(probe.stop)

    def connect(self, session, cancelled):
        cancelled()
        session.tunnel_url = 'https://research-preview-example.trycloudflare.com/'
        session.save(update_fields=['tunnel_url'])

    def launch(self):
        with patch.object(CloudflareTunnel, 'start', side_effect=self.connect), \
                patch.object(CloudflareTunnel, 'is_running', return_value=True), \
                patch('hosting.services.deployment_service.wait_until_healthy'):
            return deploy(self.session, self.docker)

    def test_each_run_uses_cloudflare_and_restart_clears_the_old_url(self):
        session = self.launch()
        self.assertEqual(session.status, 'running')
        self.assertEqual(session.preview_url, session.tunnel_url)
        self.assertIn('.trycloudflare.com/', session.preview_url)
        original_expiry = session.expires_at
        self.assertEqual(runtime_plan(session).environment['PUBLIC_URL'], '/')
        self.assertEqual(runtime_plan(session).environment['HOSTING_PUBLIC_ORIGIN'], session.tunnel_url.rstrip('/'))
        restart_session(session)
        session.refresh_from_db()
        self.assertEqual(session.preview_url, '')
        finish_deployment(session, docker=self.docker)
        session.refresh_from_db()
        self.assertEqual(session.tunnel_url, '')
        self.assertEqual(session.status, 'uploaded')
        self.assertIsNone(session.expires_at)
        self.assertIsNotNone(original_expiry)
        self.assertTrue(Path(session.source_zip).exists())

    def test_cloudflare_failure_never_reports_a_local_url_or_running_site(self):
        with patch.object(CloudflareTunnel, 'start', side_effect=HostingError('Cloudflare connection timed out')):
            session = deploy(self.session, self.docker)
        self.assertEqual(session.status, 'failed')
        self.assertIsNone(session.active_slot)
        self.assertEqual(session.preview_url, '')
        self.assertIn('Cloudflare', session.error_message)
        self.assertNotIn('build', self.docker.events)
        self.assertEqual(self.docker.events[-1], 'cleanup')

    def test_unexpected_tunnel_exit_closes_the_deployment(self):
        session = self.launch()
        with patch.object(CloudflareTunnel, 'is_running', return_value=False):
            reconcile_deployment(session, self.docker)
        session.refresh_from_db()
        self.assertEqual(session.status, 'failed')
        self.assertEqual(session.tunnel_url, '')
        self.assertIsNone(session.active_slot)

    def test_tunnel_stopping_during_build_prevents_publication(self):
        with patch.object(CloudflareTunnel, 'start', side_effect=self.connect), \
                patch.object(CloudflareTunnel, 'is_running', return_value=False), \
                patch('hosting.services.deployment_service.wait_until_healthy'):
            session = deploy(self.session, self.docker)
        self.assertEqual(session.status, 'failed')
        self.assertEqual(session.preview_url, '')
        self.assertEqual(session.tunnel_url, '')

    def test_proxy_uses_public_origin_and_routes_api_paths_to_the_uploaded_app(self):
        session = self.launch()
        upstream = Mock(status=200)
        upstream.read.return_value = b'app response'
        upstream.getheader.side_effect = lambda key, default=None: 'text/plain' if key == 'Content-Type' else default
        upstream.getheaders.return_value = [('Set-Cookie', 'sessionid=app-session; Path=/; Secure; HttpOnly')]
        with patch('hosting.services.proxy_service.http.client.HTTPConnection') as connection:
            connection.return_value.getresponse.return_value = upstream
            response = self.client.post('/api/auth/me/', {'value': 'example'},
                HTTP_HOST=tunnel_hostname(session), HTTP_ORIGIN=session.tunnel_url.rstrip('/'),
                HTTP_COOKIE='sessionid=app-session', HTTP_X_CSRFTOKEN='app-csrf')
        self.assertEqual(response.content, b'app response')
        self.assertEqual(response.status_code, 200)
        args = connection.return_value.request.call_args
        self.assertEqual(args.args[:2], ('POST', '/api/auth/me/'))
        self.assertEqual(args.kwargs['headers']['Host'], 'research-preview-example.trycloudflare.com')
        self.assertEqual(args.kwargs['headers']['X-Forwarded-Proto'], 'https')
        self.assertEqual(args.kwargs['headers']['Cookie'], 'sessionid=app-session')
        self.assertEqual(args.kwargs['headers']['X-CSRFToken'], 'app-csrf')
        self.assertTrue(response.cookies['sessionid']['secure'])
        self.assertEqual(response.cookies['sessionid']['domain'], '')

    def test_expiry_and_stop_block_public_requests_even_before_worker_cleanup(self):
        session = self.launch()
        HostingSession.objects.filter(pk=session.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
        with patch('hosting.services.proxy_service.http.client.HTTPConnection') as connection:
            self.assertEqual(self.client.get('/', HTTP_HOST=tunnel_hostname(session)).status_code, 410)
            connection.assert_not_called()
        HostingSession.objects.filter(pk=session.pk).update(expires_at=timezone.now() + timedelta(minutes=10))
        stop_session(session)
        with patch('hosting.services.proxy_service.http.client.HTTPConnection') as connection:
            self.assertEqual(self.client.get('/api/auth/me/', HTTP_HOST=tunnel_hostname(session)).status_code, 410)
            connection.assert_not_called()
        self.assertEqual(self.client.get('/api/auth/me/', HTTP_HOST='unknown.tunnel.preview.localhost').status_code, 404)

    def test_fullstack_uses_cloudflare_for_its_canonical_origin(self):
        self.session.tunnel_url = 'https://research-preview-example.trycloudflare.com/'
        environment = FullStackDocker(DockerService()).database_environment(self.session, {'engine': 'sqlite', 'secret_key': 'test', 'password': 'test'})
        self.assertEqual(environment['HOSTING_PUBLIC_ORIGIN'], self.session.tunnel_url.rstrip('/'))
        self.assertIn('research-preview-example.trycloudflare.com', environment['ALLOWED_HOSTS'])

    def test_connector_waits_for_registration_and_only_accepts_cloudflare_urls(self):
        docker = Mock()
        docker.names.return_value = ('temporary_test', '', '')
        docker.labels.return_value = []
        logs = [
            'https://research-preview-example.trycloudflare.com\n',
            'https://research-preview-example.trycloudflare.com\nRegistered tunnel connection\n',
        ]
        def capture(*args):
            directory = storage_dir(self.session) / 'logs'
            directory.mkdir(parents=True, exist_ok=True)
            (directory / 'tunnel.log').write_text(logs.pop(0))
            self.session.refresh_from_db()
            self.assertEqual(self.session.tunnel_url, '')
            return {'State': {'Running': True}}
        docker.capture_logs.side_effect = capture
        with patch('hosting.services.tunnel_service.time.sleep'):
            url = CloudflareTunnel(docker).start(self.session, Mock())
        self.assertEqual(url, 'https://research-preview-example.trycloudflare.com/')
        self.assertEqual(docker.capture_logs.call_count, 2)
        command = docker.command.call_args_list[0].args
        self.assertIn('--http-host-header', command)
        self.assertIn(tunnel_hostname(self.session), command)
        self.assertIn('127.0.0.1:0', command)
        self.assertNotIn('--volume', command)
        self.assertIsNone(QUICK_URL.search('https://demo.trycloudflare.com.evil.example'))
        self.assertIsNone(QUICK_URL.search('https://example.com'))

    @override_settings(DEPLOYMENT_TUNNEL_ORIGIN='https://example.com/admin/')
    def test_connector_rejects_a_nonlocal_or_path_origin(self):
        docker = Mock()
        with self.assertRaisesRegex(HostingError, 'local backend'):
            CloudflareTunnel(docker).start(self.session, Mock())
        docker.command.assert_not_called()

    @override_settings(DEPLOYMENT_TUNNEL_TIMEOUT_SECONDS=0)
    def test_connector_times_out_without_returning_a_fake_link(self):
        docker = Mock()
        docker.names.return_value = ('temporary_test', '', '')
        docker.labels.return_value = []
        with self.assertRaisesRegex(HostingError, 'timed out'):
            CloudflareTunnel(docker).start(self.session, Mock())
        self.session.refresh_from_db()
        self.assertEqual(self.session.tunnel_url, '')

    def test_cleanup_removes_cloudflare_before_the_application(self):
        docker = DockerService()
        name = docker.names(self.session)[0]
        with patch.object(docker, 'capture_logs', return_value=None), \
                patch.object(docker, 'remove_container') as remove, \
                patch.object(docker, 'command', return_value=''):
            docker.cleanup(self.session)
        self.assertEqual(remove.call_args_list[0].args[0], name + '_tunnel')
        self.assertEqual(remove.call_args_list[1].args[0], name + '_proxy')

    def test_public_probe_requires_the_correct_deployment_and_unpublished_state(self):
        from urllib.error import HTTPError
        from email.message import Message
        headers = Message()
        headers['X-Hosting-Deployment'] = str(self.session.deployment_id)
        url = 'https://research-preview-example.trycloudflare.com/'
        with patch('hosting.services.tunnel_service.build_opener') as opener:
            opener.return_value.open.side_effect = HTTPError(url, 410, 'Gone', headers, None)
            self.assertTrue(public_route_ready(url, self.session, 1)[0])
        headers.replace_header('X-Hosting-Deployment', 'a-different-deployment')
        with patch('hosting.services.tunnel_service.build_opener') as opener:
            opener.return_value.open.side_effect = HTTPError(url, 410, 'Gone', headers, None)
            self.assertFalse(public_route_ready(url, self.session, 1)[0])
        with patch('hosting.services.tunnel_service.build_opener') as opener:
            opener.return_value.open.side_effect = OSError('DNS unavailable')
            self.assertEqual(public_route_ready(url, self.session, 1), (False, 'DNS unavailable'))
