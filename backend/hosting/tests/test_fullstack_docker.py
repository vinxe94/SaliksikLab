"""Opt-in full-stack integration tests against a local Docker daemon.

Run with the isolated platform database:
    RUN_DOCKER_HOSTING_TESTS=1 python manage.py test \
        hosting.tests.test_fullstack_docker --settings=hosting.test_settings

PostgreSQL/MySQL containers additionally require
RUN_DOCKER_HOSTING_DATABASE_TESTS=1. All deployment resources carry a test-only
owner label, and every test removes its containers, images, networks and volumes.
"""
import http.client
import json
import os
import sqlite3
import tempfile
from datetime import timedelta
from pathlib import Path
from unittest import skipUnless

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from hosting.models import HostingSession
from hosting.services.archive_service import storage_dir
from hosting.services.deployment_service import (
    create_session_from_upload,
    delete_saved_system,
    deploy,
    finish_deployment,
    reconcile_deployment,
    restart_session,
    stop_session,
)
from hosting.services.docker_service import DockerService, LABEL, OWNER_LABEL
from hosting.services.log_service import read_logs

from .test_lifecycle import zip_upload


FIXTURE = Path(__file__).resolve().parents[1] / 'examples' / 'fullstack'


def fullstack_files(engine='sqlite'):
    """Read only fixture sources; local build/cache output never enters a ZIP."""
    ignored = {'__pycache__', '.venv', 'node_modules', 'dist'}
    files = {
        path.relative_to(FIXTURE).as_posix(): path.read_bytes()
        for path in FIXTURE.rglob('*')
        if path.is_file() and not ignored.intersection(path.relative_to(FIXTURE).parts)
    }
    manifest = json.loads(files['hosting.json'])
    manifest['database']['engine'] = engine
    files['hosting.json'] = json.dumps(manifest)
    if engine == 'postgresql':
        files['backend/requirements.txt'] += b'psycopg[binary]>=3.1,<4\n'
    elif engine == 'mysql':
        files['backend/requirements.txt'] += b'mysqlclient>=2.2,<3\n'
    return files


