// =====================================================
// MetaBreath Firmware v2 — WiFiManager Edition
// =====================================================
// Libraries ที่ต้องติดตั้งใน Arduino Library Manager:
//   - WiFiManager by tzapu (>= 2.0.17)
//   - PubSubClient by Nick O'Leary
//   - ArduinoJson by Benoit Blanchon
// (Wire, WiFi, WiFiMulti, Preferences มากับ ESP32 core อยู่แล้ว)
//
// ── Device ID = MAC address ของตัวเอง (ไม่ต้องตั้งค่าใดๆ) ──
//   MQTT topic: metabreath/<MAC_NO_COLONS>/reading
//   เช่น MAC 88:F1:55:30:28:10 → metabreath/88F155302810/reading
//
// ── PRESSURE CALIBRATION (v2.1) ──
//   * ปรับ idle ให้อ่านได้ ~0.5 kPa (แทนที่จะเป็น 7 kPa ผิดๆ)
//   * ทำ auto-tare ตอนบู๊ต (พอร์ตต้องเปิดสู่บรรยากาศตอนเปิดไฟ)
//   * EMA smoothing + hysteresis เพื่อไวต่อการเป่าจริง แต่ตัด ghost blow
// =====================================================
#include <Wire.h>
#include <WiFi.h>
#include <WiFiMulti.h>
#include <WiFiManager.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// =====================================================
// MQTT SERVER
// =====================================================
#define MQTT_BROKER  "metabreath.duckdns.org"
#define MQTT_PORT    1883
#define MQTT_USER    "esp32"
#define MQTT_PASS    "0511182c23b48b7a07c274c2"

// =====================================================
// PIN CONFIG
// =====================================================
#define TGS1820_PIN  34
#define PRESSURE_PIN 32
#define SDA_PIN      21
#define SCL_PIN      22
#define LED_PIN      2

// =====================================================
// SHT31 CONFIG
// =====================================================
#define SHT31_ADDRESS 0x44

// =====================================================
// TGS1820 CONFIG
// =====================================================
const int TGS_SAMPLE_COUNT = 50;
const int BASELINE_SECONDS = 10;
float tgsBaselineVoltage   = 0.0;

// =====================================================
// XGZP6847A PRESSURE CONFIG  (0–10 kPa, 3.3 V, ratiometric)
// =====================================================
float ADC_MAX               = 4095.0;
float ESP32_ADC_VOLTAGE     = 3.3;

// --- Calibration ---
// Datasheet-nominal sensitivity for a 10%..90% ratiometric part:
//   counts/kPa = (0.80 * ADC_MAX) / full_scale_kPa = 0.80 * 4095 / 10 ≈ 327.6
// NOTE: this is only a best-estimate scale. For accurate kPa, calibrate
//       against a water column (1 kPa ≈ 102 mm H2O) and set this value.
const float PRESSURE_FS_KPA   = 10.0;
const float PRESSURE_SPAN     = 0.80;
const float COUNTS_PER_KPA    = (PRESSURE_SPAN * 4095.0) / PRESSURE_FS_KPA;  // ≈327.6

// Reported baseline at rest (kPa). Idle sits here instead of 0.
const float PRESSURE_IDLE_KPA = 0.5;

// --- Blow detection (tune these) ---
const float PRESSURE_NOISE_KPA = 0.02;  // deadband: below this above idle = noise
const float BLOW_ON_KPA        = 0.06;  // rising threshold to DECLARE a blow (sensitive)
const float BLOW_OFF_KPA       = 0.03;  // falling threshold to END a blow (hysteresis)
const float PRESSURE_EMA_ALPHA = 0.5;   // smoothing 0..1 (higher = snappier, noisier)
const float BLOW_GAIN          = 4.0;   // amplify reported blow magnitude (~0.2 -> ~0.8 kPa)

// Bias the tared zero slightly LOW so idle floats above the 0 floor and
// normal downward drift/noise never produces negative readings.
const float PRESSURE_ZERO_MARGIN_KPA = 0.08;

int   pressureZeroADC = 0;              // reported-pressure zero (biased low)
int   pressureRestADC = 0;              // true resting ADC (blow reference)
float pressureEMA     = PRESSURE_IDLE_KPA + PRESSURE_ZERO_MARGIN_KPA;
bool  blowActive      = false;

