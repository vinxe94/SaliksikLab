import hashlib

from rest_framework.throttling import SimpleRateThrottle


def _normalized_request_value(request, key):
    value = request.data.get(key, '') if hasattr(request, 'data') else ''
    return str(value).strip().lower()


class LoginIPRateThrottle(SimpleRateThrottle):
    scope = 'auth_login_ip'

    def get_cache_key(self, request, view):
        return self.cache_format % {
            'scope': self.scope,
            'ident': self.get_ident(request),
        }


class LoginEmailRateThrottle(SimpleRateThrottle):
    scope = 'auth_login_email'

    def get_cache_key(self, request, view):
        email = _normalized_request_value(request, 'email')
        if not email:
            return None
        email_hash = hashlib.sha256(email.encode('utf-8')).hexdigest()
        return self.cache_format % {
            'scope': self.scope,
            'ident': email_hash,
        }


class PasswordResetIPRateThrottle(SimpleRateThrottle):
    scope = 'auth_password_reset_ip'

    def get_cache_key(self, request, view):
        return self.cache_format % {
            'scope': self.scope,
            'ident': self.get_ident(request),
        }


class PasswordResetEmailRateThrottle(SimpleRateThrottle):
    scope = 'auth_password_reset_email'

    def get_cache_key(self, request, view):
        email = _normalized_request_value(request, 'email')
        if not email:
            return None
        email_hash = hashlib.sha256(email.encode('utf-8')).hexdigest()
        return self.cache_format % {
            'scope': self.scope,
            'ident': email_hash,
        }
