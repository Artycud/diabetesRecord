"""
MetaBreath MQTT Subscriber

Runs as a standalone asyncio process (not Celery).
Subscribes to metabreath/+/reading, processes each ESP32 payload
through the signal_processing pipeline, and stores results in TimescaleDB.

Run: python -m app.workers.mqtt_subscriber
Or via docker-compose service: mqtt-sub
"""
import asyncio
import json
import logging
import os
import signal
from datetime import datetime
from pathlib import Path
from typing import Optional

import aiomqtt
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select

from app.core.config import settings
from app.models.health import Device, SensorReading, DeviceCalibration
from app.services import signal_processing as sp
from app.services.device_session import resolve_reading_user

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [mqtt-sub] %(levelname)s %(message)s",
)
log = logging.getLogger("mqtt_subscriber")

MQTT_BROKER = os.getenv("MQTT_HOST", "mqtt")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER = os.getenv("MQTT_USER", "api")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD") or os.getenv("MQTT_PASS", "")
MQTT_TOPIC_PREFIX = os.getenv("MQTT_TOPIC_PREFIX", "metabreath")
SUBSCRIBE_TOPIC = f"{MQTT_TOPIC_PREFIX}/+/reading"

HEARTBEAT_FILE = Path("/tmp/mqtt-sub.heartbeat")

engine = create_async_engine(settings.DATABASE_URL, echo=False, pool_pre_ping=True)
Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def _touch_heartbeat() -> None:
    try:
        HEARTBEAT_FILE.touch(exist_ok=True)
    except OSError:
        pass


async def process_reading(device_id_str: str, payload: dict):
    """
    Run signal processing pipeline and persist to TimescaleDB.

    Normal devices: save only when a recording session is active.
    Shared devices (is_shared=True): always save and fan-out to ALL active users.
    """
    import redis.asyncio as aioredis
    r = aioredis.from_url(settings.CELERY_BROKER_URL, decode_responses=True)
    active_session_id: Optional[str] = None
    try:
        await r.set(f"heartbeat:{device_id_str}", "1", ex=60)
        active_session_id = await r.get(f"recording:{device_id_str}")
    finally:
        await r.aclose()

    async with Session() as db:
        # รองรับทั้ง UUID (เดิม) และ MAC address (ใหม่ เช่น 88F155302810)
        device = None
        full_topic = f"metabreath/{device_id_str}/reading"

        topic_result = await db.exec(
            select(Device).where(Device.mqtt_topic == full_topic, Device.active == True)
        )
        device = topic_result.first()

        if not device:
            try:
                from uuid import UUID
                device_uuid_lookup = UUID(device_id_str)
                uuid_result = await db.exec(
                    select(Device).where(Device.id == device_uuid_lookup, Device.active == True)
                )
                device = uuid_result.first()
            except ValueError:
                pass

        if not device:
            log.warning("Unknown or inactive device: %s — skipping", device_id_str)
            return

        # Shared device: always process; normal device: require active session
        if not device.is_shared and not active_session_id:
            return

        device_uuid = device.id

        cal_result = await db.exec(
            select(DeviceCalibration)
            .where(DeviceCalibration.device_id == device_uuid)
            .order_by(DeviceCalibration.calibrated_at.desc())
        )
        calibration = cal_result.first()

        # Firmware payload (metabreath.ino)
        sensor_voltage   = payload.get("sensor_voltage")
        baseline_voltage = payload.get("baseline_voltage")
        pressure_kpa     = payload.get("pressure_kpa")
        temp_c           = payload.get("temperature")
        humidity         = payload.get("humidity")

        if calibration and calibration.baseline_voc:
            effective_baseline = calibration.baseline_voc
        else:
            effective_baseline = baseline_voltage

        if sensor_voltage is not None and effective_baseline is not None:
            acetone_delta_mv = (sensor_voltage - effective_baseline) * 1000.0
        else:
            acetone_delta_mv = payload.get("acetone_delta_mv") or 0.0

        q_score = sp.quality_score(
            sensor_voltage=sensor_voltage,
            baseline_voltage=effective_baseline,
            pressure_kpa=pressure_kpa,
            temp_c=temp_c,
            humidity_pct=humidity,
        )

        cal_age_days = 0.0
        if calibration:
            cal_age_days = (datetime.utcnow() - calibration.calibrated_at).total_seconds() / 86400
        r_score = sp.reliability_score(
            q_score,
            calibration.drift_score if calibration else 0.0,
            cal_age_days,
        )

        env_pen = sp.environment_penalty(temp_c, humidity)
        confidence = r_score / 100.0
        classification = sp.classify_acetone(acetone_delta_mv, confidence)

        now = datetime.utcnow()

        # Attribute to current session claimer; fallback to device owner
        reading_user_id = await resolve_reading_user(device, db)
        session_label = active_session_id or ("shared" if device.is_shared else None)

        ws_payload_dict = {
            "device_id": str(device_uuid),
            "time": now.isoformat(),
            "acetone_delta_mv": round(acetone_delta_mv, 4),
            "sensor_voltage": sensor_voltage,
            "baseline_voltage": effective_baseline,
            "pressure_kpa": pressure_kpa,
            "temperature": temp_c,
            "humidity": humidity,
            "label": classification["label"],
            "quality_score": round(q_score, 2),
            "confidence_score": round(confidence, 4),
        }

        reading = SensorReading(
            time=now,
            device_id=device_uuid,
            user_id=reading_user_id,
            session_id=session_label,
            ambient_voc=baseline_voltage,
            breath_voc=sensor_voltage,
            acetone_delta=round(acetone_delta_mv, 4),
            pressure_mean=pressure_kpa,
            pressure_std=None,
            breath_duration=None,
            temp_c=temp_c,
            humidity_pct=humidity,
            quality_score=round(q_score, 2),
            reliability_score=round(r_score, 2),
            environment_penalty=env_pen,
            metabolic_risk_index=classification["metabolic_risk_index"],
            confidence_score=round(confidence, 4),
            label=classification["label"],
            raw=payload,
        )
        db.add(reading)

        try:
            r2 = aioredis.from_url(settings.CELERY_BROKER_URL, decode_responses=True)
            await r2.publish(f"readings:{reading_user_id}", json.dumps(ws_payload_dict))
            await r2.aclose()
        except Exception as e:
            log.debug("Redis publish failed (non-critical): %s", e)

        await db.commit()

        log.info(
            "device=%s Δ=%.1f mV label=%s p=%.2f kPa T=%s H=%s q=%.0f [→ %s]",
            device_id_str[:8],
            acetone_delta_mv,
            classification["label"],
            pressure_kpa or 0.0,
            "-" if temp_c is None else f"{temp_c:.1f}°C",
            "-" if humidity is None else f"{humidity:.0f}%",
            q_score,
            str(reading_user_id)[:8],
        )


