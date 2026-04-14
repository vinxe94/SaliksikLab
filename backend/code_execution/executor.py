"""
Secure sandbox executor for Python, Java, and C++.

Security measures implemented:
  - Isolated temporary working directory (deleted after execution)
  - Hard wall-clock timeout  (EXEC_TIMEOUT_SECONDS)
  - Process memory cap via resource.setrlimit (POSIX only)
  - stdout/stderr byte cap to prevent output-flooding attacks
  - Subprocess isolation (no shell=True for runtime commands)
  - Forbidden keyword blacklist for Python (imports that hit the FS/network)
"""

import os
import resource
import subprocess
import tempfile
import time
import hashlib
import re
import shutil
import logging

logger = logging.getLogger(__name__)

# ── Sandbox limits ─────────────────────────────────────────────────────────────
EXEC_TIMEOUT_SECONDS = 10          # wall-clock kill timeout
MAX_OUTPUT_BYTES     = 64 * 1024   # 64 KB – stdout + stderr cap
MAX_MEMORY_BYTES     = 128 * 1024 * 1024  # 128 MB virtual address space

# ── Forbidden Python imports (block dangerous stdlib access) ───────────────────
PYTHON_FORBIDDEN = re.compile(
    r'\b(import\s+os|import\s+sys|import\s+subprocess|import\s+socket'
    r'|import\s+shutil|import\s+pathlib|import\s+glob|import\s+ctypes'
    r'|from\s+os\s+import|from\s+sys\s+import|from\s+subprocess\s+import'
    r'|__import__|exec\s*\(|eval\s*\(|open\s*\(|compile\s*\()\b'
)


def _set_limits():
    """Called in child process before exec – applies resource caps."""
    try:
        resource.setrlimit(resource.RLIMIT_AS, (MAX_MEMORY_BYTES, MAX_MEMORY_BYTES))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))  # no core dumps
    except Exception:
        pass  # non-POSIX or already restricted


def _set_limits_no_as():
    """Lighter limits for JVM-based runtimes (Java).
    
    The JVM maps large chunks of virtual address space (for class data sharing,
    code cache, etc.) that far exceed the 128 MB RLIMIT_AS cap, causing SIGSEGV.
    We rely on the -Xmx JVM flag for heap capping instead.
    """
    try:
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    except Exception:
        pass



def _run(cmd: list, stdin_data: str, cwd: str, use_limits: bool = True) -> dict:
    """Run a command with timeout, return {stdout, stderr, exit_code, time_ms}."""
    preexec = _set_limits if use_limits else _set_limits_no_as
    t0 = time.monotonic()
    try:
        proc = subprocess.run(
            cmd,
            input=stdin_data,
            capture_output=True,
            text=True,
            timeout=EXEC_TIMEOUT_SECONDS,
            cwd=cwd,
            preexec_fn=preexec,
        )
        elapsed = (time.monotonic() - t0) * 1000
        return {
            'stdout': proc.stdout[:MAX_OUTPUT_BYTES],
            'stderr': proc.stderr[:MAX_OUTPUT_BYTES],
            'exit_code': proc.returncode,
            'time_ms': round(elapsed, 2),
            'timed_out': False,
        }
    except subprocess.TimeoutExpired:
        elapsed = (time.monotonic() - t0) * 1000
        return {
            'stdout': '',
            'stderr': f'⏰ Execution timed out after {EXEC_TIMEOUT_SECONDS}s.',
            'exit_code': -1,
            'time_ms': round(elapsed, 2),
            'timed_out': True,
        }


# ── Language runners ───────────────────────────────────────────────────────────

