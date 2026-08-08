# Mosquitto Setup

## Create passwd file (run once on server)

```bash
# Create users: esp32, api, admin
docker run --rm eclipse-mosquitto:2 mosquitto_passwd -c /tmp/passwd esp32
# Enter password for esp32 when prompted

docker run --rm eclipse-mosquitto:2 mosquitto_passwd /tmp/passwd api
# Enter password for api when prompted

# Copy passwd to this directory
cp /tmp/passwd infra/mosquitto/passwd
```

## Environment variables to set in .env

```env
MQTT_BROKER=mqtt          # hostname (docker service name)
MQTT_PORT=1883
MQTT_USER=api
MQTT_PASSWORD=<your_api_mqtt_password>
MQTT_TOPIC_PREFIX=metabreath
```

## ESP32 firmware config

The ESP32 should publish to:
```
Topic:   metabreath/<device_id>/reading
User:    esp32
Pass:    <esp32_mqtt_password>
Payload: JSON (see below)
```

### MQTT Payload (JSON from ESP32)
```json
{
  "ambient_voc": 437.4,
  "breath_voc": 482.3,
  "pressure_mean": 117.9,
  "pressure_std": 5.7,
  "breath_duration": 7.2,
  "temperature": 29.6,
  "humidity": 62.5
}
```

The backend computes: acetone_delta, quality_score, reliability_score, label, etc.
