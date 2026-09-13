"""Bounded HTTP proxy. Its target comes only from a live database deployment."""
import http.client
import re
import posixpath
import uuid
from urllib.parse import quote, urlsplit, urlunsplit

from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from hosting.models import HostingSession


def unavailable(message='This temporary website has stopped or expired.', status=410):
    response = HttpResponse(message, status=status, content_type='text/plain; charset=utf-8')
    response['Cache-Control'] = 'no-store'
    response['X-Content-Type-Options'] = 'nosniff'
    return response


@csrf_exempt
def public_proxy(request, deployment_id, path='', isolated=False, tunneled=False):
    session = HostingSession.objects.filter(deployment_id=deployment_id, status='running',
                                            active_slot=1, expires_at__gt=timezone.now()).first()
    if not session or not session.port:
        return unavailable()
    if tunneled and not session.tunnel_url:
        return unavailable()
    if session.project_type == 'fullstack' and not isolated:
        return unavailable('Open this application using its separate preview hostname.', 400)
    if request.method not in ('GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'):
        return unavailable('Method not supported.', 405)
    if request.headers.get('Upgrade'):
        return unavailable('WebSocket upgrades are not supported by this preview proxy.', 501)
    limit = settings.DEPLOYMENT_PROXY_MAX_BYTES
    try:
        if int(request.META.get('CONTENT_LENGTH') or 0) > limit:
            return unavailable('Request is too large.', 413)
    except ValueError:
        return unavailable('Invalid content length.', 400)
    # Never copy platform credentials, forwarding headers, or proxy headers.
    headers = {key: request.headers[key] for key in ('Accept', 'Content-Type', 'Range', 'If-None-Match', 'If-Modified-Since') if key in request.headers}
    headers.update({'Host': request.get_host(), 'Accept-Encoding': 'identity',
                    'X-Forwarded-Proto': request.scheme})
    if tunneled:
        headers['Host'] = urlsplit(session.tunnel_url).netloc
        headers['X-Forwarded-Proto'] = 'https'
    prefix = '' if isolated else f'/temp/{deployment_id}'
    headers['X-Forwarded-Prefix'] = prefix
    headers['X-Hosting-Container'] = session.container_id
    if isolated:
        # A dedicated preview hostname has a separate origin and app cookie scope.
        for key in ('Cookie', 'Authorization', 'Origin', 'X-CSRFToken', 'X-XSRF-TOKEN'):
            if key in request.headers:
                headers[key] = request.headers[key]
    target = '/' + quote(path.lstrip('/'), safe="/%:@!$&'()*+,;=-._~")
    query = request.META.get('QUERY_STRING', '')
    if query:
        target += '?' + query
    connection = http.client.HTTPConnection('127.0.0.1', session.port, timeout=5)
    try:
        connection.request(request.method, target, body=request.body or None, headers=headers)
        upstream = connection.getresponse()
        content = upstream.read(limit + 1)
        if len(content) > limit:
            return unavailable('The temporary website response is too large.', 502)
        if not HostingSession.objects.filter(pk=session.pk, status='running', container_id=session.container_id,
                                              port=session.port, expires_at__gt=timezone.now()).exists():
            return unavailable()
        content_type = upstream.getheader('Content-Type', 'application/octet-stream')
        if prefix and 'text/html' in content_type:
            # Support ordinary root-relative HTML assets; framework JS must honor PUBLIC_URL.
            content = re.sub(rb'((?:href|src|action)\s*=\s*["\'])/(?!/)',
                             lambda m: m[1] + prefix.encode() + b'/', content, flags=re.I)
        if prefix and ('text/css' in content_type or 'text/html' in content_type):
            content = re.sub(rb'(url\(\s*["\']?)/(?!/)', lambda m: m[1] + prefix.encode() + b'/', content, flags=re.I)
        response = HttpResponse(content, status=upstream.status, content_type=content_type)
        for key in ('Content-Disposition', 'Content-Range', 'Accept-Ranges', 'Last-Modified'):
            value = upstream.getheader(key)
            if value:
                response[key] = value
        location = upstream.getheader('Location')
        if location:
            parsed = urlsplit(location)
            if parsed.hostname in ('localhost', '127.0.0.1'):
                location = urlunsplit(('', '', parsed.path, parsed.query, parsed.fragment))
            if prefix and location.startswith('/') and not location.startswith('//'):
                location = prefix + location
            response['Location'] = location
        if isolated:
            from http.cookies import SimpleCookie
            for key, value in upstream.getheaders():
                if key.lower() == 'set-cookie':
                    cookies = SimpleCookie()
                    cookies.load(value)
                    for name, morsel in cookies.items():
                        morsel['domain'] = ''  # Cookies cannot escape this deployment host.
                        response.cookies[name] = morsel
        else:
            # Untrusted same-origin HTML must not access the platform's localStorage,
            # cookies, APIs, parent windows, or service workers.
            response['Content-Security-Policy'] = "sandbox allow-scripts allow-forms allow-popups; frame-ancestors 'none'; base-uri 'self'"
        response['Cache-Control'] = 'no-store, max-age=0'
        response['X-Content-Type-Options'] = 'nosniff'
        response['Referrer-Policy'] = 'no-referrer'
        return response
    except (OSError, http.client.HTTPException):
        return unavailable('This temporary website is unavailable. The hosting worker is checking it.', 503)
    finally:
        connection.close()


class PreviewHostMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if posixpath.normpath(request.path).startswith('/media/temporary_hosting/'):
            return unavailable('Private deployment files are not publicly served.', 404)
        host = request.get_host().lower()
        for domain in (settings.DEPLOYMENT_TUNNEL_HOST_SUFFIX, settings.DEPLOYMENT_BASE_DOMAIN, settings.DEPLOYMENT_FULLSTACK_BASE_DOMAIN):
            if domain and (host == domain or host.endswith('.' + domain)):
                label = host[:-(len(domain) + 1)]
                try:
                    deployment_id = uuid.UUID(label)
                except ValueError:
                    return unavailable('Unknown temporary website.', 404)
                response = public_proxy(request, deployment_id, request.path.lstrip('/'), isolated=True,
                                        tunneled=domain == settings.DEPLOYMENT_TUNNEL_HOST_SUFFIX)
                if domain == settings.DEPLOYMENT_TUNNEL_HOST_SUFFIX:
                    response['X-Hosting-Deployment'] = str(deployment_id)
                return response
        return self.get_response(request)