async def _heartbeat_loop(stop_event: asyncio.Event):
    """Update heartbeat file every 10s while broker is connected."""
    while not stop_event.is_set():
        _touch_heartbeat()
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=10)
        except asyncio.TimeoutError:
            pass


async def main():
    log.info("Starting MQTT subscriber → %s:%d topic=%s user=%s",
             MQTT_BROKER, MQTT_PORT, SUBSCRIBE_TOPIC, MQTT_USER)

    reconnect_delay = 5
    while True:
        stop_event = asyncio.Event()
        heartbeat_task = None
        try:
            async with aiomqtt.Client(
                hostname=MQTT_BROKER,
                port=MQTT_PORT,
                username=MQTT_USER,
                password=MQTT_PASSWORD,
                keepalive=60,
                identifier=f"cheewarun-mqtt-sub-{os.getpid()}",
            ) as client:
                log.info("Connected to MQTT broker")
                reconnect_delay = 5
                _touch_heartbeat()
                heartbeat_task = asyncio.create_task(_heartbeat_loop(stop_event))

                await client.subscribe(SUBSCRIBE_TOPIC, qos=1)
                log.info("Subscribed to %s", SUBSCRIBE_TOPIC)

                async for message in client.messages:
                    topic = str(message.topic)
                    parts = topic.split("/")
                    if len(parts) != 3:
                        continue
                    device_id_str = parts[1]

                    try:
                        payload = json.loads(message.payload)
                    except json.JSONDecodeError:
                        log.warning("Invalid JSON from %s: %s",
                                    device_id_str, bytes(message.payload)[:100])
                        continue

                    try:
                        await process_reading(device_id_str, payload)
                    except Exception as e:
                        log.error("Error processing reading from %s: %s", device_id_str, e)

        except aiomqtt.MqttError as e:
            log.error("MQTT error: %s — reconnecting in %ds", e, reconnect_delay)
            await asyncio.sleep(reconnect_delay)
            reconnect_delay = min(reconnect_delay * 2, 60)
        except Exception as e:
            log.error("Unexpected error: %s", e)
            await asyncio.sleep(reconnect_delay)
        finally:
            stop_event.set()
            if heartbeat_task:
                try:
                    await heartbeat_task
                except Exception:
                    pass


def handle_shutdown(signum, frame):
    log.info("Received signal %d — shutting down", signum)
    raise SystemExit(0)


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, handle_shutdown)
    signal.signal(signal.SIGINT, handle_shutdown)
    asyncio.run(main())
