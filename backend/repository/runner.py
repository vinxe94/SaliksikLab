"""
runner.py — Repository Code Runner

Detects runnable files from an uploaded file or archive. Direct execution is
disabled.

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
    """Direct code execution is disabled."""
    raise RunnerError('Code execution has been disabled.')


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
