import hashlib
import time

from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse


def _parse_rate(rate):
    requests, period = rate.split('/', 1)
    period_seconds = {
        's': 1,
        'sec': 1,
        'second': 1,
        'm': 60,
        'min': 60,
        'minute': 60,
        'h': 3600,
        'hour': 3600,
    }[period.strip().lower()]
    return int(requests), period_seconds


def _cache_safe(value):
    return hashlib.sha256(str(value).encode('utf-8')).hexdigest()


class DDoSProtectionMiddleware:
    """
    Lightweight app-layer flood protection.

    This limits bursts per client IP before the request reaches Django views.
    Use a shared cache such as Redis in production so limits apply across
    multiple Gunicorn workers or servers.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self.rate = getattr(settings, 'DDOS_RATE_LIMIT', '300/min')
        self.limit, self.window_seconds = _parse_rate(self.rate)
        self.block_seconds = getattr(settings, 'DDOS_BLOCK_SECONDS', 300)
        self.enabled = getattr(settings, 'DDOS_PROTECTION_ENABLED', True)
        self.trust_proxy_headers = getattr(settings, 'DDOS_TRUST_PROXY_HEADERS', False)
        self.exempt_prefixes = tuple(getattr(settings, 'DDOS_EXEMPT_PATH_PREFIXES', ()))

    def __call__(self, request):
        if not self.enabled or request.path.startswith(self.exempt_prefixes):
            return self.get_response(request)

        client_ip = self._client_ip(request)
        client_key = _cache_safe(client_ip)
        block_key = f'ddos:block:{client_key}'

        blocked_until = cache.get(block_key)
        now = int(time.time())
        if blocked_until and blocked_until > now:
            return self._blocked_response(blocked_until - now)

        counter_key = f'ddos:count:{client_key}:{now // self.window_seconds}'
        added = cache.add(counter_key, 1, timeout=self.window_seconds + 1)
        request_count = 1 if added else cache.incr(counter_key)

        if request_count > self.limit:
            blocked_until = now + self.block_seconds
            cache.set(block_key, blocked_until, timeout=self.block_seconds)
            return self._blocked_response(self.block_seconds)

        return self.get_response(request)

    def _client_ip(self, request):
        if self.trust_proxy_headers:
            cloudflare_ip = request.META.get('HTTP_CF_CONNECTING_IP')
            if cloudflare_ip:
                return cloudflare_ip.strip()

            forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', '')
            if forwarded_for:
                return forwarded_for.split(',')[0].strip()

        return request.META.get('REMOTE_ADDR', 'unknown')

    def _blocked_response(self, retry_after):
        response = JsonResponse(
            {'detail': 'Too many requests. Please try again later.'},
            status=429,
        )
        response['Retry-After'] = str(max(1, int(retry_after)))
        return response
