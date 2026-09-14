"""Optional, revocable Chronicle response proofs; no file or network access.

Only a created, live, parent-owned production child may publish a signer.
Ordinary API clients and ineligible responses retain their original ASGI
message sequence.
"""

import base64
import hashlib
import hmac
import re
import threading
from collections.abc import Callable

NONCE_HEADER = b"x-katlab-chronicle-nonce"
MAC_HEADER = b"x-katlab-chronicle-mac"
MAX_RESPONSE_BYTES = 16_777_216
_PATHS = frozenset((b"/api/repos", b"/api/tasks", b"/api/stats",
                    b"/api/history", b"/api/events"))


def canonical_nonce (value: bytes) -> bool:
    if not isinstance(value, bytes) or re.fullmatch(rb"[A-Za-z0-9_-]{43}", value) is None:
        return False
    raw = base64.urlsafe_b64decode(value + b"=")
    return len(raw) == 32 and base64.urlsafe_b64encode(raw).rstrip(b"=") == value


def _lp (value: bytes) -> bytes:
    return len(value).to_bytes(4, "big") + value


def response_mac (key: bytes, nonce: bytes, target: bytes, status: int,
                  headers: list[tuple[bytes, bytes]], body: bytes) -> bytes:
    """D4 wire formula; preserve duplicate representation headers and their order."""
    if len(key) != 32 or not canonical_nonce(nonce):
        raise ValueError("invalid response-proof key or nonce")
    if type(status) is not int or not 100 <= status <= 999:
        raise ValueError("invalid response status")
    selected = [(name.lower(), value) for name, value in headers
                if name.lower() in (b"content-type", b"content-encoding")]
    representation = len(selected).to_bytes(4, "big") + b"".join(
        _lp(name) + _lp(value) for name, value in selected)
    digest = hmac.new(key, digestmod=hashlib.sha256)
    digest.update(b"KATLAB-CHRONICLE-v1")
    for value in (nonce, b"GET", target, str(status).encode("ascii"), representation, body):
        digest.update(_lp(value))
    return digest.hexdigest().encode("ascii")


class SignerState:
    """Serialize publication, observed revocation, and the final proof decision."""

    def __init__ (self):
        self._lock = threading.RLock()
        self._epoch = 0
        self._key: bytes | None = None
        self._child_live: Callable[[], bool] | None = None

    def publish (self, key: bytes, child_live: Callable[[], bool]) -> None:
        if not isinstance(key, bytes) or len(key) != 32 or not callable(child_live):
            raise ValueError("invalid signer capability")
        with self._lock:
            self._epoch += 1
            self._key = key
            self._child_live = child_live

    def revoke (self) -> None:
        with self._lock:
            self._epoch += 1
            self._key = None
            self._child_live = None

    def snapshot (self) -> int | None:
        with self._lock:
            return self._epoch if self._key is not None else None

    def proof (self, epoch: int, nonce: bytes, target: bytes, status: int,
               headers: list[tuple[bytes, bytes]], body: bytes) -> bytes | None:
        with self._lock:
            if epoch != self._epoch or self._key is None or self._child_live is None:
                return None
            try:
                live = self._child_live()
            except Exception:
                live = False
            if not live:
                self.revoke()
                return None
            return response_mac(self._key, nonce, target, status, headers, body)


class ChronicleProofMiddleware:
    """Pure ASGI, placed outside other middleware by the application factory."""

    def __init__ (self, app, signer: SignerState):
        self.app = app
        self.signer = signer

    async def __call__ (self, scope, receive, send):
        epoch = self.signer.snapshot()
        nonces = [value for name, value in scope.get("headers", ())
                  if name.lower() == NONCE_HEADER]
        path = scope.get("raw_path")
        if (epoch is None or scope.get("type") != "http" or scope.get("method") != "GET"
                or scope.get("root_path", "") or path not in _PATHS
                or len(nonces) != 1 or not canonical_nonce(nonces[0])):
            await self.app(scope, receive, send)
            return
        query = scope.get("query_string", b"")
        target = path + (b"?" + query if query else b"")
        buffered: list[dict] = []
        chunks: list[bytes] = []
        total = 0
        start = None
        terminal = False
        passthrough = False

        async def flush ():
            nonlocal passthrough
            passthrough = True
            for message in buffered:
                await send(message)
            buffered.clear()
            chunks.clear()

        async def capture (message):
            nonlocal start, terminal, total
            if passthrough:
                await send(message)
                return
            kind = message.get("type")
            valid = False
            if kind == "http.response.start" and start is None and not terminal:
                headers = list(message.get("headers", ()))
                valid = (not message.get("trailers", False)
                         and type(message.get("status")) is int
                         and 100 <= message["status"] <= 999
                         and all(name.lower() != MAC_HEADER for name, _ in headers))
                if valid:
                    start = dict(message, headers=headers)
                    buffered.append(start)
            elif kind == "http.response.body" and start is not None and not terminal:
                body = message.get("body", b"")
                valid = isinstance(body, bytes) and total + len(body) <= MAX_RESPONSE_BYTES
                # Bound message metadata too, including empty streaming chunks.
                valid = valid and len(buffered) < 65_536
                if valid:
                    buffered.append(dict(message))
                    chunks.append(body)
                    total += len(body)
                    terminal = not message.get("more_body", False)
            if not valid:
                await flush()
                await send(message)

        try:
            await self.app(scope, receive, capture)
        except BaseException:
            if not passthrough:
                await flush()
            raise
        if passthrough:
            return
        if terminal and start is not None:
            proof = self.signer.proof(epoch, nonces[0], target, start["status"],
                                      start["headers"], b"".join(chunks))
            if proof is not None:
                buffered[0] = dict(start, headers=start["headers"] + [(MAC_HEADER, proof)])
        await flush()
