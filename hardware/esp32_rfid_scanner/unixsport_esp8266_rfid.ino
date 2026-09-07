/**
 * UniXsport - ESP8266 (NodeMCU) Wi-Fi RFID Scanner Firmware
 * Hardware: NodeMCU ESP8266 + MFRC522 (RC522) RFID Reader
 * 
 * Pin Connections (ESP8266 <--> RC522):
 * -------------------------------------
 * RC522 SDA (SS)   <-->  D8 (GPIO 15)
 * RC522 SCK        <-->  D5 (GPIO 14)
 * RC522 MOSI       <-->  D7 (GPIO 13)
 * RC522 MISO       <-->  D6 (GPIO 12)
 * RC522 IRQ        <-->  (Not connected)
 * RC522 GND        <-->  GND
 * RC522 RST        <-->  D3 (GPIO 0)
 * RC522 3.3V (VCC) <-->  3.3V (CAUTION: Do NOT connect to 5V!)
 * 
 * Feedback Pins:
 * --------------
 * Buzzer (+)       <-->  D1 (GPIO 5)
 * LED Indicator    <-->  D4 (GPIO 2 - Built-in LED)
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <SPI.h>
#include <MFRC522.h>

// ================= USER CONFIGURATION ================= //
const char* WIFI_SSID     = "YOUR_WIFI_NAME";        // Enter your local Wi-Fi Name
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";    // Enter your Wi-Fi Password

// UniXsport Server Endpoint (Replace with your Laptop/Server IP on local Wi-Fi)
const char* SERVER_URL    = "http://192.168.1.100:5000/api/rfid/scan";
const char* DEVICE_ID     = "STORE_GATE_01";
// ====================================================== //

#define SS_PIN    15  // D8
#define RST_PIN   0   // D3
#define BUZZER_PIN 5  // D1
#define STATUS_LED 2  // D4

MFRC522 rfid(SS_PIN, RST_PIN);
WiFiClient wifiClient;

String lastScannedUID = "";
unsigned long lastScanTime = 0;
const unsigned long SCAN_COOLDOWN_MS = 2500;

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n\n==========================================");
  Serial.println("  UniXsport ESP8266 Wi-Fi RFID Scanner   ");
  Serial.println("==========================================");

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(STATUS_LED, HIGH); // ESP8266 builtin LED is active LOW

  SPI.begin();
  rfid.PCD_Init();
  delay(100);
  Serial.println("RC522 Initialized.");

  connectWiFi();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  if (!rfid.PICC_IsNewCardPresent()) {
    return;
  }

  if (!rfid.PICC_ReadCardSerial()) {
    return;
  }

  String uidString = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) uidString += "0";
    uidString += String(rfid.uid.uidByte[i], HEX);
  }
  uidString.toUpperCase();

  unsigned long now = millis();
  if (uidString == lastScannedUID && (now - lastScanTime < SCAN_COOLDOWN_MS)) {
    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
    return;
  }

  lastScannedUID = uidString;
  lastScanTime = now;

  Serial.print("\n[CARD DETECTED] UID: ");
  Serial.println(uidString);

  beep(1, 100);
  sendScanToServer(uidString);

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
}

void connectWiFi() {
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[Wi-Fi CONNECTED]");
    Serial.print("ESP8266 IP: ");
    Serial.println(WiFi.localIP());
    beep(2, 80);
  } else {
    Serial.println("\n[Wi-Fi FAILED]");
  }
}

void sendScanToServer(String cardUID) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(wifiClient, SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  String jsonPayload = "{\"rfid_tag\":\"" + cardUID + "\",\"device_id\":\"" + String(DEVICE_ID) + "\"}";

  Serial.print("Sending POST to: ");
  Serial.println(SERVER_URL);

  int httpResponseCode = http.POST(jsonPayload);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.print("HTTP Code: ");
    Serial.println(httpResponseCode);
    Serial.print("Response: ");
    Serial.println(response);

    if (httpResponseCode == 200) {
      beep(1, 200);
    } else {
      beep(2, 300);
    }
  } else {
    Serial.print("HTTP Error: ");
    Serial.println(httpResponseCode);
    beep(3, 150);
  }

  http.end();
}

void beep(int count, int durationMs) {
  for (int i = 0; i < count; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(durationMs);
    digitalWrite(BUZZER_PIN, LOW);
    if (i < count - 1) delay(80);
  }
}