int readingNumber = 1;

// =====================================================
// NETWORK GLOBALS
// =====================================================
WiFiClient   wifiClient;
WiFiMulti    wifiMulti;
PubSubClient mqttClient(wifiClient);
Preferences  prefs;

char mqttTopic[128];
char mqttCommandTopic[128];
char mqttClientId[64];
char deviceId[20] = "";
char lastCmdId[40] = "";

// WiFi slots 2 & 3 (slot 1 managed by WiFiManager's own NVS)
char slot2ssid[33] = "";
char slot2pass[65] = "";
char slot3ssid[33] = "";
char slot3pass[65] = "";
bool wifiMultiReady = false;

bool mqttEnabled = false;

// =====================================================
// LED
// =====================================================
void ledOn()  { digitalWrite(LED_PIN, HIGH); }
void ledOff() { digitalWrite(LED_PIN, LOW);  }

// =====================================================
// FORWARD DECLARATIONS
// =====================================================
void handleMqttMessage(char* topic, byte* payload, unsigned int len);
void handleResetWifi();
void connectMQTT();
void ensureNetwork();
void loadExtraWifiSlots();
void setupWifiMulti();
int  readAverageADC(int pin, int sampleCount);
float adcToVoltage(int adcValue);
float adcToPressureKPa(int adc);
void calibratePressureZero();
bool readSHT31(float &temperature, float &humidity);
void publishReading(float sensorVoltage, float baselineVoltage, float acetoneDeltaMV,
                    float pressureKPa, bool blowActive, float blowKPa,
                    float temperature, float humidity, bool shtOK);

