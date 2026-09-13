"""One trusted Cloudflare Quick Tunnel per temporary deployment."""
import re
import time
from urllib.parse import urlsplit
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener

from django.conf import settings

from .archive_service import storage_dir
from .errors import HostingError
from .log_service import append_log
from .public_http import TunnelHTTPSHandler


QUICK_URL = re.compile(r'https://[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com(?=[\s"/|]|$)')


def tunnel_hostname(session):
    return f'{session.deployment_id}.{settings.DEPLOYMENT_TUNNEL_HOST_SUFFIX}'


def public_route_ready(url, session, timeout):
    """A pending app must return our gateway's 410, never a platform page."""
    try:
        try:
            response = build_opener(TunnelHTTPSHandler()).open(
                Request(url, headers={'Cache-Control': 'no-cache'}), timeout=timeout)
        except HTTPError as error:
            response = error
        with response:
            return (response.status == 410 and response.headers.get('X-Hosting-Deployment') == str(session.deployment_id),
                    f'Public gateway returned HTTP {response.status}.')
    except (URLError, TimeoutError, OSError) as error:
        return False, str(error)


class CloudflareTunnel:
    def __init__(self, docker):
        self.docker = docker

    def start(self, session, cancelled):
        origin = urlsplit(settings.DEPLOYMENT_TUNNEL_ORIGIN)
        if (origin.scheme != 'http' or origin.hostname not in ('localhost', '127.0.0.1')
                or origin.username or origin.password or origin.path not in ('', '/') or origin.query or origin.fragment):
            raise HostingError('DEPLOYMENT_TUNNEL_ORIGIN must be the local backend HTTP origin, for example http://127.0.0.1:8080.')
        d = self.docker
        name = d.names(session)[0] + '_tunnel'
        append_log(session, 'Creating a Cloudflare temporary public URL.')
        d.ensure_image(settings.DEPLOYMENT_CLOUDFLARED_IMAGE, cancelled)
        # Only this trusted connector uses the host network. Uploaded applications
        # retain their isolated Docker networks and loopback-only proxy ports.
        d.command('create', '--name', name, *d.labels(session),
                  '--network', 'host', '--read-only', '--user', '65532:65532',
                  '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
                  '--memory', '128m', '--memory-swap', '128m', '--cpus', '0.5',
                  '--pids-limit', '64', '--restart', 'no',
                  '--log-driver', 'json-file', '--log-opt', 'max-size=2m', '--log-opt', 'max-file=2',
                  settings.DEPLOYMENT_CLOUDFLARED_IMAGE,
                  'tunnel', '--no-autoupdate', '--protocol', 'http2',
                  '--metrics', '127.0.0.1:0', '--url', settings.DEPLOYMENT_TUNNEL_ORIGIN,
                  '--http-host-header', tunnel_hostname(session))
        cancelled()
        d.command('start', name)
        deadline = time.monotonic() + settings.DEPLOYMENT_TUNNEL_TIMEOUT_SECONDS
        while time.monotonic() < deadline:
            cancelled()
            info = d.capture_logs(session, name, 'tunnel.log')
            if not info or not info['State']['Running']:
                raise HostingError('Cloudflare tunnel exited before connecting. See tunnel logs and restart the saved system.')
            log = (storage_dir(session) / 'logs' / 'tunnel.log').read_text(encoding='utf-8')
            match = QUICK_URL.search(log)
            if match and 'Registered tunnel connection' in log:
                url = match.group(0) + '/'
                append_log(session, 'Cloudflare connected. Waiting for its public hostname to reach this deployment.')
                error = 'No public HTTP response.'
                while time.monotonic() < deadline:
                    cancelled()
                    ready, error = public_route_ready(url, session, min(5, max(0.1, deadline - time.monotonic())))
                    if ready:
                        break
                    time.sleep(1)
                else:
                    append_log(session, f'Cloudflare public URL was not reachable: {error}')
                    raise HostingError('Cloudflare connected but its public URL is not reachable yet. Check Internet/DNS access and that DEPLOYMENT_TUNNEL_ORIGIN points to the updated backend, then restart the saved system.')
                cancelled()
                session.tunnel_url = url
                session.save(update_fields=['tunnel_url', 'updated_at'])
                append_log(session, 'Cloudflare public routing verified. The link will activate after the application is ready.')
                return session.tunnel_url
            time.sleep(0.5)
        raise HostingError('Cloudflare connection timed out. Check Internet access and outbound TCP port 7844, then restart the saved system. See tunnel logs.')

    def is_running(self, session):
        info = self.docker.inspect(self.docker.names(session)[0] + '_tunnel')
        self.docker.verify_owned(info, session)
        return bool(info and info['State']['Running'])
