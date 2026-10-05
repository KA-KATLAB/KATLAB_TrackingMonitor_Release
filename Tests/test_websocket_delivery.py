"""Isolated ASGI delivery/lifecycle checks; no real sockets or repository data."""

import asyncio
import json
import unittest
import uuid
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import Mock, patch

from starlette.requests import Request
from starlette.websockets import WebSocket

from Backend.app.api import routes, ws
from Backend.app.watcher import Tracker


class Peer:
    def __init__ (self, *, block_send=False, send_error=False,
                  block_close=False, close_error=False, delayed_cancel=False):
        self.incoming = asyncio.Queue()
        self.incoming.put_nowait({"type": "websocket.connect"})
        self.delivered = asyncio.Queue()
        self.accepted = asyncio.Event()
        self.send_started = asyncio.Event()
        self.send_gate = asyncio.Event()
        self.close_started = asyncio.Event()
        self.close_gate = asyncio.Event()
        self.cancel_started = asyncio.Event()
        self.cancel_gate = asyncio.Event()
        self.block_send = block_send
        self.send_error = send_error
        self.block_close = block_close
        self.close_error = close_error
        self.delayed_cancel = delayed_cancel
        self.close_codes = []
        self.close_attempts = []
        self.inflight = 0
        self.max_inflight = 0
        self.socket = WebSocket({"type": "websocket", "path": "/ws"},
                                self.incoming.get, self.send)
        original_close = self.socket.close

        async def close (code=1000, reason=None):
            self.close_attempts.append(code)
            await original_close(code=code, reason=reason)

        self.socket.close = close
        self.owner = None

    async def send (self, message):
        if message["type"] == "websocket.accept":
            self.accepted.set()
        elif message["type"] == "websocket.send":
            self.inflight += 1
            self.max_inflight = max(self.max_inflight, self.inflight)
            self.send_started.set()
            try:
                if self.block_send:
                    await self.send_gate.wait()
                if self.send_error:
                    raise self.send_error("synthetic transport failure")
                self.delivered.put_nowait(message["text"])
            except asyncio.CancelledError:
                if self.delayed_cancel:
                    self.cancel_started.set()
                    await self.cancel_gate.wait()
                raise
            finally:
                self.inflight -= 1
        elif message["type"] == "websocket.close":
            self.close_codes.append(message["code"])
            self.close_started.set()
            try:
                if self.block_close:
                    await self.close_gate.wait()
                if self.close_error:
                    raise OSError("synthetic close failure")
            except asyncio.CancelledError:
                if self.delayed_cancel:
                    self.cancel_started.set()
                    await self.cancel_gate.wait()
                raise

    def disconnect (self):
        self.incoming.put_nowait({"type": "websocket.disconnect", "code": 1000})


class WebSocketDeliveryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp (self):
        self.assertFalse(ws._clients)
        self.baseline = asyncio.all_tasks() - {asyncio.current_task()}
        self.peers = []
        self.send_timeout = patch.object(ws, "SEND_TIMEOUT_SECONDS", 1.0)
        self.close_timeout = patch.object(ws, "CLOSE_TIMEOUT_SECONDS", 0.03)
        self.send_timeout.start()
        self.close_timeout.start()

    async def asyncTearDown (self):
        for peer in self.peers:
            peer.cancel_gate.set()
            peer.owner.cancel()
        await asyncio.gather(*(peer.owner for peer in self.peers), return_exceptions=True)
        self.send_timeout.stop()
        self.close_timeout.stop()
        self.assertFalse(ws._clients)
        self.assertFalse(asyncio.all_tasks() - {asyncio.current_task()} - self.baseline)
        self.assertTrue(all(peer.inflight == 0 for peer in self.peers))

    async def connect (self, **kwargs):
        peer = Peer(**kwargs)
        peer.owner = asyncio.create_task(ws.websocket_endpoint(peer.socket))
        self.peers.append(peer)
        await asyncio.wait_for(peer.accepted.wait(), 1)
        self.assertTrue(any(client.websocket is peer.socket for client in ws._clients))
        return peer

    async def frame (self, peer):
        return await asyncio.wait_for(peer.delivered.get(), 1)

    async def ended (self, peer):
        await asyncio.wait_for(peer.owner, 1)
        self.assertFalse(any(client.websocket is peer.socket for client in ws._clients))

    async def test_shared_frame_uuid_default_serialization_and_normal_ping_disconnect (self):
        first, second = await self.connect(), await self.connect()
        first.incoming.put_nowait({"type": "websocket.receive", "text": "ping"})
        await ws.broadcast("event_resolved", {"value": datetime(2026, 10, 5)})
        left, right = await self.frame(first), await self.frame(second)
        self.assertEqual(left, right)
        message = json.loads(left)
        self.assertEqual(set(message), {"type", "id", "data"})
        self.assertEqual(message["type"], "event_resolved")
        self.assertEqual(message["data"], {"value": "2026-10-05 00:00:00"})
        self.assertEqual(str(uuid.UUID(message["id"])), message["id"])
        for peer in (first, second):
            peer.disconnect()
            await self.ended(peer)
            self.assertEqual(peer.close_codes, [1000])

    async def test_concurrent_broadcasts_retain_shared_fifo_and_one_writer (self):
        slow, healthy = await self.connect(block_send=True), await self.connect()
        await ws.broadcast("warning", {"number": 0})
        await asyncio.wait_for(slow.send_started.wait(), 1)
        await asyncio.gather(*(ws.broadcast("warning", {"number": value}) for value in range(1, 10)))
        healthy_frames = [await self.frame(healthy) for _ in range(10)]
        self.assertEqual({json.loads(frame)["data"]["number"] for frame in healthy_frames}, set(range(10)))
        slow.send_gate.set()
        slow_frames = [await self.frame(slow) for _ in range(10)]
        self.assertEqual(slow_frames, healthy_frames)
        self.assertEqual([json.loads(frame)["data"]["number"] for frame in slow_frames], list(range(10)))
        self.assertEqual(slow.max_inflight, 1)
        self.assertEqual(healthy.max_inflight, 1)

    async def test_watcher_and_persisted_manual_pick_finish_while_peer_send_is_blocked (self):
        slow, healthy = await self.connect(block_send=True), await self.connect()
        tracker = Tracker.__new__(Tracker)
        tracker.set_broadcaster(ws.broadcast)
        tracker._recompute_readiness = Mock()
        await asyncio.wait_for(tracker._push("warning", {"repo": "fixture"}), 1)
        await asyncio.wait_for(slow.send_started.wait(), 1)
        self.assertEqual(json.loads(await self.frame(healthy))["type"], "warning")
        saved = []
        row = {"id": 1, "repo_id": "fixture"}
        updated = {**row, "task_ref": "P:A.1", "mode": "MANUAL"}
        request = Request({"type": "http", "app": SimpleNamespace(state=SimpleNamespace(tracker=tracker))})
        with patch.object(routes.db, "get_event", side_effect=[row, updated]), \
                patch.object(routes.db, "set_manual_task", side_effect=lambda *args: saved.append(args)):
            result = await asyncio.wait_for(routes.manual_pick(1, routes.ManualPick(task_ref="P:A.1"), request), 1)
        self.assertEqual(saved, [(1, "P:A.1")])
        self.assertTrue(result["success"])
        self.assertEqual(result["data"], updated)
        tracker._recompute_readiness.assert_called_once_with({"fixture"})
        self.assertFalse(slow.owner.done())
        self.assertEqual(slow.inflight, 1)
        self.assertEqual([json.loads(await self.frame(healthy))["type"] for _ in range(2)],
                         ["event_resolved", "readiness_updated"])

    async def test_full_queue_retires_at_exact_capacity_and_ends_endpoint (self):
        peer = await self.connect(block_send=True)
        await ws.broadcast("warning", {"number": -1})
        await asyncio.wait_for(peer.send_started.wait(), 1)
        client = next(client for client in ws._clients if client.websocket is peer.socket)
        self.assertEqual(client.queue.maxsize, 64)
        for value in range(ws.CLIENT_QUEUE_CAPACITY):
            await ws.broadcast("warning", {"number": value})
        self.assertEqual(client.queue.qsize(), ws.CLIENT_QUEUE_CAPACITY)
        self.assertIn(client, ws._clients)
        await ws.broadcast("warning", {"number": 64})
        self.assertNotIn(client, ws._clients)
        await self.ended(peer)
        self.assertEqual(peer.close_codes, [1013])
        self.assertEqual(peer.inflight, 0)
        await ws.broadcast("warning", {"number": 65})
        self.assertEqual(client.queue.qsize(), ws.CLIENT_QUEUE_CAPACITY)
        self.assertTrue(peer.delivered.empty())

    async def test_send_failure_and_timeout_do_not_block_other_clients (self):
        for options in ({"send_error": RuntimeError}, {"send_error": OSError}, {"block_send": True}):
            with self.subTest(options=options), patch.object(ws, "SEND_TIMEOUT_SECONDS", 0.02):
                bad, good = await self.connect(**options), await self.connect()
                await ws.broadcast("task_updated", {"repo": "fixture"})
                self.assertEqual(json.loads(await self.frame(good))["type"], "task_updated")
                await self.ended(bad)
                self.assertEqual(bad.close_attempts, [1013])
                self.assertEqual(bad.close_codes, [] if options.get("send_error") is OSError else [1013])
                await ws.broadcast("warning", {"number": 2})
                self.assertEqual(json.loads(await self.frame(good))["data"], {"number": 2})
                good.disconnect()
                await self.ended(good)

    async def test_blocked_or_failed_close_still_ends_endpoint_and_retires_membership (self):
        for options in ({"block_close": True}, {"close_error": True}):
            with self.subTest(options=options):
                peer = await self.connect(send_error=RuntimeError, **options)
                await ws.broadcast("warning", {})
                await self.ended(peer)
                self.assertEqual(peer.close_codes, [1013])
                self.assertTrue(peer.close_started.is_set())

    async def test_simultaneous_disconnect_and_send_failure_is_observed (self):
        peer = await self.connect(block_send=True, send_error=OSError)
        await ws.broadcast("warning", {})
        await asyncio.wait_for(peer.send_started.wait(), 1)
        peer.disconnect()
        peer.send_gate.set()
        await self.ended(peer)
        self.assertEqual(len(peer.close_attempts), 1)
        self.assertIn(peer.close_attempts[0], (1000, 1013))

    async def test_unexpected_connected_reader_runtime_error_still_propagates (self):
        peer = await self.connect()
        peer.incoming.put_nowait({"type": "unexpected.asgi.event"})
        with self.assertRaises(RuntimeError):
            await asyncio.wait_for(peer.owner, 1)
        self.assertFalse(ws._clients)

    async def test_reader_error_and_failed_accept_preserve_error_paths_without_leaks (self):
        peer = await self.connect()
        peer.incoming.put_nowait({"type": "websocket.receive", "bytes": b"not-text"})
        with self.assertRaises(KeyError):
            await asyncio.wait_for(peer.owner, 1)
        self.assertFalse(ws._clients)
        refused = Peer()
        with patch.object(refused.socket, "accept", side_effect=RuntimeError("accept refused")):
            with self.assertRaisesRegex(RuntimeError, "accept refused"):
                await ws.websocket_endpoint(refused.socket)
        self.assertFalse(ws._clients)

    async def test_cancellation_during_send_or_close_propagates_after_owned_cleanup (self):
        for during_close in (False, True):
            with self.subTest(during_close=during_close):
                peer = await self.connect(block_send=True, block_close=during_close)
                if during_close:
                    peer.disconnect()
                    await asyncio.wait_for(peer.close_started.wait(), 1)
                else:
                    await ws.broadcast("warning", {})
                    await asyncio.wait_for(peer.send_started.wait(), 1)
                peer.owner.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await asyncio.wait_for(peer.owner, 1)
                self.assertFalse(any(client.websocket is peer.socket for client in ws._clients))
                self.assertEqual(peer.inflight, 0)

    async def test_repeated_cancellation_during_child_cleanup_observes_all_tasks (self):
        peer = await self.connect(block_send=True, delayed_cancel=True)
        await ws.broadcast("warning", {})
        await asyncio.wait_for(peer.send_started.wait(), 1)
        peer.owner.cancel()
        await asyncio.wait_for(peer.cancel_started.wait(), 1)
        peer.owner.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await asyncio.wait_for(peer.owner, 1)
        self.assertFalse(ws._clients)
        self.assertEqual(peer.inflight, 0)

    async def test_empty_fanout_yields_and_serialization_failure_remains_visible (self):
        ran = asyncio.Event()
        asyncio.get_running_loop().call_soon(ran.set)
        await ws.broadcast("warning", {})
        self.assertTrue(ran.is_set())
        cyclic = {}
        cyclic["self"] = cyclic
        with self.assertRaises(ValueError):
            await ws.broadcast("warning", cyclic)
        self.assertFalse(ws._clients)

    async def test_repeated_cancellation_during_close_cleanup_joins_the_io_task (self):
        peer = await self.connect(block_close=True, delayed_cancel=True)
        peer.disconnect()
        await asyncio.wait_for(peer.close_started.wait(), 1)
        peer.owner.cancel()
        await asyncio.wait_for(peer.cancel_started.wait(), 1)
        peer.owner.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await asyncio.wait_for(peer.owner, 1)
        self.assertFalse(ws._clients)
        self.assertEqual(peer.close_attempts, [1000])


if __name__ == "__main__":
    unittest.main()
