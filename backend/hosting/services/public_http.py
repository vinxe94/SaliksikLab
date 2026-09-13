"""HTTPS checks for Quick Tunnels, including freshly published DNS records."""
import ipaddress
import json
import re
import socket
import time
from http.client import HTTPSConnection
from urllib.parse import urlencode
from urllib.request import HTTPSHandler, Request, urlopen


QUICK_HOST = re.compile(r'[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com')


def public_addresses(hostname, timeout):
    """Resolve only generated tunnel names through Cloudflare's HTTPS resolver."""
    if not QUICK_HOST.fullmatch(hostname):
        raise OSError('Public DNS fallback is restricted to Cloudflare Quick Tunnels.')
    query = urlencode({'name': hostname, 'type': 'A'})
    request = Request('https://cloudflare-dns.com/dns-query?' + query,
                      headers={'Accept': 'application/dns-json'})
    try:
        with urlopen(request, timeout=timeout) as response:
            result = json.loads(response.read(65536))
        addresses = []
        if result.get('Status') == 0:
            for answer in result.get('Answer', []):
                if answer.get('type') == 1:
                    address = ipaddress.ip_address(answer['data'])
                    if address.version == 4 and address.is_global:
                        addresses.append(str(address))
        if addresses:
            return addresses
    except (ValueError, KeyError, TypeError, AttributeError) as error:
        raise OSError('Cloudflare returned an invalid DNS response.') from error
    raise OSError('Cloudflare has not published a public address for this tunnel yet.')


def tunnel_connection(address, timeout, source_address=None):
    """Use public DNS only after a local DNS error; never alter global resolution."""
    deadline = time.monotonic() + timeout
    try:
        return socket.create_connection(address, timeout, source_address)
    except socket.gaierror:
        if not QUICK_HOST.fullmatch(address[0]):
            raise
    remaining = max(0.1, deadline - time.monotonic())
    addresses = public_addresses(address[0], remaining)
    last_error = None
    for resolved in addresses:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        try:
            return socket.create_connection((resolved, address[1]), remaining, source_address)
        except OSError as error:
            last_error = error
    raise OSError('Could not connect to the public Cloudflare address.') from last_error


class TunnelHTTPSConnection(HTTPSConnection):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # HTTPSConnection still wraps the socket using the ORIGINAL hostname:
        # SNI, certificate validation and the HTTP Host header are unchanged.
        self._create_connection = tunnel_connection


class TunnelHTTPSHandler(HTTPSHandler):
    def https_open(self, request):
        return self.do_open(TunnelHTTPSConnection, request, context=self._context)