def run_python(source_code: str, stdin_input: str) -> dict:
    """Execute Python 3 code in an isolated temp directory."""
    # Security: reject forbidden imports
    if PYTHON_FORBIDDEN.search(source_code):
        return {
            'stdout': '',
            'stderr': '🚫 Security Error: Restricted import or built-in detected.',
            'exit_code': 1,
            'time_ms': 0,
            'timed_out': False,
        }

    tmpdir = tempfile.mkdtemp(prefix='saliksik_py_')
    try:
        src_path = os.path.join(tmpdir, 'main.py')
        with open(src_path, 'w') as f:
            f.write(source_code)

        result = _run(['python3', '-I', '-B', src_path], stdin_input, tmpdir)
        if (
            not stdin_input.strip()
            and result.get('exit_code') != 0
            and 'EOFError' in (result.get('stderr') or '')
        ):
            result['stderr'] = (
                f'{result["stderr"]}\n\n'
                'Tip: Your program called input(), but no stdin was provided. '
                'Add input values (one per line) in the IDE stdin box.'
            )
        result['language'] = 'python'
        return result
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def run_java(source_code: str, stdin_input: str) -> dict:
    """Compile and execute a Java program."""
    # Extract public class name
    match = re.search(r'public\s+class\s+(\w+)', source_code)
    class_name = match.group(1) if match else 'Main'

    tmpdir = tempfile.mkdtemp(prefix='saliksik_java_')
    try:
        src_path = os.path.join(tmpdir, f'{class_name}.java')
        with open(src_path, 'w') as f:
            f.write(source_code)

        # Compile
        compile_result = _run(
            ['javac', src_path],
            '',
            tmpdir,
            use_limits=False,
        )
        if compile_result['exit_code'] != 0:
            compile_result['language'] = 'java'
            compile_result['stdout'] = ''
            compile_result['stderr'] = '🔨 Compilation Error:\n' + compile_result['stderr']
            return compile_result

        # Run
        run_result = _run(
            ['java', '-cp', tmpdir, '-Xmx64m', '-Xss2m', class_name],
            stdin_input,
            tmpdir,
            use_limits=False,
        )
        run_result['language'] = 'java'
        run_result['time_ms'] = compile_result['time_ms'] + run_result['time_ms']
        return run_result
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def run_cpp(source_code: str, stdin_input: str) -> dict:
    """Compile and execute a C++ program with g++."""
    tmpdir = tempfile.mkdtemp(prefix='saliksik_cpp_')
    try:
        src_path = os.path.join(tmpdir, 'main.cpp')
        bin_path = os.path.join(tmpdir, 'main')
        with open(src_path, 'w') as f:
            f.write(source_code)

        # Compile
        compile_result = _run(
            ['g++', '-O2', '-std=c++17', '-o', bin_path, src_path],
            '',
            tmpdir,
        )
        if compile_result['exit_code'] != 0:
            compile_result['language'] = 'cpp'
            compile_result['stdout'] = ''
            compile_result['stderr'] = '🔨 Compilation Error:\n' + compile_result['stderr']
            return compile_result

        # Run
        run_result = _run([bin_path], stdin_input, tmpdir)
        run_result['language'] = 'cpp'
        run_result['time_ms'] = compile_result['time_ms'] + run_result['time_ms']
        return run_result
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


# ── Public API ─────────────────────────────────────────────────────────────────

RUNNERS = {
    'python': run_python,
    'java':   run_java,
    'cpp':    run_cpp,
}


def execute_code(language: str, source_code: str, stdin_input: str = '') -> dict:
    """
    Main entry point.  Returns a normalised result dict:
      {language, stdout, stderr, exit_code, time_ms, timed_out, status}
    """
    runner = RUNNERS.get(language)
    if runner is None:
        return {
            'language': language,
            'stdout': '',
            'stderr': f'Unsupported language: {language}',
            'exit_code': 1,
            'time_ms': 0,
            'timed_out': False,
            'status': 'error',
        }

    logger.info(f"[Executor] Running {language} ({len(source_code)} chars)")
    result = runner(source_code, stdin_input)

    if result['timed_out']:
        result['status'] = 'timeout'
    elif result['exit_code'] == 0:
        result['status'] = 'success'
    else:
        result['status'] = 'error'

    return result
