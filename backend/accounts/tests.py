from django.core.cache import cache
from django.conf import settings
from django.http import JsonResponse
from django.test import RequestFactory, override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from .models import User
from config.middleware import DDoSProtectionMiddleware


def _throttle_request_count(scope):
    rate = settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'][scope]
    return int(rate.split('/', 1)[0])


class AuthRateLimitTests(APITestCase):
    def setUp(self):
        cache.clear()
        User.objects.create_user(
            email='target@example.com',
            password='correct-password',
            first_name='Target',
            last_name='User',
        )

    def tearDown(self):
        cache.clear()

    def test_login_is_rate_limited(self):
        payload = {'email': 'target@example.com', 'password': 'wrong-password'}
        allowed_requests = _throttle_request_count('auth_login_ip')

        for _ in range(allowed_requests):
            response = self.client.post('/api/auth/login/', payload, format='json')
            self.assertNotEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        response = self.client.post('/api/auth/login/', payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_password_reset_request_is_rate_limited(self):
        payload = {'email': 'target@example.com'}
        allowed_requests = _throttle_request_count('auth_password_reset_email')

        for _ in range(allowed_requests):
            response = self.client.post('/api/auth/password-reset/', payload, format='json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)

        response = self.client.post('/api/auth/password-reset/', payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


@override_settings(
    DDOS_PROTECTION_ENABLED=True,
    DDOS_RATE_LIMIT='2/min',
    DDOS_BLOCK_SECONDS=60,
    DDOS_TRUST_PROXY_HEADERS=False,
    DDOS_EXEMPT_PATH_PREFIXES=(),
)
class DDoSProtectionMiddlewareTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.factory = RequestFactory()
        self.middleware = DDoSProtectionMiddleware(lambda request: JsonResponse({'ok': True}))

    def tearDown(self):
        cache.clear()

    def test_blocks_client_after_rate_limit(self):
        for _ in range(2):
            response = self.middleware(self.factory.get('/api/repository/', REMOTE_ADDR='203.0.113.10'))
            self.assertEqual(response.status_code, status.HTTP_200_OK)

        response = self.middleware(self.factory.get('/api/repository/', REMOTE_ADDR='203.0.113.10'))

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertIn('Retry-After', response)

    def test_does_not_share_limits_between_ips(self):
        for _ in range(2):
            self.middleware(self.factory.get('/api/repository/', REMOTE_ADDR='203.0.113.10'))

        response = self.middleware(self.factory.get('/api/repository/', REMOTE_ADDR='203.0.113.11'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
