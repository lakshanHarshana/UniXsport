/**
 * UniXsport - ESP32 Complete Wi-Fi RFID Scanner Firmware
 * 
 * Configured Exact Pinout:
 * -------------------------------------------------------------
 * MFRC522 RFID:
 *   SDA/SS  --> GPIO 5
 *   SCK     --> GPIO 18
 *   MOSI    --> GPIO 23
 *   MISO    --> GPIO 19
 *   RST     --> GPIO 4
 *   VCC     --> 3.3V (Do NOT connect to 5V!)
 *   GND     --> GND
 * 
 * LCD 16x2 I2C Display:
 *   SDA     --> GPIO 21
 *   SCL     --> GPIO 22
 *   VCC     --> 5V / VIN
 *   GND     --> GND
 * 
 * Buzzer:
 *   (+)     --> GPIO 27
 *   (-)     --> GND
 * 
 * LEDs:
 *   GREEN   --> GPIO 25 (Through 220Ω resistor)
 *   RED     --> GPIO 26 (Through 220Ω resistor)
 * -------------------------------------------------------------
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// ================= USER CONFIGURATION ================= //
const char* WIFI_SSID     = "Hostel_WiFi";        // Enter your local Wi-Fi Name
const char* WIFI_PASSWORD = "wifi@HostRUSL";    // Enter your Wi-Fi Password

// Cloud Production API (Default - Works anywhere over Wi-Fi / Hotspot)
const char* SERVER_URL = "https://unixsport-api.onrender.com/api/rfid/scan";

// Local Laptop Fallback (Uncomment if running node server/server.js locally)
// const char* SERVER_URL = "http://10.30.1.1:5000/api/rfid/scan";

const char* DEVICE_ID     = "STORE_GATE_01";         // Scanner identifier
// ====================================================== //

// Pin Definitions (Exact Custom Setup)
#define RFID_SS_PIN   5
#define RFID_RST_PIN  4
#define I2C_SDA_PIN   21
#define I2C_SCL_PIN   22
#define BUZZER_PIN    27
#define GREEN_LED_PIN 25
#define RED_LED_PIN   26

// RFID & LCD Instances
MFRC522 rfid(RFID_SS_PIN, RFID_RST_PIN);
// Set I2C address (usually 0x27 or 0x3F for standard 16x2 I2C displays)
LiquidCrystal_I2C lcd(0x27, 16, 2);

// Debounce Tracking
String lastScannedUID = "";
unsigned long lastScanTime = 0;
const unsigned long SCAN_COOLDOWN_MS = 2500; // 2.5s cooldown before reading same card again

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n\n========================================");
  Serial.println("  UniXsport ESP32 Hardware RFID System  ");
  Serial.println("========================================");

  // Initialize GPIO Pins
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(GREEN_LED_PIN, OUTPUT);
  pinMode(RED_LED_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(GREEN_LED_PIN, LOW);
  digitalWrite(RED_LED_PIN, LOW);

  // Initialize I2C and LCD Display
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(" UniXsport System");
  lcd.setCursor(0, 1);
  lcd.print(" Initializing...");
  delay(1200);

  // Initialize SPI bus and RC522 RFID reader
  SPI.begin();
  rfid.PCD_Init();
  delay(100);
  rfid.PCD_DumpVersionToSerial();
  Serial.println("RC522 RFID Reader Ready.");

  // Connect to Wi-Fi
  connectWiFi();
}

void loop() {
  // Ensure Wi-Fi connection is maintained
  if (WiFi.status() != WL_CONNECTED) {
    digitalWrite(GREEN_LED_PIN, LOW);
    digitalWrite(RED_LED_PIN, HIGH);
    lcd.setCursor(0, 0);
    lcd.print("Wi-Fi Lost!     ");
    lcd.setCursor(0, 1);
    lcd.print("Reconnecting... ");
    connectWiFi();
  }

  // Look for new RFID card
  if (!rfid.PICC_IsNewCardPresent()) {
    return;
  }

  // Select the card and read UID
  if (!rfid.PICC_ReadCardSerial()) {
    return;
  }

  // Format UID as Hex string: e.g. "A3B2C1D0"
  String uidString = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) {
      uidString += "0";
    }
    uidString += String(rfid.uid.uidByte[i], HEX);
  }
  uidString.toUpperCase();

  // Check cooldown to avoid rapid multi-scanning the same card
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

  // Quick detection beep
  beep(1, 80);

  // Update LCD to show scanning status
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Card Detected:  ");
  lcd.setCursor(0, 1);
  lcd.print("ID: " + uidString);

  // Transmit scan data to UniXsport Server via Wi-Fi HTTP POST
  sendScanToServer(uidString);

  // Halt PICC
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  // Reset LCD display after 2.5 seconds
  delay(2500);
  showReadyScreen();
}

void showReadyScreen() {
  digitalWrite(GREEN_LED_PIN, LOW);
  digitalWrite(RED_LED_PIN, LOW);
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("UniXsport Sports");
  lcd.setCursor(0, 1);
  lcd.print("Tap Card to Scan");
}

void connectWiFi() {
  Serial.print("Connecting to Wi-Fi SSID: ");
  Serial.println(WIFI_SSID);

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Connecting Wi-Fi");
  lcd.setCursor(0, 1);
  lcd.print(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    digitalWrite(GREEN_LED_PIN, !digitalRead(GREEN_LED_PIN));
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[Wi-Fi CONNECTED]");
    Serial.print("ESP32 IP Address: ");
    Serial.println(WiFi.localIP());

    digitalWrite(GREEN_LED_PIN, HIGH);
    digitalWrite(RED_LED_PIN, LOW);
    beep(2, 80); // Double beep indicates successful Wi-Fi connection

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Wi-Fi Connected!");
    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP().toString());
    delay(2000);

    showReadyScreen();
  } else {
    Serial.println("\n[Wi-Fi FAILED] Will retry.");
    digitalWrite(GREEN_LED_PIN, LOW);
    digitalWrite(RED_LED_PIN, HIGH);
    beep(3, 120);

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Wi-Fi Failed!   ");
    lcd.setCursor(0, 1);
    lcd.print("Check Settings  ");
    delay(2000);
  }
}

#include <WiFiClient.h>
#include <WiFiClientSecure.h>

void sendScanToServer(String cardUID) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[ERROR] Cannot send scan: Wi-Fi disconnected!");
    digitalWrite(RED_LED_PIN, HIGH);
    digitalWrite(GREEN_LED_PIN, LOW);
    beep(3, 200);
    return;
  }

  // Construct JSON payload
  String jsonPayload = "{\"rfid_tag\":\"" + cardUID + "\",\"device_id\":\"" + String(DEVICE_ID) + "\"}";

  Serial.print("Sending POST to: ");
  Serial.println(SERVER_URL);
  Serial.print("Payload: ");
  Serial.println(jsonPayload);

  HTTPClient http;
  bool isHttps = String(SERVER_URL).startsWith("https://");
  int httpResponseCode = -1;

  if (isHttps) {
    WiFiClientSecure secureClient;
    secureClient.setInsecure(); // Skip certificate verification for Render / Custom SSL
    http.begin(secureClient, SERVER_URL);
    http.setTimeout(12000);
    http.addHeader("Content-Type", "application/json");
    httpResponseCode = http.POST(jsonPayload);
  } else {
    WiFiClient plainClient;
    http.begin(plainClient, SERVER_URL);
    http.setTimeout(8000);
    http.addHeader("Content-Type", "application/json");
    httpResponseCode = http.POST(jsonPayload);
  }

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.print("HTTP Code: ");
    Serial.println(httpResponseCode);
    Serial.print("Response: ");
    Serial.println(response);

    if (httpResponseCode == 200) {
      // Authorized User or Registered Equipment
      digitalWrite(GREEN_LED_PIN, HIGH);
      digitalWrite(RED_LED_PIN, LOW);
      beep(1, 200); // 1 clear success beep

      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Scan Received!  ");
      lcd.setCursor(0, 1);
      lcd.print("ID: " + cardUID);
    } else if (httpResponseCode == 403) {
      // Unregistered RFID Card
      digitalWrite(RED_LED_PIN, HIGH);
      digitalWrite(GREEN_LED_PIN, LOW);
      beep(2, 250); // 2 error beeps

      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Access Denied!  ");
      lcd.setCursor(0, 1);
      lcd.print("Unregistered Tag");
    } else {
      digitalWrite(RED_LED_PIN, HIGH);
      digitalWrite(GREEN_LED_PIN, LOW);
      beep(2, 200);

      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Server Response:");
      lcd.setCursor(0, 1);
      lcd.print("Code: " + String(httpResponseCode));
    }
  } else {
    // Network Connection Error
    Serial.print("[HTTP ERROR] Failed, error: ");
    Serial.println(http.errorToString(httpResponseCode).c_str());

    digitalWrite(RED_LED_PIN, HIGH);
    digitalWrite(GREEN_LED_PIN, LOW);
    beep(3, 150);

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Network Error   ");
    lcd.setCursor(0, 1);
    lcd.print("Server Unreach. ");
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
