"""Installed AnyIO hostname regression checks, not a live TLS/security audit."""

import ssl
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch

from anyio.streams.tls import TLSStream


class AnyIOTLSHostnameTests(unittest.IsolatedAsyncioTestCase):
    async def check_standard_hostname (self, hostname, expected, *, server=False):
        context = ssl.SSLContext(
            ssl.PROTOCOL_TLS_SERVER if server else ssl.PROTOCOL_TLS_CLIENT)
        transport = SimpleNamespace(
            send=AsyncMock(side_effect=AssertionError("unexpected transport send")),
            receive=AsyncMock(side_effect=AssertionError("unexpected transport receive")),
        )
        with patch.object(TLSStream, "_call_sslobject_method",
                          new_callable=AsyncMock) as handshake:
            result = await TLSStream.wrap(
                transport, hostname=hostname, server_side=server, ssl_context=context)
            self.assertEqual(result._ssl_object.server_hostname, expected)
            self.assertEqual(result._ssl_object.server_side, server)
            handshake.assert_awaited_once_with(result._ssl_object.do_handshake)
            self.assertIs(result.transport_stream, transport)
            transport.send.assert_not_awaited()
            transport.receive.assert_not_awaited()

    async def test_unicode_hostname_uses_idna2008 (self):
        await self.check_standard_hostname("fa\u00df.invalid", "xn--fa-hia.invalid")

    async def test_ascii_and_punycode_hostnames_remain_unchanged (self):
        for hostname in ("example.invalid", "xn--fa-hia.invalid"):
            with self.subTest(hostname=hostname):
                await self.check_standard_hostname(hostname, hostname)

    async def test_server_without_hostname_remains_supported (self):
        await self.check_standard_hostname(None, None, server=True)

    async def test_custom_context_receives_encoded_bytes_or_none (self):
        for hostname, expected in (("fa\u00df.invalid", b"xn--fa-hia.invalid"),
                                   ("example.invalid", b"example.invalid"), (None, None)):
            with self.subTest(hostname=hostname):
                context = Mock()
                transport = object()  # Cannot perform any byte-stream I/O.
                with patch.object(TLSStream, "_call_sslobject_method",
                                  new_callable=AsyncMock) as handshake:
                    result = await TLSStream.wrap(
                        transport, hostname=hostname, ssl_context=context)
                    context.wrap_bio.assert_called_once()
                    incoming, outgoing, server, actual, session = context.wrap_bio.call_args.args
                    self.assertIsInstance(incoming, ssl.MemoryBIO)
                    self.assertIsInstance(outgoing, ssl.MemoryBIO)
                    self.assertIsNot(incoming, outgoing)
                    self.assertEqual(server, hostname is None)
                    self.assertEqual(actual, expected)
                    self.assertIsNone(session)
                    self.assertIs(result._ssl_object, context.wrap_bio.return_value)
                    self.assertIs(result.transport_stream, transport)
                    handshake.assert_awaited_once_with(result._ssl_object.do_handshake)
                    result._ssl_object.do_handshake.assert_not_called()


if __name__ == "__main__":
    unittest.main()
