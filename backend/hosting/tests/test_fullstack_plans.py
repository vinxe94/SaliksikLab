import json
import tempfile
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase, TestCase, override_settings

from hosting.services.archive_service import normalize_project_root
from hosting.services.errors import HostingError
from hosting.services.fullstack_docker import FullStackDocker, read_state, redact, write_state
from hosting.services.runtime_service import runtime_plan


class FullstackPlanTests(SimpleTestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.write('frontend/package.json', json.dumps({'scripts': {'build': 'node build.mjs'}}))
        self.write('frontend/package-lock.json', '{}')
        self.write('backend/requirements.txt', 'Django>=4.2\n')
        self.write('backend/manage.py', "import os\nos.environ.setdefault('DJANGO_SETTINGS_MODULE', 'sample.settings')\n")
        self.write('backend/sample/settings.py', "ROOT_URLCONF='sample.urls'\nDATABASES={'default': {'ENGINE':'django.db.backends.sqlite3'}}\n")
        self.session = SimpleNamespace(project_dir=str(self.root), project_type='auto', internal_port=8080,
                                       deployment_id=uuid.uuid4(), entrypoint='', start_command='')

    def write(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def manifest(self, **values):
        self.write('hosting.json', json.dumps({'version': 1, **values}))

    def test_conventional_django_project_builds_separate_frontend_and_managed_backend(self):
        plan = runtime_plan(self.session)
        self.assertEqual(plan.runtime, 'fullstack')
        self.assertEqual(plan.database.engine, 'sqlite')
        self.assertTrue(plan.database.persist)
        self.assertEqual(plan.backend.workdir, '/app/backend')
        self.assertIn('npm ci', plan.frontend.install)
        self.assertIn('npm run build', plan.frontend.install)
        self.assertEqual(plan.frontend.environment['VITE_API_BASE_URL'], '/api')
        self.assertEqual(plan.api_prefixes, ['/api'])
        self.assertEqual(plan.backend_health_path, '/__hosting_health__/')
        self.assertEqual(plan.backend.prepare[0][-2:], ['migrate', '--noinput'])
        self.assertNotIn('--insecure', plan.backend.command)
        for path, text in plan.backend.generated_files.items():
            compile(text, path, 'exec')

    def test_database_detection_reads_settings_without_executing_uploaded_code(self):
        self.write('backend/sample/settings.py', "raise RuntimeError('must not run on the host')\nENGINE='django.db.backends.postgresql'\n")
        plan = runtime_plan(self.session)
        self.assertEqual(plan.database.engine, 'postgresql')
        self.assertIn('psycopg[binary]', plan.backend.install)

    def test_explicit_mysql_uses_trusted_image_and_real_driver(self):
        self.manifest(database={'engine': 'mysql'})
        with override_settings(DEPLOYMENT_FULLSTACK_PYTHON_IMAGE='trusted-mysql-python:test'):
            plan = runtime_plan(self.session)
        self.assertEqual(plan.backend.image, 'trusted-mysql-python:test')
        self.assertIn('mysqlclient', plan.backend.install)

    def test_backend_only_manifest_manages_root_django_and_mysql(self):
        self.write('manage.py', "import os\nos.environ.setdefault('DJANGO_SETTINGS_MODULE', 'sample.settings')\n")
        self.write('requirements.txt', 'Django>=4.2\nmysqlclient==2.2.4\n')
        self.write('sample/settings.py', "ROOT_URLCONF='sample.urls'\nENGINE='django.db.backends.mysql'\n")
        self.manifest(frontend=False)
        plan = runtime_plan(self.session)
        self.assertIsNone(plan.frontend)
        self.assertEqual(plan.backend_path, '.')
        self.assertEqual(plan.backend.workdir, '/app')
        self.assertEqual(plan.database.engine, 'mysql')
        self.assertEqual(plan.backend.prepare[0], ['/app/.venv/bin/python', '/app/.hosting-build/hosting_manage.py', 'migrate', '--noinput'])
        self.assertIn('/app/.hosting-build/hosting_settings.py', plan.backend.generated_files)

    def test_backend_only_can_select_nested_backend_and_seed(self):
        import sqlite3
        with sqlite3.connect(self.root / 'backend/db.sqlite3') as database:
            database.execute('CREATE TABLE seed (id INTEGER)')
        self.manifest(frontend=False, backend={'path': 'backend'})
        plan = runtime_plan(self.session)
        self.assertIsNone(plan.frontend)
        self.assertEqual(plan.backend.workdir, '/app/backend')
        self.assertEqual(plan.database.seed, 'backend/db.sqlite3')

    def test_ambiguous_database_requires_selection(self):
        self.write('backend/sample/settings.py', "ENGINES=['django.db.backends.postgresql','django.db.backends.mysql']\n")
        with self.assertRaisesRegex(HostingError, 'Multiple Django database'):
            runtime_plan(self.session)
        self.manifest(database={'engine': 'sqlite'})
        self.assertEqual(runtime_plan(self.session).database.engine, 'sqlite')

    def test_manifest_paths_and_database_types_are_validated(self):
        cases = [
            {'frontend': True},
            {'frontend': 0},
            {'frontend': None},
            {'frontend': []},
            {'frontend': {'path': '../outside'}},
            {'frontend': {'output': '../../outside'}},
            {'backend': {'path': '/tmp'}},
            {'backend': {'path': '.'}},
            {'frontend': False, 'backend': {'path': '../outside'}},
            {'backend': {'runtime': 'fullstack'}},
            {'database': {'engine': None}},
            {'database': {'engine': 'mongodb'}},
            {'database': {'persist': 'false'}},
            {'database': {'seed': '../secret.sql'}},
            {'database': {'engine': 'sqlite', 'seed': 'backend/requirements.txt'}},
            {'api_prefixes': ['/api; return 200']},
            {'api_prefixes': ['/']},
            {'api_prefixes': ['/__hosting_backend_health__']},
            {'api_prefixes': ['/api', '/api/']},
            {'frontend': {'environment': {'NODE_OPTIONS': '--require /app/bad.js'}}},
            {'frontend': {'image': 'uploaded-image'}},
        ]
        for values in cases:
            with self.subTest(values=values):
                self.manifest(**values)
                with self.assertRaises(HostingError):
                    runtime_plan(self.session)

    def test_duplicate_and_oversized_manifests_rejected(self):
        self.write('hosting.json', '{"version":1,"database":{},"database":{}}')
        with self.assertRaisesRegex(HostingError, 'duplicate'):
            runtime_plan(self.session)
        self.write('hosting.json', ' ' * 65537)
        with self.assertRaisesRegex(HostingError, '64 KB'):
            runtime_plan(self.session)

    def test_root_detection_stops_at_split_application(self):
        outer = self.root / 'outer'
        outer.mkdir()
        nested = outer / 'project'
        nested.mkdir()
        (nested / 'frontend').mkdir()
        (nested / 'backend').mkdir()
        self.assertEqual(normalize_project_root(outer), nested)

    def test_custom_django_commands_keep_managed_settings(self):
        self.manifest(backend={'start_command': 'python manage.py runserver 0.0.0.0:{port}',
                               'migrate': [['python', 'manage.py', 'migrate', '--noinput']]})
        plan = runtime_plan(self.session)
        self.assertTrue(plan.backend.command[1].endswith('/hosting_manage.py'))
        self.assertTrue(plan.backend.prepare[0][1].endswith('/hosting_manage.py'))
        self.manifest(backend={'start_command': 'python manage.py runserver 0.0.0.0:{port} --settings=sample.settings'})
        with self.assertRaisesRegex(HostingError, 'managed hosting settings'):
            runtime_plan(self.session)


class DatabaseOwnershipTests(SimpleTestCase):
    def test_other_installation_cannot_claim_the_same_deployment_identifier(self):
        from hosting.services.docker_service import DockerService, LABEL, OWNER_LABEL
        session = SimpleNamespace(deployment_id=uuid.uuid4())
        info = {'Config': {'Labels': {LABEL: str(session.deployment_id), OWNER_LABEL: 'another-installation'}}}
        with override_settings(DEPLOYMENT_INSTANCE_ID='this-installation'), self.assertRaises(HostingError):
            DockerService().verify_owned(info, session)

    def test_credentials_remain_private_and_are_redacted(self):
        session = SimpleNamespace(deployment_id=uuid.uuid4())
        with tempfile.TemporaryDirectory() as root, override_settings(DEPLOYMENT_STORAGE_PATH=root):
            state = {'password': 'private-password', 'root_password': 'private-root', 'secret_key': 'private-key'}
            write_state(session, state)
            self.assertEqual(read_state(session), state)
            file = Path(root) / str(session.deployment_id) / 'database.json'
            self.assertEqual(file.stat().st_mode & 0o777, 0o600)
            self.assertEqual(redact(session, 'private-password private-root private-key'), '[redacted] [redacted] [redacted]')

    def test_foreign_volume_is_not_deleted(self):
        session = SimpleNamespace(deployment_id=uuid.uuid4())
        docker = Mock()
        docker.names.return_value = ('temporary_test', 'builder', 'image')
        docker.command.side_effect = ['temporary_test_data', '[{"Labels":{"org.saliksiklab.temporary":"someone-else"}}]']
        docker.verify_owned.side_effect = HostingError('Volume belongs to another deployment')
        with self.assertRaises(HostingError):
            FullStackDocker(docker).purge_data(session)
        self.assertFalse(any(call.args[:2] == ('volume', 'rm') for call in docker.command.call_args_list))


class BackendOnlyServiceTests(SimpleTestCase):
    def setUp(self):
        self.session = SimpleNamespace(deployment_id=uuid.uuid4(), internal_port=8080, project_type='fullstack',
                                       port=43217, container_name='temporary_test', container_id='container-id')
        self.docker = Mock()
        self.docker.names.return_value = ('temporary_test', 'builder', 'image')
        self.services = FullStackDocker(self.docker)

    def test_all_public_paths_route_to_backend_with_no_frontend(self):
        plan = SimpleNamespace(frontend=None, api_prefixes=['/api'], backend_health_path='/__hosting_health__/')
        routes = self.services.proxy_routes(self.session, plan)
        self.assertIn('location / { proxy_pass http://temporary_test:8080;', routes)
        self.assertIn('location = /__hosting_backend_health__/ { proxy_pass http://temporary_test:8080/__hosting_health__/;', routes)
        self.assertNotIn('_frontend', routes)
        self.assertNotIn('location = /api ', routes)

    def test_no_frontend_image_is_built(self):
        plan = SimpleNamespace(frontend=None, backend=SimpleNamespace(image='python:test'),
                               database=SimpleNamespace(engine='mysql', seed=''))
        with patch.object(self.services, 'build_frontend') as frontend, \
                patch('hosting.services.fullstack_docker.append_log'):
            self.assertEqual(self.services.build(self.session, plan, Mock()), 'image')
        frontend.assert_not_called()
        self.docker.build_runtime.assert_called_once()
        self.assertIs(self.docker.build_runtime.call_args.args[1], plan.backend)

    def test_state_remembers_frontend_absence_across_reconciliation(self):
        plan = SimpleNamespace(frontend=None, database=SimpleNamespace(engine='mysql', persist=True))
        with tempfile.TemporaryDirectory() as directory, override_settings(DEPLOYMENT_STORAGE_PATH=directory):
            state = self.services.state(self.session, plan)
            self.assertIs(state['frontend'], False)
            self.assertEqual(read_state(self.session), state)
            self.docker.inspect.return_value = {'State': {'Running': True}}
            self.assertEqual(self.services.services_healthy(self.session), (True, ''))
            self.docker.inspect.assert_called_once_with('temporary_test_db')
            self.docker.inspect.return_value = {'State': {'Running': False}}
            self.assertFalse(self.services.services_healthy(self.session)[0])

    def test_existing_state_keeps_frontend_health_requirement(self):
        with patch('hosting.services.fullstack_docker.read_state', return_value={'engine': 'sqlite'}):
            self.docker.inspect.return_value = None
            healthy, _ = self.services.services_healthy(self.session)
        self.assertFalse(healthy)
        self.docker.inspect.assert_called_once_with('temporary_test_frontend')

    def test_backend_only_readiness_uses_health_endpoint_when_root_is_404(self):
        from hosting.services.healthcheck_service import wait_until_healthy
        self.docker.inspect.return_value = {'State': {'Running': True}}
        self.docker.services_healthy.return_value = (True, '')
        with patch('hosting.services.fullstack_docker.read_state', return_value={'frontend': False}), \
                patch('hosting.services.healthcheck_service.check_http', return_value=(True, 'HTTP 200')) as check:
            wait_until_healthy(self.session, self.docker, Mock())
        check.assert_called_once_with(43217, 'container-id', path='/__hosting_backend_health__/')


class FullstackPublishingTests(TestCase):
    @override_settings(DEPLOYMENT_REQUIRE_WORKER=False)
    def test_backend_only_reconciliation_uses_managed_readiness(self):
        from django.contrib.auth import get_user_model
        from hosting.services.deployment_service import create_session_from_upload, deploy, reconcile_deployment
        from .test_lifecycle import SimulatedDocker, zip_upload

        admin = get_user_model().objects.create_user('managed-backend@example.test', 'test-password', role='admin')
        docker = SimulatedDocker()
        docker.mark_ready = Mock()
        docker.services_healthy = Mock(return_value=(True, ''))
        with tempfile.TemporaryDirectory() as directory, override_settings(DEPLOYMENT_STORAGE_PATH=directory):
            upload = zip_upload({'hosting.json': json.dumps({'version': 1, 'frontend': False}), 'app.py': '# fixture'})
            session = create_session_from_upload(upload, 'auto', admin)
            with patch('hosting.services.deployment_service.wait_until_healthy'):
                session = deploy(session, docker)
            self.assertEqual(session.status, 'running', session.error_message)
            write_state(session, {'frontend': False})
            with patch('hosting.services.deployment_service.check_http', return_value=(True, 'HTTP 200')) as check:
                session = reconcile_deployment(session, docker)
            self.assertEqual(session.status, 'running', session.error_message)
            check.assert_called_once()
            self.assertEqual(check.call_args.kwargs['path'], '/__hosting_backend_health__/')

    @override_settings(DEPLOYMENT_REQUIRE_WORKER=False)
    def test_retention_marker_is_written_before_the_public_running_state(self):
        from django.contrib.auth import get_user_model
        from hosting.models import HostingSession
        from hosting.services.deployment_service import create_session_from_upload, deploy
        from .test_lifecycle import SimulatedDocker, zip_upload

        admin = get_user_model().objects.create_user('publishing@example.test', 'test-password', role='admin')
        docker = SimulatedDocker()
        observed = []
        docker.mark_ready = lambda session: observed.append(HostingSession.objects.get(pk=session.pk).status)
        with tempfile.TemporaryDirectory() as directory, override_settings(DEPLOYMENT_STORAGE_PATH=directory):
            upload = zip_upload({'frontend/index.html': 'frontend', 'backend/app.py': '# test fixture'})
            session = create_session_from_upload(upload, 'auto', admin)
            with patch('hosting.services.deployment_service.wait_until_healthy'):
                session = deploy(session, docker)
            self.assertEqual(observed, ['starting'])
            self.assertEqual(session.status, 'running')
