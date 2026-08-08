"""
WebSocket endpoint for real-time sensor readings.

Clients connect to /ws/readings/{user_id} and authenticate via the
Sec-WebSocket-Protocol header — NOT a `?token=` query param. Query params
get written into reverse-proxy access logs (nginx), browser history, and
Referer headers, so a raw JWT there is a real leak vector. Browsers can't
set arbitrary headers on the WS handshake, but the `protocols` argument to
the JS `WebSocket` constructor *is* sent as a real Sec-WebSocket-Protocol
header, so we piggyback the token on that instead.

Client sends protocols=["access_token", <jwt>] (see useDeviceStream.ts).
We select the fixed "access_token" marker back in the handshake response
(never the token itself) — RFC 6455 requires the server to echo back one
of the values the client offered, but nothing says it has to be the secret
one, so the token is never reflected into the response headers either.

Server subscribes to Redis channel readings:{user_id} (published by mqtt_subscriber.py)
and forwards each JSON message to the connected client.
"""
import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.core.security import decode_access_token
from app.core.config import settings

log = logging.getLogger("ws_readings")

router = APIRouter(tags=["ws"])

_AUTH_SUBPROTOCOL = "access_token"


@router.websocket("/ws/readings/{user_id}")
async def ws_readings(
    websocket: WebSocket,
    user_id: str,
):
    # Authenticate: pull the JWT out of the offered subprotocols (not a
    # query param), decode it, and verify user_id matches.
    offered = websocket.scope.get("subprotocols") or []
    token = (
        offered[1]
        if len(offered) >= 2 and offered[0] == _AUTH_SUBPROTOCOL
        else None
    )

    subject = decode_access_token(token) if token else None
    if subject != user_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept(subprotocol=_AUTH_SUBPROTOCOL)
    log.info("WS connected user=%s", user_id[:8])

    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.CELERY_BROKER_URL, decode_responses=True)
        channel = f"readings:{user_id}"
        pubsub = r.pubsub()
        await pubsub.subscribe(channel)

        try:
            while True:
                # Check for incoming client messages (ping-pong or disconnect)
                recv_task = asyncio.create_task(_recv(websocket))
                msg_task = asyncio.create_task(pubsub.get_message(ignore_subscribe_messages=True, timeout=30))

                done, pending = await asyncio.wait(
                    [recv_task, msg_task],
                    return_when=asyncio.FIRST_COMPLETED,
                )

                for t in pending:
                    t.cancel()

                if recv_task in done:
                    # Client disconnected or sent data
                    try:
                        data = recv_task.result()
                        if data is None:
                            break
                        # Echo pings back as pong
                        if data == "ping":
                            await websocket.send_text("pong")
                    except WebSocketDisconnect:
                        break

                if msg_task in done:
                    msg = msg_task.result()
                    if msg and msg.get("type") == "message":
                        await websocket.send_text(msg["data"])

        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()
            await r.aclose()

    except WebSocketDisconnect:
        pass
    except Exception as e:
        log.error("WS error for user=%s: %s", user_id[:8], e)
    finally:
        log.info("WS disconnected user=%s", user_id[:8])


async def _recv(ws: WebSocket):
    """Receive one text message from WebSocket, return None on disconnect."""
    try:
        return await ws.receive_text()
    except WebSocketDisconnect:
        return None