// =====================================================
// SETUP
// =====================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(LED_PIN, OUTPUT);
  ledOff();

  analogReadResolution(12);
  analogSetPinAttenuation(TGS1820_PIN, ADC_11db);
  analogSetPinAttenuation(PRESSURE_PIN, ADC_11db);
  Wire.begin(SDA_PIN, SCL_PIN);

  Serial.println();
  Serial.println("==============================================");
  Serial.println("        MetaBreath Sensor System v2");
  Serial.println("        TGS1820 + XGZP6847A + SHT31");
  Serial.println("==============================================");
  Serial.println();

  // --------------------------------------------------
  // Load persisted lastCmdId (idempotency across reboots)
  // --------------------------------------------------
  prefs.begin("metabreath", true);
  String saved = prefs.getString("lastCmdId", "");
  saved.toCharArray(lastCmdId, sizeof(lastCmdId));
  prefs.end();

  // --------------------------------------------------
  // Device ID = MAC address
  // --------------------------------------------------
  {
    uint64_t chipid = ESP.getEfuseMac();
    snprintf(deviceId, sizeof(deviceId), "%02X%02X%02X%02X%02X%02X",
             (uint8_t)(chipid),
             (uint8_t)(chipid >> 8),
             (uint8_t)(chipid >> 16),
             (uint8_t)(chipid >> 24),
             (uint8_t)(chipid >> 32),
             (uint8_t)(chipid >> 40));
  }
  Serial.print("[Config] Device ID (MAC): ");
  Serial.println(deviceId);

  // --------------------------------------------------
  // Load extra WiFi slots from Preferences
  // --------------------------------------------------
  loadExtraWifiSlots();

  // --------------------------------------------------
  // Calibrate TGS1820
  // --------------------------------------------------
  Serial.println("Calibrating TGS1820 baseline...");
  tgsBaselineVoltage = calibrateTGSBaseline();
  Serial.print("TGS1820 Baseline Voltage: ");
  Serial.print(tgsBaselineVoltage, 4);
  Serial.println(" V");

  // --------------------------------------------------
  // Tare pressure sensor  (keep the port OPEN to air now)
  // --------------------------------------------------
  calibratePressureZero();

  // --------------------------------------------------
  // WiFiManager — portal พร้อม slot 2/3 สำรอง
  // --------------------------------------------------
  WiFiManager wm;
  wm.setConnectTimeout(30);
  wm.setConfigPortalTimeout(300);

  // Custom parameters: slot 2
  WiFiManagerParameter sep1(
    "<hr style='margin:20px 0'>"
    "<p style='color:#0891b2;font-weight:bold;margin-bottom:4px'>WiFi สำรอง (ไม่บังคับ)</p>"
    "<p style='color:#64748b;font-size:0.85em;margin-top:0'>กรอก SSID + รหัสผ่านของ WiFi ตัวสำรอง<br>"
    "ESP32 จะต่ออัตโนมัติกับตัวที่ available</p>"
  );
  WiFiManagerParameter param_ssid2("ssid2", "WiFi ช่อง 2 (SSID)", slot2ssid, 32);
  WiFiManagerParameter param_pass2("pass2", "รหัสผ่าน WiFi 2", slot2pass, 64, "type='password'");
  WiFiManagerParameter sep2("<div style='margin:12px 0'></div>");
  WiFiManagerParameter param_ssid3("ssid3", "WiFi ช่อง 3 (SSID)", slot3ssid, 32);
  WiFiManagerParameter param_pass3("pass3", "รหัสผ่าน WiFi 3", slot3pass, 64, "type='password'");

  wm.addParameter(&sep1);
  wm.addParameter(&param_ssid2);
  wm.addParameter(&param_pass2);
  wm.addParameter(&sep2);
  wm.addParameter(&param_ssid3);
  wm.addParameter(&param_pass3);

  // Save extra slots whenever portal form is submitted
  wm.setSaveParamsCallback([&]() {
    const char* s2 = param_ssid2.getValue();
    const char* p2 = param_pass2.getValue();
    const char* s3 = param_ssid3.getValue();
    const char* p3 = param_pass3.getValue();

    strncpy(slot2ssid, s2, sizeof(slot2ssid) - 1);
    // Keep existing password if field left blank
    if (strlen(p2) > 0) strncpy(slot2pass, p2, sizeof(slot2pass) - 1);
    strncpy(slot3ssid, s3, sizeof(slot3ssid) - 1);
    if (strlen(p3) > 0) strncpy(slot3pass, p3, sizeof(slot3pass) - 1);

    prefs.begin("wifiSlots", false);
    prefs.putString("ssid2", slot2ssid);
    prefs.putString("pass2", slot2pass);
    prefs.putString("ssid3", slot3ssid);
    prefs.putString("pass3", slot3pass);
    prefs.end();

    Serial.println("[WiFi] Extra slots saved to Preferences");
    Serial.printf("[WiFi]   slot2=%s  slot3=%s\n",
      strlen(slot2ssid) > 0 ? slot2ssid : "(empty)",
      strlen(slot3ssid) > 0 ? slot3ssid : "(empty)");
  });

  // Full MAC in the AP name — this is the Device ID the user types into the
  // app when adding a device, so it must be fully readable, not truncated.
  String apName = "MetaBreath-Setup-" + String(deviceId);

  wm.setTitle("MetaBreath");
  wm.setCustomHeadElement(
    "<style>"
      "body{font-family:sans-serif;background:#f0f9ff;margin:0;padding:16px}"
      ".wrap{background:#fff;border-radius:12px;padding:20px;max-width:400px;margin:auto}"
      "h1{color:#0891b2;font-size:1.2em}"
      "input{border-radius:8px!important;font-size:1em}"
      "input[type=submit]{background:#0891b2!important;color:#fff!important;"
        "border:none!important;border-radius:8px!important;padding:14px!important;"
        "font-size:1.1em!important;width:100%!important}"
    "</style>"
  );
  {
    String menuHtml =
      "<p style='color:#64748b;font-size:1em;margin-bottom:8px;text-align:center'>"
        "เลือก WiFi หลัก (ช่อง 1)<br>แล้วกรอกรหัสผ่าน"
      "</p>"
      "<p style='color:#0891b2;font-size:0.85em;text-align:center;margin-bottom:20px'>"
        "Device ID: <b>" + String(deviceId) + "</b><br>"
        "<span style='color:#64748b'>พิมพ์ค่านี้ในแอปตอนเพิ่มอุปกรณ์</span>"
      "</p>";
    wm.setCustomMenuHTML(menuHtml.c_str());
  }

  Serial.println();
  Serial.print("[WiFi] AP: ");
  Serial.println(apName);

  bool connected = wm.autoConnect(apName.c_str());

  if (!connected) {
    Serial.println("[WiFi] Portal timeout — restarting");
    delay(1000);
    ESP.restart();
  }

  Serial.print("[WiFi] Connected: ");
  Serial.println(WiFi.localIP());
  ledOn();

  // --------------------------------------------------
  // Register all slots into WiFiMulti
  // --------------------------------------------------
  setupWifiMulti();

  // --------------------------------------------------
  // MQTT
  // --------------------------------------------------
  snprintf(mqttTopic,        sizeof(mqttTopic),        "metabreath/%s/reading", deviceId);
  snprintf(mqttCommandTopic, sizeof(mqttCommandTopic), "metabreath/%s/command", deviceId);
  snprintf(mqttClientId,     sizeof(mqttClientId),     "metabreath-%s",         deviceId);
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setBufferSize(512);
  mqttClient.setKeepAlive(60);
  mqttClient.setCallback(handleMqttMessage);
  connectMQTT();
  mqttEnabled = true;

  Serial.println();
  Serial.println("Starting sensor readings...");
  Serial.println("==============================================");
}

