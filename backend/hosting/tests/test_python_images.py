"""Python runtime image selection and trusted build-context regressions."""
import io
import os
import runpy
import tarfile
import tempfile
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.conf import settings
from django.test import SimpleTestCase, override_settings

from hosting.services.docker_service import DockerService
from hosting.services.errors import HostingError
from hosting.services.runtime_service import runtime_plan


class PythonImageTests(SimpleTestCase):
    def configured_plan(self, environment):
        # Evaluate the real defaults without local .env files or the operator's
        # test-image override obscuring which image a fresh installation chooses.
        with patch.dict(os.environ, environment, clear=True), patch('dotenv.load_dotenv'):
            configuration = runpy.run_path(str(settings.BASE_DIR / 'config' / 'settings.py'))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'app.py').write_text('import MySQLdb\n')
            (root / 'requirements.txt').write_text('mysqlclient==2.2.4\n')
            session = SimpleNamespace(
                project_dir=directory, project_type='auto', internal_port=8080,
                deployment_id=uuid.uuid4(), entrypoint='', start_command='',
            )
            with override_settings(DEPLOYMENT_IMAGES=configuration['DEPLOYMENT_IMAGES']):
                return runtime_plan(session)

    def test_standalone_python_defaults_to_mysql_capable_image(self):
        plan = self.configured_plan({})
        self.assertEqual(plan.runtime, 'python')
        self.assertEqual(plan.image, 'tukiva-hosting-python:3.12')
        self.assertIn('pip install --no-cache-dir -r requirements.txt', plan.install)

    def test_python_default_follows_configured_trusted_image(self):
        plan = self.configured_plan({'DEPLOYMENT_FULLSTACK_PYTHON_IMAGE': 'local-python:custom'})
        self.assertEqual(plan.image, 'local-python:custom')

    def test_operator_can_still_override_python_image(self):
        plan = self.configured_plan({
            'DEPLOYMENT_PYTHON_IMAGE': 'registry.example/python:custom',
            'DEPLOYMENT_FULLSTACK_PYTHON_IMAGE': 'local-python:custom',
        })
        self.assertEqual(plan.image, 'registry.example/python:custom')

    @override_settings(DEPLOYMENT_FULLSTACK_PYTHON_IMAGE='trusted-python:test')
    def test_cached_images_are_reused_without_build_or_pull(self):
        for image in ('trusted-python:test', 'registry.example/python:custom'):
            with self.subTest(image=image):
                docker = DockerService()
                docker.command = Mock(return_value='cached-image-id')
                docker.ensure_image(image, Mock())
                docker.command.assert_called_once_with('image', 'ls', '-q', '--filter', f'reference={image}')

    @override_settings(DEPLOYMENT_FULLSTACK_PYTHON_IMAGE='trusted-python:test')
    def test_cold_trusted_image_builds_only_bundled_dockerfile(self):
        docker = DockerService()
        docker.command = Mock(return_value='')
        cancelled = Mock()
        docker.ensure_image('trusted-python:test', cancelled)
        self.assertEqual(docker.command.call_count, 2)
        build = docker.command.call_args
        self.assertEqual(build.args, ('build', '--tag', 'trusted-python:test', '-'))
        self.assertIs(build.kwargs['cancelled'], cancelled)
        self.assertEqual(build.kwargs['timeout'], settings.DEPLOYMENT_BUILD_TIMEOUT_SECONDS)
        context = build.kwargs['data']
        self.assertTrue(context.startswith(b'\x1f\x8b'), 'Docker stdin context must be gzip, not a raw PAX tar.')
        dockerfile = Path(__file__).resolve().parents[1] / 'images' / 'python' / 'Dockerfile'
        with tarfile.open(fileobj=io.BytesIO(context), mode='r:gz') as archive:
            self.assertEqual(archive.getnames(), ['Dockerfile'])
            self.assertFalse(archive.getmember('Dockerfile').pax_headers)
            self.assertEqual(archive.extractfile('Dockerfile').read(), dockerfile.read_bytes())

    @override_settings(DEPLOYMENT_FULLSTACK_PYTHON_IMAGE='trusted-python:test')
    def test_missing_operator_image_is_pulled(self):
        docker = DockerService()
        docker.command = Mock(return_value='')
        cancelled = Mock()
        docker.ensure_image('registry.example/python:custom', cancelled)
        self.assertEqual(docker.command.call_count, 2)
        docker.command.assert_called_with(
            'pull', 'registry.example/python:custom',
            timeout=settings.DEPLOYMENT_BUILD_TIMEOUT_SECONDS, cancelled=cancelled,
        )

    def test_standalone_build_prepares_image_before_creating_container(self):
        docker = DockerService()
        docker.command = Mock()
        docker.ensure_image = Mock(side_effect=HostingError('image unavailable'))
        session = SimpleNamespace(deployment_id=uuid.uuid4())
        cancelled = Mock()
        with patch('hosting.services.docker_service.append_log'):
            with self.assertRaisesRegex(HostingError, 'image unavailable'):
                docker.build_runtime(session, SimpleNamespace(image='trusted-python:test'), cancelled)
        docker.ensure_image.assert_called_once_with('trusted-python:test', cancelled)
        docker.command.assert_not_called()
