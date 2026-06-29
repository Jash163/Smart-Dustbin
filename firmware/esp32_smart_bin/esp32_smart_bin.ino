#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* BACKEND_URL = "http://192.168.1.100:8080/api/telemetry";
const char* BIN_ID = "lib";

const int PAPER_TRIG_PIN = 5;
const int PAPER_ECHO_PIN = 18;
const int PLASTIC_TRIG_PIN = 19;
const int PLASTIC_ECHO_PIN = 21;
const int METAL_TRIG_PIN = 22;
const int METAL_ECHO_PIN = 23;
const int IR_PIN = 27;

const int IR_ACTIVE_STATE = LOW;

const unsigned long POST_INTERVAL_MS = 5000;
const unsigned long WIFI_RETRY_INTERVAL_MS = 5000;
const unsigned long HTTP_TIMEOUT_MS = 4000;

float lastPaperCm = 52.0f;
float lastPlasticCm = 48.0f;
float lastMetalCm = 46.0f;
bool lastIrState = false;

unsigned long lastPostAt = 0;
unsigned long lastWifiAttemptAt = 0;

void setupPinPair(int trigPin, int echoPin) {
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  digitalWrite(trigPin, LOW);
}

void connectWifiIfNeeded() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  unsigned long now = millis();
  if (now - lastWifiAttemptAt < WIFI_RETRY_INTERVAL_MS) {
    return;
  }

  lastWifiAttemptAt = now;
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < 10000) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi connection attempt timed out.");
  }
}

float readRawDistanceCm(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  unsigned long durationUs = pulseIn(echoPin, HIGH, 30000);
  if (durationUs == 0) {
    return -1.0f;
  }

  return (durationUs * 0.0343f) / 2.0f;
}

float readStableDistanceCm(int trigPin, int echoPin, float fallbackValue) {
  float sum = 0.0f;
  int validSamples = 0;

  for (int i = 0; i < 3; ++i) {
    float sample = readRawDistanceCm(trigPin, echoPin);
    if (sample >= 2.0f && sample <= 60.0f) {
      sum += sample;
      validSamples += 1;
    }
    delay(25);
  }

  if (validSamples == 0) {
    return fallbackValue;
  }

  return sum / validSamples;
}

String buildTelemetryPayload(float paperCm, float plasticCm, float metalCm, bool irTriggered) {
  String payload = "{";
  payload += "\"binId\":\"";
  payload += BIN_ID;
  payload += "\",";
  payload += "\"ultrasonicCm\":{";
  payload += "\"paper\":";
  payload += String(paperCm, 2);
  payload += ",";
  payload += "\"plastic\":";
  payload += String(plasticCm, 2);
  payload += ",";
  payload += "\"metal\":";
  payload += String(metalCm, 2);
  payload += "},";
  payload += "\"irTriggered\":";
  payload += irTriggered ? "true" : "false";
  payload += "}";
  return payload;
}

void postTelemetry(bool forcePost) {
  connectWifiIfNeeded();
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  bool irTriggered = digitalRead(IR_PIN) == IR_ACTIVE_STATE;
  unsigned long now = millis();
  bool dueForIntervalPost = now - lastPostAt >= POST_INTERVAL_MS;
  bool irChanged = irTriggered != lastIrState;

  if (!forcePost && !dueForIntervalPost && !irChanged) {
    return;
  }

  float paperCm = readStableDistanceCm(PAPER_TRIG_PIN, PAPER_ECHO_PIN, lastPaperCm);
  float plasticCm = readStableDistanceCm(PLASTIC_TRIG_PIN, PLASTIC_ECHO_PIN, lastPlasticCm);
  float metalCm = readStableDistanceCm(METAL_TRIG_PIN, METAL_ECHO_PIN, lastMetalCm);

  lastPaperCm = paperCm;
  lastPlasticCm = plasticCm;
  lastMetalCm = metalCm;

  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.begin(BACKEND_URL);
  http.addHeader("Content-Type", "application/json");

  String payload = buildTelemetryPayload(paperCm, plasticCm, metalCm, irTriggered);
  int statusCode = http.POST(payload);

  Serial.print("POST ");
  Serial.print(BACKEND_URL);
  Serial.print(" -> ");
  Serial.println(statusCode);
  if (statusCode > 0) {
    String response = http.getString();
    Serial.println(response);
    lastPostAt = now;
    lastIrState = irTriggered;
  } else {
    Serial.print("HTTP error: ");
    Serial.println(http.errorToString(statusCode));
  }

  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(500);

  setupPinPair(PAPER_TRIG_PIN, PAPER_ECHO_PIN);
  setupPinPair(PLASTIC_TRIG_PIN, PLASTIC_ECHO_PIN);
  setupPinPair(METAL_TRIG_PIN, METAL_ECHO_PIN);
  pinMode(IR_PIN, INPUT_PULLUP);

  WiFi.mode(WIFI_STA);
  connectWifiIfNeeded();
  postTelemetry(true);
}

void loop() {
  postTelemetry(false);
  delay(150);
}