// =====================================================
// LOOP
// =====================================================
void loop() {
  if (mqttEnabled) {
    ensureNetwork();
    mqttClient.loop();
  }

  // --------------------------------------------------
  // TGS1820
  // --------------------------------------------------
  int   tgsADC          = readAverageADC(TGS1820_PIN, TGS_SAMPLE_COUNT);
  float tgsVoltage      = adcToVoltage(tgsADC);
  float acetoneDelta_mV = (tgsVoltage - tgsBaselineVoltage) * 1000.0;

  String tgsStatus = (tgsVoltage < 0.05)
    ? "Sensor not connected"
    : classifyAcetone(acetoneDelta_mV);

  // --------------------------------------------------
  // PRESSURE  (tare + EMA smoothing + hysteresis blow detect)
  // --------------------------------------------------
  int   pressureADC     = readAverageADC(PRESSURE_PIN, 20);
  float pressureVoltage = adcToVoltage(pressureADC);
  float pressureRaw     = adcToPressureKPa(pressureADC);        // idle ≈ 0.58 kPa

  // Exponential moving average kills brief spikes (ghost blows)
  pressureEMA = PRESSURE_EMA_ALPHA * pressureRaw +
                (1.0 - PRESSURE_EMA_ALPHA) * pressureEMA;

  // Real blow strength above the resting baseline (idle + margin)
  float blowRaw = pressureEMA - (PRESSURE_IDLE_KPA + PRESSURE_ZERO_MARGIN_KPA);
  if (blowRaw < 0.0) blowRaw = 0.0;                            // never negative
  if (blowRaw < PRESSURE_NOISE_KPA) blowRaw = 0.0;            // deadband (rejects ghosts)

  // Detection runs on the REAL strength — keeps the tuned ghost rejection
  if (!blowActive && blowRaw > BLOW_ON_KPA)       blowActive = true;
  else if (blowActive && blowRaw < BLOW_OFF_KPA)  blowActive = false;

  // Amplify the reported magnitude: ~0.2 kPa blow -> ~0.8 kPa
  float blowKPa     = blowRaw * BLOW_GAIN;
  float pressureKPa = PRESSURE_IDLE_KPA + PRESSURE_ZERO_MARGIN_KPA + blowKPa;

  float pressurePa  = pressureKPa * 1000.0;
  float pressureBar = pressureKPa / 100.0;

  String pressureStatus = (pressureVoltage < 0.05) ? "Sensor not connected"
                        : (blowActive ? "BLOW" : "idle");

  // --------------------------------------------------
  // SHT31
  // --------------------------------------------------
  float temperature = 0.0;
  float humidity    = 0.0;
  bool  shtOK       = readSHT31(temperature, humidity);

  // --------------------------------------------------
  // SERIAL OUTPUT
  // --------------------------------------------------
  Serial.println();
  Serial.println("==============================================");
  Serial.print("Reading No. ");  Serial.print(readingNumber);
  Serial.print("     Time: ");   Serial.print(millis() / 1000);
  Serial.println(" seconds");
  Serial.println("==============================================");

  Serial.println();
  Serial.println("TGS1820 ACETONE / VOC SENSOR");
  Serial.println("----------------------------------------------");
  Serial.print("Raw ADC Value      : "); Serial.println(tgsADC);
  Serial.print("Sensor Voltage     : "); Serial.print(tgsVoltage, 4);     Serial.println(" V");
  Serial.print("Baseline Voltage   : "); Serial.print(tgsBaselineVoltage, 4); Serial.println(" V");
  Serial.print("Acetone Delta      : "); Serial.print(acetoneDelta_mV, 2); Serial.println(" mV");
  Serial.print("Gas Status         : "); Serial.println(tgsStatus);

  Serial.println();
  Serial.println("XGZP6847A PRESSURE SENSOR");
  Serial.println("----------------------------------------------");
  Serial.print("Raw ADC Value      : "); Serial.println(pressureADC);
  Serial.print("Zero ADC (idle)    : "); Serial.println(pressureZeroADC);
  Serial.print("Sensor Voltage     : "); Serial.print(pressureVoltage, 4); Serial.println(" V");
  Serial.print("Pressure           : "); Serial.print(pressureKPa, 3);     Serial.println(" kPa");
  Serial.print("Blow Strength      : "); Serial.print(blowKPa, 3);         Serial.println(" kPa");
  Serial.print("Pressure           : "); Serial.print(pressurePa, 2);      Serial.println(" Pa");
  Serial.print("Pressure           : "); Serial.print(pressureBar, 5);     Serial.println(" bar");
  Serial.print("Pressure Status    : "); Serial.println(pressureStatus);

  Serial.println();
  Serial.println("SHT31 TEMPERATURE / HUMIDITY SENSOR");
  Serial.println("----------------------------------------------");
  if (shtOK) {
    Serial.print("Temperature        : "); Serial.print(temperature, 2); Serial.println(" C");
    Serial.print("Humidity           : "); Serial.print(humidity, 2);    Serial.println(" %");
    Serial.println("SHT31 Status       : OK");
  } else {
    Serial.println("Temperature        : Failed");
    Serial.println("Humidity           : Failed");
    Serial.println("SHT31 Status       : Check wiring or I2C address");
  }

  Serial.println();
  Serial.println("SYSTEM SUMMARY");
  Serial.println("----------------------------------------------");
  Serial.println(tgsVoltage < 0.05 ? "TGS1820            : CHECK SENSOR" : "TGS1820            : OK");
  Serial.print("Pressure Sensor    : "); Serial.println(pressureStatus);
  Serial.println(shtOK ? "SHT31              : OK" : "SHT31              : CHECK SENSOR");
  Serial.print("Network            : WiFi=");
  Serial.print(WiFi.isConnected() ? "OK" : "DOWN");
  if (WiFi.isConnected()) {
    Serial.print(" ("); Serial.print(WiFi.SSID()); Serial.print(")");
  }
  Serial.print("  MQTT=");
  Serial.println(mqttClient.connected() ? "OK" : "DOWN");
  Serial.println("==============================================");

  if (mqttEnabled) {
    publishReading(tgsVoltage, tgsBaselineVoltage, acetoneDelta_mV,
                   pressureKPa, blowActive, blowKPa,
                   temperature, humidity, shtOK);
  }

  readingNumber++;
  delay(500);
}

