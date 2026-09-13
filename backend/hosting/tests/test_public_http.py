import json
import socket
import ssl
from unittest.mock import Mock, patch, sentinel

from django.test import SimpleTestCase

from hosting.services.public_http import (
    TunnelHTTPSConnection, public_addresses, tunnel_connection,
)


class PublicTunnelHTTPTests(SimpleTestCase):
    host = 'research-public-test.trycloudflare.com'

    def test_dns_fallback_preserves_tls_hostname_and_certificate_verification(self):
        context = ssl.create_default_context()
        self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(context.check_hostname)
        connection = TunnelHTTPSConnection(self.host, timeout=5, context=context)
        with patch('hosting.services.public_http.socket.create_connection',
                   side_effect=[socket.gaierror('Local DNS unavailable'), Mock()]) as connect, \
                patch('hosting.services.public_http.public_addresses', return_value=['104.16.230.132']) as resolve, \
                patch.object(context, 'wrap_socket', return_value=sentinel.secure_socket) as wrap:
            connection.connect()
        resolve.assert_called_once()
        self.assertEqual(connect.call_args_list[0].args[0], (self.host, 443))
        self.assertEqual(connect.call_args_list[1].args[0], ('104.16.230.132', 443))
        self.assertEqual(wrap.call_args.kwargs['server_hostname'], self.host)
        self.assertEqual(connection.host, self.host)
        self.assertIs(connection.sock, sentinel.secure_socket)

    def test_healthy_local_dns_does_not_use_external_resolver(self):
        with patch('hosting.services.public_http.socket.create_connection', return_value=sentinel.socket), \
                patch('hosting.services.public_http.public_addresses') as resolve:
            self.assertIs(tunnel_connection((self.host, 443), 5), sentinel.socket)
        resolve.assert_not_called()

    def test_fallback_is_limited_to_dns_errors_and_quick_tunnel_hosts(self):
        with patch('hosting.services.public_http.public_addresses') as resolve:
            with patch('hosting.services.public_http.socket.create_connection', side_effect=ConnectionRefusedError):
                with self.assertRaises(ConnectionRefusedError):
                    tunnel_connection((self.host, 443), 5)
            with patch('hosting.services.public_http.socket.create_connection', side_effect=socket.gaierror):
                with self.assertRaises(socket.gaierror):
                    tunnel_connection(('example.com', 443), 5)
        resolve.assert_not_called()

    def test_public_resolver_rejects_private_addresses_and_malformed_answers(self):
        with patch('hosting.services.public_http.urlopen') as request:
            response = request.return_value.__enter__.return_value
            response.read.return_value = json.dumps({'Status': 0, 'Answer': [
                {'type': 1, 'data': '127.0.0.1'}, {'type': 1, 'data': '10.0.0.1'},
                {'type': 1, 'data': '104.16.230.132'},
            ]}).encode()
            self.assertEqual(public_addresses(self.host, 5), ['104.16.230.132'])
            response.read.return_value = b'{"Status":3}'
            with self.assertRaises(OSError):
                public_addresses(self.host, 5)
            response.read.return_value = b'not JSON'
            with self.assertRaises(OSError):
                public_addresses(self.host, 5)
            request.reset_mock()
            with self.assertRaises(OSError):
                public_addresses(self.host + '.example.com', 5)
            request.assert_not_called()
