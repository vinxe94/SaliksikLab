"""
Utility module for browsing contents of uploaded files.
Supports ZIP archives and single files.
"""
import os
import zipfile
import tarfile
import mimetypes
from datetime import datetime


# Maximum file size we'll read for content preview (512KB)
MAX_PREVIEW_SIZE = 512 * 1024

# Text-previewable extensions
TEXT_EXTENSIONS = {
    'py', 'js', 'ts', 'jsx', 'tsx', 'java', 'c', 'cpp', 'h', 'hpp',
    'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'scala',
    'html', 'htm', 'css', 'scss', 'less', 'sass',
    'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
    'md', 'txt', 'rst', 'csv', 'tsv', 'log',
    'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1',
    'sql', 'r', 'R', 'lua', 'perl', 'pl',
    'dockerfile', 'makefile', 'cmake',
    'gitignore', 'gitattributes', 'env', 'editorconfig',
    'lock', 'sum',
}

IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'}

PDF_EXTENSIONS = {'pdf'}

BINARY_EXTENSIONS = {
    'zip', 'tar', 'gz', 'rar', '7z', 'bz2', 'xz',
    'exe', 'dll', 'so', 'dylib', 'bin',
    'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'mp3', 'mp4', 'avi', 'mov', 'wav', 'flac',
    'ttf', 'otf', 'woff', 'woff2', 'eot',
}


def get_file_extension(filename):
    """Get lowercase extension without dot."""
    if '.' in filename:
        return filename.rsplit('.', 1)[-1].lower()
    # Check for extensionless known files
    basename = os.path.basename(filename).lower()
    if basename in ('makefile', 'dockerfile', 'readme', 'license',
                    'changelog', 'authors', 'contributing',
                    '.gitignore', '.gitattributes', '.env', '.editorconfig'):
        return basename.lstrip('.')
    return ''


def get_file_type(filename):
    """Determine file type category from extension."""
    ext = get_file_extension(filename)
    if ext in TEXT_EXTENSIONS:
        return 'text'
    if ext in IMAGE_EXTENSIONS:
        return 'image'
    if ext in PDF_EXTENSIONS:
        return 'pdf'
    if ext in BINARY_EXTENSIONS:
        return 'binary'
    # Try to guess
    mime, _ = mimetypes.guess_type(filename)
    if mime and mime.startswith('text/'):
        return 'text'
    return 'binary'


def is_zip_file(filepath):
    """Check if file is a ZIP archive."""
    return zipfile.is_zipfile(filepath)


def is_tar_file(filepath):
    """Check if file is a TAR archive (including .tar.gz, .tar.bz2)."""
    try:
        tarfile.open(filepath, 'r:*').close()
        return True
    except (tarfile.TarError, IOError):
        return False


def list_zip_contents(filepath, path=''):
    """
    List contents of a ZIP file at the given path level.
    Returns a list of dicts with file/folder info.
    """
    entries = {}
    path = path.strip('/')

    with zipfile.ZipFile(filepath, 'r') as zf:
        for info in zf.infolist():
            name = info.filename

            # Skip the root directory itself and __MACOSX
            if name.startswith('__MACOSX'):
                continue

            # Normalize: remove leading path prefix if all files share one
            parts = name.strip('/').split('/')

            # If we have a path filter, check if file is under that path
            if path:
                path_parts = path.split('/')
                if parts[:len(path_parts)] != path_parts:
                    continue
                # Get the remaining parts after the path
                remaining = parts[len(path_parts):]
            else:
                remaining = parts

            if not remaining or (len(remaining) == 1 and remaining[0] == ''):
                continue

            # We only want immediate children
            entry_name = remaining[0]

            if entry_name in entries:
                # Already added this entry
                if len(remaining) > 1:
                    # Has children, so it's a directory
                    entries[entry_name]['type'] = 'dir'
                continue

            is_dir = info.is_dir() if len(remaining) == 1 else True

            # Get modification time
            try:
                mod_time = datetime(*info.date_time).isoformat()
            except (ValueError, TypeError):
                mod_time = None

            entries[entry_name] = {
                'name': entry_name,
                'path': f'{path}/{entry_name}'.strip('/'),
                'type': 'dir' if is_dir or len(remaining) > 1 else 'file',
                'size': info.file_size if not is_dir and len(remaining) == 1 else 0,
                'last_modified': mod_time,
                'extension': get_file_extension(entry_name) if not is_dir and len(remaining) == 1 else '',
                'file_type': get_file_type(entry_name) if not is_dir and len(remaining) == 1 else 'dir',
            }

    # Sort: directories first, then files, alphabetically
    result = sorted(entries.values(), key=lambda x: (x['type'] != 'dir', x['name'].lower()))
    return result