// =====================================================
// WIFI MULTI HELPERS
// =====================================================
void loadExtraWifiSlots() {
  prefs.begin("wifiSlots", true);
  prefs.getString("ssid2", "").toCharArray(slot2ssid, sizeof(slot2ssid));
  prefs.getString("pass2", "").toCharArray(slot2pass, sizeof(slot2pass));
  prefs.getString("ssid3", "").toCharArray(slot3ssid, sizeof(slot3ssid));
  prefs.getString("pass3", "").toCharArray(slot3pass, sizeof(slot3pass));
  prefs.end();

  Serial.printf("[WiFi] Slots loaded — slot2=%s  slot3=%s\n",
    strlen(slot2ssid) > 0 ? slot2ssid : "(empty)",
    strlen(slot3ssid) > 0 ? slot3ssid : "(empty)");
}

void setupWifiMulti() {
  // Slot 1: WiFiManager's stored credential (already connected at this point)
  String ssid1 = WiFi.SSID();
  String pass1 = WiFi.psk();
  if (ssid1.length() > 0) {
    wifiMulti.addAP(ssid1.c_str(), pass1.c_str());
    Serial.printf("[WiFi] Multi slot1: %s\n", ssid1.c_str());
  }
  if (strlen(slot2ssid) > 0) {
    wifiMulti.addAP(slot2ssid, slot2pass);
    Serial.printf("[WiFi] Multi slot2: %s\n", slot2ssid);
  }
  if (strlen(slot3ssid) > 0) {
    wifiMulti.addAP(slot3ssid, slot3pass);
    Serial.printf("[WiFi] Multi slot3: %s\n", slot3ssid);
  }
  wifiMultiReady = true;
}

