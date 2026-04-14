import os
import re
import tarfile
import zipfile
from pathlib import PurePosixPath

from django.conf import settings


class UploadSecurityError(ValueError):
    pass


FILENAME_SAFE_RE = re.compile(r'[^A-Za-z0-9._-]+')
MAGIC_CHECK_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'gif', 'zip'}


def _rewind(uploaded, pos):
    if hasattr(uploaded, 'seek'):
        uploaded.seek(pos if pos is not None else 0)


def _peek(uploaded, size=32):
    pos = uploaded.tell() if hasattr(uploaded, 'tell') else None
    data = uploaded.read(size)
    _rewind(uploaded, pos)
    return data or b''


def _sanitize_filename(filename):
    name = os.path.basename(str(filename or ''))
    name = name.replace('\x00', '')
    name = ''.join(ch for ch in name if ord(ch) >= 32 and ord(ch) != 127)
    name = re.sub(r'\s+', '_', name).strip('._ ')
    name = FILENAME_SAFE_RE.sub('_', name)
    if not name:
        raise UploadSecurityError('Invalid filename.')
    if len(name) > 180:
        stem, ext = os.path.splitext(name)
        keep = 180 - len(ext)
        name = f'{stem[:max(1, keep)]}{ext}'
    return name


def _is_safe_archive_path(path):
    norm = str(PurePosixPath(path or ''))
    if not norm or norm in ('.', '/'):
        return False
    if norm.startswith('/') or norm.startswith('\\'):
        return False
    parts = PurePosixPath(norm).parts
    if any(part in ('..', '') for part in parts):
        return False
    return True


def _validate_magic(uploaded, ext):
    data = _peek(uploaded, 16)
    if ext == 'pdf' and not data.startswith(b'%PDF-'):
        raise UploadSecurityError('Invalid PDF file signature.')
    if ext == 'png' and not data.startswith(b'\x89PNG\r\n\x1a\n'):
        raise UploadSecurityError('Invalid PNG file signature.')
    if ext in ('jpg', 'jpeg') and not data.startswith(b'\xff\xd8\xff'):
        raise UploadSecurityError('Invalid JPEG file signature.')
    if ext == 'gif' and not (data.startswith(b'GIF87a') or data.startswith(b'GIF89a')):
        raise UploadSecurityError('Invalid GIF file signature.')
    if ext == 'zip' and not zipfile.is_zipfile(uploaded):
        raise UploadSecurityError('Invalid ZIP archive.')


def _inspect_zip(uploaded):
    max_files = int(getattr(settings, 'UPLOAD_MAX_ARCHIVE_FILES', 2000))
    max_total = int(getattr(settings, 'UPLOAD_MAX_ARCHIVE_TOTAL_UNCOMPRESSED_BYTES', 524288000))  # 500MB
    max_member = int(getattr(settings, 'UPLOAD_MAX_ARCHIVE_MEMBER_SIZE_BYTES', 104857600))  # 100MB
    max_ratio = int(getattr(settings, 'UPLOAD_MAX_ARCHIVE_COMPRESSION_RATIO', 200))

    pos = uploaded.tell() if hasattr(uploaded, 'tell') else None
    _rewind(uploaded, 0)
    try:
        with zipfile.ZipFile(uploaded, 'r') as zf:
            infos = zf.infolist()
            if len(infos) > max_files:
                raise UploadSecurityError(f'Archive contains too many files (max {max_files}).')

            total_uncompressed = 0
            for info in infos:
                if info.flag_bits & 0x1:
                    raise UploadSecurityError('Encrypted ZIP archives are not allowed.')
                if not _is_safe_archive_path(info.filename):
                    raise UploadSecurityError('Archive contains unsafe file paths.')
                if info.is_dir():
                    continue
                if info.file_size > max_member:
                    raise UploadSecurityError(f'Archive contains oversized files (max {max_member // (1024 * 1024)}MB each).')
                total_uncompressed += info.file_size
                if total_uncompressed > max_total:
                    raise UploadSecurityError(f'Archive is too large when unpacked (max {max_total // (1024 * 1024)}MB).')
                if info.compress_size > 0:
                    ratio = info.file_size / max(info.compress_size, 1)
                    if ratio > max_ratio:
                        raise UploadSecurityError('Archive compression ratio is suspiciously high.')
    finally:
        _rewind(uploaded, pos)


def _inspect_tar(uploaded):
    max_files = int(getattr(settings, 'UPLOAD_MAX_ARCHIVE_FILES', 2000))
    max_total = int(getattr(settings, 'UPLOAD_MAX_ARCHIVE_TOTAL_UNCOMPRESSED_BYTES', 524288000))  # 500MB
    max_member = int(getattr(settings, 'UPLOAD_MAX_ARCHIVE_MEMBER_SIZE_BYTES', 104857600))  # 100MB

    pos = uploaded.tell() if hasattr(uploaded, 'tell') else None
    _rewind(uploaded, 0)
    try:
        try:
            tf = tarfile.open(fileobj=uploaded, mode='r:*')
        except tarfile.TarError:
            # For plain .gz uploads that are not tar archives, skip deep inspection.
            return

        with tf:
            members = tf.getmembers()
            if len(members) > max_files:
                raise UploadSecurityError(f'Archive contains too many files (max {max_files}).')

            total_uncompressed = 0
            for member in members:
                if not _is_safe_archive_path(member.name):
                    raise UploadSecurityError('Archive contains unsafe file paths.')
                if member.issym() or member.islnk() or member.ischr() or member.isblk() or member.isfifo():
                    raise UploadSecurityError('Archive contains unsafe links or special files.')
                if not member.isfile():
                    continue
                if member.size > max_member:
                    raise UploadSecurityError(f'Archive contains oversized files (max {max_member // (1024 * 1024)}MB each).')
                total_uncompressed += member.size
                if total_uncompressed > max_total:
                    raise UploadSecurityError(f'Archive is too large when unpacked (max {max_total // (1024 * 1024)}MB).')
    finally:
        _rewind(uploaded, pos)


def validate_and_normalize_upload(uploaded):
    if uploaded is None:
        raise UploadSecurityError('No file provided.')

    start_pos = uploaded.tell() if hasattr(uploaded, 'tell') else None

    max_size = int(getattr(settings, 'UPLOAD_MAX_FILE_SIZE_BYTES', 104857600))  # 100MB
    allowed = set(getattr(settings, 'ALLOWED_UPLOAD_EXTENSIONS', []))

    try:
        safe_name = _sanitize_filename(uploaded.name)
        uploaded.name = safe_name

        if not safe_name or '.' not in safe_name:
            raise UploadSecurityError('File extension is required.')
        ext = safe_name.rsplit('.', 1)[-1].lower()

        if ext not in allowed:
            raise UploadSecurityError(f'File type ".{ext}" is not allowed.')
        if uploaded.size <= 0:
            raise UploadSecurityError('Empty files are not allowed.')
        if uploaded.size > max_size:
            raise UploadSecurityError(f'File size cannot exceed {max_size // (1024 * 1024)} MB.')

        if ext in MAGIC_CHECK_EXTENSIONS:
            _validate_magic(uploaded, ext)

        if ext == 'zip':
            _inspect_zip(uploaded)
        elif ext in ('tar', 'tgz', 'gz'):
            _inspect_tar(uploaded)

        return uploaded
    finally:
        _rewind(uploaded, start_pos)
