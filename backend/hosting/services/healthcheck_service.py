import http.client
import time

from django.conf import settings

from .errors import HostingError


def public_health_path(session):
    if session.project_type == 'fullstack':
        from .fullstack_docker import read_state
        if (read_state(session) or {}).get('frontend', True) is False:
            return '/__hosting_backend_health__/'
    return None


def check_http(port, container_id=None, timeout=2, path=None):
    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=max(0.05, timeout))
    try:
        headers = {'Host': f'localhost:{port}'}
        if container_id:
            headers['X-Hosting-Container'] = container_id
        connection.request('GET', path or settings.DEPLOYMENT_HEALTHCHECK_PATH, headers=headers)
        response = connection.getresponse()
        return 200 <= response.status < 400, f'HTTP {response.status}'
    except (OSError, http.client.HTTPException) as exc:
        return False, str(exc)
    finally:
        connection.close()


def wait_until_healthy(session, docker, cancelled):
    deadline = time.monotonic() + settings.HEALTHCHECK_TIMEOUT_SECONDS
    error = 'No HTTP response.'
    while time.monotonic() < deadline:
        cancelled()
        info = docker.inspect(session.container_name)
        if not info or not info['State']['Running']:
            if info:
                session.exit_code = info['State']['ExitCode']
                session.save(update_fields=['exit_code'])
            message = 'Backend exited during startup or database migration.' if session.project_type == 'fullstack' else 'Application exited before becoming healthy.'
            raise HostingError(message + ' See runtime logs.')
        health_path = public_health_path(session)
        healthy, error = check_http(session.port, session.container_id, path=health_path)
        if healthy and session.project_type == 'fullstack':
            healthy, error = docker.services_healthy(session)
            if healthy and health_path is None:
                healthy, error = check_http(session.port, session.container_id, path='/__hosting_backend_health__/')
        if healthy:
            return
        time.sleep(0.5)
    raise HostingError(f'Health check timed out: {error}. Listen on 0.0.0.0:{session.internal_port} and serve the health-check path.')
