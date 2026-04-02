"""
runner.py — Repository Code Runner

Detects the primary runnable entry point from an uploaded file (single source
file or ZIP archive), extracts the code, determines the language, and delegates
execution to the existing code_execution.executor sandbox.

Supported strategies (in priority order per archive):
  1. main.py / app.py / solution.py / index.py    → Python
  2. Main.java / App.java / Solution.java          → Java
  3. main.cpp / app.cpp / solution.cpp             → C++
  4. Any *.py                                      → Python
  5. Any *.java                                    → Java
  6. Any *.cpp / *.cc                              → C++
"""

import os
import zipfile
import tarfile
import tempfile
import shutil

from code_execution.executor import execute_code

# ── Language detection ──────────────────────────────────────────────────────

EXTENSION_LANGUAGE = {
    'py':   'python',
    'java': 'java',
    'cpp':  'cpp',
    'cc':   'cpp',
    'cxx':  'cpp',
}

# Preferred entry-point filenames (checked in order)
ENTRY_POINT_PRIORITY = [
    # Python
    ('main.py',     'python'),
    ('app.py',      'python'),
    ('solution.py', 'python'),
    ('index.py',    'python'),
    ('run.py',      'python'),
    # Java
    ('Main.java',   'java'),
    ('App.java',    'java'),
    ('Solution.java','java'),
    # C++
    ('main.cpp',    'cpp'),
    ('app.cpp',     'cpp'),
    ('solution.cpp','cpp'),
    ('main.cc',     'cpp'),
]


def _ext(filename: str) -> str:
    """Return lowercase extension without dot, or empty string."""
    return filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''


def _detect_from_extension(filename: str):
    """Return (language, None) or (None, None)."""
    lang = EXTENSION_LANGUAGE.get(_ext(filename))
    return lang


def _find_entry_in_namelist(names: list[str]):
    """
    Given a list of filenames inside an archive, pick the best entry point.
    Returns (archive_member_name, language) or (None, None).
    """
    # Strip leading path prefix if all files share a common root dir
    # (e.g. project-1/src/main.py → try both project-1/src/main.py and main.py)
    basenames = {os.path.basename(n): n for n in names if not n.endswith('/')}

    # 1. Priority list match (case-sensitive basename)
    for preferred, lang in ENTRY_POINT_PRIORITY:
        if preferred in basenames:
            return basenames[preferred], lang

    # 2. Any runnable source file — prefer Python > Java > C++
    for lang_ext, lang in [('py', 'python'), ('java', 'java'), ('cpp', 'cpp'), ('cc', 'cpp')]:
        candidates = [n for n in names if _ext(n) == lang_ext and not n.endswith('/')]
        if candidates:
            return candidates[0], lang

    return None, None


# ── Public API ──────────────────────────────────────────────────────────────

class RunnerError(Exception):
    """Raised when we cannot determine how to run the uploaded file."""


def run_repository_file(file_path: str, original_filename: str,
                         stdin_input: str = '',
                         entry_override: str = '') -> dict:
    """
    Run an uploaded repository file/archive through the sandbox.

    Args:
        file_path:         Absolute path to the uploaded file on disk.
        original_filename: Original filename (used for type detection).
        stdin_input:       Optional stdin to feed to the program.
        entry_override:    If set (e.g. "src/main.py"), force this archive
                           member as the entry point.

    Returns:
        A dict with keys: language, status, stdout, stderr, exit_code,
        execution_time_ms, timed_out, entry_file.
    """
    ext = _ext(original_filename)

    # ── Case 1: Single source file ──────────────────────────────────────────
    if ext not in ('zip', 'tar', 'gz', 'rar', 'bz2', 'xz', '7z', 'tgz'):
        lang = _detect_from_extension(original_filename)
        if not lang:
            raise RunnerError(
                f'Cannot run this file type ({ext or "unknown"}). '
                f'Supported: .py, .java, .cpp'
            )
        with open(file_path, 'r', errors='replace') as f:
            source_code = f.read()

        result = execute_code(lang, source_code, stdin_input)
        result['entry_file'] = original_filename
        result['language'] = lang
        return result

    # ── Case 2: ZIP archive ─────────────────────────────────────────────────
    if zipfile.is_zipfile(file_path):
        with zipfile.ZipFile(file_path, 'r') as zf:
            names = zf.namelist()

            if entry_override:
                member = entry_override.strip('/')
                # Verify it exists
                matches = [n for n in names if n.strip('/') == member]
                if not matches:
                    raise RunnerError(f'Entry file "{entry_override}" not found in archive.')
                member = matches[0]
                lang_from_ext = _detect_from_extension(os.path.basename(member))
                lang = lang_from_ext or 'python'
            else:
                member, lang = _find_entry_in_namelist(names)
                if not member:
                    raise RunnerError(
                        'No runnable entry point found in the archive. '
                        'Expected one of: main.py, Main.java, main.cpp, '
                        'or any .py/.java/.cpp file.'
                    )

            source_code = zf.read(member).decode('utf-8', errors='replace')

        result = execute_code(lang, source_code, stdin_input)
        result['entry_file'] = member
        result['language'] = lang
        return result

    # ── Case 3: TAR archive ─────────────────────────────────────────────────
    try:
        with tarfile.open(file_path, 'r:*') as tf:
            names = [m.name for m in tf.getmembers() if not m.isdir()]

            if entry_override:
                member = entry_override.strip('/')
                matches = [n for n in names if n.strip('/') == member]
                if not matches:
                    raise RunnerError(f'Entry file "{entry_override}" not found in archive.')
                member = matches[0]
                lang = _detect_from_extension(os.path.basename(member)) or 'python'
            else:
                member, lang = _find_entry_in_namelist(names)
                if not member:
                    raise RunnerError(
                        'No runnable entry point found in the archive. '
                        'Expected one of: main.py, Main.java, main.cpp, '
                        'or any .py/.java/.cpp file.'
                    )

            f = tf.extractfile(member)
            source_code = f.read().decode('utf-8', errors='replace')

        result = execute_code(lang, source_code, stdin_input)
        result['entry_file'] = member
        result['language'] = lang
        return result

    except tarfile.TarError:
        pass

    raise RunnerError(
        f'Unsupported archive format "{original_filename}". '
        f'Supported archives: .zip, .tar, .tar.gz, .tgz'
    )


def list_runnable_files(file_path: str, original_filename: str) -> list[dict]:
    """
    Return a list of all runnable source files found in an archive,
    each as {'path': str, 'language': str}.
    For single source files, returns a one-element list (or empty if not runnable).
    """
    ext = _ext(original_filename)
    runnable = []

    if ext not in ('zip', 'tar', 'gz', 'rar', 'bz2', 'xz', '7z', 'tgz'):
        lang = _detect_from_extension(original_filename)
        if lang:
            runnable.append({'path': original_filename, 'language': lang})
        return runnable

    names = []
    if zipfile.is_zipfile(file_path):
        with zipfile.ZipFile(file_path, 'r') as zf:
            names = [n for n in zf.namelist() if not n.endswith('/')]
    else:
        try:
            with tarfile.open(file_path, 'r:*') as tf:
                names = [m.name for m in tf.getmembers() if not m.isdir()]
        except tarfile.TarError:
            return runnable

    for name in names:
        lang = _detect_from_extension(os.path.basename(name))
        if lang:
            runnable.append({'path': name, 'language': lang})

    return runnable
