import shlex
import tempfile
import uuid
from pathlib import Path
from types import SimpleNamespace

from django.conf import settings
from django.test import SimpleTestCase

from hosting.services.archive_service import normalize_project_root, safe_extract_zip
from hosting.services.errors import HostingError
from hosting.services.runtime_service import CPP_EXECUTABLE, detect_runtime, runtime_plan
from .test_lifecycle import zip_upload


class AdditionalRuntimeTests(SimpleTestCase):
    def plan(self, files, runtime='auto', **options):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        for name, content in files.items():
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
        self.root = root
        self.session = SimpleNamespace(project_dir=str(root), project_type=runtime, internal_port=8080,
                                       deployment_id=uuid.uuid4(), entrypoint='', start_command='')
        for key, value in options.items():
            setattr(self.session, key, value)
        return runtime_plan(self.session)

    def test_detect_ruby_script_and_cpp_source_without_manifests(self):
        for file, runtime in [('app.rb', 'ruby'), ('server.rb', 'ruby'), ('main.cpp', 'cpp'),
                              ('server.cc', 'cpp'), ('website.cxx', 'cpp')]:
            with self.subTest(file=file):
                plan = self.plan({file: ''})
                self.assertEqual(plan.runtime, runtime)
                self.assertEqual(plan.image, settings.DEPLOYMENT_IMAGES[runtime])
                self.assertEqual(plan.environment['HOST'], '0.0.0.0')
                self.assertEqual(plan.environment['PORT'], '8080')

    def test_mixed_language_project_requires_explicit_selection(self):
        with self.assertRaisesRegex(HostingError, 'Cannot determine'):
            self.plan({'main.cpp': '', 'app.rb': ''})
        self.assertEqual(detect_runtime(self.root, 'ruby'), 'ruby')
        self.assertEqual(detect_runtime(self.root, 'cpp'), 'cpp')

    def test_ruby_prefers_rack_configuration_and_installs_private_bundle(self):
        plan = self.plan({'Gemfile': '', 'config.ru': '', 'app.rb': ''})
        self.assertEqual(plan.install, 'bundle install')
        self.assertEqual(plan.environment['BUNDLE_PATH'], '/app/vendor/bundle')
        self.assertEqual(plan.environment['BUNDLE_APP_CONFIG'], '/app/.bundle')
        self.assertEqual(plan.command, ['bundle', 'exec', 'rackup', 'config.ru', '--host', '0.0.0.0', '--port', '8080'])

    def test_standalone_ruby_does_not_require_bundler_or_gems(self):
        plan = self.plan({'app.rb': ''})
        self.assertEqual(plan.install, 'true')
        self.assertEqual(plan.command, ['ruby', 'app.rb'])

    def test_ruby_custom_entrypoint_overrides_default(self):
        plan = self.plan({'Gemfile': '', 'config.ru': '', 'src/site.rb': ''}, entrypoint='src/site.rb')
        self.assertEqual(plan.command, ['bundle', 'exec', 'ruby', 'src/site.rb'])

    def test_ruby_rails_binstub_receives_host_and_port(self):
        plan = self.plan({'Gemfile': '', 'config.ru': '', 'bin/rails': ''})
        self.assertEqual(plan.command, ['bundle', 'exec', 'ruby', 'bin/rails', 'server', '-b', '0.0.0.0', '-p', '8080'])

    def test_rack_without_dependency_manifest_has_actionable_error(self):
        with self.assertRaisesRegex(HostingError, 'Gemfile declaring rackup'):
            self.plan({'config.ru': ''})

    def test_ruby_custom_commands_use_bundle_once_and_preserve_port_template(self):
        for command in ['ruby app.rb --port {port}', 'bundle exec ruby app.rb --port {port}']:
            with self.subTest(command=command):
                plan = self.plan({'Gemfile': '', 'app.rb': ''}, start_command=command)
                self.assertEqual(plan.command, ['bundle', 'exec', 'ruby', 'app.rb', '--port', '8080'])
                self.assertEqual(self.session.start_command, command)

    def test_cpp_compiles_root_sources_and_leaves_headers_as_includes(self):
        plan = self.plan({'main.cpp': '', 'response.cc': '', 'routes.cxx': '', 'response.hpp': ''})
        compiler = shlex.split(plan.install.split(' && ', 1)[1])
        self.assertEqual(compiler[0], 'g++')
        for name in ('main.cpp', 'response.cc', 'routes.cxx'):
            self.assertIn('./' + name, compiler)
        self.assertNotIn('./response.hpp', compiler)
        self.assertEqual(compiler[-2:], ['-o', CPP_EXECUTABLE])
        self.assertEqual(plan.command, [CPP_EXECUTABLE])

    def test_cpp_source_entrypoint_can_select_nested_source(self):
        plan = self.plan({'src/web.cpp': '', 'tools.cpp': ''}, 'cpp', entrypoint='src/web.cpp')
        compiler = shlex.split(plan.install.split(' && ', 1)[1])
        self.assertIn('./src/web.cpp', compiler)
        self.assertNotIn('./tools.cpp', compiler)

    def test_cpp_source_names_cannot_inject_shell_or_compiler_flags(self):
        filenames = ['hello world.cpp', "quote'; echo nope; '.cpp", '-fplugin=example.cpp', '$(touch nope).cpp']
        plan = self.plan(dict.fromkeys(filenames, ''))
        compiler = shlex.split(plan.install.split(' && ', 1)[1])
        for filename in filenames:
            self.assertIn('./' + filename, compiler)
        self.assertNotIn('echo', compiler)
        self.assertNotIn('touch', compiler)

    def test_cpp_requires_source_even_when_custom_command_is_supplied(self):
        for files, options in [({'server': ''}, {}), ({'server': ''}, {'entrypoint': 'server'}),
                               ({'README.md': ''}, {'start_command': CPP_EXECUTABLE})]:
            with self.subTest(options=options), self.assertRaisesRegex(HostingError, r'C\+\+'):
                self.plan(files, 'cpp', **options)

    def test_cpp_custom_command_can_only_start_compiled_output(self):
        plan = self.plan({'main.cpp': ''}, start_command='./.hosting-build/server --port {port}')
        self.assertEqual(plan.command, [CPP_EXECUTABLE, '--port', '8080'])
        for command in ['sh -c anything', './uploaded-binary', 'g++ main.cpp', 'python app.py', '../../server']:
            with self.subTest(command=command), self.assertRaisesRegex(HostingError, 'must run'):
                self.plan({'main.cpp': ''}, start_command=command)

    def test_custom_commands_for_new_languages_reject_loopback_binding(self):
        for files, command in [({'app.rb': ''}, 'ruby app.rb --host localhost'),
                               ({'main.cpp': ''}, CPP_EXECUTABLE + ' --host 127.0.0.1')]:
            with self.subTest(command=command), self.assertRaisesRegex(HostingError, '0.0.0.0'):
                self.plan(files, start_command=command)

    def test_new_entrypoints_cannot_escape_project(self):
        for filename in ['app.rb', 'main.cpp']:
            with self.subTest(filename=filename), self.assertRaisesRegex(HostingError, 'inside the project'):
                self.plan({filename: ''}, entrypoint='../' + filename)

    def test_nested_root_retains_ruby_and_cpp_sources_with_asset_subdirectory(self):
        for filename in ['app.rb', 'config.ru', 'main.cpp', 'server.cc', 'server.cxx']:
            with self.subTest(filename=filename), tempfile.TemporaryDirectory() as directory:
                destination = Path(directory)
                safe_extract_zip(zip_upload({f'outer/site/{filename}': '', 'outer/site/assets/style.css': ''}), destination)
                self.assertEqual(normalize_project_root(destination), destination / 'outer/site')

    def test_uploaded_bundle_configuration_and_compiled_output_are_discarded(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            safe_extract_zip(zip_upload({'app.rb': '', '.bundle/config': 'BUNDLE_PATH: /host',
                                         '.hosting-build/server': 'old executable'}), root)
            self.assertTrue((root / 'app.rb').is_file())
            self.assertFalse((root / '.bundle').exists())
            self.assertFalse((root / '.hosting-build').exists())
