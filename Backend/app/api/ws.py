"""WebSocket live push (PLAN v0.1.0.0 G.2).

Message shape per UM standard: {type, id, data}. Types: event_resolved,
task_updated, repo_status_changed, commit_detected, warning (F47).
"""

import json
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()
_clients: set[WebSocket] = set()


async def broadcast (msg_type: str, data: dict) -> None:
    message = json.dumps({"type": msg_type, "id": str(uuid.uuid4()), "data": data},
                         default=str)
    dead = []
    # CFT-7: iterate a COPY - the set mutates when clients (dis)connect
    # while a send awaits ("set changed size during iteration").
    for client in list(_clients):
        try:
            await client.send_text(message)
        except Exception:
            dead.append(client)
    for client in dead:
        _clients.discard(client)


@router.websocket("/ws")
async def websocket_endpoint (websocket: WebSocket):
    await websocket.accept()
    _clients.add(websocket)
    try:
        while True:
            await websocket.receive_text()  # keepalive pings from the client
    except WebSocketDisconnect:
        pass
    finally:
        _clients.discard(websocket)