// =====================================================
// ADC FUNCTIONS
// =====================================================
int readAverageADC(int pin, int sampleCount) {
  long sum = 0;
  for (int i = 0; i < sampleCount; i++) {
    sum += analogRead(pin);
    delay(5);
  }
  return sum / sampleCount;
}

float adcToVoltage(int adcValue) {
  return adcValue * ESP32_ADC_VOLTAGE / ADC_MAX;
}

// =====================================================
// PRESSURE FUNCTIONS
// =====================================================
// Capture the resting ADC as 0 kPa reference. Port must be open to air.
void calibratePressureZero() {
  Serial.println("Calibrating pressure zero (keep port open to air)...");
  pressureRestADC = readAverageADC(PRESSURE_PIN, 200);                 // true resting (blow reference)
  pressureZeroADC = pressureRestADC - (int)(PRESSURE_ZERO_MARGIN_KPA * COUNTS_PER_KPA);  // biased low
  pressureEMA     = PRESSURE_IDLE_KPA + PRESSURE_ZERO_MARGIN_KPA;      // seed EMA at resting value
  blowActive      = false;
  Serial.printf("[Pressure] Rest ADC = %d  Zero ADC = %d  (idle ~%.2f kPa)\n",
                pressureRestADC, pressureZeroADC,
                PRESSURE_IDLE_KPA + PRESSURE_ZERO_MARGIN_KPA);
}

// ADC -> kPa. Idle rests at PRESSURE_IDLE_KPA, blows push it up.
float adcToPressureKPa(int adc) {
  float kpa = (float)(adc - pressureZeroADC) / COUNTS_PER_KPA + PRESSURE_IDLE_KPA;
  if (kpa < 0.0) kpa = 0.0;
  return kpa;
}

// =====================================================
// TGS1820 FUNCTIONS
// =====================================================
float calibrateTGSBaseline() {
  float sumVoltage = 0;
  for (int i = 0; i < BASELINE_SECONDS; i++) {
    int   adcValue = readAverageADC(TGS1820_PIN, TGS_SAMPLE_COUNT);
    float voltage  = adcToVoltage(adcValue);
    sumVoltage += voltage;
    Serial.print("Baseline sample ");
    Serial.print(i + 1);
    Serial.print("/");
    Serial.print(BASELINE_SECONDS);
    Serial.print(" | Voltage: ");
    Serial.print(voltage, 4);
    Serial.println(" V");
    delay(1000);
  }
  return sumVoltage / BASELINE_SECONDS;
}

String classifyAcetone(float delta_mV) {
  if (delta_mV < 5)  return "Clean Air";
  if (delta_mV < 30) return "Low";
  if (delta_mV < 80) return "Moderate";
  return "High";
}

// =====================================================
// SHT31
// =====================================================
bool readSHT31(float &temperature, float &humidity) {
  Wire.beginTransmission(SHT31_ADDRESS);
  Wire.write(0x24);
  Wire.write(0x00);
  if (Wire.endTransmission() != 0) return false;
  delay(20);
  Wire.requestFrom(SHT31_ADDRESS, 6);
  if (Wire.available() != 6) return false;
  uint16_t rawTemp = Wire.read() << 8; rawTemp |= Wire.read(); Wire.read();
  uint16_t rawHum  = Wire.read() << 8; rawHum  |= Wire.read(); Wire.read();
  temperature = -45.0  + 175.0 * ((float)rawTemp / 65535.0);
  humidity    = 100.0  *         ((float)rawHum  / 65535.0);
  return true;
}

