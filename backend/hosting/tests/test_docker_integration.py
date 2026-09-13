"""Opt-in tests using real Docker containers; no application dependencies touch the host."""
import os
import json
import socket
import tempfile
import subprocess
import sys
import time
from datetime import timedelta
from pathlib import Path
from unittest import skipUnless

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from hosting.models import HostingSession
from hosting.services.deployment_service import (create_session_from_upload, deploy, stop_session,
    restart_session, finish_deployment, reconcile_deployment)
from hosting.services.docker_service import DockerService, OWNER_LABEL
from hosting.services.log_service import read_logs
from .test_lifecycle import zip_upload


@skipUnless(os.getenv('RUN_DOCKER_HOSTING_TESTS') == '1', 'Set RUN_DOCKER_HOSTING_TESTS=1 with a local Docker daemon.')
@override_settings(DEPLOYMENT_REQUIRE_WORKER=False, DEPLOYMENT_BASE_DOMAIN='', DEPLOYMENT_PUBLIC_ORIGIN='',
                   DEPLOYMENT_DURATION_MINUTES=30, HEALTHCHECK_TIMEOUT_SECONDS=15)
class DockerLifecycleTests(TransactionTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        override = override_settings(DEPLOYMENT_STORAGE_PATH=self.temp.name)
        override.enable()
        self.addCleanup(override.disable)
        self.admin = get_user_model().objects.create_user('docker-admin@example.test', 'test-password', role='admin')
        self.docker = DockerService()
        self.client = APIClient()
        self.addCleanup(self.remove_test_resources)

    def remove_test_resources(self):
        for session in HostingSession.objects.all():
            self.docker.cleanup(session)

    def launch(self, files=None, runtime='auto'):
        session = create_session_from_upload(zip_upload(files), runtime, self.admin)
        return deploy(session, self.docker)

    def assert_running(self, session):
        self.assertEqual(session.status, 'running', session.error_message + '\n' + read_logs(session))
        response = self.client.get(f'/temp/{session.deployment_id}/')
        self.assertEqual(response.status_code, 200, response.content)
        info = self.docker.inspect(session.container_name)
        self.assertEqual(info['HostConfig']['Privileged'], False)
        self.assertEqual(info['Config']['User'], '10001:10001')
        self.assertEqual(info['HostConfig']['PidsLimit'], 128)
        self.assertFalse(info['HostConfig']['Binds'])
        self.assertNotIn('SECRET_KEY=', '\n'.join(info['Config']['Env']))
        self.assertEqual(self.docker.port_info(session)['NetworkSettings']['Ports'][f'{session.internal_port}/tcp'][0]['HostIp'], '127.0.0.1')
        networks = list(info['NetworkSettings']['Networks'])
        self.assertEqual(len(networks), 1)
        self.assertTrue(__import__('json').loads(self.docker.command('network', 'inspect', networks[0]))[0]['Internal'])
        return response

    def test_static_public_stop_restart_expire_and_original_countdown(self):
        # An occupied old fixed port must not affect Docker's dynamic allocation.
        with socket.socket() as occupied:
            occupied.bind(('127.0.0.1', 0))
            occupied.listen()
            session = self.launch({'index.html': '<h1>Live static site</h1><link href="/style.css">', 'style.css': 'body{color:green}'})
            response = self.assert_running(session)
            self.assertIn(b'Live static site', response.content)
            self.assertNotEqual(session.port, occupied.getsockname()[1])
            self.assertEqual(self.client.get(f'/temp/{session.deployment_id}/style.css').status_code, 200)
        deadline = session.expires_at
        self.assertEqual(deadline - session.started_at, timedelta(minutes=30))
        original_container = session.container_id
        reconcile_deployment(session, self.docker, startup=True)
        session.refresh_from_db()
        self.assertEqual(session.expires_at, deadline)
        self.assertEqual(session.container_id, original_container)
        stop_session(session)
        self.assertEqual(self.client.get(f'/temp/{session.deployment_id}/').status_code, 410)
        finish_deployment(session, docker=self.docker)
        self.assertIsNone(self.docker.inspect(session.container_name))
        stop_session(session)
        restart_session(session)
        finish_deployment(session, docker=self.docker)
        session.refresh_from_db()
        session = deploy(session, self.docker)
        self.assert_running(session)
        self.assertNotEqual(session.container_id, original_container)
        self.assertGreater(session.expires_at, deadline)
        self.assertEqual(session.expires_at - session.started_at, timedelta(minutes=30))
        HostingSession.objects.filter(pk=session.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
        reconcile_deployment(session, self.docker, startup=True)
        session.refresh_from_db()
        self.assertEqual(session.status, 'expired')
        self.assertIsNone(self.docker.inspect(session.container_name))
        self.assertEqual(self.client.get(f'/temp/{session.deployment_id}/').status_code, 410)
        self.assertTrue(Path(session.source_zip).is_file())
        self.assertIn('Deployment expired', read_logs(session))

    def test_nested_static_site(self):
        session = self.launch({'outer/site/index.html': 'Nested works', '__MACOSX/junk': ''})
        self.assertIn(b'Nested works', self.assert_running(session).content)

    def test_node_dependency_failure_then_success_and_application_crash(self):
        failed = self.launch({'package.json': json.dumps({'scripts': {'preinstall': 'node -e "process.exit(19)"', 'start': 'node server.js'}}), 'server.js': ''}, 'node')
        self.assertEqual(failed.status, 'failed', read_logs(failed))
        self.assertIn('Dependency installation failed', failed.error_message)
        self.assertIsNone(failed.active_slot)
        session = self.launch({'package.json': '{"scripts":{"start":"node server.js"}}',
            'server.js': 'require("http").createServer((req,res)=>res.end("Node works")).listen(process.env.PORT,"0.0.0.0")'}, 'node')
        self.assertIn(b'Node works', self.assert_running(session).content)
        self.docker.command('kill', session.container_name)
        reconcile_deployment(session, self.docker)
        session.refresh_from_db()
        self.assertEqual(session.status, 'failed')
        self.assertIsNotNone(session.exit_code)
        self.assertIn('Container exited unexpectedly', read_logs(session))

    def test_python_and_php_launch_without_host_dependencies(self):
        session = self.launch({'requirements.txt': '', 'app.py': 'import os\nfrom http.server import HTTPServer, SimpleHTTPRequestHandler\nHTTPServer(("0.0.0.0", int(os.environ["PORT"])), SimpleHTTPRequestHandler).serve_forever()\n', 'index.html': 'Python works'}, 'python')
        self.assertIn(b'Python works', self.assert_running(session).content)
        stop_session(session)
        finish_deployment(session, docker=self.docker)
        session = self.launch({'index.php': '<?php echo "PHP works";'}, 'php')
        self.assertIn(b'PHP works', self.assert_running(session).content)

    @override_settings(
        DEPLOYMENT_INSTANCE_ID='python-mysql-tests',
        DEPLOYMENT_IMAGES={**settings.DEPLOYMENT_IMAGES, 'python': settings.DEPLOYMENT_FULLSTACK_PYTHON_IMAGE},
        HEALTHCHECK_TIMEOUT_SECONDS=30,
    )
    def test_standalone_python_builds_pinned_mysqlclient_and_imports_dependencies(self):
        versions = {
            'Django': '5.1.1', 'Pillow': '10.4.0', 'reportlab': '4.2.2',
            'openpyxl': '3.1.5', 'requests': '2.32.3', 'mysqlclient': '2.2.4',
        }
        application = '''import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from importlib.metadata import version
import django
import PIL
import reportlab
import openpyxl
import requests
import MySQLdb

payload = json.dumps({
    "versions": {name: version(name) for name in
                 ("Django", "Pillow", "reportlab", "openpyxl", "requests", "mysqlclient")},
    "mysql_driver": MySQLdb.__name__,
}).encode()

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

HTTPServer(("0.0.0.0", int(os.environ["PORT"])), Handler).serve_forever()
'''
        try:
            session = self.launch({
                'requirements.txt': ''.join(f'{name}=={version}\n' for name, version in versions.items()),
                'app.py': application,
            }, 'python')
            response = self.assert_running(session)
            self.assertEqual(response.json(), {'versions': versions, 'mysql_driver': 'MySQLdb'})
            self.assertEqual(
                self.docker.inspect(session.container_name)['Config']['Labels'][OWNER_LABEL],
                'python-mysql-tests',
            )
        finally:
            # The test-only owner override ends before TestCase's registered
            # cleanups; remove these resources while that owner is still active.
            self.remove_test_resources()

    def test_immediate_startup_failure_keeps_exit_code_and_runtime_logs(self):
        session = self.launch({'package.json': '{"scripts":{"start":"node server.js"}}', 'server.js': 'console.error("broken application entrypoint");process.exit(23)'}, 'node')
        self.assertEqual(session.status, 'failed', read_logs(session))
        self.assertEqual(session.exit_code, 23)
        self.assertIn('broken application entrypoint', read_logs(session))
        self.assertIsNone(session.active_slot)
        self.assertIsNone(session.port)

    def test_ruby_bundle_failure_then_rack_website(self):
        failed = self.launch({'Gemfile': 'this is not valid Ruby {{{', 'config.ru': ''}, 'ruby')
        self.assertEqual(failed.status, 'failed', read_logs(failed))
        self.assertIn('Dependency installation failed', failed.error_message)
        self.assertIsNone(failed.active_slot)
        root = Path(__file__).resolve().parents[1] / 'examples' / 'ruby'
        session = self.launch({file.name: file.read_text() for file in root.iterdir() if file.is_file()})
        self.assertEqual(session.project_type, 'ruby')
        self.assertIn(b'Ruby hosting works!', self.assert_running(session).content)
        self.assertIn('Bundle complete', read_logs(session))

    def test_cpp_compile_failure_then_http_website(self):
        failed = self.launch({'main.cpp': 'this will not compile'}, 'cpp')
        self.assertEqual(failed.status, 'failed', read_logs(failed))
        self.assertIn('C++ compilation failed', failed.error_message)
        self.assertIsNone(failed.active_slot)
        self.assertIsNotNone(failed.exit_code)
        self.assertIn('error:', read_logs(failed))
        root = Path(__file__).resolve().parents[1] / 'examples' / 'cpp'
        session = self.launch({'main.cpp': (root / 'main.cpp').read_text()})
        self.assertEqual(session.project_type, 'cpp')
        self.assertIn(b'C++ hosting works!', self.assert_running(session).content)
        self.assertIn('C++ compilation completed', read_logs(session))

    def test_worker_restart_keeps_deadline_and_expires_without_web_requests(self):
        if connection.vendor != 'postgresql':
            self.skipTest('Worker-process test requires the disposable PostgreSQL database.')
        session = create_session_from_upload(zip_upload(), 'static', self.admin)
        environment = dict(os.environ, HOSTING_TEST_DATABASE=connection.settings_dict['NAME'],
                           DEPLOYMENT_STORAGE_PATH=self.temp.name, HOSTING_TEST_DURATION_SECONDS='12')
        command = [sys.executable, str(Path(__file__).resolve().parents[2] / 'manage.py'),
                   'hosting_worker', '--settings=hosting.test_settings']
        # tests/ -> hosting/ -> backend/
        command[1] = str(Path(__file__).resolve().parents[2] / 'manage.py')
        output = open(Path(self.temp.name) / 'worker-output.log', 'w+')
        self.addCleanup(output.close)
        worker = subprocess.Popen(command, env=environment, stdout=output, stderr=subprocess.STDOUT)
        def terminate():
            if worker.poll() is None:
                worker.kill()
                worker.wait(timeout=10)
        self.addCleanup(terminate)
        end = time.monotonic() + 60
        while time.monotonic() < end:
            session.refresh_from_db()
            if session.status in ('running', 'failed') or worker.poll() is not None:
                break
            time.sleep(0.2)
        output.flush()
        output.seek(0)
        self.assertEqual(session.status, 'running', session.error_message + output.read())
        deadline = session.expires_at
        self.assertEqual(deadline - session.started_at, timedelta(seconds=12))
        worker.kill()
        worker.wait(timeout=10)
        # A new Django/worker process must reconcile rather than create a new session.
        worker = subprocess.Popen(command, env=environment, stdout=output, stderr=subprocess.STDOUT)
        end = time.monotonic() + 30
        while time.monotonic() < end:
            session.refresh_from_db()
            self.assertEqual(session.expires_at, deadline)
            if session.status == 'expired':
                break
            time.sleep(0.2)
        output.flush()
        output.seek(0)
        self.assertEqual(session.status, 'expired', session.error_message + output.read())
        self.assertIsNone(self.docker.inspect(session.container_name))
        self.assertIsNone(self.docker.port_info(session))
        self.assertEqual(self.client.get(f'/temp/{session.deployment_id}/').status_code, 410)