def read_zip_file_content(filepath, inner_path):
    """
    Read the content of a specific file inside a ZIP archive.
    Returns (content_bytes, filename, file_type) or raises FileNotFoundError.
    """
    with zipfile.ZipFile(filepath, 'r') as zf:
        # Try exact path first
        try:
            data = zf.read(inner_path)
            return data, os.path.basename(inner_path), get_file_type(inner_path)
        except KeyError:
            pass

        # Try with trailing variations
        for info in zf.infolist():
            if info.filename.strip('/') == inner_path.strip('/'):
                data = zf.read(info.filename)
                return data, os.path.basename(info.filename), get_file_type(info.filename)

    raise FileNotFoundError(f'File "{inner_path}" not found in archive.')


def list_tar_contents(filepath, path=''):
    """List contents of a TAR file at the given path level."""
    entries = {}
    path = path.strip('/')

    with tarfile.open(filepath, 'r:*') as tf:
        for member in tf.getmembers():
            name = member.name
            parts = name.strip('/').split('/')

            if path:
                path_parts = path.split('/')
                if parts[:len(path_parts)] != path_parts:
                    continue
                remaining = parts[len(path_parts):]
            else:
                remaining = parts

            if not remaining or (len(remaining) == 1 and remaining[0] == ''):
                continue

            entry_name = remaining[0]

            if entry_name in entries:
                if len(remaining) > 1:
                    entries[entry_name]['type'] = 'dir'
                continue

            is_dir = member.isdir() if len(remaining) == 1 else True

            mod_time = datetime.fromtimestamp(member.mtime).isoformat() if member.mtime else None

            entries[entry_name] = {
                'name': entry_name,
                'path': f'{path}/{entry_name}'.strip('/'),
                'type': 'dir' if is_dir or len(remaining) > 1 else 'file',
                'size': member.size if not is_dir and len(remaining) == 1 else 0,
                'last_modified': mod_time,
                'extension': get_file_extension(entry_name) if not is_dir and len(remaining) == 1 else '',
                'file_type': get_file_type(entry_name) if not is_dir and len(remaining) == 1 else 'dir',
            }

    result = sorted(entries.values(), key=lambda x: (x['type'] != 'dir', x['name'].lower()))
    return result


def read_tar_file_content(filepath, inner_path):
    """Read content of a specific file inside a TAR archive."""
    with tarfile.open(filepath, 'r:*') as tf:
        for member in tf.getmembers():
            if member.name.strip('/') == inner_path.strip('/'):
                f = tf.extractfile(member)
                if f is None:
                    raise FileNotFoundError(f'Cannot read "{inner_path}" (may be a directory or link).')
                data = f.read()
                return data, os.path.basename(member.name), get_file_type(member.name)

    raise FileNotFoundError(f'File "{inner_path}" not found in archive.')


def list_single_file(filepath, original_filename):
    """For non-archive files, return info about the single file."""
    stat = os.stat(filepath)
    mod_time = datetime.fromtimestamp(stat.st_mtime).isoformat()

    return [{
        'name': original_filename,
        'path': original_filename,
        'type': 'file',
        'size': stat.st_size,
        'last_modified': mod_time,
        'extension': get_file_extension(original_filename),
        'file_type': get_file_type(original_filename),
    }]


def browse_file(filepath, original_filename, path=''):
    """
    Main entry point: browse the contents of an uploaded file.
    For archives, lists the directory structure.
    For single files, returns info about the file itself.
    """
    if is_zip_file(filepath):
        return {
            'archive_type': 'zip',
            'entries': list_zip_contents(filepath, path),
            'current_path': path,
        }
    elif is_tar_file(filepath):
        return {
            'archive_type': 'tar',
            'entries': list_tar_contents(filepath, path),
            'current_path': path,
        }
    else:
        return {
            'archive_type': None,
            'entries': list_single_file(filepath, original_filename),
            'current_path': '',
        }


def read_file_content(filepath, original_filename, inner_path):
    """
    Read a specific file's content.
    For archives, reads the file within the archive.
    For single files, reads the file itself.
    """
    if is_zip_file(filepath):
        data, name, file_type = read_zip_file_content(filepath, inner_path)
    elif is_tar_file(filepath):
        data, name, file_type = read_tar_file_content(filepath, inner_path)
    else:
        # Single file - just read it
        with open(filepath, 'rb') as f:
            data = f.read(MAX_PREVIEW_SIZE)
        name = original_filename
        file_type = get_file_type(original_filename)

    return data, name, file_type
