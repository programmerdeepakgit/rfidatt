/*
  RFID Attendance — ESP8266 + RC522
  Typical NodeMCU pins:
    RC522 SDA/SS -> D2, SCK -> D5, MOSI -> D7, MISO -> D6, RST -> D1
  RC522 power: 3.3V ONLY.
*/
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecureBearSSL.h>
#include <SPI.h>
#include <MFRC522.h>

#define SS_PIN D2
#define RST_PIN D1
#define LED_PIN LED_BUILTIN

const char* WIFI_SSID = "PUT_WIFI_NAME_HERE";
const char* WIFI_PASSWORD = "PUT_WIFI_PASSWORD_HERE";
const char* ENDPOINT_URL = "PUT_DEPLOYED_CLOUD_FUNCTION_URL_HERE";
const char* DEVICE_TOKEN = "PUT_DEVICE_TOKEN_HERE";

MFRC522 rfid(SS_PIN, RST_PIN);
unsigned long lastScanMs = 0;
String lastUid = "";

void beepPattern(bool success) {
  // Built-in LED feedback only. Add a buzzer only after checking its voltage/current.
  if (success) {
    digitalWrite(LED_PIN, LOW); delay(180); digitalWrite(LED_PIN, HIGH);
  } else {
    for (int i=0;i<2;i++) { digitalWrite(LED_PIN, LOW); delay(100); digitalWrite(LED_PIN, HIGH); delay(100); }
  }
}

String readUid() {
  String uid = "";
  for (byte i=0; i<rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  return uid;
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH); // many NodeMCU boards have active-low built-in LED
  SPI.begin();
  rfid.PCD_Init();
  Serial.println("\nRFID Attendance reader starting...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis()-start < 20000) {
    delay(500); Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Wi-Fi connected. IP: "); Serial.println(WiFi.localIP());
  } else {
    Serial.println("Wi-Fi unavailable. Scans will not be recorded online.");
  }
  Serial.println("Tap an RFID card or key fob.");
}

void loop() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
    delay(30); return;
  }

  String uid = readUid();
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  if (uid == lastUid && millis() - lastScanMs < 2500) return;
  lastUid = uid;
  lastScanMs = millis();

  Serial.print("Card UID: "); Serial.println(uid);

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("ERROR: Wi-Fi not connected; attendance NOT saved.");
    beepPattern(false);
    return;
  }

  BearSSL::WiFiClientSecure client;
  client.setInsecure(); // Prototype only: skips TLS certificate validation. Replace with certificate validation for production.
  HTTPClient http;
  if (!http.begin(client, ENDPOINT_URL)) {
    Serial.println("ERROR: Could not start HTTPS request.");
    beepPattern(false);
    return;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-token", DEVICE_TOKEN);
  String body = String("{\"uid\":\"") + uid + "\"}";
  int code = http.POST(body);
  String response = http.getString();
  http.end();

  Serial.printf("HTTP %d: %s\n", code, response.c_str());
  if (code == 200 && response.indexOf("\"status\":\"marked\"") >= 0) {
    Serial.println("Attendance saved.");
    beepPattern(true);
  } else {
    Serial.println("Attendance not newly marked. Check response above.");
    beepPattern(false);
  }
  delay(700);
}
