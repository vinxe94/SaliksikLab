import os
import shutil
import stat
import zipfile
from pathlib import Path, PurePosixPath

from django.conf import settings

from .errors import HostingError


IGNORED = {'__MACOSX', '.DS_Store', '.git', 'node_modules', 'venv', '.venv', '__pycache__',
           '.bundle', '.hosting-build', '.vite'}
CPP_SUFFIXES = {'.cpp', '.cc', '.cxx'}


def hosting_root():
    root = Path(settings.DEPLOYMENT_STORAGE_PATH).resolve()
    if root.is_relative_to(Path(settings.MEDIA_ROOT).resolve()):
        raise HostingError('DEPLOYMENT_STORAGE_PATH must be outside public media storage.')
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    return root


def storage_dir(session):
    return hosting_root() / str(session.deployment_id)


def save_upload(upload, destination):
    if not upload or not upload.name.lower().endswith('.zip'):
        raise HostingError('Upload a .zip file containing the website.')
    limit = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if upload.size > limit:
        raise HostingError(f'ZIP upload exceeds the {settings.MAX_UPLOAD_SIZE_MB} MB limit.')
    size = 0
    with Path(destination).open('wb') as output:
        for chunk in upload.chunks():
            size += len(chunk)
            if size > limit:
                raise HostingError(f'ZIP upload exceeds the {settings.MAX_UPLOAD_SIZE_MB} MB limit.')
            output.write(chunk)


def validate_zip(source):
    try:
        with zipfile.ZipFile(source) as archive:
            members = archive.infolist()
            if not members:
                raise HostingError('ZIP is empty.')
            if len(members) > settings.DEPLOYMENT_MAX_FILES:
                raise HostingError(f'ZIP contains too many files: {len(members):,} entries; the limit is '
                                   f'{settings.DEPLOYMENT_MAX_FILES:,}. Remove venv, .venv, node_modules, '
                                   '.git and caches before creating the ZIP.')
            total, seen = 0, set()
            for member in members:
                name = member.filename
                path = PurePosixPath(name)
                mode = member.external_attr >> 16
                if (not name or '\\' in name or '\x00' in name or ':' in name
                        or path.is_absolute() or '..' in path.parts
                        or any(ord(c) < 32 for c in name)):
                    raise HostingError('ZIP contains an unsafe path.')
                kind = stat.S_IFMT(mode)
                if kind not in (0, stat.S_IFREG, stat.S_IFDIR):
                    raise HostingError('ZIP symbolic links and special files are not allowed.')
                normalized = str(path).rstrip('/').casefold()
                if normalized in seen:
                    raise HostingError('ZIP contains duplicate file paths.')
                seen.add(normalized)
                if member.flag_bits & 1:
                    raise HostingError('Encrypted ZIPs are not supported.')
                total += member.file_size
                if total > settings.DEPLOYMENT_MAX_EXTRACTED_MB * 1024 * 1024:
                    raise HostingError('ZIP exceeds the extracted size limit.')
            return members
    except (zipfile.BadZipFile, OSError, NotImplementedError) as exc:
        raise HostingError(f'Invalid ZIP: {exc}') from exc


def safe_extract_zip(source, destination):
    members = validate_zip(source)
    destination = Path(destination).resolve()
    destination.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(source) as archive:
            total = 0
            for member in members:
                parts = PurePosixPath(member.filename).parts
                # Packages must declare dependencies; never reuse bundled host environments.
                if any(p in IGNORED or p == '.env' or p.startswith('.env.') for p in parts):
                    continue
                target = (destination / member.filename).resolve()
                if not target.is_relative_to(destination):
                    raise HostingError('ZIP contains an unsafe path.')
                if member.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(member) as src, target.open('xb') as dst:
                    while chunk := src.read(65536):
                        total += len(chunk)
                        if total > settings.DEPLOYMENT_MAX_EXTRACTED_MB * 1024 * 1024:
                            raise HostingError('ZIP exceeds the extracted size limit.')
                        dst.write(chunk)
                target.chmod(0o755 if (member.external_attr >> 16) & 0o111 else 0o644)
    except (zipfile.BadZipFile, OSError, RuntimeError, NotImplementedError) as exc:
        raise HostingError(f'ZIP extraction failed: {exc}') from exc


def normalize_project_root(path):
    path = Path(path)
    markers = {'index.html', 'index.php', 'package.json', 'requirements.txt', 'manage.py',
               'app.py', 'server.js', 'index.js', 'composer.json', 'Gemfile', 'config.ru',
               'app.rb', 'server.rb', 'pom.xml', 'build.gradle', 'hosting.json'}
    for _ in range(20):
        entries = [p for p in path.iterdir() if p.name not in IGNORED]
        if any(p.name in markers or p.suffix in CPP_SUFFIXES for p in entries if p.is_file()):
            return path
        directories = [p for p in entries if p.is_dir()]
        if len(directories) != 1:
            return path
        path = directories[0]
    raise HostingError('Project root is nested too deeply.')


def preserve_legacy_source(session):
    """Import existing saved configurations without executing their host commands."""
    root = Path(settings.MEDIA_ROOT).resolve() / 'temporary_hosting'
    source = Path(session.project_dir).resolve()
    if not source.is_relative_to(root) or not source.is_dir():
        raise HostingError('Saved system files are missing or outside legacy hosting storage.')
    destination = storage_dir(session) / 'source.zip'
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    total, count = 0, 0
    with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as archive:
        for folder, directories, files in os.walk(source, followlinks=False):
            directories[:] = [d for d in directories if d not in IGNORED]
            for name in files:
                file = Path(folder) / name
                if file.is_symlink():
                    raise HostingError('Legacy project contains symbolic links; upload a safe ZIP.')
                if name != 'preview.log':
                    total += file.stat().st_size
                    count += 1
                    if total > settings.DEPLOYMENT_MAX_EXTRACTED_MB * 1024 * 1024 or count > settings.DEPLOYMENT_MAX_FILES:
                        raise HostingError('Legacy project exceeds deployment extraction limits.')
                    archive.write(file, file.relative_to(source))
    validate_zip(destination)
    return destination


def clean_app(session):
    app = storage_dir(session) / 'app'
    if app.exists():
        shutil.rmtree(app)
    for name in ('source.tar', 'proxy.conf'):
        (storage_dir(session) / name).unlink(missing_ok=True)
