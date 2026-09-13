"""Opt-in real Internet checks using disposable data and labeled Docker resources.

RUN_CLOUDFLARE_HOSTING_TESTS=1 python manage.py test \
    hosting.tests.test_cloudflare_integration --settings=hosting.test_settings
"""
import json
import os
import tempfile
import time
from datetime import timedelta
from http.cookiejar import CookieJar
from unittest import skipUnless
from urllib.error import HTTPError, URLError
from urllib.request import HTTPCookieProcessor, Request, build_opener

from django.contrib.auth import get_user_model
from django.test import LiveServerTestCase, override_settings
from django.utils import timezone

from hosting.models import HostingSession
from hosting.services.deployment_service import (
    create_session_from_upload, deploy, finish_deployment, restart_session, stop_session,
)
from hosting.services.docker_service import DockerService
from hosting.services.log_service import read_logs
from hosting.services.public_http import TunnelHTTPSHandler
from .test_fullstack_docker import fullstack_files
from .test_lifecycle import zip_upload


@skipUnless(os.getenv('RUN_CLOUDFLARE_HOSTING_TESTS') == '1', 'Requires explicit public Cloudflare/Docker integration testing.')
@override_settings(DEPLOYMENT_TUNNEL_ENABLED=True, DEPLOYMENT_REQUIRE_WORKER=False,
                   DEPLOYMENT_INSTANCE_ID='cloudflare-integration-tests')
class CloudflareInternetTests(LiveServerTestCase):
    host = '127.0.0.1'

    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='cloudflare-integration-')
        self.addCleanup(directory.cleanup)
        settings = override_settings(DEPLOYMENT_STORAGE_PATH=directory.name,
                                     DEPLOYMENT_TUNNEL_ORIGIN=self.live_server_url)
        settings.enable()
        self.addCleanup(settings.disable)
        self.docker = DockerService()
        self.sessions = []
        self.addCleanup(self.cleanup_deployments)
        self.user = get_user_model().objects.create_user('cloudflare-test@example.test', 'test', role='admin')
        self.cookies = CookieJar()
        self.http = build_opener(TunnelHTTPSHandler(), HTTPCookieProcessor(self.cookies))

    def cleanup_deployments(self):
        for session in self.sessions:
            self.docker.cleanup(session)
            if session.project_type == 'fullstack':
                self.docker.purge_data(session)

    def launch(self, files):
        session = create_session_from_upload(zip_upload(files), 'auto', self.user)
        self.sessions.append(session)
        session = deploy(session, self.docker)
        self.assertEqual(session.status, 'running', session.error_message + '\n' + read_logs(session))
        self.assertRegex(session.preview_url, r'^https://[a-z0-9-]+\.trycloudflare\.com/$')
        return session

    def fetch(self, url, data=None, headers=None):
        try:
            with self.http.open(Request(url, data=data, headers=headers or {}), timeout=10) as response:
                return response.status, response.read(1024 * 1024)
        except HTTPError as error:
            return error.code, error.read(1024 * 1024)

    def wait_public(self, session, marker):
        deadline = time.monotonic() + 120
        status, content = None, b''
        last_error = ''
        while time.monotonic() < deadline:
            try:
                status, content = self.fetch(session.preview_url)
                if status == 200 and marker in content:
                    print('Verified public HTTPS response:', session.preview_url, flush=True)
                    return
            except (URLError, TimeoutError, OSError) as error:
                last_error = str(error)
            time.sleep(1)
        self.fail(f'Cloudflare URL did not serve the expected app: HTTP {status}, {content[:300]!r}, {last_error}\n{read_logs(session)}')

    def test_public_site_assets_expiry_and_restart_get_a_new_url(self):
        session = self.launch({'index.html': '<h1>Cloudflare isolated test</h1><script src="/app.js"></script>',
                               'app.js': 'window.previewWorking=true;'})
        self.wait_public(session, b'Cloudflare isolated test')
        old_url = session.preview_url
        self.assertEqual(self.fetch(old_url + 'app.js'), (200, b'window.previewWorking=true;'))
        HostingSession.objects.filter(pk=session.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.fetch(old_url)[0], 410)
        finish_deployment(session, target='expired', docker=self.docker)
        session = restart_session(session)
        finish_deployment(session, docker=self.docker)
        session.refresh_from_db()
        session = deploy(session, self.docker)
        self.assertEqual(session.status, 'running', session.error_message + '\n' + read_logs(session))
        self.assertNotEqual(session.preview_url, old_url)
        self.wait_public(session, b'Cloudflare isolated test')
        stop_session(session)
        self.assertEqual(self.fetch(session.tunnel_url)[0], 410)
        finish_deployment(session, docker=self.docker)
        self.assertIsNone(self.docker.inspect(self.docker.names(session)[0] + '_tunnel'))

    def test_fullstack_frontend_api_and_csrf_work_over_public_https(self):
        files = fullstack_files()
        files['backend/items/views.py'] += b'''\nfrom django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
@ensure_csrf_cookie
def csrf_check(request):
    return JsonResponse({'csrf': get_token(request), 'origin': request.build_absolute_uri('/')})
'''
        files['backend/sample/urls.py'] += b"\nfrom items.views import csrf_check\nurlpatterns += [path('api/csrf-check/', csrf_check)]\n"
        session = self.launch(files)
        self.wait_public(session, b'<!doctype html>')
        status, content = self.fetch(session.preview_url + 'api/csrf-check/')
        self.assertEqual(status, 200, content)
        body = json.loads(content)
        self.assertEqual(body['origin'], session.preview_url)
        self.assertTrue(any(cookie.name == 'csrftoken' and cookie.secure for cookie in self.cookies))
        status, content = self.fetch(session.preview_url + 'api/csrf-check/', data=b'{}', headers={
            'Content-Type': 'application/json', 'Origin': session.preview_url.rstrip('/'),
            'X-CSRFToken': body['csrf'],
        })
        self.assertEqual(status, 200, content)
        status, content = self.fetch(session.preview_url + 'api/items/', data=b'{"name":"Public test item"}',
                                     headers={'Content-Type': 'application/json'})
        self.assertEqual(status, 201, content)
        self.assertIn(b'Public test item', self.fetch(session.preview_url + 'api/items/')[1])
        stop_session(session)
        self.assertEqual(self.fetch(session.tunnel_url)[0], 410)
        finish_deployment(session, docker=self.docker)