@skipUnless(
    os.getenv('RUN_DOCKER_HOSTING_TESTS') == '1',
    'Set RUN_DOCKER_HOSTING_TESTS=1 with a local Docker daemon.',
)
@override_settings(
    DEPLOYMENT_REQUIRE_WORKER=False,
    DEPLOYMENT_INSTANCE_ID='fullstack-tests',
    DEPLOYMENT_BASE_DOMAIN='previews.localhost',
    DEPLOYMENT_PUBLIC_SCHEME='http',
    DEPLOYMENT_PUBLIC_ORIGIN='',
    DEPLOYMENT_DURATION_MINUTES=30,
    HEALTHCHECK_TIMEOUT_SECONDS=30,
)
class FullstackDockerTests(TransactionTestCase):
    def setUp(self):
        self.assertEqual(
            connection.vendor, 'sqlite',
            'Use --settings=hosting.test_settings with no HOSTING_TEST_POSTGRES_PORT.',
        )
        temporary = tempfile.TemporaryDirectory(prefix='hosting-fullstack-tests-')
        self.addCleanup(temporary.cleanup)
        override = override_settings(DEPLOYMENT_STORAGE_PATH=temporary.name)
        override.enable()
        self.addCleanup(override.disable)
        self.admin = get_user_model().objects.create_user(
            'fullstack-tests@example.test', 'test-password', role='admin',
        )
        self.docker = DockerService()
        self.client = APIClient()
        self.sessions = []
        self.addCleanup(self.remove_test_resources)

    def remove_test_resources(self):
        failures = []
        for session in self.sessions:
            try:
                if HostingSession.objects.filter(pk=session.pk).exists():
                    self.docker.cleanup(session)
                self.docker.purge_data(session)
            except Exception as exc:
                failures.append(f'{session.deployment_id}: {exc}')
        self.assertFalse(failures, 'Test resource cleanup failed: ' + '; '.join(failures))

    def launch(self, files=None, engine='sqlite'):
        session = create_session_from_upload(
            zip_upload(fullstack_files(engine) if files is None else files), 'auto', self.admin,
        )
        self.sessions.append(session)
        return deploy(session, self.docker)

    def request(self, session, path='/', method='get', data=None):
        kwargs = {'HTTP_HOST': f'{session.deployment_id}.previews.localhost'}
        if data is not None:
            kwargs.update(data=data, format='json')
        return getattr(self.client, method)(path, **kwargs)

    def assert_running(self, session):
        self.assertEqual(session.status, 'running', session.error_message + '\n' + read_logs(session))
        self.assertIn('.previews.localhost/', session.preview_url)
        response = self.request(session)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertIn(b'Full-stack hosting works!', response.content)
        health = self.request(session, '/api/health/')
        self.assertEqual(health.status_code, 200, health.content)
        self.assertTrue(health.json()['healthy'])
        main, _, _ = self.docker.names(session)
        for name in (main, main + '_frontend'):
            info = self.docker.inspect(name)
            self.assertIsNotNone(info, name)
            self.assertTrue(info['State']['Running'])
            self.assertEqual(info['Config']['User'], '10001:10001')
            self.assertFalse(info['HostConfig']['Privileged'])
            self.assertFalse(info['HostConfig']['Binds'])
            self.assertEqual(info['Config']['Labels'][OWNER_LABEL], 'fullstack-tests')
            self.assertEqual(list(info['NetworkSettings']['Networks']), [main])
        network = json.loads(self.docker.command('network', 'inspect', main))[0]
        self.assertTrue(network['Internal'])
        bindings = self.docker.port_info(session)['NetworkSettings']['Ports'][f'{session.internal_port}/tcp']
        self.assertEqual(bindings[0]['HostIp'], '127.0.0.1')

    def assert_runtime_removed(self, session):
        main, builder, image = self.docker.names(session)
        for name in (main, builder, main + '_frontend', main + '_db', main + '_proxy',
                     main + '_frontend_build', main + '_frontend_image'):
            self.assertIsNone(self.docker.inspect(name), name)
        self.assertFalse(self.docker.command('network', 'ls', '-q', '--filter', f'name=^{main}$'))
        for name in (image, image + '-frontend'):
            self.assertFalse(self.docker.command('image', 'ls', '-q', '--filter', f'reference={name}'))

    def data_volumes(self, session):
        output = self.docker.command('volume', 'ls', '-q', '--filter', f'label={LABEL}={session.deployment_id}')
        return set(output.split())

    def add_item(self, session, name):
        response = self.request(session, '/api/items/', method='post', data={'name': name})
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()['name'], name)

    def assert_items(self, session, names):
        response = self.request(session, '/api/items/')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual([item['name'] for item in response.json()['items']], names)

    def restart(self, session):
        restart_session(session)
        finish_deployment(session, docker=self.docker)
        session.refresh_from_db()
        return deploy(session, self.docker)

    def test_sqlite_frontend_routes_and_database_survive_stop_restart_expiry(self):
        session = self.launch()
        self.assert_running(session)
        main, _, _ = self.docker.names(session)
        self.assertEqual(self.data_volumes(session), {main + '_data'})
        deadline = session.expires_at
        original_container = session.container_id
        self.assertEqual(deadline - session.started_at, timedelta(minutes=30))
        self.assert_items(session, [])
        self.add_item(session, 'An item saved before restart')

        asset = self.request(session, '/assets/app.js')
        self.assertEqual(asset.status_code, 200)
        self.assertIn(b'/api/items/', asset.content)
        spa = self.request(session, '/items/new')
        self.assertEqual(spa.status_code, 200)
        self.assertIn(b'Full-stack hosting works!', spa.content)
        for missing in ('/api/unknown/', '/assets/missing.js', '/hosting.json', '/package.json'):
            response = self.request(session, missing)
            self.assertEqual(response.status_code, 404, (missing, response.content))
            self.assertNotIn(b'Full-stack hosting works!', response.content)

        reconcile_deployment(session, self.docker, startup=True)
        session.refresh_from_db()
        self.assertEqual(session.container_id, original_container)
        self.assertEqual(session.expires_at, deadline)
        stop_session(session)
        self.assertEqual(self.request(session).status_code, 410)
        finish_deployment(session, docker=self.docker)
        self.assert_runtime_removed(session)
        self.assertEqual(self.data_volumes(session), {main + '_data'})
        session = self.restart(session)
        self.assert_running(session)
        self.assertNotEqual(session.container_id, original_container)
        self.assertGreater(session.expires_at, deadline)
        self.assert_items(session, ['An item saved before restart'])
        self.add_item(session, 'An item saved after restart')

        HostingSession.objects.filter(pk=session.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
        reconcile_deployment(session, self.docker, startup=True)
        session.refresh_from_db()
        self.assertEqual(session.status, 'expired')
        self.assertEqual(self.request(session, '/api/items/').status_code, 410)
        self.assert_runtime_removed(session)
        self.assertEqual(self.data_volumes(session), {main + '_data'})
        self.assertTrue(Path(session.source_zip).is_file())
        saved_directory = storage_dir(session)
        self.assertEqual(delete_saved_system(session.pk, docker=self.docker), 1)
        self.assertFalse(HostingSession.objects.filter(pk=session.pk).exists())
        self.assertFalse(saved_directory.exists())
        self.assertFalse(self.data_volumes(session))

    def test_proxy_requires_current_container_identity(self):
        session = self.launch()
        self.assert_running(session)
        for token, expected in ((None, 410), ('stale-container-id', 410), (session.container_id, 200)):
            direct = http.client.HTTPConnection('127.0.0.1', session.port, timeout=5)
            try:
                headers = {'Host': f'{session.deployment_id}.previews.localhost'}
                if token is not None:
                    headers['X-Hosting-Container'] = token
                direct.request('GET', '/', headers=headers)
                response = direct.getresponse()
                self.assertEqual(response.status, expected)
                response.read()
            finally:
                direct.close()

    def test_hidden_build_files_are_not_public(self):
        files = fullstack_files()
        files['frontend/build.mjs'] += b'''\nimport { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('dist/.private', { recursive: true });
writeFileSync('dist/.private/config.json', '{"private": true}');
writeFileSync('dist/.env.json', '{"private": true}');
'''
        session = self.launch(files)
        self.assert_running(session)
        for path in ('/.private/config.json', '/.env.json'):
            response = self.request(session, path)
            self.assertEqual(response.status_code, 403)
            self.assertNotIn(b'"private": true', response.content)

    def test_sqlite_seed_is_applied_once_and_new_rows_survive_restart(self):
        files = fullstack_files()
        with tempfile.TemporaryDirectory(prefix='hosting-sqlite-seed-') as directory:
            seed_path = Path(directory) / 'seed.sqlite3'
            database = sqlite3.connect(seed_path)
            try:
                database.executescript('''
                    CREATE TABLE django_migrations (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        app VARCHAR(255) NOT NULL,
                        name VARCHAR(255) NOT NULL,
                        applied DATETIME NOT NULL
                    );
                    INSERT INTO django_migrations(app, name, applied)
                    VALUES ('items', '0001_initial', '2026-01-01 00:00:00');
                    CREATE TABLE items_item (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name VARCHAR(120) NOT NULL
                    );
                    INSERT INTO items_item(name) VALUES ('Seeded item');
                ''')
                database.commit()
            finally:
                database.close()
            files['database/seed.sqlite3'] = seed_path.read_bytes()
        manifest = json.loads(files['hosting.json'])
        manifest['database']['seed'] = 'database/seed.sqlite3'
        files['hosting.json'] = json.dumps(manifest)
        session = self.launch(files)
        self.assert_running(session)
        self.assert_items(session, ['Seeded item'])
        self.add_item(session, 'Added after seeding')
        stop_session(session)
        finish_deployment(session, docker=self.docker)
        session = self.restart(session)
        self.assert_running(session)
        self.assert_items(session, ['Seeded item', 'Added after seeding'])

    def test_frontend_build_failure_is_logged_and_all_resources_are_removed(self):
        files = fullstack_files()
        files['frontend/build.mjs'] = 'console.error("fixture frontend build failure"); process.exit(19);\n'
        session = self.launch(files)
        self.assertEqual(session.status, 'failed', read_logs(session))
        self.assertIn('fixture frontend build failure', read_logs(session))
        self.assertIn('Frontend build failed', session.error_message)
        self.assertIsNone(session.active_slot)
        self.assertIsNone(session.port)
        self.assert_runtime_removed(session)
        self.assertFalse(self.data_volumes(session))
        self.assertTrue(Path(session.source_zip).is_file())

    def test_initial_migration_failure_discards_uninitialized_database_volume(self):
        files = fullstack_files()
        files['backend/items/migrations/0002_failure.py'] = '''from django.db import migrations

def fail(apps, schema_editor):
    raise RuntimeError("fixture migration failure")

class Migration(migrations.Migration):
    dependencies = [('items', '0001_initial')]
    operations = [migrations.RunPython(fail)]
'''
        session = self.launch(files)
        self.assertEqual(session.status, 'failed', read_logs(session))
        self.assertIn('fixture migration failure', read_logs(session))
        self.assertIn('migration', session.error_message.lower())
        self.assertIsNone(session.active_slot)
        self.assert_runtime_removed(session)
        self.assertFalse(self.data_volumes(session))

    def test_failing_backend_health_does_not_publish_a_healthy_frontend(self):
        files = fullstack_files()
        files['backend/items/views.py'] = files['backend/items/views.py'].replace(
            b"return JsonResponse({'healthy': True, 'items': Item.objects.count()})",
            b"return JsonResponse({'healthy': False}, status=503)",
        )
        with override_settings(HEALTHCHECK_TIMEOUT_SECONDS=5):
            session = self.launch(files)
        self.assertEqual(session.status, 'failed', read_logs(session))
        self.assertIn('health', session.error_message.lower())
        self.assertEqual(self.request(session).status_code, 410)
        self.assert_runtime_removed(session)

    def test_frontend_crash_fails_whole_deployment_and_retains_database(self):
        session = self.launch()
        self.assert_running(session)
        self.add_item(session, 'Retained after a frontend crash')
        main, _, _ = self.docker.names(session)
        self.docker.command('kill', main + '_frontend')
        reconcile_deployment(session, self.docker)
        session.refresh_from_db()
        self.assertEqual(session.status, 'failed', read_logs(session))
        self.assertIn('frontend', session.error_message.lower())
        self.assertEqual(self.request(session).status_code, 410)
        self.assert_runtime_removed(session)
        self.assertEqual(self.data_volumes(session), {main + '_data'})

    @skipUnless(os.getenv('RUN_DOCKER_HOSTING_DATABASE_TESTS') == '1', 'Enable managed database tests.')
    def test_backend_only_mysql_serves_templates_static_and_database_without_frontend(self):
        files = {name: value for name, value in fullstack_files('mysql').items()
                 if not name.startswith('frontend/')}
        manifest = json.loads(files['hosting.json'])
        manifest['frontend'] = False
        files['hosting.json'] = json.dumps(manifest)
        files['backend/sample/settings.py'] += b'''
INSTALLED_APPS += ['django.contrib.staticfiles']
STATIC_URL = '/static/'
STATICFILES_DIRS = [BASE_DIR / 'static']
TEMPLATES = [{'BACKEND': 'django.template.backends.django.DjangoTemplates', 'DIRS': [BASE_DIR / 'templates']}]
'''
        files['backend/sample/urls.py'] += b'''
from django.shortcuts import render
from items.models import Item
def home(request):
    return render(request, 'home.html', {'count': Item.objects.count()})
urlpatterns += [path('', home)]
'''
        files['backend/templates/home.html'] = '<html><body>Django managed MySQL: {{ count }}</body></html>'
        files['backend/static/preview.css'] = 'body { color: navy; }'
        session = self.launch(files)
        self.assertEqual(session.status, 'running', session.error_message + '\n' + read_logs(session))
        self.assertContains(self.request(session), 'Django managed MySQL: 0')
        self.assertEqual(self.request(session, '/static/preview.css').status_code, 200)
        self.assertEqual(self.request(session, '/unconfigured-route/').status_code, 404)
        self.assertEqual(self.request(session, '/__hosting_backend_health__/').status_code, 200)
        self.add_item(session, 'Managed without frontend')
        self.assertContains(self.request(session), 'Django managed MySQL: 1')
        main, _, image = self.docker.names(session)
        self.assertIsNone(self.docker.inspect(main + '_frontend'))
        self.assertTrue(self.docker.inspect(main + '_db')['State']['Running'])
        self.assertFalse(self.docker.command('image', 'ls', '-q', '--filter', f'reference={image}-frontend'))
        session = reconcile_deployment(session, self.docker)
        self.assertEqual(session.status, 'running', session.error_message)

    @skipUnless(os.getenv('RUN_DOCKER_HOSTING_DATABASE_TESTS') == '1', 'Enable managed database tests.')
    def test_postgresql_is_isolated_and_retains_data_on_restart(self):
        self.check_managed_database('postgresql')

    @skipUnless(os.getenv('RUN_DOCKER_HOSTING_DATABASE_TESTS') == '1', 'Enable managed database tests.')
    def test_mysql_is_isolated_and_retains_data_on_restart(self):
        self.check_managed_database('mysql')

    def check_managed_database(self, engine):
        files = fullstack_files(engine)
        manifest = json.loads(files['hosting.json'])
        manifest['database']['seed'] = 'database/seed.sql'
        files['hosting.json'] = json.dumps(manifest)
        # A second import would fail CREATE TABLE: a successful restart
        # verifies SQL initialization only happens for a fresh volume.
        files['database/seed.sql'] = '''
            CREATE TABLE hosting_seed_probe (id INTEGER PRIMARY KEY, value VARCHAR(120) NOT NULL);
            INSERT INTO hosting_seed_probe (id, value) VALUES (1, 'SQL seed imported');
        '''
        views = files['backend/items/views.py'].decode()
        views = views.replace('import json\n', 'import json\nfrom django.db import connection\n')
        views = views.replace(
            "    return JsonResponse({'healthy': True, 'items': Item.objects.count()})",
            "    with connection.cursor() as cursor:\n"
            "        cursor.execute('SELECT value FROM hosting_seed_probe WHERE id = 1')\n"
            "        seed = cursor.fetchone()[0]\n"
            "    return JsonResponse({'healthy': True, 'items': Item.objects.count(), 'seed': seed})",
        )
        files['backend/items/views.py'] = views
        session = self.launch(files)
        self.assert_running(session)
        self.assertEqual(self.request(session, '/api/health/').json()['seed'], 'SQL seed imported')
        main, _, _ = self.docker.names(session)
        info = self.docker.inspect(main + '_db')
        self.assertTrue(info['State']['Running'])
        self.assertEqual(list(info['NetworkSettings']['Networks']), [main])
        self.assertFalse(info['HostConfig']['Binds'])
        self.assertFalse(info['HostConfig']['PortBindings'])
        self.assertEqual(self.data_volumes(session), {main + '_data', main + '_files'})
        self.add_item(session, f'{engine} saved item')
        stop_session(session)
        finish_deployment(session, docker=self.docker)
        session = self.restart(session)
        self.assert_running(session)
        self.assertEqual(self.request(session, '/api/health/').json()['seed'], 'SQL seed imported')
        self.assert_items(session, [f'{engine} saved item'])
        stop_session(session)
        finish_deployment(session, docker=self.docker)
        self.assert_runtime_removed(session)
        self.assertEqual(delete_saved_system(session.pk, docker=self.docker), 1)
        self.assertFalse(self.data_volumes(session))
