"""WebSocket live push (PLAN v0.1.0.0 G.2).

Message shape per UM standard: {type, id, data}. Existing message types remain
supported; v0.3.0.0 adds activity_recorded, evidence_updated, and
readiness_updated as invalidation signals for authoritative REST resync.
"""

import asyncio
import json
import uuid
from dataclasses import dataclass, field
from typing import Awaitable

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

router = APIRouter()
CLIENT_QUEUE_CAPACITY = 64
SEND_TIMEOUT_SECONDS = 2.0
CLOSE_TIMEOUT_SECONDS = 1.0
EVICTION_CLOSE_CODE = 1013


@dataclass(eq=False)
class _Client:
    websocket: WebSocket
    queue: asyncio.Queue[str] = field(
        default_factory=lambda: asyncio.Queue(maxsize=CLIENT_QUEUE_CAPACITY))
    writer: asyncio.Task[None] | None = None
    close_code: int = 1000


_clients: set[_Client] = set()


def _retire (client: _Client) -> None:
    _clients.discard(client)


async def _run_io (operation: Awaitable[None], timeout: float) -> None:
    """Own the timed operation even during repeated cancellation on Python 3.10."""
    task = asyncio.ensure_future(operation)
    try:
        done, _pending = await asyncio.wait((task,), timeout=timeout)
        if not done:
            raise asyncio.TimeoutError
        task.result()
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)


async def _write (client: _Client) -> None:
    try:
        while True:
            message = await client.queue.get()
            await _run_io(client.websocket.send_text(message), SEND_TIMEOUT_SECONDS)
    except Exception:
        # Timeout and ordinary transport failure need a reconnect/REST resync.
        client.close_code = EVICTION_CLOSE_CODE
    finally:
        _retire(client)


async def _read (websocket: WebSocket) -> None:
    try:
        while True:
            await websocket.receive_text()  # existing client text keepalive
    except WebSocketDisconnect:
        pass
    except RuntimeError:
        # A concurrent failed send can retire Starlette's application state.
        if websocket.application_state != WebSocketState.DISCONNECTED:
            raise


async def broadcast (msg_type: str, data: dict) -> None:
    """Enqueue a shared frame without waiting for any client's network I/O."""
    message = json.dumps({"type": msg_type, "id": str(uuid.uuid4()), "data": data},
                         default=str)
    for client in list(_clients):
        try:
            client.queue.put_nowait(message)
        except asyncio.QueueFull:
            _retire(client)
            client.close_code = EVICTION_CLOSE_CODE
            if client.writer is not None:
                client.writer.cancel()
    # Let writers progress during producer bursts; never wait for network delivery.
    await asyncio.sleep(0)


@router.websocket("/ws")
async def websocket_endpoint (websocket: WebSocket):
    await websocket.accept()
    client = _Client(websocket)
    writer = asyncio.create_task(_write(client))
    client.writer = writer
    reader = asyncio.create_task(_read(websocket))
    _clients.add(client)
    try:
        done, _pending = await asyncio.wait(
            (reader, writer), return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            if not task.cancelled():
                task.result()  # unexpected reader failures retain their error path
    finally:
        _retire(client)
        reader.cancel()
        writer.cancel()
        try:
            await asyncio.gather(reader, writer, return_exceptions=True)
        finally:
            try:
                await _run_io(websocket.close(code=client.close_code), CLOSE_TIMEOUT_SECONDS)
            except Exception:
                pass  # endpoint exit lets ASGI finish transport cleanup
