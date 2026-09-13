import tempfile
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import connection, connections
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase, override_settings

from hosting.models import HostingSession
from hosting.services.deployment_service import create_session_from_upload, ensure_free_slot
from hosting.services.errors import HostingError
from .test_lifecycle import zip_upload


@override_settings(DEPLOYMENT_REQUIRE_WORKER=False)
class PostgreSQLRecoveryTests(TransactionTestCase):
    def setUp(self):
        if connection.vendor != 'postgresql':
            self.skipTest('Requires the disposable PostgreSQL test database.')
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        setting = override_settings(DEPLOYMENT_STORAGE_PATH=self.temp.name)
        setting.enable()
        self.addCleanup(setting.disable)

    def test_two_simultaneous_admin_uploads_reserve_only_one_slot(self):
        admin = get_user_model().objects.create_user('concurrent@example.test', 'test', role='admin')
        barrier = Barrier(2)

        def check(*args, **kwargs):
            ensure_free_slot(*args, **kwargs)
            barrier.wait(timeout=5)

        def upload():
            try:
                return create_session_from_upload(zip_upload(), 'static', admin).status
            except HostingError:
                return 'conflict'
            finally:
                connections.close_all()

        with patch('hosting.services.deployment_service.ensure_free_slot', side_effect=check):
            with ThreadPoolExecutor(max_workers=2) as pool:
                outcomes = list(pool.map(lambda _: upload(), range(2)))
        self.assertCountEqual(outcomes, ['uploaded', 'conflict'])
        self.assertEqual(HostingSession.objects.filter(active_slot=1).count(), 1)

    def test_upgrade_preserves_saved_projects_and_assigns_unique_ids(self):
        executor = MigrationExecutor(connection)
        latest = executor.loader.graph.leaf_nodes('hosting')
        executor.migrate([('hosting', '0002_hostingsession_archive_document')])
        old = executor.loader.project_state([('hosting', '0002_hostingsession_archive_document')]).apps.get_model('hosting', 'HostingSession')
        first = old.objects.create(name='Legacy A', project_type='static', status='running', pid=123456,
                                   project_dir='/legacy/session_a', start_command='python -m http.server 9100', port=9100)
        second = old.objects.create(name='Legacy B', project_type='node', status='running', project_dir='/legacy/session_b')
        try:
            executor = MigrationExecutor(connection)
            executor.migrate(latest)
            sessions = list(HostingSession.objects.filter(pk__in=[first.pk, second.pk]))
            self.assertEqual(len({s.deployment_id for s in sessions}), 2)
            self.assertTrue(all(s.status == 'failed' and s.active_slot is None for s in sessions))
            self.assertEqual(HostingSession.objects.get(pk=first.pk).pid, 123456)
            self.assertEqual(HostingSession.objects.get(pk=second.pk).project_dir, '/legacy/session_b')
        finally:
            MigrationExecutor(connection).migrate(latest)