// =====================================================
// MQTT COMMAND HANDLER
// =====================================================
void handleResetWifi() {
  Serial.println("[CMD] Resetting WiFi credentials — device will restart");

  for (int i = 0; i < 6; i++) {
    ledOn();  delay(100);
    ledOff(); delay(100);
  }

  WiFiManager wm;
  wm.resetSettings();

  prefs.begin("metabreath", false);
  prefs.clear();
  prefs.end();

  // Clear extra slots too
  prefs.begin("wifiSlots", false);
  prefs.clear();
  prefs.end();

  delay(500);
  ESP.restart();
}

void handleMqttMessage(char* topic, byte* payload, unsigned int len) {
  if (strcmp(topic, mqttCommandTopic) != 0) return;

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload, len);
  if (err) {
    Serial.printf("[CMD] JSON parse error: %s\n", err.c_str());
    return;
  }

  const char* action = doc["action"] | "";
  const char* cmdId  = doc["cmd_id"] | "";

  if (strlen(cmdId) == 0 || strcmp(cmdId, lastCmdId) == 0) {
    Serial.println("[CMD] duplicate or missing cmd_id — ignoring");
    return;
  }

  strncpy(lastCmdId, cmdId, sizeof(lastCmdId) - 1);
  prefs.begin("metabreath", false);
  prefs.putString("lastCmdId", lastCmdId);
  prefs.end();

  Serial.printf("[CMD] action=%s cmd_id=%s\n", action, cmdId);

  if (strcmp(action, "reset_wifi") == 0) {
    handleResetWifi();
  } else {
    Serial.printf("[CMD] unknown action: %s\n", action);
  }
}

// =====================================================
// NETWORK — MQTT
// =====================================================
void connectMQTT() {
  if (!WiFi.isConnected()) return;
  if (mqttClient.connected()) return;
  Serial.print("[MQTT] Connecting... ");
  if (mqttClient.connect(mqttClientId, MQTT_USER, MQTT_PASS)) {
    Serial.println("Connected");
    Serial.print("[MQTT] Topic: ");
    Serial.println(mqttTopic);
    mqttClient.subscribe(mqttCommandTopic, 1);
    Serial.print("[MQTT] Subscribed: ");
    Serial.println(mqttCommandTopic);
  } else {
    Serial.print("[MQTT] Failed rc=");
    Serial.println(mqttClient.state());
  }
}

void ensureNetwork() {
  if (!WiFi.isConnected()) {
    Serial.println("[Net] WiFi dropped — reconnecting");
    if (wifiMultiReady) {
      Serial.print("[Net] Trying all slots...");
      uint8_t result = wifiMulti.run(15000);
      if (result == WL_CONNECTED) {
        Serial.printf(" Connected to %s\n", WiFi.SSID().c_str());
      } else {
        Serial.println(" Failed");
      }
    } else {
      WiFi.reconnect();
      unsigned long start = millis();
      while (!WiFi.isConnected() && millis() - start < 15000) {
        delay(500);
        Serial.print(".");
      }
      Serial.println();
    }
  }
  if (WiFi.isConnected() && !mqttClient.connected()) {
    connectMQTT();
  }
}

void publishReading(float sensorVoltage,
                    float baselineVoltage,
                    float acetoneDeltaMV,
                    float pressureKPa,
                    bool  blowActive,
                    float blowKPa,
                    float temperature,
                    float humidity,
                    bool  shtOK) {
  if (!mqttClient.connected()) return;
  JsonDocument doc;
  doc["sensor_voltage"]   = sensorVoltage;
  doc["baseline_voltage"] = baselineVoltage;
  doc["acetone_delta_mv"] = acetoneDeltaMV;
  doc["pressure_kpa"]     = pressureKPa;
  doc["blow_active"]      = blowActive;
  doc["blow_kpa"]         = blowKPa;
  doc["temperature"]      = shtOK ? (float)temperature : (float)NAN;
  doc["humidity"]         = shtOK ? (float)humidity    : (float)NAN;
  doc["reading_number"]   = readingNumber;

  char   buf[384];
  size_t n = serializeJson(doc, buf);

  if (mqttClient.publish(mqttTopic, (const uint8_t*)buf, n, false)) {
    Serial.print("[MQTT] Published ");
    Serial.print((int)n);
    Serial.print(" bytes -> ");
    Serial.println(buf);
  } else {
    Serial.print("[MQTT] Publish FAILED rc=");
    Serial.println(mqttClient.state());
  }
}